/**
 * The company messages Host plugin: the unread count from the account's sync, the items while the page is open,
 * read reports that survive a lost connection, and a fresh start for another member.
 */
import { Context } from '@deepseek-ai/cordis'
import type { MindeckSession } from '@deepseek-ai/dsh-mindeck-account'
import type { MindeckAccountView, MindeckSyncAnswer, MindeckSyncTopic } from '@deepseek-ai/dsh-mindeck-account/types'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { afterEach, expect, it, vi } from 'vitest'
import MindeckInbox, { type Config, type MindeckInboxPage, type MindeckInboxSummary } from '../src/index.ts'
import { notification, startFakeInbox } from './fake-inbox.ts'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

const RELEASE = { recommendedVersion: '1.8.0', notes: '修复了资源库搜索。', downloadUrl: 'https://dl.example.com/mindeck.dmg' }

async function fixture(options: { inbox?: boolean } = {}) {
  const inbox = await startFakeInbox()
  cleanups.push(() => inbox.close())
  const session = (token: string): MindeckSession => ({
    cloudUrl: 'http://127.0.0.1', token,
    bootstrap: {
      user: { id: 'u1', name: '林晓', email: 'lin@example.com', role: 'user', department: null },
      company: { name: '心言智创' }, device: { id: 'd1' },
      endpoints: {
        console: 'http://127.0.0.1', models: 'http://127.0.0.1/models', skills: 'http://127.0.0.1/skills',
        anthropicBaseUrl: 'http://127.0.0.1', openaiBaseUrl: 'http://127.0.0.1',
        ...options.inbox === false ? {} : { sync: 'http://127.0.0.1/sync', inbox: inbox.url },
      },
    },
  })
  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  let current: MindeckSession | undefined = session('desktop-token-1')
  let answer: MindeckSyncAnswer | undefined
  const account = {
    session: vi.fn(async () => current),
    getState: vi.fn(async () => ({ release: current === undefined ? null : RELEASE }) as MindeckAccountView),
    syncAnswer: vi.fn(() => answer),
    rejectToken: vi.fn(async (token: string) => {
      if (current?.token !== token) return
      current = undefined
      ctx.emit('mindeck-account/changed')
    }),
  }
  ctx.provide('mindeckAccount', account as never)
  await ctx.plugin(TypertRegistry)
  /** Report a sync answer as the account does. */
  const sync = (me: Partial<MindeckSyncAnswer['me']['inbox']>, topics: MindeckSyncTopic[] = ['inbox']) => {
    answer = {
      revisions: {},
      me: { accessRevision: 1, inbox: { unread: 0, latestAt: null, ...answer?.me.inbox, ...me }, quotaRequest: null },
    }
    ctx.emit('mindeck-account/revised', new Set(topics))
  }
  const change = (token: string | undefined) => {
    current = token === undefined ? undefined : session(token)
    answer = undefined
    ctx.emit('mindeck-account/changed')
  }
  const config: Config = { pageSize: 2, requestTimeoutMs: 5000 }
  return { ctx, inbox, account, sync, change, config }
}

/** Follow one of the plugin's streams and keep its latest frame. */
function follow<T>(open: (signal: AbortSignal) => AsyncIterable<T>): { latest: () => T | undefined } {
  const stop = new AbortController()
  let latest: T | undefined
  const done = (async () => { for await (const frame of open(stop.signal)) latest = frame })()
  cleanups.push(async () => { stop.abort(); await done })
  return { latest: () => latest }
}

const titles = (page: MindeckInboxPage | undefined) => page?.items?.map(item => `${item.title}${item.readAt === null ? ' *' : ''}`)

async function openPage(f: Awaited<ReturnType<typeof fixture>>) {
  await f.ctx.plugin(MindeckInbox, f.config)
  const summary = follow<MindeckInboxSummary>(signal => f.ctx.mindeckInbox.watch(signal))
  const page = follow<MindeckInboxPage>(signal => f.ctx.mindeckInbox.items(signal))
  return { summary, page }
}

