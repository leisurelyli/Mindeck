/** The company messages row of the left sidebar: its bell icon and its unread badge. */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { BellIcon } from './icons.tsx'
import type { MindeckInboxBadgeInjected } from './operations.ts'
import css from './InboxPage.module.css'

/** Most unread items the badge counts exactly. */
const BADGE_MAX = 99

/**
 * @param props - the sidebar's icon share: the requested edge.
 * @returns the bell glyph.
 */
export function InboxPanelIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return <BellIcon size={size} />
}

/** Composed badge props. */
export type UnreadBadgeProps =
  PropsRuntime<'sidebar.panellist.badge'> & PropsLocale<'mindeckInbox'> & InjectFace<MindeckInboxBadgeInjected>

/**
 * The sidebar announces the badge's text as the row's description, so the count is spoken with its unit.
 * @param props - the unread count and localized copy.
 * @returns the unread count capsule, or nothing without unread items.
 */
export function UnreadBadge({ useSummary, t }: UnreadBadgeProps) {
  const unread = useSummary(snapshot => snapshot.summary?.unread ?? 0)
  if (unread === 0) return null
  return <>
    <span className={css.badge} aria-hidden="true">{unread > BADGE_MAX ? `${BADGE_MAX}+` : unread}</span>
    <span className={css.srOnly}>{t('unreadBadge', { count: String(unread) })}</span>
  </>
}
