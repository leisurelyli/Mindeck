/** Pure view inputs for the desktop onboarding flow and the account-neutral first-run page. */
import type { ReactNode } from 'react'
import type { TrackProductEvent } from '@deepseek-ai/dsh-client-product-analytics/client'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { OnboardingProgress } from '../onboarding-settings.ts'
import type { AccountSnapshot } from './AccountSection.tsx'
import type { PlatformPages } from './platform-pages.ts'
import type { AccountKey } from './locales.ts'

/** Decorative illustration inputs owned by the desktop onboarding step. */
export interface DesktopOnboardingIllustrationOwnerProps {
  /** Page whose illustration is being rendered. */
  step: 'welcome' | 'credit'
  /** Resolved artwork language from the account dictionary. */
  locale: string
  /** Step-owned positioning and dimensions, applied to the illustration container. */
  className?: string | undefined
}

/** One button of a first-run page. */
export interface OnboardingPageAction {
  /** Stable identity among the page's actions. */
  key: string
  label: string
  /** `primary` for the page's main step; the hero layout gives it the wide start treatment. */
  variant: 'primary' | 'outline'
  disabled?: boolean | undefined
  /** Submit the page form, so Enter in a body field runs it; requires `onSubmit`. */
  submit?: boolean | undefined
  onClick?: (() => void) | undefined
}

/** Input of the `desktop.onboarding.page` Factory; every string arrives localized. */
export interface OnboardingPageInput {
  /** Identity of the shown page; a change replays the page transition and focuses the new heading. */
  page: string
  /**
   * `hero`: copy at the left and artwork at the right, as on the welcome page. `centered`: one centered column with
   * `body` between the copy and the actions. `status`: only `title`, as a centered status line, for loading and
   * waiting stages; an empty title leaves the stage blank.
   */
  layout: 'hero' | 'centered' | 'status'
  /** Language of the copy; selects artwork and the brand typeface for English. */
  locale: string
  title: string
  /** Word after the title in the brand typeface, as in "Welcome to DeepSeek". */
  brand?: string | undefined
  description?: string | undefined
  /** Page-owned content between the copy and the actions, such as a form field or a code. */
  body?: ReactNode
  actions?: readonly OnboardingPageAction[] | undefined
  /** Run on form submission; the page renders its content as a form when present. */
  onSubmit?: (() => void) | undefined
  /** Footer control at the bottom-left that returns to the previous page. */
  back?: { readonly label: string; readonly disabled?: boolean | undefined; readonly onClick: () => void } | undefined
  /** Whether the page waits for an operation; exposed as `aria-busy`. */
  busy?: boolean | undefined
  /** Fade the stage out over 180ms to reveal the workspace; the caller unmounts it afterwards. */
  exiting?: boolean | undefined
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Optional brand artwork; the step supplies upstream artwork when unoccupied. */
    'desktop.onboarding.illustration': {
      kind: 'single'
      scope: 'root'
      owner: DesktopOnboardingIllustrationOwnerProps
    }
    /** Optional brand artwork of a `desktop.onboarding.page` hero; upstream artwork renders when unoccupied. */
    'desktop.onboarding.page.illustration': {
      kind: 'single'
      scope: 'root'
      owner: DesktopOnboardingIllustrationOwnerProps
    }
  }

  interface SlotFactoryMap {
    /**
     * Full-screen first-run page in the desktop onboarding stage: its backdrop, typography, page transition, buttons,
     * and footer, with caller content. It covers the workspace while mounted, on Desktop and in a browser.
     */
    'desktop.onboarding.page': {
      scope: 'root'
      props: OnboardingPageInput
      children: { 'desktop.onboarding.page.illustration': { kind: 'single'; scope: 'root' } }
    }
  }
}

/** Render state with pending choices previewed over durable Host progress. */
export interface DesktopOnboardingState {
  status: 'loading' | 'ready' | 'saving' | 'error'
  visible: boolean
  progress: OnboardingProgress
  /** Whether positive balance was already available at first credit-page entry; pending uses ordinary actions, never persisted. */
  creditFunded: boolean
  error: 'settings' | null
}

/** User-selected fields accepted before final preference application. */
export type OnboardingChange = Partial<Pick<OnboardingProgress, 'step' | 'purpose' | 'process'>>

/** Data and callbacks consumed by the presentational desktop flow. */
export interface DesktopOnboardingProps extends PropsRenderSlots<'desktop.onboarding.illustration'> {
  /** Keep the saved final step visible while revealing the workspace. */
  exiting?: boolean
  /** Desktop collection callback; absent when analytics is disabled. */
  track?: TrackProductEvent
  state: DesktopOnboardingState
  account: AccountSnapshot
  /** Desktop-only: show the shared native recharge page; absent in ordinary browsers. */
  openPlatformPage?: PlatformPages['open']
  update(this: void, change: OnboardingChange): Promise<boolean>
  complete(this: void, reason: 'completed' | 'skipped'): Promise<boolean>
  retry(this: void): Promise<boolean>
  /** Active interface language selects the matching illustration artwork. */
  locale: string
  t: (key: AccountKey) => string
}
