/** Remote contribution, the summary and items streams, and the company messages page with its left-sidebar row. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remote-access/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-mindeck-inbox/remote'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { MindeckInboxPage, MindeckInboxSummary } from '../types.ts'
import { InboxPage } from './InboxPage.tsx'
import { en, NS, zh } from './locales.ts'
import type {
  MindeckInboxBadgeInjected, MindeckInboxPageInjected, MindeckInboxPageSnapshot, MindeckInboxSummarySnapshot,
} from './operations.ts'
import { InboxPanelIcon, UnreadBadge } from './PanelIcon.tsx'

/** Services required by the page. */
export const inject = ['remote', 'slots', 'locale', 'remoteAccess']

/** Id shared by the left-sidebar row, its badge, and the main-column page it selects. */
export const INBOX_PANEL_ID = 'mindeck-inbox' as MainPanelId

function registerUi(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'mindeck-inbox: dictionaries')
  const t = ctx.locale.bind(NS)
  const summary = createSnapshotStore<MindeckInboxSummarySnapshot>({ summary: undefined })
  const page = createSnapshotStore<MindeckInboxPageSnapshot>({ page: undefined, failed: false })
  ctx.remoteAccess.whenAccess('mindeckInbox/watch', function* () {
    const stream = ctx.remote.$stream<MindeckInboxSummary>({
      name: 'Mindeck inbox', open: signal => ctx.remote.mindeckInbox.watch(signal),
      ended: () => new Error('Mindeck inbox stream ended'),
    })
    // Read across closures: the disposer ends this grant while the frame loop awaits.
    const grant = { ended: false }
    yield () => {
      grant.ended = true
      summary.set({ summary: undefined })
      return stream.dispose()
    }
    void (async () => {
      for await (const frame of stream) {
        if (grant.ended) return
        summary.set({ summary: frame.value })
        frame.accept()
      }
    })().catch(() => {
      // The stream failed: the row and the page leave until the next grant.
      if (!grant.ended) summary.set({ summary: undefined })
    })
  })
  const appVersion = process.env.DSH_CLIENT_VERSION ?? ''
  const report = (task: Promise<{ ok: boolean }>): void => {
    // The page stream carries the outcome, and the Host logs a failed read; nothing else waits on it.
    void task.catch(() => undefined)
  }
  const operations: MindeckInboxPageInjected = {
    hooks: { summary, page },
    follow() {
      const stream = ctx.remote.$stream<MindeckInboxPage>({
        name: 'Mindeck inbox items', open: signal => ctx.remote.mindeckInbox.items(signal),
        ended: () => new Error('Mindeck inbox items stream ended'),
      })
      const grant = { ended: false }
      void (async () => {
        for await (const frame of stream) {
          if (grant.ended) return
          page.set({ page: frame.value, failed: false })
          frame.accept()
        }
      })().catch(() => { if (!grant.ended) page.set({ ...page.getSnapshot(), failed: true }) })
      return () => {
        grant.ended = true
        void stream.dispose()
      }
    },
    reload() { report(ctx.remote.mindeckInbox.reload()) },
    loadMore() { report(ctx.remote.mindeckInbox.loadMore()) },
    markRead(target) { report(ctx.remote.mindeckInbox.markRead(target)) },
    appVersion,
  }
  const badge: MindeckInboxBadgeInjected = { hooks: { summary }, appVersion }
  // The row, its badge, and the page exist while the member's Mindeck Cloud has an inbox; the row follows the
  // company rows (digital employees -30, skills -20, file library -10), before Plugins (0).
  const registerPage = (): (() => void) => {
    const disposers = [
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: INBOX_PANEL_ID, locale: NS, inject: () => operations }, InboxPage)),
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist', id: INBOX_PANEL_ID, order: -5, locale: NS, label: () => t('title'),
      }, InboxPanelIcon)),
      ctx.slots.inject('sidebar.panellist.badge', () => ctx.slots.register({
        name: 'sidebar.panellist.badge', id: INBOX_PANEL_ID, locale: NS, inject: () => badge,
      }, UnreadBadge)),
    ]
    return () => { for (const dispose of disposers.reverse()) dispose() }
  }
  ctx.effect(() => {
    let registered: (() => void) | undefined
    const sync = (): void => {
      const available = summary.getSnapshot().summary?.available === true
      if (available && registered === undefined) registered = registerPage()
      else if (!available && registered !== undefined) { registered(); registered = undefined }
    }
    const unsubscribe = summary.subscribe(sync)
    sync()
    return () => { unsubscribe(); registered?.() }
  }, 'mindeck-inbox: page while the member has an inbox')
}

/**
 * Mount the inbox Remote, then the page; withdraw them in reverse order.
 * @param ctx - Client plugin lifetime.
 * @param contribution - generated inbox Remote definitions.
 * @returns disposer that removes both contributions.
 */
export async function mountInbox(ctx: Context, contribution: TypertRemoteContribution): Promise<() => Promise<void>> {
  const unmountRemote = await ctx.remote.$mount(contribution)
  const ui = ctx.inject(['remote.mindeckInbox', ...inject.slice(1)], (child) => { registerUi(child) })
  try { await ui } catch (error) { await ui.dispose(); await unmountRemote(); throw error }
  return async () => { await ui.dispose(); await unmountRemote() }
}
