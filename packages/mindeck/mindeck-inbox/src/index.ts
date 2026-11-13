/**
 * Company messages for Mindeck Desktop: the member's Mindeck Cloud inbox, which merges personal notifications with
 * the announcements the member can see. The plugin keeps the unread count from the account's sync, reads the items
 * while the company messages page is open, reports what the member read, and tells the page about the recommended
 * desktop version. The Client reaches it through the `mindeckInbox` Remote namespace, which never carries the token.
 * @module @deepseek-ai/dsh-mindeck-inbox
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { followChanges } from '@deepseek-ai/dsh-mindeck-account'
import type { MindeckSyncTopic } from '@deepseek-ai/dsh-mindeck-account/types'
import { deadline } from '@deepseek-ai/dsh-timeout'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { deepEqualJson } from '@deepseek-ai/dsh-util-values'
import { InboxRequestError, listInbox, markInboxRead } from './cloud.ts'
import type {
  MindeckInboxFailure, MindeckInboxItem, MindeckInboxItemRef, MindeckInboxPage, MindeckInboxReadTarget, MindeckInboxSummary,
} from './types.ts'

export { InboxRequestError, listInbox, markInboxRead } from './cloud.ts'
export type { InboxListing } from './cloud.ts'
export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    mindeckInbox: MindeckInbox
  }
}

/** Deployment options. */
export interface Config {
  /** Items read per page, from 1 through 50. */
  pageSize: number
  /** Timeout of one Mindeck Cloud request in milliseconds. */
  requestTimeoutMs: number
}

/** Most items Mindeck Cloud returns or marks in one request. */
const CLOUD_PAGE_MAX = 50
const CLOUD_READ_MAX = 100

const SIGNED_OUT: MindeckInboxSummary = { available: false, unread: 0, release: null }
const EMPTY_PAGE: MindeckInboxPage = { items: null, more: false, loading: null, failure: null }

/** @param item - an inbox item or its reference. @returns the key unique across both item types. */
function keyOf(item: MindeckInboxItemRef): string {
  return `${item.type}:${item.id}`
}

/** @param error - a failed inbox request. @returns what the page tells the member. */
function failureOf(error: unknown): MindeckInboxFailure {
  if (error instanceof InboxRequestError) return { reason: error.reason === 'unreachable' ? 'unreachable' : 'failed', requestId: error.requestId }
  return { reason: 'failed', requestId: null }
}

/** The signed-in session's inbox address. */
interface InboxSession {
  readonly token: string
  readonly url: string
}

/** Unread count, inbox items, and read reports of the signed-in member's company messages. */
export default class MindeckInbox extends TypertRemoteService {
  static inject = ['mindeckAccount', 'typert']
  static Config: z<Config> = z.object({
    pageSize: z.natural().min(1).max(CLOUD_PAGE_MAX).default(20)
      .description('Items read per page, from 1 through 50.'),
    requestTimeoutMs: z.natural().min(1000).default(15_000)
      .description('Timeout of one Mindeck Cloud request in milliseconds.'),
  })

  private readonly lifetime = new AbortController()
  private readonly summaryListeners = new Set<() => void>()
  private readonly pageListeners = new Set<() => void>()
  /** Token of the member whose inbox this state holds; undefined while signed out. */
  private owner: string | undefined
  private summary: MindeckInboxSummary = SIGNED_OUT
  private page: MindeckInboxPage = EMPTY_PAGE
  /** Unread count of the latest Mindeck Cloud answer: a sync, a page, or a read report. */
  private cloudUnread = 0
  /** Inbox summary of the sync answer the page last caught up with. */
  private seen: { unread: number; latestAt: string | null } | undefined
  private cursor: string | null = null
  /** Open company messages pages. */
  private viewers = 0
  /** The running read of the newest items, and whether another was asked for meanwhile. */
  private reloading: Promise<void> | undefined
  private reloadAgain = false
  /** The running read of an older page. */
  private older: Promise<boolean> | undefined
  /** Items marked read on this computer that Mindeck Cloud has not confirmed. */
  private readonly unreported = new Map<string, MindeckInboxItemRef>()
  /** When the member marked everything read, until Mindeck Cloud confirms it. */
  private unreportedAll: number | undefined
  private reporting: Promise<void> | undefined
  private readonly background = new Set<Promise<void>>()

