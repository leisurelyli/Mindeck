/** Sidebar account launcher: the signed-in member, this month's quota, Settings, Mindeck Cloud, and sign-out. */
import { useRef, useState } from 'react'
import {
  Menu, IconEllipsisOutlineMedium, IconGlobeOutlineMedium, IconSettingsOutlineMedium, type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { MindeckQuota } from '../types.ts'
import type { MindeckAccountKey } from './locales.ts'
import { initial, type MindeckAccountInjected } from './operations.ts'
import { formatCny } from './quota.ts'
import { SignOutDialog } from './SignOutDialog.tsx'
import { SignOutIcon } from './SignOutIcon.tsx'
import css from './Account.module.css'

/** Composed launcher props. */
export type AccountMenuProps =
  PropsRuntime<'settings.launcher'> & PropsLocale<'mindeckAccount'> & InjectFace<MindeckAccountInjected>

/**
 * Heading rows with the member's and the department's month-to-date cost.
 * @param quota - latest quota, or null before the first read.
 * @param t - account copy.
 * @returns label rows followed by a separator, or no rows without a quota.
 */
function quotaRows(quota: MindeckQuota | null, t: (key: MindeckAccountKey, params?: Record<string, string>) => string): MenuEntry[] {
  if (quota === null) return []
  const { user, department } = quota
  const rows: MenuEntry[] = [{
    type: 'label', id: 'quota-user',
    text: user.limit === null
      ? t('quotaMenuUnlimited', { used: formatCny(user.used) })
      : t('quotaMenuUser', { used: formatCny(user.used), limit: formatCny(user.limit) }),
  }]
  if (department?.limit != null) {
    rows.push({ type: 'label', id: 'quota-department', text: t('quotaMenuDepartment', { used: formatCny(department.used), limit: formatCny(department.limit) }) })
  }
  return [...rows, { type: 'separator', id: 'quota-separator' }]
}

/**
 * Opening the menu asks the Host for a fresh quota, so the rows catch up while the menu is open.
 * @param props - sidebar geometry, settings navigation, localized copy, and account operations.
 * @returns the launcher button and its menu.
 */
export function AccountMenu({ wide, settingsShortcut, openSettings, useAccount, signOut, refreshQuota, t }: AccountMenuProps) {
  const view = useAccount(snapshot => snapshot.view)
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const user = view?.status === 'signed-in' ? view.user : null
  const cloudUrl = view?.cloudUrl ?? null
  return <div className={css.launcher}>
    <Menu open={open} side="top" portal autoFocus className={css.launcherAnchor}
      anchor={<button ref={trigger} type="button" className={css.trigger} data-collapsed={!wide} aria-label={t('menu')}
        aria-haspopup="menu" aria-expanded={open} onClick={() => {
          if (!open && user !== null) refreshQuota()
          setOpen(value => !value)
        }}>
        {user === null
          ? <IconEllipsisOutlineMedium size={14} />
          : <span className={css.smallAvatar} aria-hidden="true">{initial(user.name)}</span>}
        {wide && <span className={css.triggerLabel}>{user?.name ?? t('settings')}</span>}
      </button>}
      items={[
        ...(user !== null && view?.status === 'signed-in' ? quotaRows(view.quota, t) : []),
        { id: 'settings', label: t('settings'), icon: <IconSettingsOutlineMedium size={16} />,
          ...(settingsShortcut === undefined ? {} : { shortcut: settingsShortcut }) },
        ...(user !== null && cloudUrl !== null ? [{ id: 'console', label: t('openConsole'), icon: <IconGlobeOutlineMedium size={16} /> }] : []),
        ...(user !== null ? [{ id: 'signout', label: t('signOut'), icon: <SignOutIcon /> }] : []),
      ]}
      onClose={() => { setOpen(false) }}
      onSelect={(id) => {
        setOpen(false)
        if (id === 'settings') { trigger.current?.focus(); openSettings() }
        else if (id === 'console' && cloudUrl !== null) window.open(cloudUrl, '_blank', 'noopener,noreferrer')
        else if (id === 'signout') setConfirming(true)
      }} />
    {confirming && <SignOutDialog signOut={signOut} close={() => { setConfirming(false) }} t={t} />}
  </div>
}
