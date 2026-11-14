/** The company messages row of the left sidebar: its bell icon, and its unread count or new-version dot. */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { isOlderVersion } from './format.ts'
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
 * The sidebar announces the badge's text as the row's description, so the count is spoken with its unit. A newer
 * recommended version, which is no unread item, shows as a dot without a number while nothing is unread; with unread
 * items the count shows and the description names both.
 * @param props - the unread count, the recommended version, this build's version, and localized copy.
 * @returns the unread count capsule, the new-version dot, or nothing.
 */
export function UnreadBadge({ useSummary, appVersion, t }: UnreadBadgeProps) {
  const unread = useSummary(snapshot => snapshot.summary?.unread ?? 0)
  const recommended = useSummary(snapshot => snapshot.summary?.release?.recommendedVersion ?? null)
  const update = recommended !== null && isOlderVersion(appVersion, recommended)
  if (unread === 0 && !update) return null
  if (unread === 0) return <>
    <span className={css.versionDot} aria-hidden="true" />
    <span className={css.srOnly}>{t('versionBadge')}</span>
  </>
  return <>
    <span className={css.badge} aria-hidden="true">{unread > BADGE_MAX ? `${BADGE_MAX}+` : unread}</span>
    <span className={css.srOnly}>{t(update ? 'unreadVersionBadge' : 'unreadBadge', { count: String(unread) })}</span>
  </>
}
