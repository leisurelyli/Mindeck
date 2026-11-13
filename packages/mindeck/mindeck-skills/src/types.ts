/** Company-skill listing shared by the Host plugin and the skills page. */
import type {} from '@deepseek-ai/dsh-typert-protocol'

/** One company skill as Mindeck lists it. */
export interface MindeckSkillView {
  /** Skill name, typed as `/name` to use the skill. */
  readonly name: string
  /** Name members see, such as `周报助手`; null shows `name`. */
  readonly displayName: string | null
  /** Group the skill is listed under; null lists it with the ungrouped skills. */
  readonly category: string | null
  readonly description: string
  /** Whether the company recommends the skill to this member. */
  readonly recommended: boolean
  /** Lowercase pinyin of the display name and category, such as `zhoubao` and `zb`. */
  readonly searchKeys: readonly string[]
}

/** Company skills the signed-in member has on this computer. */
export interface MindeckSkillCatalog {
  /** Company that provides the skills; null while signed out. */
  readonly company: string | null
  /** Installed company skills in Mindeck Cloud order. */
  readonly skills: readonly MindeckSkillView[]
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The member has no company skill of that name on this computer. */
    'mindeck-skills/not-found': Record<string, never>
  }
}