  /** @param ctx - Host with the Mindeck account. @param config - deployment options. */
  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'mindeckInbox', { namespace: 'mindeckInbox' })
    ctx.effect(() => () => { this.lifetime.abort() }, 'mindeck-inbox: Cloud requests')
    ctx.on('mindeck-account/changed', () => { this.track(this.follow()) })
    ctx.on('mindeck-account/revised', (topics) => { this.track(this.revised(topics)) })
    ctx.on('mindeck-account/synced', () => { this.track(this.reachable()) })
    this.track(this.follow())
  }

  /**
   * Stream the unread count and the recommended version for the sidebar row and the page header.
   * @param signal - stream lifetime.
   * @returns the current summary, then every change.
   */
  @Remote({ mode: 'stream' })
  async *watch(signal: AbortSignal): AsyncIterable<MindeckInboxSummary> {
    yield* followChanges(this.summaryListeners, signal, this.lifetime.signal, () => this.summary)
  }

  /**
   * Stream the inbox items while the company messages page is open. Opening it reads the newest items; while it is
   * open, a sync that reports new or read items or changed announcements reads them again.
   * @param signal - the page's lifetime.
   * @returns the loaded items, then every change.
   */
  @Remote({ mode: 'stream' })
  async *items(signal: AbortSignal): AsyncIterable<MindeckInboxPage> {
    this.viewers++
    try {
      this.track(this.reload())
      yield* followChanges(this.pageListeners, signal, this.lifetime.signal, () => this.page)
    } finally { this.viewers-- }
  }

  /** Read the newest items again, as after a failed read; the page stream carries the result. */
  @Remote
  async reload(): Promise<void> {
    if (this.reloading !== undefined) {
      this.reloadAgain = true
      await this.reloading
      return
    }
    this.reloading = (async () => {
      // A running older-page read finishes first, so its items do not land on the new first page.
      await this.older
      do {
        this.reloadAgain = false
        await this.loadFirst()
      } while (this.takeReloadRequest() && !this.stopped())
    })().finally(() => { this.reloading = undefined })
    await this.reloading
  }

  /** Read the next older page, unless a read is running or no older items remain; the page stream carries the result. */
  @Remote
  async loadMore(): Promise<void> {
    const cursor = this.cursor
    if (this.reloading !== undefined || this.older !== undefined || cursor === null || this.page.items === null) return
    this.older = this.loadOlder(cursor).finally(() => { this.older = undefined })
    // Mindeck Cloud no longer takes the cursor: the list starts again from the newest items.
    if (await this.older) await this.reload()
  }

  /**
   * Mark items read, as when the member opens one or marks everything read. The items show as read at once; a report
   * that does not reach Mindeck Cloud is sent again after the next sync.
   * @param target - every unread item, or up to 100 listed ones.
   */
  @Remote
  async markRead(target: MindeckInboxReadTarget): Promise<void> {
    const items = this.page.items ?? []
    if ('all' in target) {
      this.unreportedAll = Date.now()
      this.unreported.clear()
    } else {
      const unread = new Set(items.filter(item => item.readAt === null).map(keyOf))
      // Only items this page shows unread count against the unread number until Mindeck Cloud confirms them.
      for (const ref of target.items.slice(0, CLOUD_READ_MAX)) {
        if (unread.has(keyOf(ref))) this.unreported.set(keyOf(ref), { type: ref.type, id: ref.id })
      }
    }
    this.setPage({ items: this.page.items === null ? null : this.withLocalReads(this.page.items) })
    this.publishSummary()
    await this.report()
  }

  // Read through a method: a check after `await` must not reuse an earlier narrowing.
  private stopped(): boolean { return this.lifetime.signal.aborted }

  /** The signed-in session with an inbox, or undefined. */
  private async inboxSession(): Promise<InboxSession | undefined> {
    const session = await this.ctx.mindeckAccount.session()
    const url = session?.bootstrap.endpoints.inbox
    return session === undefined || url === undefined ? undefined : { token: session.token, url }
  }

  /** Follow the account: another member starts over, and the summary follows the stored bootstrap. */
  private async follow(): Promise<void> {
    const current = await this.inboxSession()
    const state = await this.ctx.mindeckAccount.getState()
    if (this.stopped()) return
    const signedIn = await this.ctx.mindeckAccount.session()
    if (signedIn?.token !== this.owner) {
      this.owner = signedIn?.token
      this.cursor = null
      this.seen = undefined
      this.unreported.clear()
      this.unreportedAll = undefined
      this.cloudUnread = 0
      this.setPage(EMPTY_PAGE)
    }
    const answer = this.ctx.mindeckAccount.syncAnswer()
    if (answer !== undefined) this.cloudUnread = answer.me.inbox.unread
    this.summary = { available: current !== undefined, unread: 0, release: state.release }
    this.publishSummary(true)
    if (current !== undefined && this.viewers > 0 && this.page.items === null && this.reloading === undefined) await this.reload()
  }

  /** A sync changed the inbox summary or the announcements. */
  private async revised(topics: ReadonlySet<MindeckSyncTopic>): Promise<void> {
    if (!topics.has('inbox') && !topics.has('announcements')) return
    const answer = this.ctx.mindeckAccount.syncAnswer()
    const current = await this.inboxSession()
    if (current === undefined || current.token !== this.owner || this.stopped()) return
    if (answer !== undefined) this.cloudUnread = answer.me.inbox.unread
    this.publishSummary()
    const inbox = answer?.me.inbox
    const moved = inbox === undefined || this.seen === undefined
      || inbox.unread !== this.seen.unread || inbox.latestAt !== this.seen.latestAt
    if (inbox !== undefined) this.seen = { ...inbox }
    if (this.viewers > 0 && (moved || topics.has('announcements'))) await this.reload()
  }

  /** Mindeck Cloud answered a sync: read reports that did not reach it go now, and an open page that failed reads again. */
  private async reachable(): Promise<void> {
    const current = await this.inboxSession()
    if (current === undefined || current.token !== this.owner || this.stopped()) return
    if (this.unreportedAll !== undefined || this.unreported.size > 0) await this.report()
    if (this.viewers > 0 && this.page.failure !== null && this.reloading === undefined) await this.reload()
  }

  /** Run one Mindeck Cloud request with the configured timeout, fused with the plugin lifetime. */
  private async request<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    using limit = deadline(this.lifetime.signal, this.config.requestTimeoutMs, 'MINDECK_INBOX_TIMEOUT')
    return await run(limit.signal)
  }

  private async loadFirst(): Promise<void> {
    const current = await this.inboxSession()
    if (current === undefined || current.token !== this.owner || this.stopped()) return
    // A reload keeps the items already shown, up to one Mindeck Cloud page.
    const limit = Math.min(CLOUD_PAGE_MAX, Math.max(this.config.pageSize, this.page.items?.length ?? 0))
    this.setPage({ loading: 'first' })
    let listing
    try { listing = await this.request(signal => listInbox(current.url, current.token, { limit, cursor: null }, signal)) }
    catch (error) {
      if (this.stopped() || current.token !== this.owner) return
      if (!(error instanceof InboxRequestError && error.reason === 'unreachable')) this.ctx.logger.warn('mindeck-inbox: could not read the inbox', error)
      this.setPage({ loading: null, failure: failureOf(error) })
      return
    }
    if (this.stopped() || current.token !== this.owner) return
    if (listing === 'sign-in-required') { this.setPage({ loading: null }); await this.ctx.mindeckAccount.rejectToken(current.token); return }
    if (listing.skipped > 0) this.ctx.logger.warn(`mindeck-inbox: skipped ${listing.skipped} inbox items in an unknown format`)
    this.cursor = listing.nextCursor
    this.cloudUnread = listing.unread
    this.setPage({ items: this.withLocalReads(listing.items), more: listing.nextCursor !== null, loading: null, failure: null })
    this.publishSummary()
  }

  /** @returns whether the list must start again because Mindeck Cloud refused the cursor. */
  private async loadOlder(cursor: string): Promise<boolean> {
    const current = await this.inboxSession()
    if (current === undefined || current.token !== this.owner || this.stopped()) return false
    this.setPage({ loading: 'more' })
    let listing
    try {
      listing = await this.request(signal => listInbox(current.url, current.token, { limit: this.config.pageSize, cursor }, signal))
    } catch (error) {
      if (this.stopped() || current.token !== this.owner) return false
      if (error instanceof InboxRequestError && error.reason === 'invalid-cursor') { this.cursor = null; this.setPage({ loading: null }); return true }
      this.setPage({ loading: null, failure: failureOf(error) })
      return false
    }
    if (this.stopped() || current.token !== this.owner) return false
    if (listing === 'sign-in-required') { this.setPage({ loading: null }); await this.ctx.mindeckAccount.rejectToken(current.token); return false }
    const shown = new Set((this.page.items ?? []).map(keyOf))
    const older = this.withLocalReads(listing.items.filter(item => !shown.has(keyOf(item))))
    this.cursor = listing.nextCursor
    this.cloudUnread = listing.unread
    this.setPage({ items: [...this.page.items ?? [], ...older], more: listing.nextCursor !== null, loading: null, failure: null })
    this.publishSummary()
    return false
  }

  /** Send the read marks Mindeck Cloud has not confirmed; a failure keeps them for the next sync. */
  private async report(): Promise<void> {
    if (this.reporting !== undefined) await this.reporting
    if (this.unreportedAll === undefined && this.unreported.size === 0) return
    this.reporting = this.sendReport().finally(() => { this.reporting = undefined })
    await this.reporting
  }

  private async sendReport(): Promise<void> {
    const current = await this.inboxSession()
    if (current === undefined || current.token !== this.owner || this.stopped()) return
    const all = this.unreportedAll
    const refs = [...this.unreported.values()].slice(0, CLOUD_READ_MAX)
    const target: MindeckInboxReadTarget = all !== undefined ? { all: true } : { items: refs }
    let answer
    try { answer = await this.request(signal => markInboxRead(current.url, current.token, target, signal)) }
    catch (error) {
      if (!this.stopped()) this.ctx.logger.info('mindeck-inbox: read marks did not reach Mindeck Cloud; sending them after the next sync', error)
      return
    }
    if (this.stopped() || current.token !== this.owner) return
    if (answer === 'sign-in-required') { await this.ctx.mindeckAccount.rejectToken(current.token); return }
    if (all !== undefined && this.unreportedAll === all) this.unreportedAll = undefined
    for (const ref of refs) this.unreported.delete(keyOf(ref))
    this.cloudUnread = answer.unread
    // The next sync answer carries this count; it is not news for the open page.
    if (this.seen !== undefined) this.seen = { ...this.seen, unread: answer.unread }
    this.publishSummary()
  }

  /** @returns whether a reload was asked for while the last one ran. */
  private takeReloadRequest(): boolean {
    return this.reloadAgain
  }

  /**
   * @param items - items as Mindeck Cloud listed them.
   * @returns the items with this computer's unreported read marks.
   */
  private withLocalReads(items: readonly MindeckInboxItem[]): MindeckInboxItem[] {
    const all = this.unreportedAll
    const now = new Date().toISOString()
    const markedHere = (item: MindeckInboxItem): boolean =>
      this.unreported.has(keyOf(item)) || (all !== undefined && Date.parse(item.createdAt) <= all)
    return items.map(item => item.readAt === null && markedHere(item) ? { ...item, readAt: now } : item)
  }

  /** Publish the unread count: Mindeck Cloud's, less what this computer marked read and has not reported. */
  private publishSummary(force = false): void {
    const unread = this.owner === undefined || this.unreportedAll !== undefined
      ? 0
      : Math.max(0, this.cloudUnread - this.unreported.size)
    const next: MindeckInboxSummary = this.owner === undefined ? SIGNED_OUT : { ...this.summary, unread }
    if (!force && deepEqualJson(next, this.summary)) return
    this.summary = next
    for (const listener of this.summaryListeners) listener()
  }

  private setPage(patch: Partial<MindeckInboxPage>): void {
    const next = { ...this.page, ...patch }
    if (deepEqualJson(next, this.page)) return
    this.page = next
    for (const listener of this.pageListeners) listener()
  }

  private track(task: Promise<void>): void {
    const tracked = task.catch((error: unknown) => { if (!this.stopped()) this.ctx.logger.warn('mindeck-inbox: background task failed', error) })
      .finally(() => { this.background.delete(tracked) })
    this.background.add(tracked)
  }
}
