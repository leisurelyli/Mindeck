/** Browser entry for Mindeck digital employees: the cards above the composer of a blank conversation. */
import type { Context } from '@deepseek-ai/cordis'
import remote from '@deepseek-ai/dsh-mindeck-employees/remote'
import { mountEmployees } from './mount.ts'

export { inject } from './mount.ts'
export type { MindeckEmployeesKey } from './locales.ts'
export type { MindeckEmployeesInjected, MindeckEmployeesSnapshot } from './operations.ts'
export type { EmployeeDockProps } from './EmployeeDock.tsx'

/**
 * Mount the digital-employee Remote, then the cards.
 * @param ctx - browser plugin context.
 * @returns disposer withdrawing the cards before the Remote.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> { return await mountEmployees(ctx, remote) }
