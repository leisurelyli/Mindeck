/** Remote contribution, the card stream, and the digital-employee page with its left-sidebar row. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remote-access/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { MindeckDraft } from '@deepseek-ai/dsh-mindeck-account/client'
import type {} from '@deepseek-ai/dsh-mindeck-employees/remote'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { MindeckEmployeeCatalog } from '../types.ts'
import { offersEmployees, starterInsertion } from './cards.ts'
import { EmployeesPage } from './EmployeesPage.tsx'
import { en, NS, zh } from './locales.ts'
import type { MindeckEmployeesPageInjected, MindeckEmployeesSnapshot } from './operations.ts'
import { EmployeesPanelIcon } from './PanelIcon.tsx'

/** Services required by the page. */
export const inject = ['remote', 'slots', 'locale', 'remoteAccess', 'mindeckComposer']

/** Id shared by the left-sidebar row and the main-column page it selects. */
export const EMPLOYEES_PANEL_ID = 'mindeck-employees' as MainPanelId

/**
 * Put a starter request in a draft without sending it.
 * @param target - the conversation's composer.
 * @param starter - the starter request.
 * @returns whether the composer accepted it.
 */
function insertStarter({ scope, input }: MindeckDraft, starter: string): boolean {
  const { draft, draftRev } = input.state.getSnapshot()
  const { text, start, end } = starterInsertion(draft, starter)
  return scope.bail(scope, 'slash/input-insert-text', { text, span: { start, end, draftRev } }) === true
}

function registerUi(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'mindeck-employees: dictionaries')
  const t = ctx.locale.bind(NS)
  const state = createSnapshotStore<MindeckEmployeesSnapshot>({ catalog: undefined })
  ctx.remoteAccess.whenAccess('mindeckEmployees/watch', function* () {
    const stream = ctx.remote.$stream<MindeckEmployeeCatalog>({
      name: 'Mindeck digital employees', open: signal => ctx.remote.mindeckEmployees.watch(signal),
      ended: () => new Error('Mindeck digital-employee stream ended'),
    })
    // Read across closures: the disposer ends this grant while the frame loop awaits.
    const grant = { ended: false }
    yield () => {
      grant.ended = true
      state.set({ catalog: undefined })
      return stream.dispose()
    }
    void (async () => {
      for await (const frame of stream) {
        if (grant.ended) return
        state.set({ catalog: frame.value })
        frame.accept()
      }
    })().catch(() => {
      // The stream failed: the page leaves until the next grant, and the base preset chip still switches presets.
      if (!grant.ended) state.set({ catalog: undefined })
    })
  })
  const page: MindeckEmployeesPageInjected = {
    hooks: { catalog: state },
    start: (presetId, starter) => ctx.mindeckComposer.startConversation({
      agentPreset: presetId,
      ...starter === undefined ? {} : { prepare: (target: MindeckDraft) => { insertStarter(target, starter) } },
    }),
  }
  // The row and its page exist while the company offers an employee; the row leads the sidebar's
  // company rows (skills -20, file library -10), all before Plugins (0).
  const registerPage = (): (() => void) => {
    const disposers = [
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: EMPLOYEES_PANEL_ID, locale: NS, inject: () => page }, EmployeesPage)),
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist', id: EMPLOYEES_PANEL_ID, order: -30, locale: NS, label: () => t('panel'),
      }, EmployeesPanelIcon)),
    ]
    return () => { for (const dispose of disposers.reverse()) dispose() }
  }
  ctx.effect(() => {
    let registered: (() => void) | undefined
    const sync = (): void => {
      const offered = offersEmployees(state.getSnapshot().catalog)
      if (offered && registered === undefined) registered = registerPage()
      else if (!offered && registered !== undefined) { registered(); registered = undefined }
    }
    const unsubscribe = state.subscribe(sync)
    sync()
    return () => { unsubscribe(); registered?.() }
  }, 'mindeck-employees: page while the company offers employees')
}

/**
 * Mount the digital-employee Remote, then the page; withdraw them in reverse order.
 * @param ctx - Client plugin lifetime.
 * @param contribution - generated digital-employee Remote definitions.
 * @returns disposer that removes both contributions.
 */
export async function mountEmployees(ctx: Context, contribution: TypertRemoteContribution): Promise<() => Promise<void>> {
  const unmountRemote = await ctx.remote.$mount(contribution)
  const ui = ctx.inject(['remote.mindeckEmployees', ...inject.slice(1)], (child) => { registerUi(child) })
  try { await ui } catch (error) { await ui.dispose(); await unmountRemote(); throw error }
  return async () => { await ui.dispose(); await unmountRemote() }
}
