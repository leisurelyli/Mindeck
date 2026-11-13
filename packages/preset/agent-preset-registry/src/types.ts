/** Client-safe payloads and event declarations owned by the agent-preset domain. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { LocalizedText } from '@deepseek-ai/dsh-package-manifest'


/**
 * One declared preset as a client reads it.
 */
export interface AgentPresetRow {
  /** Stable identifier; also the label's fallback. */
  readonly id: string
  /** Whether a session naming no preset composes this one. */
  readonly isDefault: boolean
  /** Display name the preset published; clients resolve translations in the active locale. */
  readonly name?: LocalizedText
  /** One sentence on what this preset is for, resolved like {@link name}. */
  readonly description?: LocalizedText
  /** `false` when pickers omit the preset for new conversations; a Session already on it keeps it. */
  readonly listed?: false
  /** Why this preset cannot compose a session; absent when it can. */
  readonly broken?: string
}

/** The roster one deployment currently supplies. */
export interface AgentPresetRoster {
  /** Every current declaration, including activation failures. */
  readonly presets: readonly AgentPresetRow[]
}

/** One preset's declared composition, rendered for reading. */
export interface AgentPresetDocument {
  /** The preset the composition belongs to. */
  readonly agentPreset: string
  /** The declared child plugin list as entry-list YAML, `!!js` expressions included. */
  readonly content: string
  /** Display name the preset published; clients resolve translations in the active locale. */
  readonly name?: LocalizedText
  /** One sentence on what this preset is for, resolved like {@link name}. */
  readonly description?: LocalizedText
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** No declaration supplies the requested identity. */
    'agent-preset/not-found': { readonly agentPreset: string; readonly available: readonly string[] }
    /** The id is unusable, already taken, or its composition cannot be installed. */
    'agent-preset/invalid': { readonly agentPreset: string; readonly reason: string }
    /** The preset is not offered for new conversations, and the session is not already on it. */
    'agent-preset/unlisted': { readonly sessionId: SessionId; readonly agentPreset: string }
    /** The session's conversation has started, so its composition is fixed. */
    'agent-preset/locked': { readonly sessionId: SessionId; readonly agentPreset: string }
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Preset the Session runs, or null when the deployment composes none. */
    agentPreset: string | null
  }
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * One session committed a different agent preset to its durable log.
     * Consumers invalidate only state derived from that session's composition.
     * @mode emit
     * @param sessionId - the session whose composition changed.
     * @param agentPreset - the preset recorded by the committed selection.
     */
    'agent-preset/selected'(sessionId: SessionId, agentPreset: string): void
  }
}

export {}
