/** Operations and the availability observable injected into the file-library side panel and page. */
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { LibraryAvailability, LibraryEntryView, LibrarySpaceView } from '../types.ts'
import type { MindeckFilesKey } from './locales.ts'

/** Latest availability as the Client observes it. */
export interface LibrarySnapshot {
  /** Latest streamed availability; absent until the first frame. */
  readonly availability: LibraryAvailability | undefined
  /** Whether the availability stream failed. */
  readonly failed: boolean
}

/** Result of one Host read; a failure names the copy that explains it. */
export type LibraryResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: MindeckFilesKey }

/** Library reads and the upload, shared by the panel and the page. */
export interface MindeckFilesReads {
  /** @returns the member's spaces, personal first. */
  spaces: () => Promise<LibraryResult<LibrarySpaceView[]>>
  /** @param path - library path of a space or folder. @returns its entries, folders first. */
  list: (path: string) => Promise<LibraryResult<LibraryEntryView[]>>
  /** @param query - text contained in names. @returns matching entries. */
  search: (query: string) => Promise<LibraryResult<LibraryEntryView[]>>
  /**
   * Save a file from the member's computer into a library folder.
   * @param folder - library path of a space or folder.
   * @param file - file the member picked or dropped.
   * @param overwrite - replace a file of the same name.
   * @returns the saved file, or why it was not saved; `exists` when the name is taken and `overwrite` is false.
   */
  upload: (folder: string, file: File, overwrite: boolean) => Promise<LibraryResult<LibraryEntryView>>
}

/** Panel operations for one Session's pane. */
export interface MindeckFilesInjected extends MindeckFilesReads {
  hooks: { library: HostObservable<LibrarySnapshot> }
  /**
   * Put a reference to the library item into this Session's message draft.
   * @param entry - file or folder.
   * @returns whether the composer accepted it.
   */
  addToConversation: (entry: LibraryEntryView) => boolean
}

/** Operations of the library page. */
export interface MindeckFilesPageInjected extends MindeckFilesReads {
  hooks: { library: HostObservable<LibrarySnapshot> }
  /**
   * Open a blank conversation in the current Workspace with a reference to the library item in its draft.
   * @param entry - file or folder.
   * @returns once the conversation shows or the Host refused it.
   */
  startWith: (entry: Pick<LibraryEntryView, 'path' | 'name' | 'kind'>) => Promise<void>
}
