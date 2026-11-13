/** Cloud address and device sign-in steps shared by the sign-in gate and the settings section. */
import { useEffect, useId, useRef, useState, type ClipboardEvent, type FormEvent } from 'react'
import { Button, IconLoadingOutlineRegular, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MindeckAccountView } from '../types.ts'
import type { MindeckAccountKey } from './locales.ts'
import { attemptErrorKey, type MindeckAccountInjected } from './operations.ts'
import { cloudUrlInText } from './address.ts'
import css from './Account.module.css'

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

/** Props of {@link SignInPanel}. */
export interface SignInPanelProps extends Pick<MindeckAccountInjected, 'connect' | 'startSignIn' | 'cancelSignIn'> {
  /** Signed-out account state. */
  view: MindeckAccountView
  t: (key: MindeckAccountKey, params?: Record<string, string>) => string
}

/**
 * The address form appears until an address is set and again on "Change address"; the sign-in steps follow the
 * Host attempt, so every window shows the same code. The window where the member chose Sign in opens the approval
 * page in the browser once the code arrives.
 * @param props - signed-out state, localized copy, and account operations.
 * @returns the current sign-in step.
 */
export function SignInPanel({ view, t, connect, startSignIn, cancelSignIn }: SignInPanelProps) {
  const [editing, setEditing] = useState(false)
  const [address, setAddress] = useState(view.cloudUrl ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<MindeckAccountKey | null>(null)
  const [copied, setCopied] = useState<'copiedLink' | 'copyFailed' | null>(null)
  const inputId = useId()
  const hintId = useId()
  const attempt = view.attempt
  const phase = attempt?.phase
  const now = useNow(phase === 'waiting' && attempt?.expiresAt !== undefined)
  const requestedHere = useRef(false)
  const openedFor = useRef<string | null>(null)
  useEffect(() => { setCopied(null) }, [attempt?.id])
  useEffect(() => {
    const url = attempt?.verificationUrl
    if (phase !== 'waiting' || url === undefined || !requestedHere.current || openedFor.current === attempt?.id) return
    requestedHere.current = false
    openedFor.current = attempt?.id ?? null
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [phase, attempt?.id, attempt?.verificationUrl])
  useEffect(() => {
    if (copied === null) return
    const timer = setTimeout(() => { setCopied(null) }, 2000)
    return () => { clearTimeout(timer) }
  }, [copied])
  const run = async (action: () => Promise<{ ok: true } | { ok: false; reason: MindeckAccountKey }>): Promise<boolean> => {
    setBusy(true)
    setError(null)
    try {
      const outcome = await action()
      if (!outcome.ok) setError(outcome.reason)
      return outcome.ok
    } catch { setError('failed'); return false } finally { setBusy(false) }
  }
  const submit = (event: FormEvent): void => {
    event.preventDefault()
    void run(() => connect(address)).then((ok) => { if (ok) setEditing(false) })
  }
  const cancel = (): void => {
    if (attempt === null) return
    setBusy(true)
    void cancelSignIn(attempt.id).catch(() => { setError('failed') }).finally(() => { setBusy(false) })
  }
  const signIn = (): void => {
    requestedHere.current = true
    void run(startSignIn).then((ok) => { if (!ok) requestedHere.current = false })
  }
  const paste = (event: ClipboardEvent<HTMLInputElement>): void => {
    const text = event.clipboardData.getData('text')
    const found = cloudUrlInText(text)
    if (found === undefined || found === text.trim()) return
    event.preventDefault()
    setAddress(found)
    setError(null)
  }
  const copyLink = async (url: string): Promise<void> => {
    try { await navigator.clipboard.writeText(url); setCopied('copiedLink') } catch { setCopied('copyFailed') }
  }

  if (phase === 'requesting' || phase === 'registering') return (
    <div className={css.panel}>
      <p className={css.progress} role="status">
        <IconLoadingOutlineRegular className={css.spinner} />{t(phase)}
      </p>
      {phase === 'requesting' && <div className={css.actions}>
        <Button variant="outline" disabled={busy} onClick={cancel}>{t('cancel')}</Button>
      </div>}
    </div>
  )
  if (phase === 'waiting' && attempt?.userCode !== undefined && attempt.verificationUrl !== undefined) {
    const url = attempt.verificationUrl
    return (
      <div className={css.panel}>
        <div className={css.copy}>
          <span className={css.stepTitle}>{t('waitingTitle')}</span>
          <span className={css.secondary}>{t('waitingDescription')}</span>
        </div>
        <output className={css.code} aria-label={t('waitingTitle')}>{displayUserCode(attempt.userCode)}</output>
        {attempt.retrying === true
          ? <p className={css.progress} role="status"><IconLoadingOutlineRegular className={css.spinner} />{t('reconnecting')}</p>
          : attempt.expiresAt !== undefined && <p className={css.secondary}>{t('expiresIn', { time: formatRemaining(attempt.expiresAt - now) })}</p>}
        <div className={css.actions}>
          <Button variant="outline" disabled={busy} onClick={cancel}>{t('cancel')}</Button>
          <Button variant="outline" onClick={() => { void copyLink(url) }}>{t(copied ?? 'copyLink')}</Button>
          <a className={css.primaryLink} href={url} target="_blank" rel="noreferrer">{t('openBrowser')}</a>
        </div>
      </div>
    )
  }
  if (view.cloudUrl === null || editing) return (
    <form className={css.panel} onSubmit={submit}>
      <div className={css.field}>
        <label htmlFor={inputId} className={css.label}>{t('cloudUrlLabel')}</label>
        <Input id={inputId} value={address} autoFocus spellCheck={false} autoCapitalize="off" autoComplete="url" inputMode="url"
          placeholder={t('cloudUrlPlaceholder')} disabled={busy} aria-invalid={error !== null} aria-describedby={hintId}
          onChange={(event) => { setAddress(event.target.value); setError(null) }} onPaste={paste} />
        <span id={hintId} className={error === null ? css.secondary : css.error} role={error === null ? undefined : 'alert'}>
          {t(error ?? 'cloudUrlHint')}
        </span>
      </div>
      <div className={css.actions}>
        {view.cloudUrl !== null && <Button variant="outline" type="button" disabled={busy}
          onClick={() => { setEditing(false); setError(null); setAddress(view.cloudUrl ?? '') }}>{t('cancel')}</Button>}
        <Button variant="primary" type="submit" disabled={busy || address.trim() === ''}>
          {t(busy ? 'connecting' : 'continue')}
        </Button>
      </div>
    </form>
  )
  const noticeKey: MindeckAccountKey | null = error
    ?? (phase === 'failed' ? attemptErrorKey(attempt?.errorCode) : view.notice === 'session-expired' ? 'sessionExpired' : null)
  return (
    <div className={css.panel}>
      <div className={css.addressRow}>
        <div className={css.copy}>
          <span className={css.label}>{t('cloudUrlLabel')}</span>
          <span className={css.address}>{view.cloudUrl}</span>
        </div>
        <button type="button" className={css.textButton} disabled={busy}
          onClick={() => { setAddress(view.cloudUrl ?? ''); setError(null); setEditing(true) }}>{t('changeCloud')}</button>
      </div>
      {noticeKey !== null && <p className={css.error} role="alert">{t(noticeKey)}</p>}
      <div className={css.actions}>
        <Button variant="primary" disabled={busy} onClick={signIn}>
          {t(phase === 'failed' ? 'retry' : 'signIn')}
        </Button>
      </div>
    </div>
  )
}
