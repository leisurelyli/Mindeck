/** Sign-in dialog for compositions without the base first-run page, so a member can still sign in. */
import type { FormEvent } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { OnboardingPageInput } from '@deepseek-ai/dsh-client-ui-settings-account/client'
import css from './Account.module.css'

const stay = (): void => {
  // Nothing in Mindeck works without a session, so the dialog cannot be dismissed.
}

/**
 * Render one first-run page as an undismissable dialog: its copy, body, back control, and actions.
 * @param props - the page input the `desktop.onboarding.page` Factory would have received.
 * @returns the dialog, or nothing for a blank status page.
 */
export function OnboardingFallback(
  { layout, title, brand, description, body, actions = [], onSubmit, back, busy = false }: OnboardingPageInput,
) {
  if (layout === 'status' && title === '') return null
  const heading = brand === undefined ? title : `${title} ${brand}`
  const submit = (event: FormEvent): void => { event.preventDefault(); if (!busy) onSubmit?.() }
  return <Modal open headless title={heading} onClose={stay} className={css.dialog as string}>
    <form className={css.fallback} onSubmit={submit} noValidate aria-busy={busy}>
      <h2 className={css.dialogTitle}>{heading}</h2>
      {description !== undefined && <p className={css.dialogNote}>{description}</p>}
      {body}
      <div className={css.fallbackActions}>
        {back !== undefined && <Button variant="outline" type="button" disabled={busy || back.disabled === true} onClick={back.onClick}>{back.label}</Button>}
        {actions.map(action => <Button key={action.key} variant={action.variant} type={action.submit === true ? 'submit' : 'button'}
          disabled={busy || action.disabled === true} onClick={action.onClick}>{action.label}</Button>)}
      </div>
    </form>
  </Modal>
}
