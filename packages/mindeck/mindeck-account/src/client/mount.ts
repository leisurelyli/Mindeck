/** Remote contribution, the reconnecting account stream, and the account slot registrations. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remote-access/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-message-feedback/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-account/client'
import type {} from '@deepseek-ai/dsh-mindeck-account/remote'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { RemoteFailure, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { MindeckAccountView } from '../types.ts'
import { AccountMenu } from './AccountMenu.tsx'
import { composerInject, createMindeckComposer } from './composer.ts'
import { AccountSection, AccountSectionIcon } from './AccountSection.tsx'
import { QuotaNotice } from './QuotaNotice.tsx'
import { MindeckOnboarding } from './MindeckOnboarding.tsx'
import { FeedbackOptions, type MindeckFeedbackOptionsInjected } from './FeedbackOptions.tsx'
import { deepseekAccount, en, feedbackDialog, NS, zh, type MindeckAccountKey } from './locales.ts'
import type { MindeckAccountInjected, MindeckAccountSnapshot, MindeckReminderSnapshot, OperationOutcome } from './operations.ts'
import { QuotaDock } from './QuotaDock.tsx'
import { followPersonalDeepSeek } from './personal-deepseek.ts'

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
    case 'mindeck-account/settings': return 'settingsFailed'
    case 'mindeck-account/signed-out': return 'feedbackSignedOut'
    case 'mindeck-account/unreachable': return 'feedbackUnreachable'
    case 'mindeck-account/invalid-feedback': return 'feedbackInvalid'
    case 'mindeck-account/quota-request-refused': return 'quotaRequestRefused'
    default: return 'failed'
  }
}

function registerUi(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'mindeck-account: dictionaries')
  // The base account page shows the personal DeepSeek account beside this page, so it takes the DeepSeek name.
  ctx.effect(() => ctx.locale.override('settings.account', deepseekAccount), 'mindeck-account: DeepSeek account page name')
  // The base feedback dialog says it sends the conversation log; Mindeck sends a round only when the member ticks it.
  ctx.effect(() => ctx.locale.override('feedback', feedbackDialog), 'mindeck-account: feedback dialog hint')
  // The Mindeck pages open conversations through this service whether or not the member is signed in.
  ctx.inject(composerInject, (child) => { child.provide('mindeckComposer', createMindeckComposer(child)) })
  const state = createSnapshotStore<MindeckAccountSnapshot>({ view: undefined, failed: false })
  const reminders = createSnapshotStore<MindeckReminderSnapshot>({ dismissed: [] })
  const appVersion = process.env.DSH_CLIENT_VERSION ?? ''
  const personal = followPersonalDeepSeek(ctx, state)
  const outcome = (result: { ok: true } | { ok: false; error: RemoteFailure }): OperationOutcome => {
    if (result.ok) return { ok: true }
    const { error } = result
    // Mindeck Cloud explains its refusals of quota requests itself.
    if (error.code === 'mindeck-account/quota-request-refused') return { ok: false, reason: 'quotaRequestRefused', message: error.details.message }
    return { ok: false, reason: failureReason(error) }
  }
  const operations: MindeckAccountInjected = {
    hooks: { account: state, reminders, personal: personal.store },
    async connect(input) {
      const set = await ctx.remote.mindeckAccount.setCloudUrl(input)
      if (!set.ok) return outcome(set)
      return outcome(await ctx.remote.mindeckAccount.startSignIn(appVersion))
    },
    async startSignIn() { return outcome(await ctx.remote.mindeckAccount.startSignIn(appVersion)) },
    finishWelcome() {
      // A failed write leaves the welcome page to show again at the next start; the Host logs it.
      void ctx.remote.mindeckAccount.finishWelcome().catch(() => undefined)
    },
    async cancelSignIn(id) {
      const result = await ctx.remote.mindeckAccount.cancelSignIn(id)
      if (!result.ok) throw result.error
    },
    async signOut() { return outcome(await ctx.remote.mindeckAccount.signOut()) },
    async sendFeedback(text) { return outcome(await ctx.remote.mindeckAccount.sendFeedback(text)) },
    async requestQuota(reason) { return outcome(await ctx.remote.mindeckAccount.requestQuota(reason)) },
    async withdrawQuotaRequest() { return outcome(await ctx.remote.mindeckAccount.withdrawQuotaRequest()) },
    appVersion,
    refreshQuota() {
      // A failed refresh keeps the last quota; the periodic Host read tries again.
      void ctx.remote.mindeckAccount.refreshQuota().catch(() => undefined)
    },
    async syncNow() { return outcome(await ctx.remote.mindeckAccount.syncNow()) },
    dismissReminder(key) {
      const { dismissed } = reminders.getSnapshot()
      if (!dismissed.includes(key)) reminders.set({ dismissed: [...dismissed, key] })
    },
    startPersonalSignIn: personal.start,
    cancelPersonalSignIn: personal.cancel,
    signOutPersonal: personal.signOut,
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
  // Returning to the window, or to the network, catches up with company changes at once; the Host skips a sync
  // when one just succeeded.
  ctx.remoteAccess.whenAccess('mindeckAccount/syncSoon', () => {
    const prompt = (): void => {
      // A failed prompt changes nothing; the scheduled sync follows within a minute.
      void ctx.remote.mindeckAccount.syncSoon().catch(() => undefined)
    }
    window.addEventListener('focus', prompt)
    window.addEventListener('online', prompt)
    return () => {
      window.removeEventListener('focus', prompt)
      window.removeEventListener('online', prompt)
    }
  })
  ctx.remoteAccess.whenAccess('mindeckAccount/watch', () => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'mindeck-account.sign-in', locale: NS, inject: () => operations,
  }, MindeckOnboarding)))
  // The company account owns the sidebar launcher; a lower priority shadows the DeepSeek account launcher, whose
  // sign-in and sign-out stay on this account page.
  ctx.remoteAccess.whenAccess('mindeckAccount/watch', () => ctx.slots.inject('settings.launcher', () => ctx.slots.register({
    name: 'settings.launcher', priority: -1, locale: NS, inject: () => operations,
  }, AccountMenu)))
  const t = ctx.locale.bind(NS)
  ctx.remoteAccess.whenAccess('mindeckAccount/watch', () => ctx.slots.inject('settings.section', () => ctx.slots.register({
    // Before the base DeepSeek account page (order -10), so the company account leads the navigation.
    name: 'settings.section', id: 'mindeck-account', order: -20, label: () => t('nav'), locale: NS, inject: () => operations,
  }, AccountSection)))
  // A company quota failure from the Mindeck Cloud gateway; the DeepSeek account reports its own code.
  ctx.remoteAccess.whenAccess('mindeckAccount/watch', () => ctx.slots.inject('shell.quota-notice', () => ctx.slots.register({
    name: 'shell.quota-notice', locale: NS, select: owner => owner.code === 'QUOTA' ? owner : null, inject: () => operations,
  }, QuotaNotice)))
  // Sessions whose open feedback dialog has its round attached; a rating down sends the choice before it is recorded.
  const attached = new Set<string>()
  const optionFaces = new Map<string, MindeckFeedbackOptionsInjected>()
  const optionsFor = (sessionId: string): MindeckFeedbackOptionsInjected => {
    let face = optionFaces.get(sessionId)
    if (face === undefined) {
      face = { choose: (attach) => { if (attach) attached.add(sessionId); else attached.delete(sessionId) } }
      optionFaces.set(sessionId, face)
    }
    return face
  }
  ctx.remoteAccess.whenAccess('mindeckAccount/prepareFeedback', () => {
    const feedback = ctx.inject(['feedbackUi'], (scope) => {
      scope.effect(() => scope.feedbackUi.beforeSubmit(async (sessionId, target) => {
        if (target.kind !== 'message' || target.rating !== 'negative') return
        // Called on this plugin's scope, which injected the account Remote; the feedback service's scope did not.
        const result = await ctx.remote.mindeckAccount.prepareFeedback(sessionId, target.messageId, attached.has(sessionId))
        if (!result.ok) throw new Error(result.error.message)
      }), 'mindeck-account: feedback round choice')
      scope.slots.inject('feedback.dialog.options', () => scope.slots.register({
        name: 'feedback.dialog.options', id: 'mindeck-account', locale: NS, inject: sessionId => optionsFor(sessionId),
      }, FeedbackOptions))
    })
    return () => { void feedback.dispose() }
  })
  ctx.remoteAccess.whenAccess('mindeckAccount/watch', () => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock', id: 'mindeck-quota', order: -10, locale: NS, inject: () => operations,
  }, QuotaDock)))
  ctx.remoteAccess.whenAccess('mindeckAccount/watch', () => ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
    name: 'settings.section.icon', id: 'mindeck-account',
  }, AccountSectionIcon)))
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
