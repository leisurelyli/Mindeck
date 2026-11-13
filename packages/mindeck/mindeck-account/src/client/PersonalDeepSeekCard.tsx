/** Optional personal DeepSeek account block on the company account page, shown while the company allows it. */
import { useEffect, useRef, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { MindeckAccountKey } from './locales.ts'
import type { MindeckAccountInjected } from './operations.ts'
import { personalSignInActive } from './personal-deepseek.ts'
import css from './Account.module.css'

/** Props of the personal account block. */
export type PersonalDeepSeekCardProps =
  Pick<InjectFace<MindeckAccountInjected>, 'usePersonal' | 'startPersonalSignIn' | 'cancelPersonalSignIn' | 'signOutPersonal'>
  & { readonly t: (key: MindeckAccountKey) => string }

/**
 * The member signs in to or out of a personal DeepSeek account and reads what that means for cost and data.
 * @param props - personal account state, its actions, and localized copy.
 * @returns the block.
 */
export function PersonalDeepSeekCard(
  { usePersonal, startPersonalSignIn, cancelPersonalSignIn, signOutPersonal, t }: PersonalDeepSeekCardProps,
) {
  const { available, view, failed } = usePersonal(snapshot => snapshot)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<MindeckAccountKey | undefined>()
  const run = async (action: () => Promise<{ ok: true } | { ok: false; reason: MindeckAccountKey }>) => {
    setBusy(true)
    setError(undefined)
    try {
      const outcome = await action()
      if (!outcome.ok) setError(outcome.reason)
    } finally { setBusy(false) }
  }
  const active = personalSignInActive(view)
  const attempt = view?.attempt
  const authorizeUrl = attempt?.phase === 'waiting-browser' ? attempt.authorizeUrl : undefined
  // Mindeck Desktop's main process does not follow the DeepSeek account, so the window that started the
  // sign-in opens the authorization page once.
  const requestedHere = useRef(false)
  const openedFor = useRef<string | null>(null)
  useEffect(() => {
    if (authorizeUrl === undefined || !requestedHere.current || openedFor.current === attempt?.id) return
    requestedHere.current = false
    openedFor.current = attempt?.id ?? null
    window.open(authorizeUrl, '_blank', 'noopener,noreferrer')
  }, [authorizeUrl, attempt?.id])
  const ended = view?.attempt?.phase === 'failed' || view?.attempt?.phase === 'expired'
  const status: MindeckAccountKey | undefined = !available || failed ? 'personalUnavailable'
    : error ?? (active ? 'personalWaiting' : ended ? 'personalFailed' : view?.status === 'credential-stored' ? 'personalSignedIn' : undefined)
  return <section className={css.card} aria-label={t('personalTitle')}>
    <div className={css.panel}>
      <div className={css.copy}>
        <span className={css.name}>{t('personalTitle')}</span>
        <span className={css.secondary}>{t('personalDescription')}</span>
      </div>
      {status !== undefined && <p className={error !== undefined || status === 'personalFailed' ? css.error : css.secondary} role="status">
        {t(status)}
      </p>}
      {available && view !== undefined && <div className={css.actions}>
        {active
          ? <Button variant="outline" disabled={busy} onClick={() => { void cancelPersonalSignIn() }}>{t('cancel')}</Button>
          : view.status === 'credential-stored'
            ? <Button variant="outline" disabled={busy} onClick={() => { void run(signOutPersonal) }}>{t('personalSignOut')}</Button>
            : <Button variant="outline" disabled={busy} onClick={() => { requestedHere.current = true; void run(startPersonalSignIn) }}>
              {t('personalSignIn')}
            </Button>}
        {authorizeUrl !== undefined && <a className={css.primaryLink} href={authorizeUrl} target="_blank" rel="noreferrer">{t('openBrowser')}</a>}
      </div>}
    </div>
  </section>
}
