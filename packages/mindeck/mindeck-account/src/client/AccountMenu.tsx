/** Sidebar account launcher: the signed-in member, Settings, Mindeck Cloud, and sign-out. */
import { useRef, useState } from 'react'
import { Menu, IconEllipsisOutlineMedium, IconGlobeOutlineMedium, IconSettingsOutlineMedium } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { initial, type MindeckAccountInjected } from './operations.ts'
import { SignOutDialog } from './SignOutDialog.tsx'
import { SignOutIcon } from './SignOutIcon.tsx'
import css from './Account.module.css'

/** Composed launcher props. */
export type AccountMenuProps =
  PropsRuntime<'settings.launcher'> & PropsLocale<'mindeckAccount'> & InjectFace<MindeckAccountInjected>

/**
 * @param props - sidebar geometry, settings navigation, localized copy, and account operations.
 * @returns the launcher button and its menu.
 */
export function AccountMenu({ wide, settingsShortcut, openSettings, useAccount, signOut, t }: AccountMenuProps) {
  const view = useAccount(snapshot => snapshot.view)
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const user = view?.status === 'signed-in' ? view.user : null
  const cloudUrl = view?.cloudUrl ?? null
  return <div className={css.launcher}>
    <Menu open={open} side="top" portal autoFocus className={css.launcherAnchor}
      anchor={<button ref={trigger} type="button" className={css.trigger} data-collapsed={!wide} aria-label={t('menu')}
        aria-haspopup="menu" aria-expanded={open} onClick={() => { setOpen(value => !value) }}>
        {user === null
          ? <IconEllipsisOutlineMedium size={14} />
          : <span className={css.smallAvatar} aria-hidden="true">{initial(user.name)}</span>}
        {wide && <span className={css.triggerLabel}>{user?.name ?? t('settings')}</span>}
      </button>}
      items={[
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
