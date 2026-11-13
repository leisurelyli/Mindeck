/** Operations and the skill-listing observable injected into the skills page. */
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { MindeckSkillCatalog } from '../types.ts'

/** Latest company-skill listing as the Client observes it. */
export interface MindeckSkillsSnapshot {
  /** Latest streamed listing; absent until the first frame. */
  readonly catalog: MindeckSkillCatalog | undefined
  /** Whether the listing stream failed; the last listing stays visible. */
  readonly failed: boolean
}

/** Outcome of reading one skill's instructions. */
export type InstructionsRead =
  | { readonly ok: true; readonly markdown: string }
  /** `missing`: the skill left this computer; `failed`: the read did not complete. */
  | { readonly ok: false; readonly reason: 'missing' | 'failed' }

/** Operations of the skills page. */
export interface MindeckSkillsInjected {
  hooks: { catalog: HostObservable<MindeckSkillsSnapshot> }
  /**
   * Open a blank conversation in the current Workspace with `/name ` at the start of its draft.
   * @param name - skill to use.
   * @returns once the conversation shows or the Host refused it.
   */
  use: (name: string) => Promise<void>
  /**
   * Read the instructions the agent receives with a skill.
   * @param name - skill from the listing.
   * @returns the SKILL.md body, or why it could not be read.
   */
  instructions: (name: string) => Promise<InstructionsRead>
}
