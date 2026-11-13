/**
 * The cards register above the composer, stream the catalog, switch presets through the registry Remote, put starters
 * in the draft, and link to the digital-employee page; the page and its row exist while the company offers an
 * employee, start conversations with an employee, and leave with the plugin.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { StaticRemoteAccess } from '@deepseek-ai/dsh-client-test-runtime'
import type { MindeckConversationRequest, MindeckDraft } from '@deepseek-ai/dsh-mindeck-account/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { RemoteError, type RemoteResult, type TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { MindeckEmployeeCatalog } from '../src/types.ts'
import type { MindeckEmployeesInjected, MindeckEmployeesPageInjected } from '../src/client/operations.ts'
import { EMPLOYEE_DOCK_ID, EMPLOYEES_PANEL_ID, mountEmployees } from '../src/client/mount.ts'

/** Matches the draft edit a page passes with its request. */
const anyFunction: unknown = expect.any(Function)

const contribution: TypertRemoteContribution = { package: '@deepseek-ai/dsh-mindeck-employees', descriptors: [] }
const sessionId = 'session-1' as SessionId
const catalog: MindeckEmployeeCatalog = {
  cards: [
    { kind: 'general', presetId: 'mindeck-general' },
    { kind: 'employee', presetId: 'mindeck-employee-e1', employeeId: 'e1', name: '法务专员', avatar: 'legal', tagline: '审合同', starters: ['审一份合同'], draft: false },
  ],
}

/** Catalog frames the fake `watch` stream delivers in order. */
class Frames {
  private readonly queue: MindeckEmployeeCatalog[] = []
  private wake: (() => void) | undefined
  push(value: MindeckEmployeeCatalog): void { this.queue.push(value); this.wake?.() }
  async *stream(signal: AbortSignal): AsyncIterable<MindeckEmployeeCatalog> {
    while (!signal.aborted) {
      const next = this.queue.shift()
      if (next !== undefined) { yield next; continue }
      await new Promise<void>((resolve) => {
        this.wake = resolve
        signal.addEventListener('abort', () => { resolve() }, { once: true })
      })
    }
  }
}

