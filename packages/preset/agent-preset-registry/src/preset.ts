import type { Volatile } from '@deepseek-ai/cordis'
import type { LocalizedText } from '@deepseek-ai/dsh-package-manifest'
/** Public preset roster and selection configuration. */
/** One declared preset and its current activation failure, if any. */
export interface AgentPreset {
  readonly id: string
  /** Display name as the definition published it. */
  readonly name?: LocalizedText
  /** Description as the definition published it. */
  readonly description?: LocalizedText
  readonly order?: number
  /** `false` when the preset is not offered for new conversations; see `PresetDefinition.listed`. */
  readonly listed?: false
  readonly broken?: string
}

/** Registry selection policy. */
export interface Config {
  /** Deployment default when the caller omits a preset. */
  default: string
  /** User-selected default; edited through Settings. */
  selectedDefault: Volatile<string | undefined>
}
