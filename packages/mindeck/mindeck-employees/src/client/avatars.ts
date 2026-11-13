/**
 * Card banners bundled with the digital employees, by Mindeck Cloud avatar key: transparent 16:9 head-to-chest
 * crops that Mindeck Cloud's `pnpm employees:avatars --deck` writes from its source drawings, each drawn on a soft
 * backdrop picked against the character's clothing.
 */
import generalBanner from './assets/employees/general.webp'
import adminBanner from './assets/employees/admin.webp'
import hrBanner from './assets/employees/hr.webp'
import legalBanner from './assets/employees/legal.webp'
import financeBanner from './assets/employees/finance.webp'
import itBanner from './assets/employees/it.webp'
import salesBanner from './assets/employees/sales.webp'
import marketingBanner from './assets/employees/marketing.webp'
import analystBanner from './assets/employees/analyst.webp'
import productBanner from './assets/employees/product.webp'
import engineerBanner from './assets/employees/engineer.webp'
import supportBanner from './assets/employees/support.webp'
import neutral1Banner from './assets/employees/neutral-1.webp'
import neutral2Banner from './assets/employees/neutral-2.webp'
import neutral3Banner from './assets/employees/neutral-3.webp'
import neutral4Banner from './assets/employees/neutral-4.webp'
import neutral5Banner from './assets/employees/neutral-5.webp'
import neutral6Banner from './assets/employees/neutral-6.webp'
import neutral7Banner from './assets/employees/neutral-7.webp'
import neutral8Banner from './assets/employees/neutral-8.webp'
import neutral9Banner from './assets/employees/neutral-9.webp'
import neutral10Banner from './assets/employees/neutral-10.webp'
import neutral11Banner from './assets/employees/neutral-11.webp'
import neutral12Banner from './assets/employees/neutral-12.webp'

/** Backdrop family of a banner; `EmployeesPage.module.css` holds its light and dark colors. */
export type PortraitBackdrop = 'butter' | 'blue' | 'sage' | 'lavender' | 'aqua' | 'rose' | 'peach' | 'slate'

/** One bundled banner. */
export interface Portrait {
  /** Image URL. */
  readonly image: string
  /** Backdrop the transparent image is drawn on. */
  readonly backdrop: PortraitBackdrop
}

/** Banner of each avatar key Mindeck Cloud offers; any other key draws the name's first character. */
const PORTRAITS: ReadonlyMap<string, Portrait> = new Map<string, Portrait>([
  ['general', { image: generalBanner, backdrop: 'butter' }],
  ['admin', { image: adminBanner, backdrop: 'blue' }],
  ['hr', { image: hrBanner, backdrop: 'sage' }],
  ['legal', { image: legalBanner, backdrop: 'lavender' }],
  ['finance', { image: financeBanner, backdrop: 'butter' }],
  ['it', { image: itBanner, backdrop: 'aqua' }],
  ['sales', { image: salesBanner, backdrop: 'rose' }],
  ['marketing', { image: marketingBanner, backdrop: 'peach' }],
  ['analyst', { image: analystBanner, backdrop: 'slate' }],
  ['product', { image: productBanner, backdrop: 'rose' }],
  ['engineer', { image: engineerBanner, backdrop: 'peach' }],
  ['support', { image: supportBanner, backdrop: 'blue' }],
  ['neutral-1', { image: neutral1Banner, backdrop: 'lavender' }],
  ['neutral-2', { image: neutral2Banner, backdrop: 'butter' }],
  ['neutral-3', { image: neutral3Banner, backdrop: 'slate' }],
  ['neutral-4', { image: neutral4Banner, backdrop: 'sage' }],
  ['neutral-5', { image: neutral5Banner, backdrop: 'rose' }],
  ['neutral-6', { image: neutral6Banner, backdrop: 'peach' }],
  ['neutral-7', { image: neutral7Banner, backdrop: 'butter' }],
  ['neutral-8', { image: neutral8Banner, backdrop: 'aqua' }],
  ['neutral-9', { image: neutral9Banner, backdrop: 'blue' }],
  ['neutral-10', { image: neutral10Banner, backdrop: 'sage' }],
  ['neutral-11', { image: neutral11Banner, backdrop: 'lavender' }],
  ['neutral-12', { image: neutral12Banner, backdrop: 'peach' }],
])

/**
 * Look up the bundled banner of an avatar key.
 * @param key - the avatar key Mindeck Cloud sends.
 * @returns the banner and its backdrop, or undefined for a key this build has no image for.
 */
export function portrait(key: string): Portrait | undefined {
  return PORTRAITS.get(key)
}
