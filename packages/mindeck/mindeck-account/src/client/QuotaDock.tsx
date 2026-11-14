/** Reminder above the composer when a company model quota is nearly or fully used. */
import { IconCloseOutlineRegular, IconWarningOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useState } from 'react'
import type { MindeckAccountInjected } from './operations.ts'
import { QuotaDialog } from './QuotaNotice.tsx'
import { QUOTA_REMINDER_RATIOS, quotaParams, quotaRequestOffer, quotaText, tightestQuota } from './quota.ts'
import css from './Account.module.css'

/** Composed dock props. */
export type QuotaDockProps = PropsRuntime<'conversation.input.dock'> & PropsLocale<'mindeckAccount'>
  & InjectFace<MindeckAccountInjected>

/**
 * Shown from 75% of the limit that runs out first, again from 95%, and when it is used up. Dismissing hides
 * that level until the next level or the next month, in every session of this window. When the personal limit runs
 * out first and Mindeck Cloud accepts a request for more, the reminder offers **Ask for more quota** instead of the
 * usage link; with a request pending, **View request**. Both open the quota dialog, which reads the quota again.
 * @param props - account state, dismissed reminders, quota request operations, and localized copy.
 * @returns the reminder, or nothing below 75%, without a limit, or while signed out.
 */
export function QuotaDock({
  useAccount, useReminders, dismissReminder, refreshQuota, requestQuota, withdrawQuotaRequest, t,
}: QuotaDockProps) {
  const view = useAccount(snapshot => snapshot.view)
  const dismissed = useReminders(snapshot => snapshot.dismissed)
  const [dialog, setDialog] = useState(false)
  const quota = view?.status === 'signed-in' ? view.quota : null
  const position = quota === null ? undefined : tightestQuota(quota)
  if (view === undefined || quota === null || position === undefined || view.cloudUrl === null) return null
  const cloudUrl = view.cloudUrl
  const open = dialog && <QuotaDialog view={view} cloudUrl={cloudUrl} dismiss={() => { setDialog(false) }}
    requestQuota={requestQuota} withdrawQuotaRequest={withdrawQuotaRequest} t={t} />
  if (position.ratio < QUOTA_REMINDER_RATIOS.warning) return open || null
  const level = position.ratio >= 1 ? 'out' : position.ratio >= QUOTA_REMINDER_RATIOS.urgent ? 'urgent' : 'warning'
  const key = `${quota.resetDate}:${position.scope}:${level}`
  if (dismissed.includes(key)) return open || null
  const offer = position.scope === 'user' ? quotaRequestOffer(quota).kind : 'none'
  const action = offer === 'ask' || offer === 'pending' ? offer : null
  const text = level === 'out' && action === 'ask' ? t('quotaDockUserOutAsk', quotaParams(position, quota.resetDate, t))
    : level === 'out' && action === 'pending' ? t('quotaDockUserOutPending', quotaParams(position, quota.resetDate, t))
      : quotaText(position, level, quota.resetDate, t)
  return <>
    <div className={css.quotaDock} data-level={level} role="status">
      <IconWarningOutlineRegular size={16} className={css.quotaDockIcon} />
      <span className={css.quotaDockText}>{text}</span>
      {action === null
        ? <a className={css.quotaDockLink} href={new URL('/usage', cloudUrl).href} target="_blank" rel="noreferrer">{t('quotaUsage')}</a>
        : <button type="button" className={`${css.quotaDockLink} ${css.quotaDockAction}`} onClick={() => { refreshQuota(); setDialog(true) }}>
          {t(action === 'ask' ? 'quotaRequestSubmit' : 'quotaDockViewRequest')}
        </button>}
      <button type="button" className={css.close} aria-label={t('quotaDockDismiss')} onClick={() => { dismissReminder(key) }}>
        <IconCloseOutlineRegular size={14} />
      </button>
    </div>
    {open}
  </>
}
