/** Browser entry for Mindeck company skills: the skills page and its left-sidebar row. */
import type { Context } from '@deepseek-ai/cordis'
import remote from '@deepseek-ai/dsh-mindeck-skills/remote'
import { mountSkills } from './mount.ts'

export { inject, SKILLS_PANEL_ID } from './mount.ts'
export type { MindeckSkillsKey } from './locales.ts'
export type { InstructionsRead, MindeckSkillsInjected, MindeckSkillsSnapshot } from './operations.ts'
export type { SkillsPageProps } from './SkillsPage.tsx'
export { matchesSkill, skillInsertion, skillSections } from './sections.ts'
export type { SectionHeading, SkillSection } from './sections.ts'

/**
 * Mount the skills Remote, then the page.
 * @param ctx - browser plugin context.
 * @returns disposer withdrawing the page before the Remote.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> { return await mountSkills(ctx, remote) }
