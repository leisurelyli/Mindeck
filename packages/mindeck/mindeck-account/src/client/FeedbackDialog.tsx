/** Written feedback to the company's administrators, sent through Mindeck Cloud. */
import { useState } from 'react'
import { Button, IconCloseOutlineRegular, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MindeckAccountKey } from './locales.ts'
import type { MindeckAccountInjected } from './operations.ts'
import css from './Account.module.css'

/** Longest feedback Mindeck Cloud accepts, in characters. */
const MAX_FEEDBACK = 2000

/** @param props - send operation, dialog close, and localized copy. @returns the feedback dialog. */
export function FeedbackDialog({ sendFeedback, close, t }: {
  sendFeedback: MindeckAccountInjected['sendFeedback']
  close: () => void
  t: (key: MindeckAccountKey) => string
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<MindeckAccountKey | null>(null)
  const dismiss = (): void => { if (!busy) close() }
  const send = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const outcome = await sendFeedback(text)
      if (outcome.ok) setSent(true)
      else setError(outcome.reason)
    } catch { setError('failed') } finally { setBusy(false) }
  }
  return <Modal open headless title={t('feedbackTitle')} onClose={dismiss} className={css.dialog as string}>
    <div className={css.dialogHeader}>
      <h2 className={css.dialogTitle}>{t('feedbackTitle')}</h2>
      <button type="button" className={css.close} aria-label={t('close')} disabled={busy} onClick={dismiss}>
        <IconCloseOutlineRegular size={14} />
      </button>
    </div>
    {sent
      ? <p className={css.dialogText} role="status">{t('feedbackSent')}</p>
      : <>
        <p className={`${css.dialogText} ${css.dialogNote}`}>{t('feedbackDescription')}</p>
        <div className={css.dialogBody}>
          <textarea className={css.textarea} aria-label={t('feedbackLabel')} placeholder={t('feedbackPlaceholder')}
            value={text} maxLength={MAX_FEEDBACK} readOnly={busy} autoFocus
            onChange={(event) => { setText(event.target.value); setError(null) }} />
        </div>
        {error !== null && <p className={`${css.dialogText} ${css.error}`} role="alert">{t(error)}</p>}
      </>}
    <div className={css.dialogActions}>
      {sent
        ? <Button variant="primary" onClick={close}>{t('feedbackDone')}</Button>
        : <>
          <Button variant="outline" disabled={busy} onClick={dismiss}>{t('cancel')}</Button>
          <Button variant="primary" disabled={busy || text.trim() === ''} onClick={() => { void send() }}>
            {t(busy ? 'feedbackSending' : 'feedbackSend')}
          </Button>
        </>}
    </div>
  </Modal>
}
