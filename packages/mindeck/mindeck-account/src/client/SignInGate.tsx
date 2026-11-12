/** Modal sign-in that covers the workspace while this desktop has no Mindeck session. */
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { MindeckAccountInjected } from './operations.ts'
import { SignInPanel } from './SignInPanel.tsx'
import css from './Account.module.css'

/** Composed gate props. */
export type SignInGateProps = PropsLocale<'mindeckAccount'> & InjectFace<MindeckAccountInjected>

const stay = (): void => {
  // Nothing in Mindeck works without a session, so the gate cannot be dismissed.
}

/**
 * Hidden until the first state arrives, so a signed-in start never flashes the gate.
 * @param props - localized copy, account state, and operations.
 * @returns the gate, or nothing while signed in.
 */
export function SignInGate({ t, useAccount, connect, startSignIn, cancelSignIn }: SignInGateProps) {
  const { view, failed } = useAccount(snapshot => snapshot)
  if (view?.status === 'signed-in' || (view === undefined && !failed)) return null
  return (
    <Modal open headless title={t('gateTitle')} onClose={stay} className={css.gate as string}>
      <div className={css.gateContent}>
        <div className={css.copy}>
          <h2 className={css.gateTitle}>{t('gateTitle')}</h2>
          <p className={css.secondary}>{t('gateDescription')}</p>
        </div>
        {view === undefined
          ? <p className={css.error} role="alert">{t('streamFailed')}</p>
          : <SignInPanel view={view} t={t} connect={connect} startSignIn={startSignIn} cancelSignIn={cancelSignIn} />}
      </div>
    </Modal>
  )
}
