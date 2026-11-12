/** Mindeck take-over of the frame-wide quota notice raised when Mindeck Cloud refuses a request over the company quota. */
import { Button, IconCloseOutlineRegular, IconWarningOutlineRegular, Modal, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { QuotaNoticeOwnerProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { MindeckAccountInjected } from './operations.ts'
import css from './Account.module.css'

/** Composed quota notice props. */
export type QuotaNoticeProps = PropsRuntime<'shell.quota-notice'> & { matched: QuotaNoticeOwnerProps }
  & PropsLocale<'mindeckAccount'> & InjectFace<MindeckAccountInjected>

/**
 * A signed-in member learns that the company quota is used up and can open their usage page in Mindeck Cloud;
 * without a session, the generic warning appears.
 * @param props - the claimed notice, account state, and localized copy.
 * @returns the quota dialog, or the generic Toast while signed out.
 */
export function QuotaNotice({ matched, useAccount, t }: QuotaNoticeProps) {
  const { dismiss, message } = matched
  const view = useAccount(snapshot => snapshot.view)
  if (view?.status !== 'signed-in' || view.cloudUrl === null) {
    return <Toast text={message} icon={<IconWarningOutlineRegular size={18} />} onDone={dismiss} />
  }
  const usageUrl = new URL('/usage', view.cloudUrl).href
  return <Modal open headless title={t('quotaTitle')} onClose={dismiss} className={css.dialog as string}>
    <div className={css.dialogHeader}>
      <h2 className={css.dialogTitle}>{t('quotaTitle')}</h2>
      <button type="button" className={css.close} aria-label={t('close')} onClick={dismiss}>
        <IconCloseOutlineRegular size={14} />
      </button>
    </div>
    <p className={css.dialogText}>{t('quotaDescription')}</p>
    <div className={css.dialogActions}>
      <Button variant="outline" onClick={dismiss}>{t('quotaDismiss')}</Button>
      <a className={css.primaryLink} href={usageUrl} target="_blank" rel="noreferrer" onClick={dismiss}>{t('quotaUsage')}</a>
    </div>
  </Modal>
}
