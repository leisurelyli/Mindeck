/**
 * The cards register above the composer, stream the catalog, switch presets through the registry Remote, put starters
 * in the draft, and leave with the plugin.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { StaticRemoteAccess } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { RemoteError, type RemoteResult, type TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { MindeckEmployeeCatalog } from '../src/types.ts'
import type { MindeckEmployeesInjected } from '../src/client/operations.ts'
import { EMPLOYEE_DOCK_ID, mountEmployees } from '../src/client/mount.ts'

const contribution: TypertRemoteContribution = { package: '@deepseek-ai/dsh-mindeck-employees', descriptors: [] }
const sessionId = 'session-1' as SessionId
const catalog: MindeckEmployeeCatalog = {
  cards: [
    { kind: 'general', presetId: 'mindeck-general' },
    { kind: 'employee', presetId: 'mindeck-employee-e1', employeeId: 'e1', name: '法务专员', avatar: 'legal', tagline: '审合同', starters: ['审一份合同'], draft: false },
  ],
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
  ctx.provide('remote.mindeckEmployees', {
    async *watch(signal: AbortSignal): AsyncIterable<MindeckEmployeeCatalog> {
      yield catalog
      await new Promise<void>((resolve) => { signal.addEventListener('abort', () => { resolve() }, { once: true }) })
    },
  } as never)
  const selected = { result: { ok: true, value: 'mindeck-employee-e1' } as RemoteResult<string> | Error }
  const select = vi.fn(async (_session: SessionId, _preset: string) => {
    if (selected.result instanceof Error) throw selected.result
    return selected.result
  })
  ctx.provide('remote.agentPresets', { select } as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  new StaticRemoteAccess(ctx)
  const draft = { draft: '', draftRev: 3 }
  const input = { state: { getSnapshot: () => draft }, focus: vi.fn() }
  const bail = vi.fn((): true | undefined => true)
  const scope = { bail, get: (name: string) => name === 'conversation' ? { input: { for: () => input } } : undefined }
  ctx.provide('sessions', { scope: (id: SessionId) => id === sessionId ? scope : undefined } as never)
  await ctx.plugin(SlotRegistry)
  ctx.slots.register({ name: 'root', children: { 'conversation.input.dock': { kind: 'list', scope: 'session' } } } as never, () => null)
  return { ctx, unmount, select, selected, draft, input, bail, scope }
}

function face(entry: { inject?: unknown } | undefined, id: SessionId): MindeckEmployeesInjected {
  if (typeof entry?.inject !== 'function') throw new Error('Expected an injected employees face')
  return (entry.inject as (sessionId: SessionId) => MindeckEmployeesInjected)(id)
}

it('registers the cards, streams the catalog, switches presets, puts starters in the draft, and withdraws before the Remote', async () => {
  const f = await fixture()
  try {
    const dispose = await mountEmployees(f.ctx, contribution)
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
    expect(f.bail).toHaveBeenLastCalledWith(f.scope, 'slash/input-insert-text', { text: '审一份合同', span: { start: 0, end: 0, draftRev: 3 } })
    expect(f.input.focus).toHaveBeenCalledOnce()
    f.draft.draft = '请看附件'
    expect(operations.insertStarter('审一份合同')).toBe(true)
    expect(f.bail).toHaveBeenLastCalledWith(f.scope, 'slash/input-insert-text', { text: '\n审一份合同', span: { start: 4, end: 4, draftRev: 3 } })
    f.bail.mockReturnValueOnce(undefined)
    expect(operations.insertStarter('审一份合同')).toBe(false)
    expect(f.input.focus).toHaveBeenCalledTimes(2)
    expect(face(entry, 'other' as SessionId).insertStarter('审一份合同')).toBe(false)

    await dispose()
    expect(f.ctx.slots.entries('conversation.input.dock')).toHaveLength(0)
    expect(operations.hooks.catalog.getSnapshot()).toEqual({ catalog: undefined })
    expect(f.unmount).toHaveBeenCalledOnce()
  } finally { await f.ctx.fiber.dispose() }
})