it('shows the unread count of the sync answer and the recommended version while signed in', async () => {
  const f = await fixture()
  await f.ctx.plugin(MindeckInbox, f.config)
  const summary = follow<MindeckInboxSummary>(signal => f.ctx.mindeckInbox.watch(signal))
  await vi.waitFor(() => { expect(summary.latest()).toEqual({ available: true, unread: 0, release: RELEASE }) })
  f.sync({ unread: 3, latestAt: '2026-11-13T08:20:00.000Z' })
  await vi.waitFor(() => { expect(summary.latest()?.unread).toBe(3) })
  // Without the page open, nothing reads the items.
  expect(f.inbox.requests).toEqual([])

  f.change(undefined)
  await vi.waitFor(() => { expect(summary.latest()).toEqual({ available: false, unread: 0, release: null }) })
})

it('has no company messages on a Mindeck Cloud without an inbox', async () => {
  const f = await fixture({ inbox: false })
  const { summary, page } = await openPage(f)
  await vi.waitFor(() => { expect(summary.latest()).toMatchObject({ available: false, release: RELEASE }) })
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(page.latest()).toEqual({ items: null, more: false, loading: null, failure: null })
  expect(f.inbox.requests).toEqual([])
})

it('reads the newest items when the page opens and keeps only web links and known formats', async () => {
  const f = await fixture()
  f.inbox.items = [
    { ...notification(0), type: 'announcement', kind: 'announcement', level: 'important', title: '十一月报销截止提醒', link: 'javascript:alert(1)' },
    { ...notification(1), type: 'survey' },
    notification(2, { readAt: '2026-11-13T09:00:00.000Z', level: 'urgent' }),
  ]
  const { summary, page } = await openPage(f)
  await vi.waitFor(() => { expect(titles(page.latest())).toEqual(['十一月报销截止提醒 *']) })
  expect(page.latest()).toMatchObject({ more: true, loading: null, failure: null })
  expect(f.inbox.requests).toEqual(['GET /api/desktop/inbox?limit=2'])
  await vi.waitFor(() => { expect(summary.latest()?.unread).toBe(2) })
  await f.ctx.mindeckInbox.loadMore()
  const [announcement, read] = page.latest()?.items ?? []
  expect(announcement).toMatchObject({ type: 'announcement', level: 'important', link: null })
  expect(read).toMatchObject({ title: '提额申请已批准 2', level: 'info', link: 'https://cloud.example.com/usage' })
})

it('reads the items again while the page is open when a sync reports news, but not for its own read report', async () => {
  const f = await fixture()
  f.inbox.items = [notification(0)]
  const { page } = await openPage(f)
  await vi.waitFor(() => { expect(titles(page.latest())).toEqual(['提额申请已批准 0 *']) })
  f.sync({ unread: 1, latestAt: f.inbox.items[0]?.createdAt ?? null })

  f.inbox.items = [{ ...notification(-1), title: '反馈已回复', kind: 'feedback.replied' }, ...f.inbox.items]
  f.sync({ unread: 2, latestAt: f.inbox.items[0]?.createdAt ?? null })
  await vi.waitFor(() => { expect(titles(page.latest())).toEqual(['反馈已回复 *', '提额申请已批准 0 *']) })
  const reads = f.inbox.requests.length

  await f.ctx.mindeckInbox.markRead({ items: [{ type: 'notification', id: 'n-1' }] })
  expect(f.inbox.reads).toEqual([{ items: [{ type: 'notification', id: 'n-1' }] }])
  // The next sync carries the count the read report returned.
  f.sync({ unread: 1 })
  await new Promise(resolve => setTimeout(resolve, 30))
  expect(f.inbox.requests).toHaveLength(reads + 1)

  // A changed announcement reads the items again even when the count stays.
  f.sync({ unread: 1 }, ['announcements'])
  await vi.waitFor(() => { expect(f.inbox.requests).toHaveLength(reads + 2) })
})

