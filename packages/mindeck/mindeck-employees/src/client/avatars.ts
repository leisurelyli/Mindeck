/** Avatar images bundled with the digital employees, by avatar key: a head crop for small avatars and a half-body portrait for the page. */
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

/** Images of one avatar key. */
interface AvatarImages {
  /** 192px head crop. */
  readonly face: string
  /** 512px half-body portrait. */
  readonly portrait: string
}

/** URLs of each bundled avatar; any other key draws the name's first character. */
const AVATARS: ReadonlyMap<string, AvatarImages> = new Map([
  ['general', { face: generalFace, portrait: generalPortrait }],
  ['admin', { face: adminFace, portrait: adminPortrait }],
  ['hr', { face: hrFace, portrait: hrPortrait }],
  ['legal', { face: legalFace, portrait: legalPortrait }],
  ['finance', { face: financeFace, portrait: financePortrait }],
  ['it', { face: itFace, portrait: itPortrait }],
  ['sales', { face: salesFace, portrait: salesPortrait }],
  ['marketing', { face: marketingFace, portrait: marketingPortrait }],
  ['analyst', { face: analystFace, portrait: analystPortrait }],
  ['product', { face: productFace, portrait: productPortrait }],
  ['engineer', { face: engineerFace, portrait: engineerPortrait }],
  ['support', { face: supportFace, portrait: supportPortrait }],
  ['neutral-1', { face: neutral1Face, portrait: neutral1Portrait }],
  ['neutral-2', { face: neutral2Face, portrait: neutral2Portrait }],
  ['neutral-3', { face: neutral3Face, portrait: neutral3Portrait }],
  ['neutral-4', { face: neutral4Face, portrait: neutral4Portrait }],
])

/**
 * Look up the bundled head crop of an avatar key.
 * @param key - the avatar key Mindeck Cloud sends, such as `legal` or `neutral-2`.
 * @returns the image URL, or undefined for a key without an image.
 */
export function avatarImage(key: string): string | undefined {
  return AVATARS.get(key)?.face
}

/**
 * Look up the bundled half-body portrait of an avatar key.
 * @param key - the avatar key Mindeck Cloud sends.
 * @returns the image URL, or undefined for a key without an image.
 */
export function portraitImage(key: string): string | undefined {
  return AVATARS.get(key)?.portrait
}
