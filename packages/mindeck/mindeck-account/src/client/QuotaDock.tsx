/** Reminder above the composer when a company model quota is nearly or fully used. */
import { IconCloseOutlineRegular, IconWarningOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { MindeckAccountInjected } from './operations.ts'
import { QUOTA_REMINDER_RATIOS, quotaText, tightestQuota } from './quota.ts'
import css from './Account.module.css'

/** Composed dock props. */
export type QuotaDockProps = PropsRuntime<'conversation.input.dock'> & PropsLocale<'mindeckAccount'>
  & InjectFace<MindeckAccountInjected>

/**
 * Shown from 75% of the limit that runs out first, again from 95%, and when it is used up. Dismissing hides
 * that level until the next level or the next month, in every session of this window.
 * @param props - account state, dismissed reminders, and localized copy.
 * @returns the reminder, or nothing below 75%, without a limit, or while signed out.
 */
export function QuotaDock({ useAccount, useReminders, dismissReminder, t }: QuotaDockProps) {
  const view = useAccount(snapshot => snapshot.view)
  const dismissed = useReminders(snapshot => snapshot.dismissed)
  const quota = view?.status === 'signed-in' ? view.quota : null
  const position = quota === null ? undefined : tightestQuota(quota)
  if (quota === null || position === undefined || view?.cloudUrl == null || position.ratio < QUOTA_REMINDER_RATIOS.warning) return null
  const level = position.ratio >= 1 ? 'out' : position.ratio >= QUOTA_REMINDER_RATIOS.urgent ? 'urgent' : 'warning'
  const key = `${quota.resetDate}:${position.scope}:${level}`
  if (dismissed.includes(key)) return null
  const text = quotaText(position, level, quota.resetDate, t)
  return <div className={css.quotaDock} data-level={level} role="status">
    <IconWarningOutlineRegular size={16} className={css.quotaDockIcon} />
    <span className={css.quotaDockText}>{text}</span>
    <a className={css.quotaDockLink} href={new URL('/usage', view.cloudUrl).href} target="_blank" rel="noreferrer">{t('quotaUsage')}</a>
    <button type="button" className={css.close} aria-label={t('quotaDockDismiss')} onClick={() => { dismissReminder(key) }}>
      <IconCloseOutlineRegular size={14} />
    </button>
  </div>
}
