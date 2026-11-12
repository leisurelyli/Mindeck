/** The library page registers its sidebar type, maps Remote failures, writes draft references, and leaves with the plugin. */
import { Context, Service } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { StaticRemoteAccess } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { RemoteError, type RemoteResult, type TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { LibraryAvailability, LibraryEntryView } from '../src/types.ts'
import type { MindeckFilesInjected } from '../src/client/operations.ts'
import { LIBRARY_TAB_ID, mountFiles } from '../src/client/mount.ts'

const contribution: TypertRemoteContribution = { package: '@deepseek-ai/dsh-mindeck-files', descriptors: [] }
const sessionId = 'session-1' as SessionId

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
  const remote = {
    async *watch(signal: AbortSignal): AsyncIterable<LibraryAvailability> {
      yield 'ready'
      await new Promise<void>((resolve) => { signal.addEventListener('abort', () => { resolve() }, { once: true }) })
    },
    spaces: vi.fn(async (): Promise<RemoteResult<never[]>> => ({ ok: true, value: [] })),
    list: vi.fn(async (_path: string): Promise<RemoteResult<LibraryEntryView[]>> => ({
      ok: false, error: new RemoteError('mindeck-files/denied', 'no access', {}),
    })),
    search: vi.fn(async (_query: string): Promise<RemoteResult<LibraryEntryView[]>> => ({ ok: true, value: [] })),
  }
  ctx.provide('remote.mindeckFiles', remote as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  new StaticRemoteAccess(ctx)
  const tabs: string[] = []
  ctx.provide('sidebarRightTabs', {
    register: (definition: { id: string }) => { tabs.push(definition.id); return () => { tabs.splice(tabs.indexOf(definition.id), 1) } },
  } as never)
  const draft = { draft: 'Read ', draftRev: 3 }
  const input = { state: { getSnapshot: () => draft }, insertReference: vi.fn(() => true), focus: vi.fn() }
  const scope = { get: (name: string) => name === 'conversation' ? { input: { for: () => input } } : undefined }
  ctx.provide('sessions', { scope: (id: SessionId) => id === sessionId ? scope : undefined } as never)
  const sources: Array<{ name: string; codec?: { serialize: (ref: string, signal: AbortSignal) => Promise<string> } }> = []
  const registerSource = (source: (typeof sources)[number]) => {
    sources.push(source)
    return () => { sources.splice(sources.indexOf(source), 1) }
  }
  ctx.provide('inputTriggers', { registerSource } as never)
  await ctx.plugin(SlotRegistry)
  ctx.slots.register({ name: 'root', children: {
    'sidebar.right.pane.tab': { kind: 'keyed', scope: 'session' },
  } } as never, () => null)
  return { ctx, remote, unmount, tabs, input, sources }
}

function face(entry: { inject?: unknown } | undefined, id: SessionId): MindeckFilesInjected {
  if (typeof entry?.inject !== 'function') throw new Error('Expected an injected library face')
  return (entry.inject as (sessionId: SessionId) => MindeckFilesInjected)(id)
}

it('registers the sidebar type and page, writes a library reference into the draft, and withdraws both before the Remote', async () => {
  const f = await fixture()
  try {
    const dispose = await mountFiles(f.ctx, contribution)
    expect(f.tabs).toEqual([LIBRARY_TAB_ID])
    const [entry] = f.ctx.slots.entries('sidebar.right.pane.tab')
    expect(entry?.options.key).toBe(LIBRARY_TAB_ID)
    const operations = face(entry, sessionId)
    expect(face(entry, sessionId)).toBe(operations)
    await vi.waitFor(() => { expect(operations.hooks.library.getSnapshot().availability).toBe('ready') })
    expect(await operations.list('/研发部')).toEqual({ ok: false, reason: 'denied' })
    expect(await operations.spaces()).toEqual({ ok: true, value: [] })

    const file: LibraryEntryView = { path: '/研发部/规范.md', name: '规范.md', kind: 'file', writable: true }
    expect(operations.addToConversation(file)).toBe(true)
    expect(f.input.insertReference).toHaveBeenCalledWith({
      source: 'mindeck-files', ref: 'library:/研发部/规范.md', label: '规范.md', appearance: 'file', clipboardText: 'library:/研发部/规范.md',
    }, { start: 5, end: 5, draftRev: 3 })
    expect(f.input.focus).toHaveBeenCalledOnce()
    expect(face(entry, 'other' as SessionId).addToConversation(file)).toBe(false)
    const [source] = f.sources
    expect(source?.name).toBe('mindeck-files')
    expect(await source?.codec?.serialize('library:/研发部/规范.md', new AbortController().signal)).toBe('library:/研发部/规范.md')

    await dispose()
    expect(f.tabs).toEqual([])
    expect(f.sources).toEqual([])
    expect(f.ctx.slots.entries('sidebar.right.pane.tab')).toHaveLength(0)
    expect(operations.hooks.library.getSnapshot()).toEqual({ availability: undefined, failed: false })
    expect(f.unmount).toHaveBeenCalledOnce()
  } finally { await f.ctx.fiber.dispose() }
})
