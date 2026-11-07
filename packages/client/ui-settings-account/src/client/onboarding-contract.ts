/** Pure view inputs for the desktop onboarding flow. */
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

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Optional brand artwork; the step supplies upstream artwork when unoccupied. */
    'desktop.onboarding.illustration': {
      kind: 'single'
      scope: 'root'
      owner: DesktopOnboardingIllustrationOwnerProps
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
