/** How the company messages page compares versions, words times, finds web links, and names notification kinds. */
import type { MindeckInboxItem } from '../types.ts'
import type { MindeckInboxKey } from './locales.ts'

/** Translate of the page's namespace. */
type Translate = (key: MindeckInboxKey, params?: Record<string, string>) => string

// The versions Mindeck Cloud orders: an optional leading `v`, a prerelease of non-empty identifiers, and build metadata.
const VERSION = /^[Vv]?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]*)?$/

/**
 * Compare two prerelease identifier lists as Semantic Versioning orders them.
 * @returns a negative number, zero, or a positive number as `left` sorts before, with, or after `right`.
 */
function comparePrerelease(left: readonly string[], right: readonly string[]): number {
  // A release sorts after its prereleases.
  if (left.length === 0 || right.length === 0) return right.length - left.length
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const a = left[index]
    const b = right[index]
    if (a === undefined || b === undefined) return a === undefined ? -1 : 1
    if (a === b) continue
    const numeric = /^\d+$/
    if (numeric.test(a) && numeric.test(b)) return Number(a) - Number(b)
    // Numeric identifiers sort before alphanumeric ones.
    if (numeric.test(a) !== numeric.test(b)) return numeric.test(a) ? -1 : 1
    return a < b ? -1 : 1
  }
  return 0
}

/**
 * Tell whether the running desktop is older than the version the company recommends, by Semantic Versioning order.
 * @param current - version of this build, such as `0.2.2-rc.1`; empty in builds without release metadata.
 * @param recommended - the recommended version, such as `1.8.0`.
 * @returns whether `current` sorts before `recommended`; false when either is missing or not a semantic version, as
 *   Mindeck Cloud counts a desktop behind.
 */
export function isOlderVersion(current: string, recommended: string): boolean {
  const a = VERSION.exec(current.trim())
  const b = VERSION.exec(recommended.trim())
  if (a === null || b === null) return false
  for (const index of [1, 2, 3]) {
    const difference = Number(a[index]) - Number(b[index])
    if (difference !== 0) return difference < 0
  }
  return comparePrerelease(a[4]?.split('.') ?? [], b[4]?.split('.') ?? []) < 0
}

/**
 * Word when an item reached the inbox, relative to today in this computer's time zone.
 * @param iso - ISO 8601 time.
 * @param now - the current time.
 * @param t - page copy; its `timeLocale` formats hours and month names.
 * @returns `Today 08:20`, `Yesterday 08:20`, a date this year, or a date with its year; the original text when it is not a time.
 */
export function formatItemTime(iso: string, now: Date, t: Translate): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return iso
  const locale = t('timeLocale')
  const day = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  const days = Math.round((day(now) - day(at)) / 86_400_000)
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false }).format(at)
  if (days === 0) return t('today', { time })
  if (days === 1) return t('yesterday', { time })
  const params = {
    year: String(at.getFullYear()), month: String(at.getMonth() + 1), day: String(at.getDate()),
    monthName: new Intl.DateTimeFormat(locale, { month: 'short' }).format(at),
  }
  return t(at.getFullYear() === now.getFullYear() ? 'thisYear' : 'otherYear', params)
}

/** A run of an item body: plain text, or a web address to open in the system browser. */
export type BodyPart = { readonly text: string; readonly href?: string }

const WEB_ADDRESS = /https?:\/\/[^\s<>"'，。；：！？、）】》」』]+/g

/**
 * Split an item body into text and the web addresses in it. Punctuation that ends a sentence after an address stays text.
 * @param body - plain text, possibly with line breaks.
 * @returns the runs in order.
 */
export function bodyParts(body: string): BodyPart[] {
  const parts: BodyPart[] = []
  let last = 0
  for (const match of body.matchAll(WEB_ADDRESS)) {
    const href = match[0].replace(/[.,;:!?)\]]+$/, '')
    const start = match.index
    if (start > last) parts.push({ text: body.slice(last, start) })
    parts.push({ text: href, href })
    last = start + href.length
  }
  if (last < body.length) parts.push({ text: body.slice(last) })
  return parts
}

/** What a notification is about, by the kind's family. */
export type ItemFamily = 'announcement' | 'quota' | 'feedback' | 'handover' | 'other'

/**
 * Classify an item by the kind's family.
 *
 * @param item - an inbox item.
 * @returns the family that chooses its icon and label; an unknown kind is `other`.
 */
export function itemFamily(item: Pick<MindeckInboxItem, 'type' | 'kind'>): ItemFamily {
  if (item.type === 'announcement') return 'announcement'
  if (item.kind.startsWith('quota-request.')) return 'quota'
  if (item.kind.startsWith('feedback.')) return 'feedback'
  if (item.kind.startsWith('offboarding.')) return 'handover'
  return 'other'
}

/** Label of each family beside an item's time. */
export const FAMILY_LABELS: Readonly<Record<ItemFamily, MindeckInboxKey>> = {
  announcement: 'kindAnnouncement',
  quota: 'kindQuota',
  feedback: 'kindFeedback',
  handover: 'kindHandover',
  other: 'kindOther',
}
