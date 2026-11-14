/**
 * The catalog streams from the Host; the digital-employee page and its row exist while the company offers an
 * employee, start conversations with an employee, and leave with the plugin before the Remote. Nothing is added
 * above the composer.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { StaticRemoteAccess } from '@deepseek-ai/dsh-client-test-runtime'
import type { MindeckConversationRequest, MindeckDraft } from '@deepseek-ai/dsh-mindeck-account/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { MindeckEmployeeCatalog } from '../src/types.ts'
import type { MindeckEmployeesPageInjected } from '../src/client/operations.ts'
import { EMPLOYEES_PANEL_ID, mountEmployees } from '../src/client/mount.ts'

/** Matches the draft edit a page passes with its request. */
const anyFunction: unknown = expect.any(Function)

const contribution: TypertRemoteContribution = { package: '@deepseek-ai/dsh-mindeck-employees', descriptors: [] }
const sessionId = 'session-1' as SessionId
const catalog: MindeckEmployeeCatalog = {
  cards: [
    { kind: 'general', presetId: 'mindeck-general' },
    { kind: 'employee', presetId: 'mindeck-employee-e1', employeeId: 'e1', name: '法务专员', avatar: 'legal', tagline: '审合同', starters: ['审一份合同'], draft: false,
      folders: [], model: null },
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
  ctx.provide('locale', new LocaleRuntime(ctx))
  new StaticRemoteAccess(ctx)
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
  return { ctx, frames, unmount, draft, focus, bail, target, startConversation }
}

function page(entry: { inject?: unknown } | undefined): MindeckEmployeesPageInjected {
  if (typeof entry?.inject !== 'function') throw new Error('Expected an injected page face')
  return (entry.inject as () => MindeckEmployeesPageInjected)()
}

it('keeps the page and its row while the company offers an employee, starts conversations with one, and leaves with the plugin', async () => {
  const f = await fixture()
  try {
    const dispose = await mountEmployees(f.ctx, contribution)
    // Without the catalog, or with only the general assistant, neither the row nor the page exists.
    expect(f.ctx.slots.entries('sidebar.panellist')).toHaveLength(0)
    f.frames.push({ cards: [{ kind: 'general', presetId: 'mindeck-general' }] })
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(f.ctx.slots.entries('main')).toHaveLength(0)

    f.frames.push(catalog)
    await vi.waitFor(() => { expect(f.ctx.slots.entries('main')).toHaveLength(1) })
    expect(f.ctx.slots.entries('sidebar.panellist').map(entry => entry.options)).toMatchObject([{ id: EMPLOYEES_PANEL_ID, order: -30 }])
    const [entry] = f.ctx.slots.entries('main')
    expect(entry?.options.key).toBe(EMPLOYEES_PANEL_ID)
    const operations = page(entry)
    expect(operations.hooks.catalog.getSnapshot()).toEqual({ catalog })

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

    expect(f.ctx.slots.entries('conversation.input.dock')).toHaveLength(0)

    await dispose()
    expect(f.ctx.slots.entries('main')).toHaveLength(0)
    expect(f.ctx.slots.entries('sidebar.panellist')).toHaveLength(0)
    expect(operations.hooks.catalog.getSnapshot()).toEqual({ catalog: undefined })
    expect(f.unmount).toHaveBeenCalledOnce()
  } finally { await f.ctx.fiber.dispose() }
})
