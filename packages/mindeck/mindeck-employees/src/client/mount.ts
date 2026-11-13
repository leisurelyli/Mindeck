/** Remote contribution, the card stream, and the digital-employee cards above the composer. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remote-access/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-mindeck-employees/remote'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { MindeckEmployeeCatalog } from '../types.ts'
import { starterInsertion } from './cards.ts'
import { EmployeeDock } from './EmployeeDock.tsx'
import { en, NS, zh } from './locales.ts'
import type { MindeckEmployeesInjected, MindeckEmployeesSnapshot } from './operations.ts'

/** Services required by the cards. */
export const inject = ['remote', 'slots', 'locale', 'remoteAccess', 'sessions', 'remote.agentPresets']

/** Registration id of the cards in `conversation.input.dock`. */
export const EMPLOYEE_DOCK_ID = 'mindeck-employees'

function registerUi(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'mindeck-employees: dictionaries')
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
      // The stream failed: the cards leave until the next grant, and the base preset chip still switches presets.
      if (!grant.ended) state.set({ catalog: undefined })
    })
  })
  const createFace = (sessionId: SessionId): MindeckEmployeesInjected => ({
    hooks: { catalog: state },
    async select(presetId) {
      // A transport failure is reported like a refusal: the conversation keeps its preset.
      const result = await ctx.remote.agentPresets.select(sessionId, presetId)
        .catch((error: unknown) => error instanceof Error ? error : new Error(String(error)))
      if (result instanceof Error) return result.message
      if (result.ok) return undefined
      const { error } = result
      // Prefer the bare cause; the notice already names the card.
      return 'reason' in error.details && typeof error.details.reason === 'string' ? error.details.reason : error.message
    },
    insertStarter(starter) {
      const scope = ctx.sessions.scope(sessionId)
      const input = scope === undefined ? undefined : scope.get('conversation')?.input.for(scope)
      if (scope === undefined || input === undefined) return false
      const { draft, draftRev } = input.state.getSnapshot()
      const { text, start, end } = starterInsertion(draft, starter)
      if (scope.bail(scope, 'slash/input-insert-text', { text, span: { start, end, draftRev } }) !== true) return false
      input.focus()
      return true
    },
  })
  // One face per Session keeps the cards' operations stable across renders.
  const faces = new Map<SessionId, MindeckEmployeesInjected>()
  const face = (sessionId: SessionId): MindeckEmployeesInjected => {
    let existing = faces.get(sessionId)
    if (existing === undefined) { existing = createFace(sessionId); faces.set(sessionId, existing) }
    return existing
  }
  // Above the quota reminder (order -10), which stays next to the composer it warns about.
  ctx.remoteAccess.whenAccess('mindeckEmployees/watch', () => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock', id: EMPLOYEE_DOCK_ID, order: -20, locale: NS, inject: face,
  }, EmployeeDock)))
}

/**
 * Mount the digital-employee Remote, then the cards; withdraw them in reverse order.
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
