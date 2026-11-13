/** Browser entry for Mindeck digital employees: the cards above the composer of a blank conversation and the digital-employee page. */
import type { Context } from '@deepseek-ai/cordis'
import remote from '@deepseek-ai/dsh-mindeck-employees/remote'
import { mountEmployees } from './mount.ts'

export { EMPLOYEES_PANEL_ID, inject } from './mount.ts'
export type { MindeckEmployeesKey } from './locales.ts'
export type { MindeckEmployeesInjected, MindeckEmployeesPageInjected, MindeckEmployeesSnapshot } from './operations.ts'
export type { EmployeeDockProps } from './EmployeeDock.tsx'
export type { EmployeesPageProps } from './EmployeesPage.tsx'

/**
 * Mount the digital-employee Remote, then the cards and the page.
 * @param ctx - browser plugin context.
 * @returns disposer withdrawing the cards and the page before the Remote.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> { return await mountEmployees(ctx, remote) }
