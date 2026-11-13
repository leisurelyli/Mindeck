/** Operations and the card observable injected into the digital-employee cards and page. */
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { MindeckEmployeeCatalog } from '../types.ts'

/** Latest cards as the Client observes them. */
export interface MindeckEmployeesSnapshot {
  /** Latest streamed cards; absent until the first frame or while the stream is unavailable. */
  readonly catalog: MindeckEmployeeCatalog | undefined
}

/** Card operations for one Session. */
export interface MindeckEmployeesInjected {
  hooks: { catalog: HostObservable<MindeckEmployeesSnapshot> }
  /**
   * Switch this blank Session to one card's agent preset.
   * @param presetId - the card's preset.
   * @returns why the Host refused the switch, or undefined once it is applied.
   */
  select: (presetId: string) => Promise<string | undefined>
  /**
   * Put a starter request in this Session's message draft without sending it: it fills an empty draft and
   * follows other text on a new line.
   * @param text - the starter request.
   * @returns whether the composer accepted it.
   */
  insertStarter: (text: string) => boolean
  /** Show the digital-employee page in the main column. */
  openAll: () => void
}

/** Operations of the digital-employee page. */
export interface MindeckEmployeesPageInjected {
  hooks: { catalog: HostObservable<MindeckEmployeesSnapshot> }
  /**
   * Open a blank conversation in the current Workspace under a card's preset, with a starter request in its draft.
   * @param presetId - the card's preset.
   * @param starter - starter request for the draft; omitted keeps the draft as it is.
   * @returns once the conversation shows or the Host refused it.
   */
  start: (presetId: string, starter?: string) => Promise<void>
}
