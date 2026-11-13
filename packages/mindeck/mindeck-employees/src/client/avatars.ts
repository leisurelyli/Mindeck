/** Head-crop avatar images bundled with the cards, by avatar key. */
import generalFace from './assets/employees/general-face.webp'
import adminFace from './assets/employees/admin-face.webp'
import hrFace from './assets/employees/hr-face.webp'
import legalFace from './assets/employees/legal-face.webp'
import financeFace from './assets/employees/finance-face.webp'
import itFace from './assets/employees/it-face.webp'
import salesFace from './assets/employees/sales-face.webp'
import marketingFace from './assets/employees/marketing-face.webp'
import analystFace from './assets/employees/analyst-face.webp'
import productFace from './assets/employees/product-face.webp'
import engineerFace from './assets/employees/engineer-face.webp'
import supportFace from './assets/employees/support-face.webp'
import neutral1Face from './assets/employees/neutral-1-face.webp'
import neutral2Face from './assets/employees/neutral-2-face.webp'
import neutral3Face from './assets/employees/neutral-3-face.webp'
import neutral4Face from './assets/employees/neutral-4-face.webp'

/** URL of each bundled avatar; the cards draw the name's first character for any other key. */
const AVATARS: ReadonlyMap<string, string> = new Map([
  ['general', generalFace],
  ['admin', adminFace],
  ['hr', hrFace],
  ['legal', legalFace],
  ['finance', financeFace],
  ['it', itFace],
  ['sales', salesFace],
  ['marketing', marketingFace],
  ['analyst', analystFace],
  ['product', productFace],
  ['engineer', engineerFace],
  ['support', supportFace],
  ['neutral-1', neutral1Face],
  ['neutral-2', neutral2Face],
  ['neutral-3', neutral3Face],
  ['neutral-4', neutral4Face],
])

/**
 * Look up the bundled image of an avatar key.
 * @param key - the avatar key Mindeck Cloud sends, such as `legal` or `neutral-2`.
 * @returns the bundled image URL, or undefined for a key without an image.
 */
export function avatarImage(key: string): string | undefined {
  return AVATARS.get(key)
}
