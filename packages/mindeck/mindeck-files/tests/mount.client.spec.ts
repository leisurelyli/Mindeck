// @vitest-environment jsdom
/**
 * The library registers its side panel, its page, and its row, maps Remote failures, writes draft references, and
 * leaves with the plugin.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { StaticRemoteAccess } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { RemoteError, type RemoteResult, type TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { LibraryAvailability, LibraryEntryView } from '../src/types.ts'
import type { MindeckFilesInjected, MindeckFilesPageInjected } from '../src/client/operations.ts'
import { LIBRARY_PANEL_ID, LIBRARY_TAB_ID, mountFiles } from '../src/client/mount.ts'
import type { MindeckConversationRequest, MindeckDraft } from '@deepseek-ai/dsh-mindeck-account/client'
import { LIBRARY_TEXT_NODE } from '../src/client/LibraryReference.tsx'
import type { InputTriggerCandidate } from '@deepseek-ai/dsh-client-ui-input-trigger/client'

/** Matches the draft edit a page passes with its request. */
const anyFunction: unknown = expect.any(Function)

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
    search: vi.fn(async (_query: string, _signal?: AbortSignal): Promise<RemoteResult<LibraryEntryView[]>> => ({ ok: true, value: [
      { path: '/Personal/周报/第一周.md', name: '第一周.md', kind: 'file', writable: true },
      { path: '/研发部/周报', name: '周报', kind: 'folder', writable: true },
    ] })),
    upload: vi.fn(async (_folder: string, _name: string, _content: string, _overwrite: boolean)
    : Promise<RemoteResult<LibraryEntryView>> => ({ ok: false, error: new RemoteError('mindeck-files/exists', 'taken', {}) })),
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
  const target: MindeckDraft = { scope: {} as never, input: input as never }
  const startConversation = vi.fn(async (request?: MindeckConversationRequest) => { request?.prepare?.(target) })
  ctx.provide('mindeckComposer', { draft: (id: SessionId) => id === sessionId ? target : undefined, startConversation } as never)
  const sources: Array<{
    name: string
    codec?: { serialize: (ref: string, signal: AbortSignal) => Promise<string> }
    candidates: (session: unknown, request: { query: string; signal: AbortSignal }) => Promise<readonly InputTriggerCandidate[]>
    onPick: (pick: { candidate: InputTriggerCandidate }) => unknown
  }> = []
  const registerSource = (source: (typeof sources)[number]) => {
    sources.push(source)
    return () => { sources.splice(sources.indexOf(source), 1) }
  }
  ctx.provide('inputTriggers', { registerSource } as never)
  const rules: Array<{ id: string; match: (text: string, from: number, context: never) => unknown }> = []
  ctx.provide('uiConversation', { userText: { register: (rule: (typeof rules)[number]) => {
    rules.push(rule)
    return () => { rules.splice(rules.indexOf(rule), 1) }
  } } } as never)
  await ctx.plugin(SlotRegistry)
  ctx.slots.register({ name: 'root', children: {
    'sidebar.right.pane.tab': { kind: 'keyed', scope: 'session' },
    'conversation.user.text.node': { kind: 'keyed', scope: 'session', inline: true },
    'tool.call.toolview': { kind: 'keyed', scope: 'session' },
    'main': { kind: 'keyed', scope: 'root' },
    'sidebar.panellist': { kind: 'list', scope: 'root' },
  } } as never, () => null)
  return { ctx, remote, unmount, tabs, input, sources, rules, startConversation }
}

function face(entry: { inject?: unknown } | undefined, id: SessionId): MindeckFilesInjected {
  if (typeof entry?.inject !== 'function') throw new Error('Expected an injected library face')
  return (entry.inject as (sessionId: SessionId) => MindeckFilesInjected)(id)
}

function pageFace(entry: { inject?: unknown } | undefined): MindeckFilesPageInjected {
  if (typeof entry?.inject !== 'function') throw new Error('Expected an injected page face')
  return (entry.inject as () => MindeckFilesPageInjected)()
}

