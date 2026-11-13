/** Half-body portraits bundled with the digital employees, by avatar key. */
import generalPortrait from './assets/employees/general.webp'
import adminPortrait from './assets/employees/admin.webp'
import hrPortrait from './assets/employees/hr.webp'
import legalPortrait from './assets/employees/legal.webp'
import financePortrait from './assets/employees/finance.webp'
import itPortrait from './assets/employees/it.webp'
import salesPortrait from './assets/employees/sales.webp'
import marketingPortrait from './assets/employees/marketing.webp'
import analystPortrait from './assets/employees/analyst.webp'
import productPortrait from './assets/employees/product.webp'
import engineerPortrait from './assets/employees/engineer.webp'
import supportPortrait from './assets/employees/support.webp'
import neutral1Portrait from './assets/employees/neutral-1.webp'
import neutral2Portrait from './assets/employees/neutral-2.webp'
import neutral3Portrait from './assets/employees/neutral-3.webp'
import neutral4Portrait from './assets/employees/neutral-4.webp'

/** URL of each bundled portrait; any other key draws the name's first character. */
const PORTRAITS: ReadonlyMap<string, string> = new Map([
  ['general', generalPortrait],
  ['admin', adminPortrait],
  ['hr', hrPortrait],
  ['legal', legalPortrait],
  ['finance', financePortrait],
  ['it', itPortrait],
  ['sales', salesPortrait],
  ['marketing', marketingPortrait],
  ['analyst', analystPortrait],
  ['product', productPortrait],
  ['engineer', engineerPortrait],
  ['support', supportPortrait],
  ['neutral-1', neutral1Portrait],
  ['neutral-2', neutral2Portrait],
  ['neutral-3', neutral3Portrait],
  ['neutral-4', neutral4Portrait],
])

/**
 * Look up the bundled half-body portrait of an avatar key.
 * @param key - the avatar key Mindeck Cloud sends.
 * @returns the image URL, or undefined for a key without an image.
 */
export function portraitImage(key: string): string | undefined {
  return PORTRAITS.get(key)
}
