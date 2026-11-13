/** The skills page registers its sidebar type, streams the listing, puts skills in the draft, and leaves with the plugin. */
import { Context, Service } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { StaticRemoteAccess } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { RemoteError, type RemoteResult, type TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { MindeckSkillCatalog } from '../src/types.ts'
import type { MindeckSkillsInjected } from '../src/client/operations.ts'
import { mountSkills, SKILLS_TAB_ID } from '../src/client/mount.ts'

const contribution: TypertRemoteContribution = { package: '@deepseek-ai/dsh-mindeck-skills', descriptors: [] }
const sessionId = 'session-1' as SessionId
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
  ctx.provide('remote.mindeckSkills', {
    async *watch(signal: AbortSignal): AsyncIterable<MindeckSkillCatalog> {
      yield catalog
      await new Promise<void>((resolve) => { signal.addEventListener('abort', () => { resolve() }, { once: true }) })
    },
  } as never)
  const listed = { result: { ok: true, value: { skills: [{ name: 'docx', description: 'Word', modelInvocable: true }] } } as RemoteResult<unknown> }
  ctx.provide('remote.skills', { list: vi.fn(async () => listed.result) } as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  new StaticRemoteAccess(ctx)
  const tabs: string[] = []
  ctx.provide('sidebarRightTabs', {
    register: (definition: { id: string }) => { tabs.push(definition.id); return () => { tabs.splice(tabs.indexOf(definition.id), 1) } },
  } as never)
  const openResource = vi.fn()
  ctx.provide('sidebarRight', { openResource } as never)
  const draft = { draft: '/meeting-notes 整理', draftRev: 3 }
  const input = { state: { getSnapshot: () => draft }, focus: vi.fn() }
  const bail = vi.fn((): true | undefined => true)
  const scope = { bail, get: (name: string) => name === 'conversation' ? { input: { for: () => input } } : undefined }
  ctx.provide('sessions', {
    scope: (id: SessionId) => id === sessionId ? scope : undefined,
    list: { getSnapshot: () => ({ byId: { [sessionId]: { cwd: '/work' } } }) },
  } as never)
  await ctx.plugin(SlotRegistry)
  ctx.slots.register({ name: 'root', children: { 'sidebar.right.pane.tab': { kind: 'keyed', scope: 'session' } } } as never, () => null)
  return { ctx, unmount, tabs, input, bail, scope, openResource, listed }
}

function face(entry: { inject?: unknown } | undefined, id: SessionId): MindeckSkillsInjected {
  if (typeof entry?.inject !== 'function') throw new Error('Expected an injected skills face')
  return (entry.inject as (sessionId: SessionId) => MindeckSkillsInjected)(id)
}

it('registers the sidebar page, reads both listings, puts skills in the draft, previews instructions, and withdraws before the Remote', async () => {
  const f = await fixture()
  try {
    const dispose = await mountSkills(f.ctx, contribution)
    expect(f.tabs).toEqual([SKILLS_TAB_ID])
    const [entry] = f.ctx.slots.entries('sidebar.right.pane.tab')
    expect(entry?.options.key).toBe(SKILLS_TAB_ID)
    const operations = face(entry, sessionId)
    expect(face(entry, sessionId)).toBe(operations)
    await vi.waitFor(() => { expect(operations.hooks.catalog.getSnapshot()).toEqual({ catalog, failed: false }) })
    expect(await operations.sessionSkills()).toEqual([{ name: 'docx', description: 'Word', modelInvocable: true }])
    f.listed.result = { ok: false, error: new RemoteError('gateway/internal', 'not readable', {}) }
    expect(await operations.sessionSkills()).toBeUndefined()

    expect(operations.useSkill('weekly-report')).toBe(true)
    expect(f.bail).toHaveBeenCalledWith(f.scope, 'slash/input-insert-text', { text: '/weekly-report ', span: { start: 0, end: 15, draftRev: 3 } })
    expect(f.input.focus).toHaveBeenCalledOnce()
    f.bail.mockReturnValueOnce(undefined)
    expect(operations.useSkill('weekly-report')).toBe(false)
    expect(f.input.focus).toHaveBeenCalledOnce()
    expect(face(entry, 'other' as SessionId).useSkill('weekly-report')).toBe(false)

    operations.preview('/work/.skills/docx/SKILL.md')
    expect(f.openResource).toHaveBeenCalledOnce()

    await dispose()
    expect(f.tabs).toEqual([])
    expect(f.ctx.slots.entries('sidebar.right.pane.tab')).toHaveLength(0)
    expect(operations.hooks.catalog.getSnapshot()).toEqual({ catalog: undefined, failed: false })
    expect(f.unmount).toHaveBeenCalledOnce()
  } finally { await f.ctx.fiber.dispose() }
})
