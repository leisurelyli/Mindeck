/**
 * The desktop's sync with Mindeck Cloud: which topics a new sync answer changed, and the loop that polls the sync
 * endpoint for the signed-in session, or reads the bootstrap again on a Mindeck Cloud without one.
 */
import { MindeckCloudError, readSync } from './cloud.ts'
import type { MindeckSignOutReason, MindeckSyncAnswer, MindeckSyncTopic, MindeckSyncView } from './types.ts'

/** Every topic; a sync the member asks for refreshes all of them. */
export const ALL_SYNC_TOPICS: readonly MindeckSyncTopic[] = [
  'models', 'skills', 'employees', 'webSearch', 'policies', 'announcements', 'client', 'access', 'inbox', 'quota-request',
]

/** Catalog topics that the member's department or role also decides. */
const ACCESS_TOPICS: readonly MindeckSyncTopic[] = ['models', 'skills', 'employees', 'policies']

const CATALOG_TOPICS = ['models', 'skills', 'employees', 'webSearch', 'policies', 'announcements', 'client'] as const

/**
 * Compare two sync answers of one session. The first answer of a session changes no catalog, because the desktop
 * reads every catalog when it starts or signs in; it does change `inbox` and `quota-request`, which have no earlier
 * value.
 * @param previous - the session's previous answer; undefined for its first one.
 * @param next - the new answer.
 * @returns the topics whose data changed.
 */
export function changedTopics(previous: MindeckSyncAnswer | undefined, next: MindeckSyncAnswer): Set<MindeckSyncTopic> {
  if (previous === undefined) return new Set(['inbox', 'quota-request'])
  const topics = new Set<MindeckSyncTopic>()
  for (const topic of CATALOG_TOPICS) if (previous.revisions[topic] !== next.revisions[topic]) topics.add(topic)
  if (previous.me.accessRevision !== next.me.accessRevision) for (const topic of ['access', ...ACCESS_TOPICS] as const) topics.add(topic)
  if (previous.me.inbox.unread !== next.me.inbox.unread || previous.me.inbox.latestAt !== next.me.inbox.latestAt) topics.add('inbox')
  const request = (answer: MindeckSyncAnswer) => {
    const value = answer.me.quotaRequest
    return value === null ? null : `${value.id} ${value.status} ${value.decidedAt ?? ''}`
  }
  if (request(previous) !== request(next)) topics.add('quota-request')
  return topics
}

/**
 * Why a sync runs. `timer`: the periodic poll; `prompt`: the window regained focus, the network came back, or a
 * request was refused in a way a company change may explain, which skips the poll when one succeeded within the
 * cool-down; `manual`: the member asked, which refreshes every topic.
 */
export type SyncReason = 'timer' | 'prompt' | 'manual'

const STRENGTH: Readonly<Record<SyncReason, number>> = { prompt: 0, timer: 1, manual: 2 }

/** The signed-in session as the loop needs it. */
export interface SyncSession {
  readonly token: string
  /** The bootstrap's `endpoints.sync`; undefined for a Mindeck Cloud that predates it. */
  readonly syncUrl: string | undefined
}

/** Outcome of reading the bootstrap again. */
export type BootstrapRead = 'ok' | 'unreachable' | 'failed' | 'signed-out'

/** What the loop needs from the account service. */
export interface SyncLoopHost {
  /** @returns the stored session, or undefined while signed out. */
  readonly session: () => Promise<SyncSession | undefined>
  /** Run one Mindeck Cloud request with the request timeout, fused with the service lifetime. */
  readonly request: <T>(run: (signal: AbortSignal) => Promise<T>) => Promise<T>
  /** Mindeck Cloud rejected `token`; `reason` says who ended its session, null when Mindeck Cloud did not say. */
  readonly rejectToken: (token: string, reason: MindeckSignOutReason | null) => Promise<void>
  /** Read the bootstrap again and store it when it changed. */
  readonly readBootstrap: () => Promise<BootstrapRead>
  /** Read the quota again. */
  readonly readQuota: () => Promise<void>
  /** Report topics whose data changed. */
  readonly revised: (topics: ReadonlySet<MindeckSyncTopic>) => void
  /** Mindeck Cloud answered, after any {@link SyncLoopHost.revised} of the same answer. */
  readonly synced: () => void
  /** The sync view changed. */
  readonly changed: () => void
  /** Log a failure that the loop recovers from at its next run. */
  readonly warn: (message: string, error: unknown) => void
}

/** Loop timing. */
export interface SyncTiming {
  /** Milliseconds between automatic syncs with the sync endpoint. */
  readonly intervalMs: number
  /** Milliseconds between bootstrap reads on a Mindeck Cloud without the sync endpoint. */
  readonly fallbackIntervalMs: number
  /** Milliseconds after a successful sync during which a `prompt` sync is skipped. */
  readonly cooldownMs: number
}

/**
 * Polls the sync endpoint for the signed-in session. Concurrent requests share one run; a stronger request that
 * arrives during a run starts one more run afterwards. A failed poll changes nothing but the view and is retried
 * on schedule.
 */
export class SyncLoop {
  /** The session the answers belong to, its last answer, and that answer's `ETag`. */
  private current: { readonly token: string; etag: string | null; answer: MindeckSyncAnswer | undefined } | undefined
  private view: { syncedAt: number | null; problem: MindeckSyncView['problem']; running: boolean } =
    { syncedAt: null, problem: null, running: false }
  private running: Promise<void> | undefined
  /** Reason of the run in progress. */
  private active: SyncReason = 'prompt'
  private pending: SyncReason | undefined
  private lastSuccessAt = 0
  private lastFallbackAt: number

