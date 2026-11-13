/**
 * The company messages UI registers its row, badge, and page while the member's Mindeck Cloud has an inbox, follows
 * the items only while the page shows, forwards its operations, and leaves before the Remote.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { StaticRemoteAccess } from '@deepseek-ai/dsh-client-test-runtime'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { MindeckInboxPage, MindeckInboxSummary } from '../src/types.ts'
import type { MindeckInboxBadgeInjected, MindeckInboxPageInjected } from '../src/client/operations.ts'
import { INBOX_PANEL_ID, mountInbox } from '../src/client/mount.ts'

const contribution: TypertRemoteContribution = { package: '@deepseek-ai/dsh-mindeck-inbox', descriptors: [] }
const PAGE: MindeckInboxPage = { items: [], more: false, loading: null, failure: null }

/** A stream that yields queued frames and ends when its signal aborts. */
function frames<T>() {
  const queued: T[] = []
  let wake: (() => void) | undefined
  const push = (value: T) => { queued.push(value); wake?.() }
  async function* open(signal: AbortSignal): AsyncIterable<T> {
    signal.addEventListener('abort', () => { wake?.() }, { once: true })
    while (!signal.aborted) {
      const next = queued.shift()
      if (next !== undefined) { yield next; continue }
      await new Promise<void>((resolve) => { wake = resolve })
    }
  }
  return { push, open }
}

async function fixture() {
  const ctx = new Context()
  const unmount = vi.fn(async () => {})
  class TestRemote extends Service {
    constructor() { super(ctx, 'remote') }
    async $mount(value: TypertRemoteContribution) { expect(value).toBe(contribution); return unmount }
    $stream<T>(spec: { open: (signal: AbortSignal) => AsyncIterable<T> }) {
      const lifetime = new AbortController()
      const source = spec.open(lifetime.signal)
      return {
        async *[Symbol.asyncIterator]() { for await (const value of source) yield { value, accept: () => {} } },
        dispose: async () => { lifetime.abort() },
      }
    }
  }
  new TestRemote()
  const summaries = frames<MindeckInboxSummary>()
  const pages = frames<MindeckInboxPage>()
  const opened = vi.fn()
  const remote = {
    watch: (signal: AbortSignal) => summaries.open(signal),
    items: (signal: AbortSignal) => { opened(); return pages.open(signal) },
    reload: vi.fn(async () => ({ ok: true })),
    loadMore: vi.fn(async () => ({ ok: true })),
    markRead: vi.fn(async () => { throw new Error('connection lost') }),
  }
  ctx.provide('remote.mindeckInbox', remote as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  new StaticRemoteAccess(ctx)
  await ctx.plugin(SlotRegistry)
  ctx.slots.register({ name: 'root', children: {
    'main': { kind: 'keyed', scope: 'root' },
    'sidebar.panellist': { kind: 'list', scope: 'root' },
    'sidebar.panellist.badge': { kind: 'list', scope: 'root' },
  } } as never, () => null)
  return { ctx, unmount, summaries, pages, opened, remote }
}

function badgeFace(entry: { inject?: unknown } | undefined): MindeckInboxBadgeInjected {
  if (typeof entry?.inject !== 'function') throw new Error('Expected an injected badge face')
  return (entry.inject as () => MindeckInboxBadgeInjected)()
}

function pageFace(entry: { inject?: unknown } | undefined): MindeckInboxPageInjected {
  if (typeof entry?.inject !== 'function') throw new Error('Expected an injected page face')
  return (entry.inject as () => MindeckInboxPageInjected)()
}

it('shows the row, its badge, and the page while the member has an inbox, and withdraws them before the Remote', async () => {
  const f = await fixture()
  try {
    const dispose = await mountInbox(f.ctx, contribution)
    expect(f.ctx.slots.entries('sidebar.panellist')).toEqual([])
    f.summaries.push({ available: true, unread: 2, release: null })
    await vi.waitFor(() => { expect(f.ctx.slots.entries('sidebar.panellist').map(entry => entry.options)).toMatchObject([{ id: INBOX_PANEL_ID, order: -5 }]) })
    expect(f.ctx.slots.entries('sidebar.panellist.badge').map(entry => entry.options.id)).toEqual([INBOX_PANEL_ID])
    const badge = badgeFace(f.ctx.slots.entries('sidebar.panellist.badge')[0])
    expect(badge.hooks.summary.getSnapshot().summary?.unread).toBe(2)
    expect(f.ctx.locale.bind('mindeckInbox')('title')).toBe('Company messages')

    const page = pageFace(f.ctx.slots.entries('main')[0])
    expect(f.opened).not.toHaveBeenCalled()
    const stop = page.follow()
    f.pages.push(PAGE)
    await vi.waitFor(() => { expect(page.hooks.page.getSnapshot()).toEqual({ page: PAGE, failed: false }) })
    expect(f.opened).toHaveBeenCalledOnce()
    page.reload()
    page.loadMore()
    page.markRead({ all: true })
    expect(f.remote.reload).toHaveBeenCalledOnce()
    expect(f.remote.loadMore).toHaveBeenCalledOnce()
    expect(f.remote.markRead).toHaveBeenCalledWith({ all: true })
    stop()

    f.summaries.push({ available: false, unread: 0, release: null })
    await vi.waitFor(() => { expect(f.ctx.slots.entries('sidebar.panellist')).toEqual([]) })
    expect(f.ctx.slots.entries('sidebar.panellist.badge')).toEqual([])
    expect(f.ctx.slots.entries('main')).toEqual([])

    f.summaries.push({ available: true, unread: 0, release: null })
    await vi.waitFor(() => { expect(f.ctx.slots.entries('main')).toHaveLength(1) })
    await dispose()
    expect(f.ctx.slots.entries('sidebar.panellist')).toEqual([])
    expect(f.ctx.slots.entries('main')).toEqual([])
    expect(f.unmount).toHaveBeenCalledOnce()
  } finally { await f.ctx.fiber.dispose() }
})
