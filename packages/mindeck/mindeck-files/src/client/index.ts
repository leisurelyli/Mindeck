/** Browser entry for the Mindeck file library: the sidebar page. */
import type { Context } from '@deepseek-ai/cordis'
import remote from '@deepseek-ai/dsh-mindeck-files/remote'
import { mountFiles } from './mount.ts'

export { inject, LIBRARY_TAB_ID } from './mount.ts'
export type { MindeckFilesKey } from './locales.ts'
export type { LibraryResult, LibrarySnapshot, MindeckFilesInjected } from './operations.ts'
export type { LibraryPanelProps } from './LibraryPanel.tsx'

/**
 * Mount the file-library Remote, then the panel.
 * @param ctx - browser plugin context.
 * @returns disposer withdrawing the panel before the Remote.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> { return await mountFiles(ctx, remote) }
