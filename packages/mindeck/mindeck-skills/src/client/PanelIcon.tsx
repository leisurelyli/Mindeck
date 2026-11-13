/** Icon of the skills row in the left sidebar; the sidebar owns the row, its label, and its selected state. */
import { IconSkillOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * @param props - the sidebar's icon share: the requested edge.
 * @returns the skill glyph.
 */
export function SkillsPanelIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return <IconSkillOutlineRegular size={size} />
}
