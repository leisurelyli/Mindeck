/** Remote contribution, the reconnecting account stream, and the account slot registrations. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remote-access/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-mindeck-account/remote'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { RemoteFailure, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { MindeckAccountView } from '../types.ts'
import { AccountMenu } from './AccountMenu.tsx'
import { AccountSection } from './AccountSection.tsx'
import { SignInGate } from './SignInGate.tsx'
import { en, NS, zh, type MindeckAccountKey } from './locales.ts'
import type { MindeckAccountInjected, MindeckAccountSnapshot, OperationOutcome } from './operations.ts'

/** Services required by the account UI. */
export const inject = ['remote', 'slots', 'locale', 'remoteAccess']

/**
 * @param error - Remote failure of an account operation.
 * @returns the copy that explains it to the member.
 */
function failureReason(error: RemoteFailure): MindeckAccountKey {
  switch (error.code) {
    case 'mindeck-account/invalid-cloud-url': {
      const { reason } = error.details
      return reason === 'format' ? 'invalidFormat' : reason === 'unreachable' ? 'unreachable' : 'notMindeckCloud'
    }
    case 'mindeck-account/signed-in': return 'cloudLocked'
    case 'mindeck-account/storage': return 'storage'
    default: return 'failed'
  }
}

function registerUi(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'mindeck-account: dictionaries')
  const state = createSnapshotStore<MindeckAccountSnapshot>({ view: undefined, failed: false })
  const appVersion = process.env.DSH_CLIENT_VERSION ?? ''
  const outcome = (result: { ok: true } | { ok: false; error: RemoteFailure }): OperationOutcome =>
    result.ok ? { ok: true } : { ok: false, reason: failureReason(result.error) }
  const operations: MindeckAccountInjected = {
    hooks: { account: state },
    async connect(input) {
      const set = await ctx.remote.mindeckAccount.setCloudUrl(input)
      if (!set.ok) return outcome(set)
      return outcome(await ctx.remote.mindeckAccount.startSignIn(appVersion))
    },
    async startSignIn() { return outcome(await ctx.remote.mindeckAccount.startSignIn(appVersion)) },
    async cancelSignIn(id) {
      const result = await ctx.remote.mindeckAccount.cancelSignIn(id)
      if (!result.ok) throw result.error
    },
    async signOut() { return outcome(await ctx.remote.mindeckAccount.signOut()) },
  }
  ctx.remoteAccess.whenAccess('mindeckAccount/watch', function* () {
    const stream = ctx.remote.$stream<MindeckAccountView>({
      name: 'Mindeck account', open: signal => ctx.remote.mindeckAccount.watch(signal),
      ended: () => new Error('Mindeck account stream ended'),
    })
    // Read across closures: the disposer ends this grant while the frame loop awaits.
    const grant = { ended: false }
    yield () => {
      grant.ended = true
      state.set({ view: undefined, failed: false })
      return stream.dispose()
    }
    void (async () => {
      for await (const frame of stream) {
        if (grant.ended) return
        state.set({ view: frame.value, failed: false })
        frame.accept()
      }
    })().catch(() => { if (!grant.ended) state.set({ ...state.getSnapshot(), failed: true }) })
  })
  ctx.remoteAccess.whenAccess('mindeckAccount/watch', () => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'mindeck-account.sign-in', locale: NS, inject: () => operations,
  }, SignInGate)))
  ctx.remoteAccess.whenAccess('mindeckAccount/watch', () => ctx.slots.inject('settings.launcher', () => ctx.slots.register({
    name: 'settings.launcher', locale: NS, inject: () => operations,
  }, AccountMenu)))
  const t = ctx.locale.bind(NS)
  ctx.remoteAccess.whenAccess('mindeckAccount/watch', () => ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'mindeck-account', order: -10, label: () => t('nav'), locale: NS, inject: () => operations,
  }, AccountSection)))
}

/**
 * Mount the account Remote, then its UI; withdraw them in reverse order.
 * @param ctx - Client plugin lifetime.
 * @param contribution - generated account Remote definitions.
 * @returns disposer that removes both contributions.
 */
export async function mountAccount(ctx: Context, contribution: TypertRemoteContribution): Promise<() => Promise<void>> {
  const unmountRemote = await ctx.remote.$mount(contribution)
  const ui = ctx.inject(['remote.mindeckAccount', ...inject.slice(1)], (child) => { registerUi(child) })
  try { await ui } catch (error) { await ui.dispose(); await unmountRemote(); throw error }
  return async () => { await ui.dispose(); await unmountRemote() }
}
