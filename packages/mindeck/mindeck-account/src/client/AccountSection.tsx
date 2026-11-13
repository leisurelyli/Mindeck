/** Settings page with the signed-in member, the company, this month's usage, and sign-out, drawn with the base account page parts. */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, IconUserOutlineMedium } from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from '@deepseek-ai/dsh-client-ui-settings-account/client'
import type { InjectFace, PropsLocale, PropsRenderFactories, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { MindeckQuotaUsage } from '../types.ts'
import type { MindeckAccountKey } from './locales.ts'
import { initial, type MindeckAccountInjected } from './operations.ts'
import { PersonalDeepSeekCard } from './PersonalDeepSeekCard.tsx'
import { formatCny, monthDay } from './quota.ts'
import { SignOutDialog } from './SignOutDialog.tsx'
import css from './Account.module.css'

/** Composed settings section props. */
export type AccountSectionProps =
  PropsRuntime<'settings.section'> & PropsLocale<'mindeckAccount'> & PropsRenderFactories & InjectFace<MindeckAccountInjected>

/** @param props - requested edge. @returns the account glyph for the settings navigation. */
export function AccountSectionIcon({ size }: PropsRuntime<'settings.section.icon'>) {
  return <IconUserOutlineMedium size={size} />
}

/**
 * @param props.usage - month-to-date cost against one limit.
 * @param props.resetDate - `YYYY-MM-DD` when usage starts over.
 * @param props.renderFactorySlot - base account page parts.
 * @param props.t - account copy.
 * @returns the amount used, the limit beside it, and when usage starts over.
 */
function UsageValue({ usage, resetDate, renderFactorySlot, t }: {
  usage: MindeckQuotaUsage
  resetDate: string
  renderFactorySlot: PropsRenderFactories['renderFactorySlot']
  t: (key: MindeckAccountKey, params?: Record<string, string>) => string
}) {
  const used = formatCny(usage.used)
  return <span className={css.value}>
    <span className={css.usageLine}>
      {renderFactorySlot('settings.account.amount', { values: [{ key: 'used', text: used }] }, { fallback: used })}
      <span className={css.usageLimit}>
        {usage.limit === null ? t('usageUnlimited') : t('usageLimit', { limit: formatCny(usage.limit) })}
      </span>
    </span>
    <span className={css.note}>{t('usageReset', { reset: t('quotaReset', monthDay(resetDate)) })}</span>
  </span>
}

/**
 * The account page leaves Settings when the member signs out or the session ends, so the sign-in stage underneath
 * is not covered by the Settings dialog.
 * @param props - localized copy, account state, operations, and the base account page parts.
 * @returns the account settings page.
 */
export function AccountSection({
  t, close, renderFactorySlot, useAccount, usePersonal, signOut, startPersonalSignIn, cancelPersonalSignIn, signOutPersonal,
}: AccountSectionProps) {
  const { view, failed } = useAccount(snapshot => snapshot)
  const [confirming, setConfirming] = useState(false)
  const signedIn = view?.status === 'signed-in'
  const wasSignedIn = useRef(signedIn)
  useEffect(() => {
    if (wasSignedIn.current && !signedIn) close()
    wasSignedIn.current = signedIn
  }, [signedIn, close])
  // Without the base page parts, as in a composition that leaves out ui-settings-account, the page keeps the member's
  // identity and sign-out in plain form.
  const page = (children: ReactNode, plain: ReactNode = children) => renderFactorySlot('settings.account.page', { label: t('nav'), children }, {
    fallback: <section aria-label={t('nav')}>{plain}</section>,
  })
  const user = view?.user ?? null
  if (view === undefined || !signedIn || user === null) {
    const key: MindeckAccountKey = view === undefined ? failed ? 'streamFailed' : 'loading' : 'signedOutSection'
    return page(<p className={failed ? css.error : css.secondary} role="status">{t(key)}</p>)
  }
  const quota = view.quota
  const department = quota?.department?.limit == null ? null : quota.department
  const cloudUrl = view.cloudUrl
  const text = (value: string) => <span className={css.value}>{value}</span>
  const dialog = confirming && <SignOutDialog signOut={signOut} close={() => { setConfirming(false) }} t={t} />
  return page(<>
    {renderFactorySlot('settings.account.identity', {
      avatar: <span className={css.initial} aria-hidden="true">{initial(user.name)}</span>,
      name: user.name, status: user.email,
      link: cloudUrl === null ? undefined : { label: t(user.role === 'admin' ? 'openConsole' : 'openCloud'), href: cloudUrl },
    })}
    {renderFactorySlot('settings.account.rows', { rows: [
      { key: 'company', label: t('company'), value: text(view.companyName ?? '') },
      { key: 'department', label: t('department'), value: text(user.department?.name ?? t('noDepartment')) },
      { key: 'role', label: t('role'), value: text(t(user.role === 'admin' ? 'admin' : 'member')) },
      ...quota === null ? [] : [{
        key: 'usage', label: t('usage'),
        value: <UsageValue usage={quota.user} resetDate={quota.resetDate} renderFactorySlot={renderFactorySlot} t={t} />,
      }],
      ...quota === null || department === null ? [] : [{
        key: 'department-usage', label: t('departmentUsage'),
        value: <UsageValue usage={department} resetDate={quota.resetDate} renderFactorySlot={renderFactorySlot} t={t} />,
      }],
      ...cloudUrl === null ? [] : [{
        key: 'cloud', label: t('cloudAddress'),
        value: <span className={css.value}><span className={css.address}>{cloudUrl}</span><span className={css.note}>{t('cloudLocked')}</span></span>,
      }],
      {
        key: 'more', label: t('more'), muted: true,
        value: renderFactorySlot('settings.account.links', { links: [
          ...cloudUrl === null ? [] : [{ key: 'help', label: t('help'), href: `${cloudUrl}/help` }],
          { key: 'sign-out', label: t('signOut'), onClick: () => { setConfirming(true) } },
        ] }),
      },
    ] })}
    {view.personalDeepSeek && <PersonalDeepSeekCard t={t} renderFactorySlot={renderFactorySlot} usePersonal={usePersonal}
      startPersonalSignIn={startPersonalSignIn} cancelPersonalSignIn={cancelPersonalSignIn} signOutPersonal={signOutPersonal} />}
    {dialog}
  </>, <>
    <p className={css.secondary}>{user.name} · {user.email}</p>
    <Button variant="outline" onClick={() => { setConfirming(true) }}>{t('signOut')}</Button>
    {dialog}
  </>)
}
