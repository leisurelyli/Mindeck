/**
 * Presentational parts of the account settings page. The DeepSeek account page renders through them, and the
 * `settings.account.*` Component Factories publish them for other account pages, which pass already-localized text.
 */
import { Fragment, type MouseEvent, type ReactNode } from 'react'
import { IconRightUpOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './AccountSection.module.css'

/** Input of {@link AccountPage}. */
export interface AccountPageInput {
  /** Accessible name of the page region. */
  label: string
  /** Cards in display order. */
  children: ReactNode
}

/** Input of {@link AccountIdentity}. */
export interface AccountIdentityInput {
  /** Picture or glyph inside the 32px round avatar. */
  avatar: ReactNode
  /** Load state of a picture avatar, exposed as `data-avatar-status`; omitted for glyphs. */
  avatarStatus?: string | undefined
  /** Account holder's display name. */
  name: string
  /** One status line under the name, announced politely when it changes. */
  status: string
  /** External page at the right edge, opened in a new tab. */
  link?: { readonly label: string; readonly href: string } | undefined
  /** Controls at the right edge, such as {@link AccountLinks}. */
  actions?: ReactNode
}

/** One row of {@link AccountRows}. */
export interface AccountRowInput {
  /** Stable identity among the card's rows. */
  key: string
  /** Row label at the left edge. */
  label: string
  /** Label in tertiary ink, as for a trailing actions row. */
  muted?: boolean | undefined
  /** Value or controls at the right edge. */
  value: ReactNode
}

/** Input of {@link AccountRows}. */
export interface AccountRowsInput {
  /** Rows in display order; a divider separates adjacent rows. */
  rows: readonly AccountRowInput[]
}

/** One outlined button of {@link AccountLinks}: an anchor when it has `href`, otherwise a button. */
export interface AccountLinkInput {
  /** Stable identity among the group's links. */
  key: string
  label: string
  /** Filled primary treatment. */
  primary?: boolean | undefined
  /** Destination opened in a new tab; absent renders a button. */
  href?: string | undefined
  /** Exposed as `aria-disabled` on an anchor and as `disabled` on a button. */
  disabled?: boolean | undefined
  /** @param event - the click; an anchor handler may prevent the navigation. */
  onClick?: ((event: MouseEvent<HTMLElement>) => void) | undefined
}

/** Input of {@link AccountLinks}. */
export interface AccountLinksInput {
  links: readonly AccountLinkInput[]
}

/** Input of {@link AccountAmount}. */
export interface AccountAmountInput {
  /** Amounts joined with ` + `, such as one balance per currency. */
  values: readonly { readonly key: string; readonly text: string }[]
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotFactoryMap {
    /** Account page column with the settings page gap and type scale. */
    'settings.account.page': { scope: 'root'; props: AccountPageInput }
    /** Identity card: round avatar, name, status line, and a right-edge link or controls. */
    'settings.account.identity': { scope: 'root'; props: AccountIdentityInput }
    /** Card of label-value rows separated by dividers. */
    'settings.account.rows': { scope: 'root'; props: AccountRowsInput }
    /** Right-aligned group of outlined link buttons. */
    'settings.account.links': { scope: 'root'; props: AccountLinksInput }
    /** Amounts in the balance type scale. */
    'settings.account.amount': { scope: 'root'; props: AccountAmountInput }
  }
}

/** @param props - region name and cards. @returns the page column with the settings page gap and type scale. */
export function AccountPage({ label, children }: AccountPageInput) {
  return <section className={css.section} aria-label={label}>{children}</section>
}

/** @param props - avatar, name, status line, and right-edge link or controls. @returns the identity card. */
export function AccountIdentity({ avatar, avatarStatus, name, status, link, actions }: AccountIdentityInput) {
  return <div className={css.card}>
    <div className={css.identity}>
      <span className={css.avatar} data-avatar-status={avatarStatus}>{avatar}</span>
      <div className={css.identityCopy}>
        <span className={css.name}>{name}</span>
        <span className={css.status} role="status">{status}</span>
      </div>
    </div>
    {link !== undefined && <a className={css.accountInfo} href={link.href} target="_blank" rel="noopener noreferrer">
      {link.label}<IconRightUpOutlineRegular size={12} />
    </a>}
    {actions}
  </div>
}

/** @param props - labelled rows. @returns the card of label-value rows with dividers between them. */
export function AccountRows({ rows }: AccountRowsInput) {
  return <div className={css.balanceCard}>
    {rows.map((row, index) => <Fragment key={row.key}>
      {index > 0 && <div className={css.divider} />}
      <div className={css.row}>
        <span className={row.muted === true ? css.secondary : undefined}>{row.label}</span>
        {row.value}
      </div>
    </Fragment>)}
  </div>
}

/** @param props - links and buttons in display order. @returns the right-aligned group of outlined buttons. */
export function AccountLinks({ links }: AccountLinksInput) {
  return <div className={css.links}>
    {links.map((link) => {
      const className = link.primary === true ? `${css.linkButton} ${css.primary}` : css.linkButton
      return link.href === undefined
        ? <button key={link.key} type="button" className={className} disabled={link.disabled} onClick={link.onClick}>{link.label}</button>
        : <a key={link.key} className={className} href={link.href} aria-disabled={link.disabled}
          target="_blank" rel="noreferrer" onClick={link.onClick}>{link.label}</a>
    })}
  </div>
}

/** @param props - formatted amounts. @returns the amounts in the balance type scale. */
export function AccountAmount({ values }: AccountAmountInput) {
  return <span className={css.amount}>{values.map(value => <span key={value.key}>{value.text}</span>)}</span>
}
