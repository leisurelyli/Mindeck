/** Settings page with the signed-in member, the company, and sign-out. */
import { useState } from 'react'
import { Button, IconRightUpOutlineRegular, IconUserOutlineMedium } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { initial, type MindeckAccountInjected } from './operations.ts'
import { SignInPanel } from './SignInPanel.tsx'
import { SignOutDialog } from './SignOutDialog.tsx'
import css from './Account.module.css'

/** Composed settings section props. */
export type AccountSectionProps =
  PropsRuntime<'settings.section'> & PropsLocale<'mindeckAccount'> & InjectFace<MindeckAccountInjected>

/** @param props - requested edge. @returns the account glyph for the settings navigation. */
export function AccountSectionIcon({ size }: PropsRuntime<'settings.section.icon'>) {
  return <IconUserOutlineMedium size={size} />
}

/** @param props - localized copy, account state, and operations. @returns the account settings page. */
export function AccountSection({ t, useAccount, connect, startSignIn, cancelSignIn, signOut }: AccountSectionProps) {
  const { view, failed } = useAccount(snapshot => snapshot)
  const [confirming, setConfirming] = useState(false)
  if (view === undefined) return <section className={css.section} aria-label={t('nav')}>
    <p className={failed ? css.error : css.secondary} role="status">{t(failed ? 'streamFailed' : 'loading')}</p>
  </section>
  const user = view.user
  if (view.status === 'signed-out' || user === null) return <section className={css.section} aria-label={t('nav')}>
    <div className={css.card}>
      <SignInPanel view={view} t={t} connect={connect} startSignIn={startSignIn} cancelSignIn={cancelSignIn} />
    </div>
  </section>
  return (
    <section className={css.section} aria-label={t('nav')}>
      <div className={css.card}>
        <div className={css.identity}>
          <span className={css.avatar} aria-hidden="true">{initial(user.name)}</span>
          <div className={css.copy}>
            <span className={css.name}>{user.name}</span>
            <span className={css.secondary}>{user.email}</span>
          </div>
        </div>
      </div>
      <dl className={css.card}>
        <div className={css.row}><dt>{t('company')}</dt><dd>{view.companyName}</dd></div>
        <div className={css.row}><dt>{t('department')}</dt><dd>{user.department?.name ?? t('noDepartment')}</dd></div>
        <div className={css.row}><dt>{t('role')}</dt><dd>{t(user.role === 'admin' ? 'admin' : 'member')}</dd></div>
        <div className={css.row}>
          <dt>{t('cloudAddress')}</dt>
          <dd className={css.copy}>
            <span className={css.address}>{view.cloudUrl}</span>
            <span className={css.secondary}>{t('cloudLocked')}</span>
          </dd>
        </div>
      </dl>
      <div className={css.actions}>
        {view.cloudUrl !== null && <a className={css.outlineLink} href={view.cloudUrl} target="_blank" rel="noreferrer">
          {t('openConsole')}<IconRightUpOutlineRegular size={12} />
        </a>}
        <Button variant="outline" onClick={() => { setConfirming(true) }}>{t('signOut')}</Button>
      </div>
      {confirming && <SignOutDialog signOut={signOut} close={() => { setConfirming(false) }} t={t} />}
    </section>
  )
}