it('loads older pages to the last one and starts over when Mindeck Cloud refuses the cursor', async () => {
  const f = await fixture()
  f.inbox.items = [0, 1, 2, 3, 4].map(index => notification(index))
  const { page } = await openPage(f)
  await vi.waitFor(() => { expect(page.latest()?.items).toHaveLength(2) })
  await f.ctx.mindeckInbox.loadMore()
  expect(page.latest()).toMatchObject({ more: true, loading: null })
  expect(page.latest()?.items).toHaveLength(4)
  await f.ctx.mindeckInbox.loadMore()
  expect(page.latest()?.items).toHaveLength(5)
  expect(page.latest()?.more).toBe(false)
  await f.ctx.mindeckInbox.loadMore()
  expect(f.inbox.requests.filter(request => request.includes('cursor'))).toHaveLength(2)

  // A reload keeps the items already shown.
  await f.ctx.mindeckInbox.reload()
  expect(f.inbox.requests.at(-1)).toBe('GET /api/desktop/inbox?limit=5')

  f.inbox.items = [0, 1, 2, 3, 4, 5, 6, 7].map(index => notification(index))
  await f.ctx.mindeckInbox.reload()
  f.inbox.refuseCursor = true
  await f.ctx.mindeckInbox.loadMore()
  expect(f.inbox.requests.slice(-2)).toEqual(['GET /api/desktop/inbox?limit=2&cursor=5', 'GET /api/desktop/inbox?limit=5'])
  expect(page.latest()).toMatchObject({ failure: null, more: true })
})

it('shows read items at once and sends unconfirmed read marks again after the next sync', async () => {
  const f = await fixture()
  f.inbox.items = [notification(0), notification(1)]
  const { summary, page } = await openPage(f)
  await vi.waitFor(() => { expect(summary.latest()?.unread).toBe(2) })

  f.inbox.status = 0
  await f.ctx.mindeckInbox.markRead({ items: [{ type: 'notification', id: 'n0' }, { type: 'notification', id: 'missing' }] })
  expect(titles(page.latest())).toEqual(['提额申请已批准 0', '提额申请已批准 1 *'])
  expect(summary.latest()?.unread).toBe(1)
  expect(f.inbox.reads).toEqual([])

  f.inbox.status = 200
  f.sync({ unread: 2 })
  await vi.waitFor(() => { expect(f.inbox.reads).toEqual([{ items: [{ type: 'notification', id: 'n0' }] }]) })
  await vi.waitFor(() => { expect(summary.latest()?.unread).toBe(1) })

  await f.ctx.mindeckInbox.markRead({ all: true })
  expect(f.inbox.reads.at(-1)).toEqual({ all: true })
  expect(summary.latest()?.unread).toBe(0)
  expect(titles(page.latest())).toEqual(['提额申请已批准 0', '提额申请已批准 1'])
})

it('keeps the shown items and names the failure while Mindeck Cloud is unreachable or failing', async () => {
  const f = await fixture()
  f.inbox.items = [notification(0)]
  const { page } = await openPage(f)
  await vi.waitFor(() => { expect(titles(page.latest())).toEqual(['提额申请已批准 0 *']) })

  f.inbox.status = 0
  await f.ctx.mindeckInbox.reload()
  expect(page.latest()).toMatchObject({ failure: { reason: 'unreachable', requestId: null }, loading: null })
  expect(titles(page.latest())).toEqual(['提额申请已批准 0 *'])

  f.inbox.status = 500
  await f.ctx.mindeckInbox.reload()
  const requestId: unknown = expect.stringMatching(/^req-/)
  expect(page.latest()?.failure).toEqual({ reason: 'failed', requestId })

  f.inbox.status = 200
  await f.ctx.mindeckInbox.reload()
  expect(page.latest()?.failure).toBeNull()

  f.inbox.status = 503
  await f.ctx.mindeckInbox.loadMore()
  f.inbox.items = [0, 1, 2].map(index => notification(index))
  await f.ctx.mindeckInbox.reload()
  f.inbox.status = 503
  await f.ctx.mindeckInbox.loadMore()
  expect(page.latest()).toMatchObject({ failure: { reason: 'failed' }, loading: null })
})

it('ends the session when Mindeck Cloud rejects the token and starts over for the next member', async () => {
  const f = await fixture()
  f.inbox.items = [notification(0)]
  const { summary, page } = await openPage(f)
  await vi.waitFor(() => { expect(page.latest()?.items).toHaveLength(1) })

  f.inbox.token = 'desktop-token-2'
  await f.ctx.mindeckInbox.reload()
  expect(f.account.rejectToken).toHaveBeenCalledWith('desktop-token-1')
  await vi.waitFor(() => { expect(page.latest()?.items).toBeNull() })
  expect(summary.latest()?.available).toBe(false)

  f.inbox.items = [{ ...notification(0), id: 'other', title: '离职交接' }]
  f.change('desktop-token-2')
  await vi.waitFor(() => { expect(titles(page.latest())).toEqual(['离职交接 *']) })
  expect(summary.latest()?.available).toBe(true)
})
