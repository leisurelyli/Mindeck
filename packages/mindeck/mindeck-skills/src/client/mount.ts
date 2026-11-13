/** Remote contribution, the listing stream, and the skills page with its left-sidebar row. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remote-access/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-mindeck-account/client'
import type {} from '@deepseek-ai/dsh-mindeck-skills/remote'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { MindeckSkillCatalog } from '../types.ts'
import { en, NS, zh } from './locales.ts'
import type { MindeckSkillsInjected, MindeckSkillsSnapshot } from './operations.ts'
import { SkillsPanelIcon } from './PanelIcon.tsx'
import { skillInsertion } from './sections.ts'
import { SkillsPage } from './SkillsPage.tsx'

/** Services required by the page. */
export const inject = ['remote', 'slots', 'locale', 'remoteAccess', 'mindeckComposer']

/** Id shared by the left-sidebar row and the main-column page it selects. */
export const SKILLS_PANEL_ID = 'mindeck-skills' as MainPanelId

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
  const page: MindeckSkillsInjected = {
    hooks: { catalog: state },
    use: name => ctx.mindeckComposer.startConversation({
      prepare: ({ scope, input }) => {
        const { draft, draftRev } = input.state.getSnapshot()
        const { end, text } = skillInsertion(draft, name)
        scope.bail(scope, 'slash/input-insert-text', { text, span: { start: 0, end, draftRev } })
      },
    }),
    async instructions(name) {
      const read = await ctx.remote.mindeckSkills.instructions(name)
        .catch((error: unknown) => ({ ok: false as const, error: error instanceof Error ? error : new Error(String(error)) }))
      if (read.ok) return { ok: true, markdown: read.value }
      return { ok: false, reason: 'code' in read.error && read.error.code === 'mindeck-skills/not-found' ? 'missing' : 'failed' }
    },
  }
  // Between the digital-employee row (-30) and the file-library row (-10), before Plugins (0).
  ctx.remoteAccess.whenAccess('mindeckSkills/watch', function* () {
    yield ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: SKILLS_PANEL_ID, locale: NS, inject: () => page }, SkillsPage))
    yield ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
      name: 'sidebar.panellist', id: SKILLS_PANEL_ID, order: -20, locale: NS, label: () => t('title'),
    }, SkillsPanelIcon))
  })
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
