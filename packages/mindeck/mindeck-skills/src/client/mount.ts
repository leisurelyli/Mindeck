/** Remote contribution, the listing stream, and the skills sidebar page. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remote-access/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-mindeck-skills/remote'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { IconSkillOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { fileAddressFor } from '@deepseek-ai/dsh-util-workspace-path'
import type { MindeckSkillCatalog } from '../types.ts'
import { en, NS, zh } from './locales.ts'
import type { MindeckSkillsInjected, MindeckSkillsSnapshot } from './operations.ts'
import { skillInsertion } from './sections.ts'
import { SkillsPanel } from './SkillsPanel.tsx'

/** Services required by the page. */
export const inject = ['remote', 'slots', 'locale', 'remoteAccess', 'sidebarRight', 'sidebarRightTabs', 'sessions', 'remote.skills']

/** Identity of the sidebar page type. */
export const SKILLS_TAB_ID = '@deepseek-ai/dsh-mindeck-skills'

function registerUi(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'mindeck-skills: dictionaries')
  const t = ctx.locale.bind(NS)
  const state = createSnapshotStore<MindeckSkillsSnapshot>({ catalog: undefined, failed: false })
  ctx.remoteAccess.whenAccess('mindeckSkills/watch', function* () {
    const stream = ctx.remote.$stream<MindeckSkillCatalog>({
      name: 'Mindeck skills', open: signal => ctx.remote.mindeckSkills.watch(signal),
      ended: () => new Error('Mindeck skills stream ended'),
    })
    // Read across closures: the disposer ends this grant while the frame loop awaits.
    const grant = { ended: false }
    yield () => {
      grant.ended = true
      state.set({ catalog: undefined, failed: false })
      return stream.dispose()
    }
    void (async () => {
      for await (const frame of stream) {
        if (grant.ended) return
        state.set({ catalog: frame.value, failed: false })
        frame.accept()
      }
    })().catch(() => { if (!grant.ended) state.set({ ...state.getSnapshot(), failed: true }) })
  })
  const createFace = (sessionId: SessionId): MindeckSkillsInjected => ({
    hooks: { catalog: state },
    async sessionSkills() {
      const result = await ctx.remote.skills.list({ sessionId })
      return result.ok ? result.value.skills : undefined
    },
    useSkill(name) {
      const scope = ctx.sessions.scope(sessionId)
      const conversation = scope?.get('conversation')
      if (scope === undefined || conversation === undefined) return false
      const input = conversation.input.for(scope)
      const { draft, draftRev } = input.state.getSnapshot()
      const { end, text } = skillInsertion(draft, name)
      const inserted = scope.bail(scope, 'slash/input-insert-text', { text, span: { start: 0, end, draftRev } }) === true
      if (inserted) input.focus()
      return inserted
    },
    preview(path) {
      const cwd = ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd
      ctx.sidebarRight.openResource(fileAddressFor(sessionId, cwd, path))
    },
  })
  // One face per Session keeps the page's operations stable across renders.
  const faces = new Map<SessionId, MindeckSkillsInjected>()
  const face = (sessionId: SessionId): MindeckSkillsInjected => {
    let existing = faces.get(sessionId)
    if (existing === undefined) { existing = createFace(sessionId); faces.set(sessionId, existing) }
    return existing
  }
  ctx.remoteAccess.whenAccess('mindeckSkills/watch', () => ctx.sidebarRightTabs.register({
    id: SKILLS_TAB_ID, kind: 'mindeck-skills', title: () => t('title'),
    guide: [{ id: 'open', order: 41, title: () => t('title'), description: () => t('guideDescription'), icon: IconSkillOutlineRegular }],
  }))
  ctx.remoteAccess.whenAccess('mindeckSkills/watch', () => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: SKILLS_TAB_ID, locale: NS, inject: face,
  }, SkillsPanel)))
}

/**
 * Mount the skills Remote, then the page; withdraw them in reverse order.
 * @param ctx - Client plugin lifetime.
 * @param contribution - generated skills Remote definitions.
 * @returns disposer that removes both contributions.
 */
export async function mountSkills(ctx: Context, contribution: TypertRemoteContribution): Promise<() => Promise<void>> {
  const unmountRemote = await ctx.remote.$mount(contribution)
  const ui = ctx.inject(['remote.mindeckSkills', ...inject.slice(1)], (child) => { registerUi(child) })
  try { await ui } catch (error) { await ui.dispose(); await unmountRemote(); throw error }
  return async () => { await ui.dispose(); await unmountRemote() }
}
