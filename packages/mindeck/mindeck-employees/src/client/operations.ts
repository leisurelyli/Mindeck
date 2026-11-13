/** Operations and the card observable injected into the digital-employee page. */
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { MindeckEmployeeCatalog } from '../types.ts'

/** Latest cards as the Client observes them. */
export interface MindeckEmployeesSnapshot {
  /** Latest streamed cards; absent until the first frame or while the stream is unavailable. */
  readonly catalog: MindeckEmployeeCatalog | undefined
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
