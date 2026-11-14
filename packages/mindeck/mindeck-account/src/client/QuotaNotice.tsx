/** Mindeck take-over of the frame-wide quota notice raised when Mindeck Cloud refuses a request over the company quota. */
import {
  Button, IconCloseOutlineRegular, IconWarningOutlineRegular, Modal, StateDot, Toast,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { QuotaNoticeOwnerProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useEffect, useId, useState } from 'react'
import type { MindeckAccountView, MindeckQuotaRequest } from '../types.ts'
import type { MindeckAccountKey } from './locales.ts'
import type { MindeckAccountInjected, OperationOutcome } from './operations.ts'
import {
  formatCny, quotaParams, quotaPosition, type QuotaRequestOffer, quotaRequestOffer, quotaText, tightestQuota,
} from './quota.ts'
import css from './Account.module.css'

/** Composed quota notice props. */
export type QuotaNoticeProps = PropsRuntime<'shell.quota-notice'> & { matched: QuotaNoticeOwnerProps }
  & PropsLocale<'mindeckAccount'> & InjectFace<MindeckAccountInjected>

/** Longest reason Mindeck Cloud accepts, in characters. */
const MAX_REASON = 200

type Translate = (key: MindeckAccountKey, params?: Record<string, string>) => string

/**
 * A signed-in member learns which limit is used up (the company budget, their own, or their department's) and when
 * it resets, and can open their usage page in Mindeck Cloud. When Mindeck Cloud accepts a request for more quota, the
 * member asks for it here with an optional reason; a pending request shows when it was sent and can be withdrawn; a
 * used-up department or company limit names the administrator contact instead, since a personal request cannot raise
 * it. The quota is read again on open; until the read shows a used-up limit, the dialog gives the general explanation.
 * Without a session, the generic warning appears.
 * @param props - the claimed notice, account state, quota request operations, and localized copy.
 * @returns the quota dialog, or the generic Toast while signed out.
 */
export function QuotaNotice({ matched, useAccount, refreshQuota, requestQuota, withdrawQuotaRequest, t }: QuotaNoticeProps) {
  const { dismiss, message } = matched
  const view = useAccount(snapshot => snapshot.view)
  const signedIn = view?.status === 'signed-in'
  useEffect(() => { if (signedIn) refreshQuota() }, [signedIn, refreshQuota])
  if (view?.status !== 'signed-in' || view.cloudUrl === null) {
    return <Toast text={message} icon={<IconWarningOutlineRegular size={18} />} onDone={dismiss} />
  }
  return <QuotaDialog view={view} cloudUrl={view.cloudUrl} dismiss={dismiss}
    requestQuota={requestQuota} withdrawQuotaRequest={withdrawQuotaRequest} t={t} />
}

/** What the dialog is doing on the member's behalf. */
type Busy = 'ask' | 'withdraw' | null

/**
 * The quota dialog body shared by the refused-request notice and the reminder above the composer.
 * @param props - signed-in account state, its Cloud address, close, quota request operations, and copy.
 * @returns the quota dialog for a signed-in member.
 */
export function QuotaDialog({ view, cloudUrl, dismiss, requestQuota, withdrawQuotaRequest, t }: {
  view: MindeckAccountView
  cloudUrl: string
  dismiss: () => void
  requestQuota: MindeckAccountInjected['requestQuota']
  withdrawQuotaRequest: MindeckAccountInjected['withdrawQuotaRequest']
  t: Translate
}) {
  const reasonId = useId()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState<Busy>(null)
  const [confirming, setConfirming] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [withdrawn, setWithdrawn] = useState(false)
  const quota = view.quota
  const offer: QuotaRequestOffer = quota === null ? { kind: 'none', last: null } : quotaRequestOffer(quota)
  const position = quota === null ? undefined
    : offer.kind === 'contact' ? quotaPosition(quota, offer.scope) ?? tightestQuota(quota) : tightestQuota(quota)
  const usedUp = position !== undefined && position.ratio >= 1
  const last = offer.kind === 'ask' || offer.kind === 'none' ? offer.last : null
  // An approval that gave the member room again, while the dialog was open or before it opened.
  const approval = last?.status === 'approved' && !usedUp ? last : null
  const raised = approval !== null

  const run = async (kind: Exclude<Busy, null>, operation: () => Promise<OperationOutcome>): Promise<void> => {
    setBusy(kind)
    setFailure(null)
    try {
      const outcome = await operation()
      if (outcome.ok) {
        setConfirming(false)
        setWithdrawn(kind === 'withdraw')
        if (kind === 'ask') setReason('')
      } else {
        setFailure(outcome.message ?? t(outcome.reason === 'feedbackUnreachable' ? 'quotaRequestUnreachable' : 'quotaRequestFailed'))
        setConfirming(false)
      }
    } catch { setFailure(t('quotaRequestFailed')) } finally { setBusy(null) }
  }

  let text: string
  if (approval !== null) text = `${approvedText(approval, t)}${t('quotaApprovedContinue')}`
  else if (position !== undefined && usedUp) {
    text = position.scope === 'user' && offer.kind === 'ask' ? t('quotaUserOutAsk', quotaParams(position, quota?.resetDate ?? '', t))
      : position.scope === 'user' && offer.kind === 'pending' ? t('quotaUserOutPending', quotaParams(position, quota?.resetDate ?? '', t))
        : quotaText(position, 'out', quota?.resetDate ?? '', t)
  } else text = t('quotaDescription')
  const outcome = !raised && offer.kind === 'ask' && last !== null ? outcomeText(last, t) : undefined
  const usageUrl = new URL('/usage', cloudUrl).href
  const offersContact = offer.kind === 'contact' || (offer.kind === 'none' && !raised)

  return <Modal open headless title={raised ? t('quotaApprovedTitle') : t('quotaTitle')} onClose={dismiss} className={css.dialog as string}>
    <div className={css.dialogHeader}>
      <h2 className={css.dialogTitle}>{raised ? t('quotaApprovedTitle') : t('quotaTitle')}</h2>
      <button type="button" className={css.close} aria-label={t('close')} onClick={dismiss}>
        <IconCloseOutlineRegular size={14} />
      </button>
    </div>
    <p className={css.dialogText}>{text}</p>
    {offersContact && view.adminContact !== null && <p className={css.dialogText}>{t('adminContact', { contact: view.adminContact })}</p>}
    {outcome !== undefined && <p className={`${css.dialogText} ${css.dialogNote}`}>{outcome}</p>}
    {withdrawn && offer.kind === 'ask' && <p className={`${css.dialogText} ${css.dialogNote}`} role="status">{t('quotaRequestWithdrawn')}</p>}
    {offer.kind === 'ask' && (
      <div className={css.dialogBody}>
        <div className={css.fieldHead}>
          <label htmlFor={reasonId}>{t('quotaRequestReasonLabel')}</label>
          <span className={css.counter} aria-hidden="true">{reason.length}/{MAX_REASON}</span>
        </div>
        <textarea id={reasonId} className={`${css.textarea} ${css.reasonInput}`} placeholder={t('quotaRequestReasonPlaceholder')}
          value={reason} maxLength={MAX_REASON} readOnly={busy !== null}
          onChange={(event) => { setReason(event.target.value); setFailure(null) }} />
      </div>
    )}
    {offer.kind === 'pending' && <PendingRequest request={offer.request} confirming={confirming} t={t} />}
    {failure !== null && <p className={`${css.dialogText} ${css.error}`} role="alert">{failure}</p>}
    <div className={css.dialogActions}>
      {offer.kind === 'ask' && <>
        <a className={css.outlineLink} href={usageUrl} target="_blank" rel="noreferrer">{t('quotaUsage')}</a>
        <Button variant="primary" disabled={busy !== null} onClick={() => { void run('ask', () => requestQuota(reason)) }}>
          {t(busy === 'ask' ? 'quotaRequestSubmitting' : last?.status === 'rejected' ? 'quotaRequestResubmit' : 'quotaRequestSubmit')}
        </Button>
      </>}
      {offer.kind === 'pending' && (confirming
        ? <>
          <Button variant="outline" disabled={busy !== null} onClick={() => { setConfirming(false) }}>{t('quotaRequestKeep')}</Button>
          <Button variant="primary" disabled={busy !== null} onClick={() => { void run('withdraw', withdrawQuotaRequest) }}>
            {t(busy === 'withdraw' ? 'quotaRequestWithdrawing' : 'quotaRequestWithdraw')}
          </Button>
        </>
        : <>
          <Button variant="outline" onClick={() => { setConfirming(true); setFailure(null) }}>{t('quotaRequestWithdraw')}</Button>
          <Button variant="primary" onClick={dismiss}>{t('quotaDismiss')}</Button>
        </>)}
      {(offer.kind === 'contact' || offer.kind === 'none') && (raised
        ? <>
          <a className={css.outlineLink} href={usageUrl} target="_blank" rel="noreferrer">{t('quotaUsage')}</a>
          <Button variant="primary" onClick={dismiss}>{t('quotaDismiss')}</Button>
        </>
        : <>
          <Button variant="outline" onClick={dismiss}>{t('quotaDismiss')}</Button>
          <a className={css.primaryLink} href={usageUrl} target="_blank" rel="noreferrer" onClick={dismiss}>{t('quotaUsage')}</a>
        </>)}
    </div>
  </Modal>
}

/**
 * @param props - the pending request, whether its withdrawal awaits confirmation, and copy.
 * @returns when the request was sent and where the decision arrives, or what withdrawing it means.
 */
function PendingRequest({ request, confirming, t }: { request: MindeckQuotaRequest; confirming: boolean; t: Translate }) {
  return <div className={css.requestStatus} role="status">
    <StateDot state="warning" className={css.requestDot} />
    <div className={css.requestStatusText}>
      <p className={css.requestStatusTitle}>{t('quotaRequestPendingTitle')}</p>
      <p className={css.requestStatusMeta}>
        {confirming ? t('quotaRequestWithdrawConfirm') : t('quotaRequestPendingMeta', { time: requestTime(request.createdAt, t) })}
      </p>
      {!confirming && request.reason !== null && request.reason.trim() !== '' && (
        <p className={css.requestStatusMeta}>{t('quotaRequestReasonShown', { reason: request.reason })}</p>
      )}
    </div>
  </div>
}

/**
 * Word the outcome of this month's last request above a new one.
 * @param request - the member's last request this month.
 * @param t - account copy.
 * @returns the outcome, or undefined for a withdrawn or closed request.
 */
function outcomeText(request: MindeckQuotaRequest, t: Translate): string | undefined {
  if (request.status === 'approved') return approvedText(request, t)
  if (request.status !== 'rejected') return undefined
  const note = request.decisionNote?.trim() ?? ''
  return note === '' ? t('quotaRequestRejected') : t('quotaRequestRejectedNote', { note })
}

/**
 * @param request - an approved request.
 * @param t - account copy.
 * @returns what the approval changed.
 */
function approvedText(request: MindeckQuotaRequest, t: Translate): string {
  const amount = request.amount === null ? undefined : formatCny(request.amount)
  if (amount !== undefined && request.decision === 'this_month') return t('quotaRequestApproved', { change: t('quotaRequestThisMonth', { amount }) })
  if (amount !== undefined && request.decision === 'permanent') return t('quotaRequestApproved', { change: t('quotaRequestPermanent', { amount }) })
  return t('quotaRequestApprovedPlain')
}

/**
 * @param iso - ISO 8601 time.
 * @param t - account copy.
 * @returns the time in this computer's time zone, as `11 月 14 日 10:32`.
 */
function requestTime(iso: string, t: Translate): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (value: number): string => String(value).padStart(2, '0')
  return t('quotaRequestTime', {
    month: String(date.getMonth() + 1), day: String(date.getDate()), time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  })
}
