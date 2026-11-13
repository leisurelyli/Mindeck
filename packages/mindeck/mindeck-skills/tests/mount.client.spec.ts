/**
 * The skills page registers its row and page, streams the listing, starts conversations with a skill, reads
 * instructions, and leaves with the plugin.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { StaticRemoteAccess } from '@deepseek-ai/dsh-client-test-runtime'
import type { MindeckConversationRequest, MindeckDraft } from '@deepseek-ai/dsh-mindeck-account/client'
import { RemoteError, type RemoteResult, type TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { MindeckSkillCatalog } from '../src/types.ts'
import type { MindeckSkillsInjected } from '../src/client/operations.ts'
import { mountSkills, SKILLS_PANEL_ID } from '../src/client/mount.ts'

/** Matches the draft edit a page passes with its request. */
const anyFunction: unknown = expect.any(Function)

const contribution: TypertRemoteContribution = { package: '@deepseek-ai/dsh-mindeck-skills', descriptors: [] }
const catalog: MindeckSkillCatalog = {
  company: '星河科技',
  skills: [{ name: 'weekly-report', displayName: '周报助手', category: '写作', description: '写周报。', recommended: true, searchKeys: ['zbzs'] }],
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
  const read = { result: { ok: true, value: '# 周报助手' } as RemoteResult<string> | Error }
  ctx.provide('remote.mindeckSkills', {
    async *watch(signal: AbortSignal): AsyncIterable<MindeckSkillCatalog> {
      yield catalog
      await new Promise<void>((resolve) => { signal.addEventListener('abort', () => { resolve() }, { once: true }) })
    },
    instructions: vi.fn(async (_name: string) => {
      if (read.result instanceof Error) throw read.result
      return read.result
    }),
  } as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  new StaticRemoteAccess(ctx)
  const draft = { draft: '/meeting-notes 整理', draftRev: 3 }
  const bail = vi.fn((): true | undefined => true)
  const target: MindeckDraft = { scope: { bail } as never, input: { state: { getSnapshot: () => draft } } as never }
  const startConversation = vi.fn(async (request?: MindeckConversationRequest) => { request?.prepare?.(target) })
  ctx.provide('mindeckComposer', { startConversation, draft: () => undefined } as never)
  await ctx.plugin(SlotRegistry)
  ctx.slots.register({ name: 'root', children: {
    'main': { kind: 'keyed', scope: 'root' },
    'sidebar.panellist': { kind: 'list', scope: 'root' },
  } } as never, () => null)
  return { ctx, unmount, bail, target, startConversation, read }
}

function page(entry: { inject?: unknown } | undefined): MindeckSkillsInjected {
  if (typeof entry?.inject !== 'function') throw new Error('Expected an injected skills face')
  return (entry.inject as () => MindeckSkillsInjected)()
}

it('registers the row and the page, starts a conversation with the skill, reads instructions, and withdraws before the Remote', async () => {
  const f = await fixture()
  try {
    const dispose = await mountSkills(f.ctx, contribution)
    expect(f.ctx.slots.entries('sidebar.panellist').map(entry => entry.options)).toMatchObject([{ id: SKILLS_PANEL_ID, order: -20 }])
    const [entry] = f.ctx.slots.entries('main')
    expect(entry?.options.key).toBe(SKILLS_PANEL_ID)
    const operations = page(entry)
    await vi.waitFor(() => { expect(operations.hooks.catalog.getSnapshot()).toEqual({ catalog, failed: false }) })

    await operations.use('weekly-report')
    expect(f.startConversation).toHaveBeenCalledWith({ prepare: anyFunction })
    expect(f.bail).toHaveBeenCalledWith(f.target.scope, 'slash/input-insert-text', { text: '/weekly-report ', span: { start: 0, end: 15, draftRev: 3 } })

    expect(await operations.instructions('weekly-report')).toEqual({ ok: true, markdown: '# 周报助手' })
    f.read.result = { ok: false, error: new RemoteError('mindeck-skills/not-found', 'no such skill', {}) }
    expect(await operations.instructions('gone')).toEqual({ ok: false, reason: 'missing' })
    f.read.result = { ok: false, error: new RemoteError('gateway/internal', 'not readable', {}) }
    expect(await operations.instructions('weekly-report')).toEqual({ ok: false, reason: 'failed' })
    f.read.result = new Error('connection lost')
    expect(await operations.instructions('weekly-report')).toEqual({ ok: false, reason: 'failed' })

    await dispose()
    expect(f.ctx.slots.entries('main')).toHaveLength(0)
    expect(f.ctx.slots.entries('sidebar.panellist')).toHaveLength(0)
    expect(operations.hooks.catalog.getSnapshot()).toEqual({ catalog: undefined, failed: false })
    expect(f.unmount).toHaveBeenCalledOnce()
  } finally { await f.ctx.fiber.dispose() }
})
