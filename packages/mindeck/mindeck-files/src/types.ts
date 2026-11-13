/** Wire types of the file-library Remote shared by the Host service and the Client panel. */
import type {} from '@deepseek-ai/dsh-typert-protocol'

/** Whether the member can use the file library now. */
export type LibraryAvailability = 'ready' | 'signed-out' | 'not-configured'

/** One space as the panel shows it. */
export interface LibrarySpaceView {
  /** Library path of the space root, such as `/Personal`. */
  readonly path: string
  readonly name: string
  readonly kind: 'personal' | 'project' | 'shares'
  /** Page that opens the space in the OpenCloud web app. */
  readonly webUrl: string
  readonly used?: number
  readonly total?: number
}

/** One file or folder as the panel shows it. */
export interface LibraryEntryView {
  readonly path: string
  readonly name: string
  readonly kind: 'folder' | 'file'
  readonly size?: number
  /** ISO 8601 modification time. */
  readonly modified?: string
  readonly writable: boolean
  /** Page that opens the item in the OpenCloud web app. */
  readonly webUrl?: string
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The member is not signed in, or Mindeck Cloud ended the session. */
    'mindeck-files/signed-out': Record<string, never>
    /** The company has not enabled the file library. */
    'mindeck-files/not-configured': Record<string, never>
    /** The path does not exist or is not the expected kind. */
    'mindeck-files/not-found': Record<string, never>
    /** The member may not open or change this item. */
    'mindeck-files/denied': Record<string, never>
    /** A file of the same name already exists. */
    'mindeck-files/exists': Record<string, never>
    /** The space has no room for the file. */
    'mindeck-files/quota': Record<string, never>
    /** The file is larger than the upload or download limit. */
    'mindeck-files/too-large': Record<string, never>
    /** The file library did not respond or failed. */
    'mindeck-files/unavailable': Record<string, never>
  }
}
