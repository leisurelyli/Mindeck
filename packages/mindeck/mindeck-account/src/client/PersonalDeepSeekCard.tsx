/** Optional personal DeepSeek account card on the account page, shown while the company allows it. */
import { useEffect, useRef, useState } from 'react'
import { FishLogo } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AccountLinkInput } from '@deepseek-ai/dsh-client-ui-settings-account/client'
import type { InjectFace, PropsRenderFactories } from '@deepseek-ai/dsh-client-ui-slots'
import type { MindeckAccountKey } from './locales.ts'
import type { MindeckAccountInjected } from './operations.ts'
import { personalSignInActive } from './personal-deepseek.ts'

/** Props of the personal account card. */
export type PersonalDeepSeekCardProps =
  Pick<InjectFace<MindeckAccountInjected>, 'usePersonal' | 'startPersonalSignIn' | 'cancelPersonalSignIn' | 'signOutPersonal'>
  & Pick<PropsRenderFactories, 'renderFactorySlot'>
  & { readonly t: (key: MindeckAccountKey) => string }

/**
 * The member signs in to or out of a personal DeepSeek account and reads what that means for cost and data. Balance,
 * usage, and top-up stay on the base DeepSeek account page.
 * @param props - personal account state, its actions, the base account page parts, and localized copy.
 * @returns the identity card of the personal account.
 */
export function PersonalDeepSeekCard(
  { usePersonal, startPersonalSignIn, cancelPersonalSignIn, signOutPersonal, renderFactorySlot, t }: PersonalDeepSeekCardProps,
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
  const ended = attempt?.phase === 'failed' || attempt?.phase === 'expired'
  const signedIn = view?.status === 'credential-stored'
  const status: MindeckAccountKey = !available || failed ? 'personalUnavailable'
    : error ?? (active ? 'personalWaiting' : ended ? 'personalFailed' : signedIn ? 'personalSignedIn' : 'personalDescription')
  const links: AccountLinkInput[] = !available || view === undefined ? []
    : active
      ? [
        { key: 'cancel', label: t('cancel'), disabled: busy, onClick: () => { void cancelPersonalSignIn() } },
        ...authorizeUrl === undefined ? [] : [{ key: 'open', label: t('openBrowser'), primary: true, href: authorizeUrl }],
      ]
      : signedIn
        ? [{ key: 'sign-out', label: t('personalSignOut'), disabled: busy, onClick: () => { void run(signOutPersonal) } }]
        : [{
          key: 'sign-in', label: t('personalSignIn'), disabled: busy,
          onClick: () => { requestedHere.current = true; void run(startPersonalSignIn) },
        }]
  return renderFactorySlot('settings.account.identity', {
    avatar: <FishLogo size={18} />,
    name: t('personalTitle'),
    status: t(status),
    actions: links.length === 0 ? undefined : renderFactorySlot('settings.account.links', { links }),
  })
}
