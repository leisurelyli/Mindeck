/** Operations and the skill-listing observable injected into the skills page. */
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { MindeckSkillCatalog } from '../types.ts'
import type { SessionSkill } from './sections.ts'

/** Latest company-skill listing as the Client observes it. */
export interface MindeckSkillsSnapshot {
  /** Latest streamed listing; absent until the first frame. */
  readonly catalog: MindeckSkillCatalog | undefined
  /** Whether the listing stream failed; the last listing stays visible. */
  readonly failed: boolean
}

/** Page operations for one Session's pane. */
export interface MindeckSkillsInjected {
  hooks: { catalog: HostObservable<MindeckSkillsSnapshot> }
  /**
   * Read the skills this conversation can use, including the company's.
   * @returns the skills, or undefined when the conversation cannot be read yet.
   */
  sessionSkills: () => Promise<readonly SessionSkill[] | undefined>
  /**
   * Put `/name ` at the start of this Session's message draft.
   * @param name - skill to use.
   * @returns whether the composer accepted it.
   */
  useSkill: (name: string) => boolean
  /** @param path - SKILL.md to show in the side panel. */
  preview: (path: string) => void
}
