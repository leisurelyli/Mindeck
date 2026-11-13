/** Welcome page with a required explicit start, and the hero layout it shares with other first-run pages. */
import type { ReactNode, RefObject } from 'react'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DesktopOnboardingProps } from './onboarding-contract.ts'
import { OnboardingIllustration } from './OnboardingIllustration.tsx'
import art from './assets/onboarding-welcome.webp'
import artDark from './assets/onboarding-welcome-dark.webp'
import artZh from './assets/onboarding-welcome-zh.webp'
import artZhDark from './assets/onboarding-welcome-zh-dark.webp'
import css from './DesktopOnboarding.module.css'

/**
 * @param props.locale - artwork language.
 * @returns the upstream welcome artwork, sized for the hero layout.
 */
export function OnboardingWelcomeArtwork({ locale }: { locale: string }) {
  return <OnboardingIllustration className={css.welcomeArtwork} src={locale === 'zh' ? artZh : art} darkSrc={locale === 'zh' ? artZhDark : artDark} />
}

/**
 * Copy at the left and artwork at the right, as on the welcome page.
 * @param props.title - heading text.
 * @param props.brand - word after the heading in the brand typeface; omitted renders the heading alone.
 * @param props.description - paragraph under the heading.
 * @param props.heading - focus target of the page heading.
 * @param props.actions - controls under the paragraph.
 * @param props.illustration - artwork in the right column.
 * @returns the hero content.
 */
export function OnboardingHero({ title, brand, description, heading, actions, illustration }: {
  title: string
  brand?: string | undefined
  description: string
  heading: RefObject<HTMLHeadingElement>
  actions: ReactNode
  illustration: ReactNode
}) {
  return <div className={`${css.content} ${css.welcome}`}>
    <div className={css.copy}>
      <h1 id="desktop-onboarding-title" ref={heading} tabIndex={-1}>{title}{brand !== undefined && <> <em className={css.brand}>{brand}</em></>}</h1>
      <p className={css.heroDescription}>{description}</p>
      {actions}
    </div>
    <div className={css.welcomeIllustration} aria-hidden="true">{illustration}</div>
  </div>
}

/** @param props - localized content, focus target and navigation. @returns the welcome step. */
export function OnboardingWelcomeStep({ t, locale, renderSlot, heading, busy, onStart }: Pick<DesktopOnboardingProps, 't' | 'locale'>
  & PropsRenderSlots<'desktop.onboarding.illustration'> & {
    heading: RefObject<HTMLHeadingElement>
    busy: boolean
    onStart: () => void
  }) {
  return <OnboardingHero title={t('onboardingWelcome')} brand={t('onboardingBrand')} description={t('onboardingIntroduction')} heading={heading}
    actions={<Button variant="primary" className={`${css.action} ${css.start}`} disabled={busy} onClick={onStart}>{t('onboardingStart')}</Button>}
    illustration={renderSlot('desktop.onboarding.illustration', { step: 'welcome', locale, className: css.welcomeArtwork }, {
      fallback: <OnboardingWelcomeArtwork locale={locale} />,
    })} />
}