it('registers the side panel, the page, and the row, writes library references into the draft, shows them in sent messages, and withdraws all before the Remote', async () => {
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
    expect(await operations.upload('/研发部', new File(['周报'], '周报.md'), false)).toEqual({ ok: false, reason: 'exists' })
    expect(f.remote.upload).toHaveBeenCalledWith('/研发部', '周报.md', Buffer.from('周报').toString('base64'), false)

    const file: LibraryEntryView = { path: '/研发部/规范.md', name: '规范.md', kind: 'file', writable: true }
    expect(operations.addToConversation(file)).toBe(true)
    expect(f.input.insertReference).toHaveBeenCalledWith({
      source: 'mindeck-files', ref: 'library:"/研发部/规范.md"', label: '规范.md', appearance: 'file', clipboardText: 'library:"/研发部/规范.md"',
    }, { start: 5, end: 5, draftRev: 3 })
    expect(f.input.focus).toHaveBeenCalledOnce()
    expect(face(entry, 'other' as SessionId).addToConversation(file)).toBe(false)
    const [source] = f.sources
    if (source === undefined) throw new Error('Expected the library reference source')
    const signal = new AbortController().signal
    expect(await source.candidates({ sessionId }, { query: ' ', signal })).toEqual([])
    const candidates = await source.candidates({ sessionId }, { query: '周报', signal })
    expect(f.remote.search).toHaveBeenCalledWith('周报', signal)
    expect(candidates).toEqual([
      { name: '/Personal/周报/第一周.md', label: '第一周.md', description: 'My files / 周报', icon: 'file', section: 'File library', value: 'file' },
      { name: '/研发部/周报', label: '周报', description: '研发部', icon: 'folder', section: 'File library', value: 'folder' },
    ])
    expect(source.onPick({ candidate: candidates[1]! })).toEqual({ insert: {
      source: 'mindeck-files', ref: 'library:"/研发部/周报/"', label: '周报', appearance: 'folder', clipboardText: 'library:"/研发部/周报/"',
    } })
    const superseded = new AbortController()
    const pending = source.candidates({ sessionId }, { query: '周', signal: superseded.signal })
    superseded.abort()
    expect(await pending).toEqual([])
    expect(f.remote.search).toHaveBeenCalledOnce()
    expect(source?.name).toBe('mindeck-files')
    expect(await source?.codec?.serialize('library:/研发部/规范.md', new AbortController().signal)).toBe('library:/研发部/规范.md')
    expect(operations.addToConversation({ path: '/Shared with me/周报', name: '周报', kind: 'folder', writable: false })).toBe(true)
    expect(f.input.insertReference).toHaveBeenLastCalledWith(expect.objectContaining({
      ref: 'library:"/Shared with me/周报/"', label: '周报', appearance: 'folder',
    }), expect.anything())

    // The page and its row start conversations with the same reference.
    expect(f.ctx.slots.entries('sidebar.panellist').map(item => item.options)).toMatchObject([{ id: LIBRARY_PANEL_ID, order: -10 }])
    const [main] = f.ctx.slots.entries('main')
    expect(main?.options.key).toBe(LIBRARY_PANEL_ID)
    const page = pageFace(main)
    expect(page.hooks.library).toBe(operations.hooks.library)
    expect(await page.list('/研发部')).toEqual({ ok: false, reason: 'denied' })
    await page.startWith({ path: '/研发部/周报', name: '周报', kind: 'folder' })
    expect(f.startConversation).toHaveBeenCalledWith({ prepare: anyFunction })
    expect(f.input.insertReference).toHaveBeenLastCalledWith({
      source: 'mindeck-files', ref: 'library:"/研发部/周报/"', label: '周报', appearance: 'folder', clipboardText: 'library:"/研发部/周报/"',
    }, { start: 5, end: 5, draftRev: 3 })

    const [rule] = f.rules
    expect(rule?.id).toBe(LIBRARY_TEXT_NODE)
    const folderRef = 'library:"/Shared with me/周报/"'
    expect(rule?.match(`读 ${folderRef}，和 library:"/研发部/规范.md"`, 0, undefined as never)).toEqual({
      id: LIBRARY_TEXT_NODE, start: 2, end: 2 + folderRef.length, data: { path: '/Shared with me/周报/' },
    })
    expect(f.ctx.slots.entries('conversation.user.text.node').map(item => item.options.key)).toEqual([LIBRARY_TEXT_NODE])
    expect(f.ctx.slots.entries('tool.call.toolview').map(item => item.options.key))
      .toEqual(['library_list', 'library_search', 'library_download', 'library_upload'])

    await dispose()
    expect(f.tabs).toEqual([])
    expect(f.sources).toEqual([])
    expect(f.rules).toEqual([])
    expect(f.ctx.slots.entries('conversation.user.text.node')).toHaveLength(0)
    expect(f.ctx.slots.entries('sidebar.right.pane.tab')).toHaveLength(0)
    expect(f.ctx.slots.entries('tool.call.toolview')).toHaveLength(0)
    expect(f.ctx.slots.entries('main')).toHaveLength(0)
    expect(f.ctx.slots.entries('sidebar.panellist')).toHaveLength(0)
    expect(operations.hooks.library.getSnapshot()).toEqual({ availability: undefined, failed: false })
    expect(f.unmount).toHaveBeenCalledOnce()
  } finally { await f.ctx.fiber.dispose() }
})