async function fixture() {
  const ctx = new Context()
  const frames = new Frames()
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
  ctx.provide('remote.mindeckEmployees', { watch: (signal: AbortSignal) => frames.stream(signal) } as never)
  const selected = { result: { ok: true, value: 'mindeck-employee-e1' } as RemoteResult<string> | Error }
  const select = vi.fn(async (_session: SessionId, _preset: string) => {
    if (selected.result instanceof Error) throw selected.result
    return selected.result
  })
  ctx.provide('remote.agentPresets', { select } as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  new StaticRemoteAccess(ctx)
  const selectPanel = vi.fn()
  ctx.provide('layout', { selectPanel } as never)
  const draft = { draft: '', draftRev: 3 }
  const focus = vi.fn()
  const bail = vi.fn((): true | undefined => true)
  const target: MindeckDraft = { scope: { bail } as never, input: { state: { getSnapshot: () => draft }, focus } as never }
  const startConversation = vi.fn(async (request?: MindeckConversationRequest) => { request?.prepare?.(target) })
  ctx.provide('mindeckComposer', {
    draft: (id: SessionId) => id === sessionId ? target : undefined, startConversation,
  } as never)
  await ctx.plugin(SlotRegistry)
  ctx.slots.register({ name: 'root', children: {
    'conversation.input.dock': { kind: 'list', scope: 'session' },
    'main': { kind: 'keyed', scope: 'root' },
    'sidebar.panellist': { kind: 'list', scope: 'root' },
  } } as never, () => null)
  return { ctx, frames, unmount, select, selected, draft, focus, bail, target, selectPanel, startConversation }
}

function face(entry: { inject?: unknown } | undefined, id: SessionId): MindeckEmployeesInjected {
  if (typeof entry?.inject !== 'function') throw new Error('Expected an injected employees face')
  return (entry.inject as (sessionId: SessionId) => MindeckEmployeesInjected)(id)
}

function page(entry: { inject?: unknown } | undefined): MindeckEmployeesPageInjected {
  if (typeof entry?.inject !== 'function') throw new Error('Expected an injected page face')
  return (entry.inject as () => MindeckEmployeesPageInjected)()
}

it('registers the cards, streams the catalog, switches presets, puts starters in the draft, and withdraws before the Remote', async () => {
  const f = await fixture()
  try {
    const dispose = await mountEmployees(f.ctx, contribution)
    f.frames.push(catalog)
    const [entry] = f.ctx.slots.entries('conversation.input.dock')
    expect(entry?.options).toMatchObject({ id: EMPLOYEE_DOCK_ID })
    const operations = face(entry, sessionId)
    expect(face(entry, sessionId)).toBe(operations)
    await vi.waitFor(() => { expect(operations.hooks.catalog.getSnapshot()).toEqual({ catalog }) })

    expect(await operations.select('mindeck-employee-e1')).toBeUndefined()
    expect(f.select).toHaveBeenCalledWith(sessionId, 'mindeck-employee-e1')
    f.selected.result = { ok: false, error: new RemoteError('agent-preset/invalid', 'agent preset is invalid', { agentPreset: 'x', reason: '组合无法加载' }) }
    expect(await operations.select('x')).toBe('组合无法加载')
    f.selected.result = { ok: false, error: new RemoteError('agent-preset/locked', 'This session has already started', { sessionId, agentPreset: 'x' }) }
    expect(await operations.select('x')).toBe('This session has already started')
    f.selected.result = new Error('connection lost')
    expect(await operations.select('x')).toBe('connection lost')

    expect(operations.insertStarter('审一份合同')).toBe(true)
    expect(f.bail).toHaveBeenLastCalledWith(f.target.scope, 'slash/input-insert-text', { text: '审一份合同', span: { start: 0, end: 0, draftRev: 3 } })
    expect(f.focus).toHaveBeenCalledOnce()
    f.draft.draft = '请看附件'
    expect(operations.insertStarter('审一份合同')).toBe(true)
    expect(f.bail).toHaveBeenLastCalledWith(f.target.scope, 'slash/input-insert-text', { text: '\n审一份合同', span: { start: 4, end: 4, draftRev: 3 } })
    f.bail.mockReturnValueOnce(undefined)
    expect(operations.insertStarter('审一份合同')).toBe(false)
    expect(f.focus).toHaveBeenCalledTimes(2)
    expect(face(entry, 'other' as SessionId).insertStarter('审一份合同')).toBe(false)

    operations.openAll()
    expect(f.selectPanel).toHaveBeenCalledWith(EMPLOYEES_PANEL_ID)

    await dispose()
    expect(f.ctx.slots.entries('conversation.input.dock')).toHaveLength(0)
    expect(operations.hooks.catalog.getSnapshot()).toEqual({ catalog: undefined })
    expect(f.unmount).toHaveBeenCalledOnce()
  } finally { await f.ctx.fiber.dispose() }
})

it('keeps the page and its row while the company offers an employee, starts conversations with one, and leaves with the plugin', async () => {
  const f = await fixture()
  try {
    const dispose = await mountEmployees(f.ctx, contribution)
    // Without the catalog, or with only the general assistant, neither the row nor the page exists.
    expect(f.ctx.slots.entries('sidebar.panellist')).toHaveLength(0)
    f.frames.push({ cards: [{ kind: 'general', presetId: 'mindeck-general' }] })
    const [dock] = f.ctx.slots.entries('conversation.input.dock')
    await vi.waitFor(() => { expect(face(dock, sessionId).hooks.catalog.getSnapshot().catalog?.cards).toHaveLength(1) })
    expect(f.ctx.slots.entries('main')).toHaveLength(0)

    f.frames.push(catalog)
    await vi.waitFor(() => { expect(f.ctx.slots.entries('main')).toHaveLength(1) })
    expect(f.ctx.slots.entries('sidebar.panellist').map(entry => entry.options)).toMatchObject([{ id: EMPLOYEES_PANEL_ID, order: -30 }])
    const [entry] = f.ctx.slots.entries('main')
    expect(entry?.options.key).toBe(EMPLOYEES_PANEL_ID)
    const operations = page(entry)

    await operations.start('mindeck-employee-e1')
    expect(f.startConversation).toHaveBeenLastCalledWith({ agentPreset: 'mindeck-employee-e1' })
    expect(f.bail).not.toHaveBeenCalled()
    f.draft.draft = '附件见上'
    await operations.start('mindeck-employee-e1', '审一份合同')
    expect(f.startConversation).toHaveBeenLastCalledWith({ agentPreset: 'mindeck-employee-e1', prepare: anyFunction })
    expect(f.bail).toHaveBeenCalledWith(f.target.scope, 'slash/input-insert-text', { text: '\n审一份合同', span: { start: 4, end: 4, draftRev: 3 } })

    // The company withdrew its last employee: the row and the page leave with it.
    f.frames.push({ cards: [{ kind: 'general', presetId: 'mindeck-general' }] })
    await vi.waitFor(() => { expect(f.ctx.slots.entries('main')).toHaveLength(0) })
    expect(f.ctx.slots.entries('sidebar.panellist')).toHaveLength(0)
    f.frames.push(catalog)
    await vi.waitFor(() => { expect(f.ctx.slots.entries('main')).toHaveLength(1) })

    await dispose()
    expect(f.ctx.slots.entries('main')).toHaveLength(0)
    expect(f.ctx.slots.entries('sidebar.panellist')).toHaveLength(0)
  } finally { await f.ctx.fiber.dispose() }
})
