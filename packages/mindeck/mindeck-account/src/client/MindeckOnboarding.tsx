/**
 * Full-screen Mindeck sign-in on the base first-run page: welcome on a device's first start, then the company address,
 * then confirmation in the browser, then a short welcome before the stage fades into the workspace.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type ClipboardEvent } from 'react'
import { IconInfoOutlineRegular, IconLoadingOutlineRegular, IconWarningOutlineRegular, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { OnboardingPageAction, OnboardingPageInput } from '@deepseek-ai/dsh-client-ui-settings-account/client'
import type { InjectFace, PropsLocale, PropsRenderFactories, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { MindeckAccountView } from '../types.ts'
import { cloudUrlInText } from './address.ts'
import type { MindeckAccountKey } from './locales.ts'
import { attemptErrorKey, type MindeckAccountInjected, type OperationOutcome } from './operations.ts'
import { OnboardingFallback } from './OnboardingFallback.tsx'
import css from './Onboarding.module.css'

/** Composed sign-in stage props. */
export type MindeckOnboardingProps = PropsRuntime<'shell.overlay'> & PropsLocale<'mindeckAccount'> & PropsRenderFactories
  & InjectFace<MindeckAccountInjected>

/** Copy lookup of the account namespace. */
type Translate = (key: MindeckAccountKey, params?: Record<string, string>) => string

/** How long the welcome page after a sign-in stays before the stage fades. */
const DONE_HOLD_MS = 900
/** The base stage's exit fade. */
const EXIT_MS = 180

/**
 * Whether the stage covers the workspace: until the first account state, while signed out, and through the exit.
 * `done` holds the welcome after a sign-in; `leaving` fades the stage; `hidden` shows the workspace.
 */
type Presence = 'covering' | 'done' | 'leaving' | 'hidden'

/** Groups an eight-character code as `XXXX-XXXX`, the way the Mindeck Cloud confirmation page shows it. */
function displayUserCode(code: string): string {
  return /^[A-Z0-9]{8}$/i.test(code) ? `${code.slice(0, 4)}-${code.slice(4)}`.toUpperCase() : code
}

/** Remaining time as `m:ss`. */
function formatRemaining(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * Current time, refreshed every second while `active`.
 * @param active - whether a countdown is visible.
 * @returns epoch milliseconds.
 */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const timer = setInterval(() => { setNow(Date.now()) }, 1000)
    return () => { clearInterval(timer) }
  }, [active])
  return now
}

/** @returns whether the member asked the system for reduced motion. */
function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Phases of a sign-in attempt the confirmation page shows. A succeeded attempt arrives together with the signed-in
 * state, so while signed out it belongs to a session that has since ended.
 */
const CONFIRM_PHASES = new Set(['requesting', 'waiting', 'registering'])

/**
 * Explain why the last session ended without the member signing out on this computer.
 * @param view - signed-out account state.
 * @param t - account copy.
 * @returns who signed this computer out, with the administrator contact when an administrator did, or that the
 *   sign-in expired; null when no session ended that way.
 */
function sessionEndNotice(view: MindeckAccountView, t: Translate): { text: string; tone: 'info' } | null {
  switch (view.notice) {
    case 'signed-out-by-admin':
      return { text: view.adminContact === null ? t('signedOutByAdmin') : t('signedOutByAdminContact', { contact: view.adminContact }), tone: 'info' }
    case 'signed-out-by-member': return { text: t('signedOutByMember'), tone: 'info' }
    case 'session-expired': return { text: t('sessionExpired'), tone: 'info' }
    case null: return null
  }
}

/**
 * @param props.view - signed-out account state.
 * @param props.t - account copy.
 * @param props.now - current time for the countdown.
 * @returns the code card and a status line below it. While the code is requested and while sign-in finishes, the
 * card shows that progress instead, so the page keeps its layout between phases.
 */
function ConfirmBody({ view, t, now }: { view: MindeckAccountView; t: Translate; now: number }) {
  const attempt = view.attempt
  if (attempt?.phase !== 'waiting' || attempt.userCode === undefined) {
    return <div className={css.confirm}>
      <p className={css.code} data-pending role="status">
        <IconLoadingOutlineRegular className={css.spinner} />{t(attempt?.phase === 'requesting' ? 'requesting' : 'registering')}
      </p>
      <p className={css.status} />
    </div>
  }
  return <div className={css.confirm}>
    <output className={css.code} aria-label={t('codeLabel')}>{displayUserCode(attempt.userCode)}</output>
    {attempt.retrying === true
      ? <p className={css.status} role="status"><IconLoadingOutlineRegular className={css.spinner} />{t('reconnecting')}</p>
      : <p className={css.status}>{attempt.expiresAt !== undefined && t('expiresIn', { time: formatRemaining(attempt.expiresAt - now) })}</p>}
  </div>
}

