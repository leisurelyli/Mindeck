/** Browser entry for Mindeck company messages: the page, its left-sidebar row, and the row's unread badge. */
import type { Context } from '@deepseek-ai/cordis'
import remote from '@deepseek-ai/dsh-mindeck-inbox/remote'
import { mountInbox } from './mount.ts'

export { INBOX_PANEL_ID, inject } from './mount.ts'
export { bodyParts, formatItemTime, isOlderVersion, itemFamily } from './format.ts'
export type { BodyPart, ItemFamily } from './format.ts'
export type { MindeckInboxKey } from './locales.ts'
export type {
  MindeckInboxBadgeInjected, MindeckInboxPageInjected, MindeckInboxPageSnapshot, MindeckInboxSummarySnapshot,
} from './operations.ts'
export type { InboxPageProps } from './InboxPage.tsx'
export type { UnreadBadgeProps } from './PanelIcon.tsx'

/**
 * Mount the inbox Remote, then the page.
 * @param ctx - browser plugin context.
 * @returns disposer withdrawing the page before the Remote.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> { return await mountInbox(ctx, remote) }
