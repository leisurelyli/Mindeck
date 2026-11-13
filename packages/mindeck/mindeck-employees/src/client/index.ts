/** Browser entry for Mindeck digital employees: the digital-employee page and its left-sidebar row. */
import type { Context } from '@deepseek-ai/cordis'
import remote from '@deepseek-ai/dsh-mindeck-employees/remote'
import { mountEmployees } from './mount.ts'

export { EMPLOYEES_PANEL_ID, inject } from './mount.ts'
export type { MindeckEmployeesKey } from './locales.ts'
export type { MindeckEmployeesPageInjected, MindeckEmployeesSnapshot } from './operations.ts'
export type { EmployeesPageProps } from './EmployeesPage.tsx'

/**
 * Mount the digital-employee Remote, then the page.
 * @param ctx - browser plugin context.
 * @returns disposer withdrawing the page before the Remote.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> { return await mountEmployees(ctx, remote) }
