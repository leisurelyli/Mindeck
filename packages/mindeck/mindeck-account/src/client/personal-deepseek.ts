/**
 * The member's personal DeepSeek account beside the company account, read and driven through the DeepSeek
 * account Remote. The company decides whether it may be used: while it does not, a stored DeepSeek credential
 * is signed out.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remote-access/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { AccountClientMetadata, AccountView } from '@deepseek-ai/dsh-deepseek-account/types'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { MindeckAccountSnapshot, OperationOutcome } from './operations.ts'

/** The personal DeepSeek account as this window observes it. */
export interface PersonalDeepSeekSnapshot {
  /** Whether this window can read the DeepSeek account; false while its Remote is absent or not permitted. */
  readonly available: boolean
  /** Latest streamed DeepSeek account state; absent until the first frame. */
  readonly view: AccountView | undefined
  /** Whether the state stream failed; the last view stays visible. */
  readonly failed: boolean
}

/** Phases of a DeepSeek sign-in attempt that are still running. */
const ACTIVE_PHASES = new Set(['initializing', 'waiting-browser', 'exchanging', 'committing'])

/**
 * Tell whether the personal DeepSeek account has a sign-in attempt in progress.
 * @param view - DeepSeek account state.
 * @returns whether a sign-in attempt is still running.
 */
export function personalSignInActive(view: AccountView | undefined): boolean {
  return view?.attempt != null && ACTIVE_PHASES.has(view.attempt.phase)
}

/** Personal account state and actions shared by the account settings page. */
export interface PersonalDeepSeek {
  readonly store: SnapshotStore<PersonalDeepSeekSnapshot>
  /** Start a browser sign-in; the page that asked opens the authorization page once the attempt has one. */
  start: () => Promise<OperationOutcome>
  /** Cancel the running sign-in attempt, if any. */
  cancel: () => Promise<void>
  /** Remove the stored DeepSeek credential. */
  signOut: () => Promise<OperationOutcome>
}

/**
 * Follow the DeepSeek account while its Remote is mounted and permitted, and sign out a stored credential while
 * the signed-in company does not allow personal accounts.
 * @param ctx - Client plugin lifetime.
 * @param account - the company account state, which carries the company's policy.
 * @returns the personal account state and its actions.
 */
export function followPersonalDeepSeek(ctx: Context, account: SnapshotStore<MindeckAccountSnapshot>): PersonalDeepSeek {
  const store = createSnapshotStore<PersonalDeepSeekSnapshot>({ available: false, view: undefined, failed: false })
  const desktop = 'dshDesktop' in globalThis
  /** @returns the client identity of one account call, read at call time. */
  const client = (): AccountClientMetadata => ({
    version: process.env.DSH_CLIENT_VERSION ?? '',
    locale: ctx.locale.getSnapshot().active,
    // Date.getTimezoneOffset reports minutes west of UTC; the account expects seconds east.
    timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
  })
  ctx.inject(['remote.account'], (scope) => {
    scope.remoteAccess.whenAccess('account/watch', function* () {
      const stream = scope.remote.$stream<AccountView>({
        name: 'Personal DeepSeek account', open: signal => scope.remote.account.watch(signal),
        ended: () => new Error('DeepSeek account stream ended'),
      })
      // Read across closures: the disposer ends this grant while the frame loop awaits.
      const grant = { ended: false }
      store.set({ available: true, view: undefined, failed: false })
      yield () => {
        grant.ended = true
        store.set({ available: false, view: undefined, failed: false })
        return stream.dispose()
      }
      void (async () => {
        for await (const frame of stream) {
          if (grant.ended) return
          store.set({ available: true, view: frame.value, failed: false })
          frame.accept()
        }
      })().catch(() => { if (!grant.ended) store.set({ ...store.getSnapshot(), failed: true }) })
    })
  })

  const signOut = async (): Promise<OperationOutcome> => {
    try {
      const result = await ctx.remote.account.signOut(client())
      return result.ok ? { ok: true } : { ok: false, reason: 'failed' }
    } catch (_error) {
      // The Remote is not mounted or the call did not complete; the page shows the generic failure.
      return { ok: false, reason: 'failed' }
    }
  }

  // The company's policy arrives with the company account; a credential it does not allow is signed out once.
  let enforcing = false
  const enforce = (): void => {
    const company = account.getSnapshot().view
    const personal = store.getSnapshot().view
    if (enforcing || company?.status !== 'signed-in' || company.personalDeepSeek) return
    if (personal?.status !== 'credential-stored') return
    enforcing = true
    void signOut().finally(() => { enforcing = false })
  }
  ctx.effect(() => {
    const stops = [account.subscribe(enforce), store.subscribe(enforce)]
    return () => { for (const stop of stops) stop() }
  }, 'mindeck-account: personal DeepSeek policy')

  return {
    store,
    async start() {
      if (!desktop) return { ok: false, reason: 'personalDesktopOnly' }
      const transport = (globalThis as typeof globalThis & { __DSH_TRANSPORT__?: { streamBaseUrl?: string } }).__DSH_TRANSPORT__
      const origin = transport?.streamBaseUrl === undefined ? window.location.origin : new URL(transport.streamBaseUrl).origin
      try {
        const result = await ctx.remote.account.startSignIn(client(), origin, 'desktop')
        return result.ok ? { ok: true } : { ok: false, reason: 'personalFailed' }
      } catch (_error) {
        // The Remote is not mounted or the call did not complete; the page asks the member to try again.
        return { ok: false, reason: 'personalFailed' }
      }
    },
    async cancel() {
      const attempt = store.getSnapshot().view?.attempt
      if (attempt == null || !ACTIVE_PHASES.has(attempt.phase)) return
      await ctx.remote.account.cancelSignIn(attempt.id).catch(() => undefined)
    },
    signOut,
  }
}
