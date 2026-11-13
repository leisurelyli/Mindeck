/** Icon of the file-library row in the left sidebar; the sidebar owns the row, its label, and its selected state. */
import { IconFolderCloseRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * @param props - the sidebar's icon share: the requested edge.
 * @returns the folder glyph.
 */
export function LibraryPanelIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return <IconFolderCloseRegular size={size} />
}
