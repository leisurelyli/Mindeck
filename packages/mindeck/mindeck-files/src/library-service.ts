/** File-library operations on library paths, shared by the agent tools and the panel Remote. */
import { libraryPath, locate, nameSpaces, type LibrarySpace } from './library.ts'
import { LibraryError, type OpenCloudClient, type OpenCloudItem } from './opencloud.ts'

/** One file or folder addressed by its library path. */
export interface LibraryEntry {
  /** Library path such as `/Personal/reports/weekly.md`. */
  readonly path: string
  readonly name: string
  readonly kind: 'file' | 'folder'
  readonly size?: number
  /** ISO 8601 modification time. */
  readonly modified?: string
  /** Whether the member may change this item: replace a file, or add to a folder. */
  readonly writable: boolean
  /** Page that opens the item in the OpenCloud web app. */
  readonly webUrl?: string
}

/** Byte limits for transfers between the workspace and the library. */
export interface TransferLimits {
  /** Largest file a download accepts. */
  readonly maxDownloadBytes: number
  /** Largest file an upload sends. */
  readonly maxUploadBytes: number
}

function entry(space: LibrarySpace, item: OpenCloudItem): LibraryEntry {
  const modified = item.modified === undefined ? undefined : new Date(item.modified)
  const writable = item.permissions === undefined ? false
    : item.kind === 'folder' ? /[CK]/.test(item.permissions) : item.permissions.includes('W')
  const name = item.path === '' ? space.name : item.path.slice(item.path.lastIndexOf('/') + 1)
  const origin = URL.canParse(space.webUrl) ? new URL(space.webUrl).origin : undefined
  return {
    path: libraryPath(space.name, item.path), name, kind: item.kind,
    ...item.size === undefined ? {} : { size: item.size },
    ...modified === undefined || Number.isNaN(modified.getTime()) ? {} : { modified: modified.toISOString() },
    writable,
    ...item.fileId === undefined || origin === undefined ? {} : { webUrl: `${origin}/f/${encodeURIComponent(item.fileId)}` },
  }
}

/** Library-path operations over one member's OpenCloud drives. */
export class LibraryService {
  /**
   * @param client - OpenCloud client for the signed-in member.
   * @param limits - transfer limits.
   */
  constructor(private readonly client: OpenCloudClient, readonly limits: TransferLimits) {}

  /**
   * List the spaces the member can open.
   * @param signal - cancellation.
   * @returns the member's spaces, personal first.
   */
  async spaces(signal: AbortSignal): Promise<LibrarySpace[]> {
    return nameSpaces(await this.client.drives(signal))
  }

  /**
   * List one space or folder.
   * @param path - library path of a folder or a space.
   * @param signal - cancellation.
   * @returns the folder's entries, folders first and then by name.
   * @throws LibraryError `not-found` when the path is a file or does not exist.
   */
  async list(path: string, signal: AbortSignal): Promise<LibraryEntry[]> {
    const { space, inner } = locate(path, await this.spaces(signal))
    const [self, ...children] = await this.client.propfind(space.driveId, inner, 1, signal)
    if (self?.kind !== 'folder') throw new LibraryError('not-found', `${libraryPath(space.name, inner)} is a file, not a folder`)
    return children.map(item => entry(space, item))
      .sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'folder' ? -1 : 1)
  }

  /**
   * Look up the entry at one library path.
   * @param path - library path.
   * @param signal - cancellation.
   * @returns the entry, or undefined when nothing exists at the path.
   */
  async stat(path: string, signal: AbortSignal): Promise<LibraryEntry | undefined> {
    const { space, inner } = locate(path, await this.spaces(signal))
    try {
      const [self] = await this.client.propfind(space.driveId, inner, 0, signal)
      return self === undefined ? undefined : entry(space, self)
    } catch (error) {
      if (error instanceof LibraryError && error.code === 'not-found') return undefined
      throw error
    }
  }

  /**
   * Search file and folder names across the member's spaces.
   * @param query - text contained in file or folder names.
   * @param limit - most results.
   * @param signal - cancellation.
   * @returns matches in spaces the member can open.
   */
  async search(query: string, limit: number, signal: AbortSignal): Promise<LibraryEntry[]> {
    const spaces = await this.spaces(signal)
    const byDrive = new Map(spaces.map(space => [space.driveId, space]))
    const matches: LibraryEntry[] = []
    for (const item of await this.client.search(query, limit, signal)) {
      const space = byDrive.get(item.driveId)
      // A result in a drive the member cannot list (such as the source drive of a share) has no library path.
      if (space !== undefined && item.path !== '') matches.push(entry(space, item))
    }
    return matches
  }

  /**
   * Download one file.
   * @param path - library path of a file.
   * @param signal - cancellation.
   * @returns the file's entry and content.
   * @throws LibraryError `not-found` for a folder or a missing file; `too-large` over the download limit.
   */
  async read(path: string, signal: AbortSignal): Promise<{ entry: LibraryEntry; bytes: Uint8Array }> {
    const { space, inner } = locate(path, await this.spaces(signal))
    const [self] = await this.client.propfind(space.driveId, inner, 0, signal)
    if (self?.kind !== 'file') throw new LibraryError('not-found', `${libraryPath(space.name, inner)} is a folder, not a file`)
    const bytes = await this.client.download(space.driveId, inner, this.limits.maxDownloadBytes, signal)
    return { entry: entry(space, self), bytes }
  }

  /**
   * Save a file, creating missing folders. A replaced file stays available as an OpenCloud version.
   * @param path - library path of the file.
   * @param bytes - content.
   * @param overwrite - replace an existing file.
   * @param signal - cancellation.
   * @returns the saved file's entry.
   * @throws LibraryError `exists` when the file exists and `overwrite` is false; `too-large` over the upload limit.
   */
  async write(path: string, bytes: Uint8Array, overwrite: boolean, signal: AbortSignal): Promise<LibraryEntry> {
    if (bytes.byteLength > this.limits.maxUploadBytes) {
      throw new LibraryError('too-large', `the file has ${bytes.byteLength} bytes; the upload limit is ${this.limits.maxUploadBytes}`)
    }
    const { space, inner } = locate(path, await this.spaces(signal))
    if (inner === '') throw new LibraryError('not-found', `${path} names a space; add a file name such as ${libraryPath(space.name, 'report.md')}`)
    const folder = inner.includes('/') ? inner.slice(0, inner.lastIndexOf('/')) : ''
    if (folder !== '') await this.client.createFolders(space.driveId, folder, signal)
    await this.client.upload(space.driveId, inner, bytes, overwrite, signal)
    const [self] = await this.client.propfind(space.driveId, inner, 0, signal)
    if (self === undefined) throw new LibraryError('protocol', `${libraryPath(space.name, inner)} was saved but cannot be read back`)
    return entry(space, self)
  }
}
