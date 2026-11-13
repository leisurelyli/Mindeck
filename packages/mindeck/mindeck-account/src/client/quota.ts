/** Which company limit is closest to being used up, and how the account UI words amounts and dates. */
import type { MindeckQuota } from '../types.ts'
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
  const positions = (['user', 'department'] as const).flatMap((scope): QuotaPosition[] => {
    const usage = scope === 'user' ? quota.user : quota.department
    if (usage === null || usage.limit === null) return []
    return [{ scope, used: usage.used, limit: usage.limit, ratio: usage.limit === 0 ? 1 : usage.used / usage.limit }]
  })
  if (quota.companyBudgetPercent !== null) {
    const company: QuotaPosition = {
      scope: 'company', used: quota.companyBudgetPercent, limit: 100, ratio: quota.companyBudgetPercent / 100,
    }
    if (company.ratio >= 1) return company
    positions.push(company)
  }
  return positions.sort((a, b) => b.ratio - a.ratio)[0]
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
  return t(QUOTA_TEXT_KEYS[position.scope][level], {
    percent: String(Math.floor(position.ratio * 100)),
    used: formatCny(position.used),
    limit: formatCny(position.limit),
    reset: t('quotaReset', monthDay(resetDate)),
  })
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