  /** @param host - account operations. @param timing - intervals. */
  constructor(private readonly host: SyncLoopHost, private readonly timing: SyncTiming) {
    // The account reads the bootstrap when it starts, so the first fallback read waits a whole interval.
    this.lastFallbackAt = Date.now()
  }

  /**
   * Read the latest sync answer of a session.
   *
   * @param token - the stored session's token.
   * @returns the session's latest sync answer; undefined before the first one or for another session.
   */
  answer(token: string): MindeckSyncAnswer | undefined {
    return this.current?.token === token ? this.current.answer : undefined
  }

  /**
   * Describe a session's sync for the account view.
   *
   * @param session - the stored session.
   * @returns the view of the session's sync.
   */
  viewFor(session: SyncSession): MindeckSyncView {
    const own = this.current?.token === session.token
    return {
      supported: session.syncUrl !== undefined,
      running: this.view.running,
      syncedAt: own ? this.view.syncedAt : null,
      problem: own ? this.view.problem : null,
    }
  }

  /**
   * Sync now, or after the running sync.
   * @param reason - why; see {@link SyncReason}.
   * @returns after the run that covers this request.
   */
  async request(reason: SyncReason): Promise<void> {
    if (reason === 'prompt' && this.view.problem === null && Date.now() - this.lastSuccessAt < this.timing.cooldownMs) return
    if (this.running !== undefined) {
      // A request no stronger than the run in progress is answered by that run.
      if (STRENGTH[reason] > STRENGTH[this.active] && (this.pending === undefined || STRENGTH[reason] > STRENGTH[this.pending])) {
        this.pending = reason
      }
      // The running drain performs the pending run before it settles.
      await this.running
      return
    }
    this.running = this.drain(reason).finally(() => { this.running = undefined })
    await this.running
  }

  private async drain(first: SyncReason): Promise<void> {
    let reason: SyncReason | undefined = first
    while (reason !== undefined) {
      this.pending = undefined
      this.active = reason
      await this.run(reason)
      reason = this.pending
    }
  }

  private async run(reason: SyncReason): Promise<void> {
    const session = await this.host.session()
    if (session === undefined) { this.reset(); return }
    if (this.current?.token !== session.token) {
      this.current = { token: session.token, etag: null, answer: undefined }
      this.view = { syncedAt: null, problem: null, running: false }
    }
    const manual = reason === 'manual'
    if (manual) this.setView({ running: true })
    try {
      if (session.syncUrl === undefined) await this.fallback(reason)
      else await this.poll(session.token, session.syncUrl, manual)
    } finally {
      if (manual) this.setView({ running: false })
    }
  }

  /** On a Mindeck Cloud without the sync endpoint, read the bootstrap every fallback interval or when asked. */
  private async fallback(reason: SyncReason): Promise<void> {
    if (reason !== 'manual' && Date.now() - this.lastFallbackAt < this.timing.fallbackIntervalMs) return
    this.lastFallbackAt = Date.now()
    const read = await this.host.readBootstrap()
    if (read === 'signed-out') return
    if (read !== 'ok') { this.setView({ problem: read }); return }
    this.succeeded()
    if (reason === 'manual') this.host.revised(new Set(ALL_SYNC_TOPICS))
    this.host.synced()
  }

  private async poll(token: string, url: string, manual: boolean): Promise<void> {
    const state = this.current
    let poll
    try { poll = await this.host.request(signal => readSync(url, token, state?.etag ?? null, signal)) }
    catch (error) {
      const problem = error instanceof MindeckCloudError && error.code === 'unreachable' ? 'unreachable' : 'failed'
      if (problem === 'failed') this.host.warn('mindeck-account: sync failed; retrying on schedule', error)
      this.setView({ problem })
      return
    }
    // A sign-out or another sign-in during the poll resets the state for the new session.
    if (state === undefined || this.current !== state) return
    if (poll.status === 'sign-in-required') { await this.host.rejectToken(token, poll.reason); return }
    // The account read the quota when the session started, so the session's first answer does not read it again.
    const first = state.answer === undefined
    let topics = new Set<MindeckSyncTopic>()
    if (poll.status === 'changed') {
      topics = changedTopics(state.answer, poll.answer)
      state.answer = poll.answer
      state.etag = poll.etag
    }
    if (manual) topics = new Set(ALL_SYNC_TOPICS)
    this.succeeded()
    // Consumers of these topics read the bootstrap the account stores, so it is current before they hear of them.
    if (topics.has('policies') || topics.has('client') || topics.has('access')) await this.host.readBootstrap()
    if (topics.has('quota-request') && (manual || !first)) await this.host.readQuota()
    if (topics.size > 0) this.host.revised(topics)
    this.host.synced()
  }

  private succeeded(): void {
    this.lastSuccessAt = Date.now()
    this.setView({ syncedAt: this.lastSuccessAt, problem: null })
  }

  private reset(): void {
    if (this.current === undefined) return
    this.current = undefined
    this.view = { syncedAt: null, problem: null, running: false }
    this.host.changed()
  }

  private setView(patch: Partial<SyncLoop['view']>): void {
    const next = { ...this.view, ...patch }
    if (next.syncedAt === this.view.syncedAt && next.problem === this.view.problem && next.running === this.view.running) return
    this.view = next
    this.host.changed()
  }
}
