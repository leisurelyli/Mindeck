/** Mindeck take-over of the frame-wide quota notice raised when Mindeck Cloud refuses a request over the company quota. */
import { Button, IconCloseOutlineRegular, IconWarningOutlineRegular, Modal, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { QuotaNoticeOwnerProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useEffect } from 'react'
import type { MindeckAccountInjected } from './operations.ts'
import { quotaText, tightestQuota } from './quota.ts'
import css from './Account.module.css'

/** Composed quota notice props. */
export type QuotaNoticeProps = PropsRuntime<'shell.quota-notice'> & { matched: QuotaNoticeOwnerProps }
  & PropsLocale<'mindeckAccount'> & InjectFace<MindeckAccountInjected>

/**
 * A signed-in member learns which limit is used up (the company budget, their own, or their department's) and when
 * it resets, and can open their usage page in Mindeck Cloud. The quota is read again on open; until the read shows
 * a used-up limit, the dialog gives the general explanation. Without a session, the generic warning appears.
 * @param props - the claimed notice, account state, and localized copy.
 * @returns the quota dialog, or the generic Toast while signed out.
 */
export function QuotaNotice({ matched, useAccount, refreshQuota, t }: QuotaNoticeProps) {
  const { dismiss, message } = matched
  const view = useAccount(snapshot => snapshot.view)
  const signedIn = view?.status === 'signed-in'
  useEffect(() => { if (signedIn) refreshQuota() }, [signedIn, refreshQuota])
  if (view?.status !== 'signed-in' || view.cloudUrl === null) {
    return <Toast text={message} icon={<IconWarningOutlineRegular size={18} />} onDone={dismiss} />
  }
  const usageUrl = new URL('/usage', view.cloudUrl).href
  const position = view.quota === null ? undefined : tightestQuota(view.quota)
  const text = view.quota !== null && position !== undefined && position.ratio >= 1
    ? quotaText(position, 'out', view.quota.resetDate, t)
    : t('quotaDescription')
  return <Modal open headless title={t('quotaTitle')} onClose={dismiss} className={css.dialog as string}>
    <div className={css.dialogHeader}>
      <h2 className={css.dialogTitle}>{t('quotaTitle')}</h2>
      <button type="button" className={css.close} aria-label={t('close')} onClick={dismiss}>
        <IconCloseOutlineRegular size={14} />
      </button>
    </div>
    <p className={css.dialogText}>{text}</p>
    {view.adminContact !== null && <p className={css.dialogText}>{t('adminContact', { contact: view.adminContact })}</p>}
    <div className={css.dialogActions}>
      <Button variant="outline" onClick={dismiss}>{t('quotaDismiss')}</Button>
      <a className={css.primaryLink} href={usageUrl} target="_blank" rel="noreferrer" onClick={dismiss}>{t('quotaUsage')}</a>
    </div>
  </Modal>
}
