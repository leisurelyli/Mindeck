/** Which company limit is closest to being used up, and how the account UI words amounts and dates. */
import type { MindeckQuota } from '../types.ts'

/** One limited scope of the member's quota. */
export interface QuotaPosition {
  readonly scope: 'user' | 'department'
  readonly used: number
  readonly limit: number
  /** `used / limit`; a zero limit counts as used up. */
  readonly ratio: number
}

/** Share of a limit from which the composer reminds the member, and from which the reminder is urgent. */
export const QUOTA_REMINDER_RATIOS = { warning: 0.75, urgent: 0.95 } as const

/**
 * Pick the limit that runs out first.
 * @param quota - the member's quota.
 * @returns the limited scope with the highest used share, or undefined when neither scope has a limit.
 */
export function tightestQuota(quota: MindeckQuota): QuotaPosition | undefined {
  const positions = (['user', 'department'] as const).flatMap((scope): QuotaPosition[] => {
    const usage = scope === 'user' ? quota.user : quota.department
    if (usage === null || usage.limit === null) return []
    return [{ scope, used: usage.used, limit: usage.limit, ratio: usage.limit === 0 ? 1 : usage.used / usage.limit }]
  })
  return positions.sort((a, b) => b.ratio - a.ratio)[0]
}

/**
 * Format an amount of money for the quota rows.
 * @param value - amount in CNY.
 * @returns the amount as `¥12.50`.
 */
export function formatCny(value: number): string {
  return `¥${value.toFixed(2)}`
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
