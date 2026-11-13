/** Account-neutral first-run page published as the `desktop.onboarding.page` Factory. */
import { useEffect, useLayoutEffect, useRef, type FormEvent, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { OnboardingPageAction, OnboardingPageInput } from './onboarding-contract.ts'
import { OnboardingHero, OnboardingWelcomeArtwork } from './OnboardingWelcomeStep.tsx'
import { OnboardingSurface } from './OnboardingSurface.tsx'
import backIcon from './assets/onboarding-back.svg'
import css from './DesktopOnboarding.module.css'

/** Props of {@link OnboardingPage}: the caller's input and the illustration child slot. */
export type OnboardingPageProps = OnboardingPageInput & PropsRenderSlots<'desktop.onboarding.page.illustration'>

/**
 * @param action - one page action.
 * @param className - layout treatment of the button.
 * @param busy - whether the page waits, which disables every action.
 * @returns the button.
 */
function actionButton(action: OnboardingPageAction, className: string | undefined, busy: boolean): ReactNode {
  return <Button key={action.key} variant={action.variant} className={className} type={action.submit === true ? 'submit' : 'button'}
    disabled={busy || action.disabled === true} onClick={action.onClick}>{action.label}</Button>
}

/**
 * The stage covers the workspace and asks Desktop for its onboarding window width while mounted. A new `page`
 * remounts the content with the page transition and moves focus to its heading, unless a body control took it.
 * @param props - localized page content, actions, and the illustration slot.
 * @returns the body-portaled stage with the page.
 */
export function OnboardingPage({
  page, layout, locale, title, brand, description, body, actions = [], onSubmit, back, busy = false, exiting = false, renderSlot,
}: OnboardingPageProps) {
  const heading = useRef<HTMLHeadingElement>(null)
  const section = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const bridge = (globalThis as typeof globalThis & { dshOnboarding?: { setActive(active: boolean): void } }).dshOnboarding
    bridge?.setActive(true)
    return () => { bridge?.setActive(false) }
  }, [])
  // A body control that took focus as the page mounted, such as an auto-focused field, keeps it.
  useEffect(() => {
    if (section.current?.contains(document.activeElement) !== true) heading.current?.focus()
  }, [page])
  const waiting = busy || exiting
  const submit = onSubmit === undefined ? undefined : (event: FormEvent) => {
    event.preventDefault()
    if (!waiting) onSubmit()
  }
  const content = layout === 'status'
    ? <div className={css.loading} role="status">{title}</div>
    : layout === 'hero'
      ? <OnboardingHero title={title} brand={brand} description={description ?? ''} heading={heading}
        actions={<>{body}{actions.map((action, index) => actionButton(action, index === 0 ? `${css.action} ${css.start}` : css.action, waiting))}</>}
        illustration={renderSlot('desktop.onboarding.page.illustration', { step: 'welcome', locale, className: css.welcomeArtwork }, {
          fallback: <OnboardingWelcomeArtwork locale={locale} />,
        })} />
      : <>
        <div className={css.copy}>
          <h1 id="desktop-onboarding-title" ref={heading} tabIndex={-1}>{title}{brand !== undefined && <> <em className={css.brand}>{brand}</em></>}</h1>
          {description !== undefined && <p className={css.subtitle}>{description}</p>}
        </div>
        {body !== undefined && <div className={css.formBody}>{body}</div>}
        {actions.length > 0 && <div className={css.formActions}>{actions.map(action => actionButton(action, css.action, waiting))}</div>}
      </>
  const framed = layout === 'centered'
    ? submit === undefined
      ? <div className={`${css.content} ${css.form}`}>{content}</div>
      : <form className={`${css.content} ${css.form}`} onSubmit={submit} noValidate>{content}</form>
    : submit === undefined || layout === 'status' ? content : <form onSubmit={submit} noValidate>{content}</form>
  return <OnboardingSurface exiting={exiting}>
    <section key={page} ref={section} className={css.page} data-desktop-onboarding-page={page} lang={locale}
      aria-labelledby={layout === 'status' ? undefined : 'desktop-onboarding-title'} aria-busy={waiting}>
      {framed}
      {back !== undefined && <footer className={css.navigation}>
        <button type="button" disabled={waiting || back.disabled === true} onClick={back.onClick}>
          <span className={css.backIcon} style={{ maskImage: `url(${backIcon})` }} aria-hidden="true" />{back.label}
        </button>
      </footer>}
    </section>
  </OnboardingSurface>
}