/**
 * Covers the workspace until the first account state arrives, so a signed-in start never shows a sign-in page and a
 * signed-out start never shows the workspace. The welcome page appears once per device; a member who signed out or
 * whose session ended starts at the address, which keeps the known Cloud and says why. The window where the member
 * chose to continue opens the approval page in the browser once the code arrives. After a sign-in the stage greets
 * the member and fades, leaving the workspace as it was.
 * @param props - localized copy, account state, operations, and the base first-run page.
 * @returns the stage, or nothing while signed in.
 */
export function MindeckOnboarding(
  { t, renderFactorySlot, useAccount, connect, startSignIn, cancelSignIn, finishWelcome }: MindeckOnboardingProps,
) {
  const { view, failed } = useAccount(snapshot => snapshot)
  const signedIn = view?.status === 'signed-in'
  const [presence, setPresence] = useState<Presence>('covering')
  // Whether a sign-in page showed since the stage last covered the workspace: only a sign-in earns the welcome.
  const [showedSignIn, setShowedSignIn] = useState(false)
  const [showedWelcome, setShowedWelcome] = useState(false)
  const [started, setStarted] = useState(false)
  const [revisiting, setRevisiting] = useState(false)
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<MindeckAccountKey | null>(null)
  const [copied, setCopied] = useState<'copiedLink' | 'copyFailed' | null>(null)
  const requestedHere = useRef(false)
  const openedFor = useRef<string | null>(null)
  const fieldId = useId()
  const hintId = useId()
  const attempt = view?.attempt ?? null
  const phase = attempt?.phase
  const confirming = phase !== undefined && CONFIRM_PHASES.has(phase)
  const welcoming = view !== undefined && !signedIn && !confirming
    && (revisiting || (!view.welcomed && !started && view.notice === null))
  const step = view === undefined ? (failed ? 'failed' : 'loading')
    : signedIn ? (presence === 'done' || showedSignIn ? 'done' : 'loading')
      : confirming ? 'confirm' : welcoming ? 'welcome' : 'connect'

  // Layout effects settle the stage before paint, so a sign-out never shows the workspace for a frame.
  useLayoutEffect(() => {
    if (view === undefined) return
    if (!signedIn) { setPresence('covering'); return }
    setPresence(current => current !== 'covering' ? current : showedSignIn ? 'done' : 'leaving')
  }, [view === undefined, signedIn, showedSignIn])
  useEffect(() => {
    if (presence === 'hidden') { setShowedSignIn(false); setShowedWelcome(false); return }
    if (presence === 'covering') return
    if (presence === 'leaving' && reducedMotion()) { setPresence('hidden'); return }
    const timer = setTimeout(() => { setPresence(presence === 'done' ? 'leaving' : 'hidden') }, presence === 'done' ? DONE_HOLD_MS : EXIT_MS)
    return () => { clearTimeout(timer) }
  }, [presence])
  // Entering the address page starts from the known Cloud address.
  const previousStep = useRef<typeof step | null>(null)
  useLayoutEffect(() => {
    if (step === 'welcome' || step === 'connect' || step === 'confirm') setShowedSignIn(true)
    if (step === 'welcome') setShowedWelcome(true)
    if (step === 'connect' && previousStep.current !== 'connect') {
      setAddress(view?.cloudUrl ?? '')
      setError(null)
    }
    previousStep.current = step
  }, [step, view?.cloudUrl])
  useEffect(() => { setCopied(null) }, [attempt?.id])
  useEffect(() => {
    if (copied === null) return
    const timer = setTimeout(() => { setCopied(null) }, 2000)
    return () => { clearTimeout(timer) }
  }, [copied])
  const url = attempt?.verificationUrl
  useEffect(() => {
    if (phase !== 'waiting' || url === undefined || !requestedHere.current || openedFor.current === attempt?.id) return
    requestedHere.current = false
    openedFor.current = attempt?.id ?? null
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [phase, attempt?.id, url])
  const now = useNow(phase === 'waiting' && attempt?.expiresAt !== undefined)
  if (presence === 'hidden') return null

  const run = (action: () => Promise<OperationOutcome>): void => {
    setBusy(true)
    setError(null)
    requestedHere.current = true
    void action().then((outcome) => {
      if (outcome.ok) return
      requestedHere.current = false
      setError(outcome.reason)
    }, () => {
      requestedHere.current = false
      setError('failed')
    }).finally(() => { setBusy(false) })
  }
  const submit = (): void => {
    if (view === undefined || busy) return
    const typed = cloudUrlInText(address) ?? address.trim()
    if (typed === '') return
    run(() => view.cloudUrl !== null && typed === view.cloudUrl ? startSignIn() : connect(typed))
  }
  const paste = (event: ClipboardEvent<HTMLInputElement>): void => {
    const text = event.clipboardData.getData('text')
    const found = cloudUrlInText(text)
    if (found === undefined || found === text.trim()) return
    event.preventDefault()
    setAddress(found)
    setError(null)
  }
  const cancel = (): void => {
    if (attempt === null) return
    setBusy(true)
    void cancelSignIn(attempt.id).catch(() => { setError('failed') }).finally(() => { setBusy(false) })
  }
  const copyLink = async (link: string): Promise<void> => {
    try { await navigator.clipboard.writeText(link); setCopied('copiedLink') } catch { setCopied('copyFailed') }
  }

  const common = { locale: t('artworkLocale'), exiting: presence === 'leaving' }
  let input: OnboardingPageInput
  switch (step) {
    case 'loading':
      input = { ...common, page: 'loading', layout: 'status', title: '' }
      break
    case 'failed':
      input = { ...common, page: 'failed', layout: 'centered', title: t('streamFailedTitle'), description: t('streamFailed') }
      break
    case 'welcome':
      input = {
        ...common, page: 'welcome', layout: 'hero', title: t('welcomeTitle'), brand: t('brand'), description: t('welcomeDescription'),
        actions: [{ key: 'start', label: t('welcomeStart'), variant: 'primary', onClick: () => {
          setStarted(true)
          setRevisiting(false)
          if (view?.welcomed === false) finishWelcome()
        } }],
      }
      break
    case 'connect': {
      const notice: { text: string; tone: 'error' | 'info' } | null = error !== null ? null
        : phase === 'failed' ? { text: t(attemptErrorKey(attempt?.errorCode)), tone: 'error' }
          : view === undefined ? null : sessionEndNotice(view, t)
      input = {
        ...common, page: 'connect', layout: 'centered', title: t('connectTitle'), description: t('connectDescription'), busy,
        onSubmit: submit,
        body: <div className={css.connect}>
          {notice !== null && <p className={css.notice} data-tone={notice.tone} role={notice.tone === 'error' ? 'alert' : 'status'}>
            {notice.tone === 'error' ? <IconWarningOutlineRegular size={16} /> : <IconInfoOutlineRegular size={16} />}
            <span>{notice.text}</span>
          </p>}
          <div className={css.field}>
            <label htmlFor={fieldId} className={css.label}>{t('cloudUrlLabel')}</label>
            <Input id={fieldId} className={css.input as string} value={address} autoFocus spellCheck={false} autoCapitalize="off" autoComplete="url" inputMode="url"
              placeholder={t('cloudUrlPlaceholder')} disabled={busy} aria-invalid={error !== null} aria-describedby={hintId}
              onChange={(event) => { setAddress(event.target.value); setError(null) }} onPaste={paste} />
            <span id={hintId} className={error === null ? css.hint : css.error} role={error === null ? undefined : 'alert'}>
              {t(error ?? 'cloudUrlHint')}
            </span>
          </div>
        </div>,
        actions: [{ key: 'continue', label: t(busy ? 'connecting' : 'continue'), variant: 'primary', submit: true, disabled: address.trim() === '' }],
        ...showedWelcome ? { back: { label: t('back'), onClick: () => { setRevisiting(true) } } } : {},
      }
      break
    }
    case 'confirm': {
      const link = phase === 'waiting' ? url : undefined
      const actions: OnboardingPageAction[] = [
        { key: 'copy', label: t(copied ?? 'copyLink'), variant: 'outline', disabled: link === undefined, onClick: () => { if (link !== undefined) void copyLink(link) } },
        { key: 'open', label: t('openBrowser'), variant: 'primary', disabled: link === undefined, onClick: () => { if (link !== undefined) window.open(link, '_blank', 'noopener,noreferrer') } },
      ]
      input = {
        ...common, page: 'confirm', layout: 'centered', title: t('confirmTitle'), description: t('confirmDescription'),
        body: view === undefined ? undefined : <>
          <ConfirmBody view={view} t={t} now={now} />
          {error !== null && <p className={css.error} role="alert">{t(error)}</p>}
        </>,
        actions,
        back: { label: t('back'), disabled: busy || phase === 'registering', onClick: cancel },
      }
      break
    }
    case 'done':
      input = {
        ...common, page: 'done', layout: 'centered', busy: true,
        title: t('doneTitle', { name: view?.user?.name ?? '' }), description: t('doneDescription', { company: view?.companyName ?? '' }),
      }
      break
  }
  return renderFactorySlot('desktop.onboarding.page', input, { fallback: <OnboardingFallback {...input} /> })
}
