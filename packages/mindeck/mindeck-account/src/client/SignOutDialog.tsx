/** Sign-out confirmation. */
import { useState } from 'react'
import { Button, IconCloseOutlineRegular, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MindeckAccountKey } from './locales.ts'
import type { MindeckAccountInjected } from './operations.ts'
import css from './Account.module.css'

/** @param props - sign-out operation, dialog close, and localized copy. @returns sign-out confirmation. */
export function SignOutDialog({ signOut, close, t }: {
  signOut: MindeckAccountInjected['signOut']
  close: () => void
  t: (key: MindeckAccountKey) => string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<MindeckAccountKey | null>(null)
  const dismiss = (): void => { if (!busy) close() }
  const confirm = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const outcome = await signOut()
      if (outcome.ok) close()
      else setError(outcome.reason)
    } catch { setError('failed') } finally { setBusy(false) }
  }
  return <Modal open headless title={t('signOutTitle')} onClose={dismiss} className={css.dialog as string}>
    <div className={css.dialogHeader}>
      <h2 className={css.dialogTitle}>{t('signOutTitle')}</h2>
      <button type="button" className={css.close} aria-label={t('close')} disabled={busy} onClick={dismiss}>
        <IconCloseOutlineRegular size={14} />
      </button>
    </div>
    <p className={css.dialogText}>{t('signOutDescription')}</p>
    {error !== null && <p className={`${css.dialogText} ${css.error}`} role="alert">{t(error)}</p>}
    <div className={css.dialogActions}>
      <Button variant="outline" disabled={busy} onClick={dismiss}>{t('cancel')}</Button>
      <Button variant="primary" disabled={busy} onClick={() => { void confirm() }}>{t('signOut')}</Button>
    </div>
  </Modal>
}
