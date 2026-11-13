/** Workspace screenshot variants owned by the Mindeck brand plugin. */
import type {} from '@deepseek-ai/dsh-client-ui-settings-account/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import art from './assets/mindeck-onboarding-welcome.webp'
import artDark from './assets/mindeck-onboarding-welcome-dark.webp'
import artZh from './assets/mindeck-onboarding-welcome-zh.webp'
import artZhDark from './assets/mindeck-onboarding-welcome-zh-dark.webp'
import css from './OnboardingIllustration.module.css'

/**
 * Render the same workspace preview on the welcome and credit pages and on a first-run page hero.
 * @param props - Step-owned language and illustration geometry.
 * @returns Decorative light and dark screenshots selected by the active theme.
 */
export function MindeckOnboardingIllustration({ locale, className = '' }: PropsRuntime<'desktop.onboarding.illustration'>) {
  return <div className={`${css.illustration} ${className}`} aria-hidden="true">
    <img className={css.light} src={locale === 'zh' ? artZh : art} alt="" />
    <img className={css.dark} src={locale === 'zh' ? artZhDark : artDark} alt="" />
  </div>
}
