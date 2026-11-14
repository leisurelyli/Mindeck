/** Which company limit is closest to being used up, what the member may do about it, and how the account UI words amounts and dates. */
import type { MindeckQuota, MindeckQuotaRequest } from '../types.ts'
import type { MindeckAccountKey } from './locales.ts'

/** One limited scope of the member's quota. */
export interface QuotaPosition {
  readonly scope: 'user' | 'department' | 'company'
  /** Amount used; for the company budget, the percentage used. */
  readonly used: number
  /** Limit; 100 for the company budget, whose amounts members do not see. */
  readonly limit: number
  /** `used / limit`; a zero limit counts as used up. */
  readonly ratio: number
}

/** Share of a limit from which the composer reminds the member, and from which the reminder is urgent. */
export const QUOTA_REMINDER_RATIOS = { warning: 0.75, urgent: 0.95 } as const

/**
 * Pick the limit that runs out first. A used-up company budget comes first, because raising the member's or the
 * department's limit would not help.
 * @param quota - the member's quota.
 * @returns the limited scope with the highest used share, or undefined when no scope has a limit.
 */
export function tightestQuota(quota: MindeckQuota): QuotaPosition | undefined {
  const positions = (['user', 'department', 'company'] as const).flatMap(scope => quotaPosition(quota, scope) ?? [])
  const company = positions.find(position => position.scope === 'company')
  if (company !== undefined && company.ratio >= 1) return company
  return positions.sort((a, b) => b.ratio - a.ratio)[0]
}

/**
 * Read one scope of the member's quota.
 * @param quota - the member's quota.
 * @param scope - the scope to read.
 * @returns its position, or undefined when the scope has no limit.
 */
export function quotaPosition(quota: MindeckQuota, scope: QuotaPosition['scope']): QuotaPosition | undefined {
  if (scope === 'company') {
    const percent = quota.companyBudgetPercent
    return percent === null ? undefined : { scope, used: percent, limit: 100, ratio: percent / 100 }
  }
  const usage = scope === 'user' ? quota.user : quota.department
  if (usage === null || usage.limit === null) return undefined
  return { scope, used: usage.used, limit: usage.limit, ratio: usage.limit === 0 ? 1 : usage.used / usage.limit }
}

/**
 * What the quota notice offers about more quota. `ask`: a request is accepted now, after the outcome of this month's
 * last request if any; `pending`: a request waits for a decision; `contact`: the department's or the company's limit is
 * used up, which a personal request cannot raise; `none`: nothing to offer, such as on a Mindeck Cloud without quota
 * requests or while quota is left.
 */
export type QuotaRequestOffer =
  | { readonly kind: 'ask'; readonly last: MindeckQuotaRequest | null }
  | { readonly kind: 'pending'; readonly request: MindeckQuotaRequest }
  | { readonly kind: 'contact'; readonly scope: 'department' | 'company' }
  | { readonly kind: 'none'; readonly last: MindeckQuotaRequest | null }

/**
 * Decide what the quota notice offers from Mindeck Cloud's request state.
 * @param quota - the member's quota with its request state.
 * @returns the offer.
 */
export function quotaRequestOffer(quota: MindeckQuota): QuotaRequestOffer {
  const state = quota.request
  if (state === null) return { kind: 'none', last: null }
  if (state.canRequest) return { kind: 'ask', last: state.request }
  switch (state.blocker) {
    case 'pending':
      return state.request?.status === 'pending' ? { kind: 'pending', request: state.request } : { kind: 'none', last: state.request }
    case 'company':
    case 'department':
      return { kind: 'contact', scope: state.blocker }
    default:
      // `unlimited`, `quota-left`, and blockers of a newer Mindeck Cloud offer no request.
      return { kind: 'none', last: state.request }
  }
}

/** Locale keys of the reminder and the used-up explanation for each scope and level. */
const QUOTA_TEXT_KEYS = {
  user: { warning: 'quotaDockUser', urgent: 'quotaDockUser', out: 'quotaDockUserOut' },
  department: { warning: 'quotaDockDepartment', urgent: 'quotaDockDepartment', out: 'quotaDockDepartmentOut' },
  company: { warning: 'quotaDockCompany', urgent: 'quotaDockCompany', out: 'quotaDockCompanyOut' },
} as const satisfies Record<QuotaPosition['scope'], Record<QuotaLevel, MindeckAccountKey>>

/** How close a limit is to being used up. */
export type QuotaLevel = 'warning' | 'urgent' | 'out'

/**
 * Word a quota position with its level's template.
 * @param position - the limit to describe.
 * @param level - how close the limit is to being used up.
 * @param resetDate - `YYYY-MM-DD` when usage starts over.
 * @param t - account copy.
 * @returns the sentence naming the limit, its usage, and the reset date.
 */
export function quotaText(
  position: QuotaPosition, level: QuotaLevel, resetDate: string,
  t: (key: MindeckAccountKey, params?: Record<string, string>) => string,
): string {
  return t(QUOTA_TEXT_KEYS[position.scope][level], quotaParams(position, resetDate, t))
}

/**
 * Fill the parameters the quota templates name.
 * @param position - the limit to describe.
 * @param resetDate - `YYYY-MM-DD` when usage starts over.
 * @param t - account copy, for the reset date.
 * @returns `percent`, `used`, `limit`, and `reset`.
 */
export function quotaParams(
  position: QuotaPosition, resetDate: string, t: (key: MindeckAccountKey, params?: Record<string, string>) => string,
): Record<string, string> {
  return {
    percent: String(Math.floor(position.ratio * 100)),
    used: formatCny(position.used),
    limit: formatCny(position.limit),
    reset: t('quotaReset', monthDay(resetDate)),
  }
}

/** Two decimals with thousands separators, the way amounts read in both Chinese and English copy. */
const CNY = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Format an amount of money for the quota rows.
 * @param value - amount in CNY.
 * @returns the amount as `¥2,012.50`.
 */
export function formatCny(value: number): string {
  return `¥${CNY.format(value)}`
}

/**
 * Split a reset date into the parts the locale templates name.
 * @param date - `YYYY-MM-DD`.
 * @returns the month and day as numbers for the locale template.
 */
export function monthDay(date: string): { month: string; day: string } {
  const [, month = '', day = ''] = date.split('-')
  return { month: String(Number(month)), day: String(Number(day)) }
}
