/** File-library operations on library paths, shared by the agent tools and the panel Remote. */
import { libraryPath, locate, nameSpaces, type LibrarySpace } from './library.ts'
import { LibraryError, searchPattern, type OpenCloudClient, type OpenCloudItem, type SearchScope } from './opencloud.ts'
import type { LibraryPassagePart } from './types.ts'

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
  /** Search results matched by document text: the passage around the match, matching runs marked. */
  readonly passage?: readonly LibraryPassagePart[]
}

/** Byte limits for transfers between the workspace and the library. */
export interface TransferLimits {
  /** Largest file a download accepts. */
  readonly maxDownloadBytes: number
  /** Largest file an upload sends. */
  readonly maxUploadBytes: number
}

/** Most characters of a passage before its first match. */
const PASSAGE_LEAD = 40
/** Most characters of a passage. */
const PASSAGE_LENGTH = 160
/** Punctuation that ends a clause, where a shortened lead starts. */
const CLAUSE_END = /[。！？；!?;]/u

/**
 * Read an OpenCloud highlight into a passage: white space runs become one space, adjacent matches join, and the text
 * is shortened to {@link PASSAGE_LEAD} characters before the first match and to {@link PASSAGE_LENGTH} in all, with `…`
 * where it was cut. A lead that was cut, here or by OpenCloud's leading `…`, starts after its first clause end when it
 * has one.
 * @param highlights - `oc:highlights` text, each matching run inside `<mark>` and `</mark>`.
 * @returns the passage, or undefined when it marks no match.
 */
export function passageOf(highlights: string): LibraryPassagePart[] | undefined {
  const parts: Array<{ text: string; match: boolean }> = []
  let match = false
  for (const piece of highlights.split(/(<\/?mark>)/u)) {
    if (piece === '<mark>' || piece === '</mark>') { match = piece === '<mark>'; continue }
    const text = piece.replace(/\s+/gu, ' ')
    if (text === '') continue
    const last = parts.at(-1)
    if (last?.match === match) last.text += text
    else parts.push({ text, match })
  }
  const first = parts.findIndex(part => part.match)
  if (first === -1) return undefined
  const before = parts.slice(0, first).map(part => part.text).join('').trimStart()
  const clipped = before.startsWith('…')
  const lead = clipped ? before.slice(1) : before
  const kept: Array<{ text: string; match: boolean }> = []
  if (clipped || lead.length > PASSAGE_LEAD) kept.push({ text: `…${shortLead(lead)}`, match: false })
  else if (lead !== '') kept.push({ text: lead, match: false })
  let length = kept[0]?.text.length ?? 0
  for (const part of parts.slice(first)) {
    const room = PASSAGE_LENGTH - length
    if (room <= 0) { kept.push({ text: '…', match: false }); break }
    const text = part.text.length > room ? `${part.text.slice(0, room)}…` : part.text
    kept.push({ text, match: part.match })
    length += text.length
    if (text !== part.text) break
  }
  const last = kept.at(-1)
  if (last !== undefined && !last.match) last.text = last.text.trimEnd()
  return kept.filter(part => part.text !== '')
}

function shortLead(lead: string): string {
  const tail = lead.slice(-PASSAGE_LEAD)
  const end = tail.search(CLAUSE_END)
  const clause = end === -1 ? '' : tail.slice(end + 1).trimStart()
  return clause === '' ? tail.trimStart() : clause
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

/** Options of one library search. */
export interface LibrarySearch extends SearchScope {
  /** Most results. */
  readonly limit: number
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
    const self = await this.item(space, inner, signal)
    return self === undefined ? undefined : entry(space, self)
  }

  /**
   * The item at one path inside a space.
   * @param space - space.
   * @param inner - path inside the space.
   * @param signal - cancellation.
   * @returns the item, or undefined when nothing exists at the path.
   */
  private async item(space: LibrarySpace, inner: string, signal: AbortSignal): Promise<OpenCloudItem | undefined> {
    try {
      const [self] = await this.client.propfind(space.driveId, inner, 0, signal)
      return self
    } catch (error) {
      if (error instanceof LibraryError && error.code === 'not-found') return undefined
      throw error
    }
  }

  /**
   * Search the member's spaces, or one folder of them, by name and, with full text, by document text.
   * @param query - search text.
   * @param options - result limit, full text, and the folder's resource id.
   * @param signal - cancellation.
   * @returns matches in spaces the member can open, in relevance order; a text match carries its passage.
   */
  async search(query: string, options: LibrarySearch, signal: AbortSignal): Promise<LibraryEntry[]> {
    const pattern = searchPattern(query, options)
    const spaces = await this.spaces(signal)
    const byDrive = new Map(spaces.map(space => [space.driveId, space]))
    const matches: LibraryEntry[] = []
    for (const item of await this.client.search(pattern, options.limit, signal)) {
      const space = byDrive.get(item.driveId)
      // A result in a drive the member cannot list (such as the source drive of a share) has no library path.
      if (space === undefined || item.path === '') continue
      const passage = item.highlights === undefined ? undefined : passageOf(item.highlights)
      matches.push({ ...entry(space, item), ...passage === undefined ? {} : { passage } })
    }
    return matches
  }

  /**
   * Read the resource id of a folder, which a search uses to stay inside it.
   * @param path - library path of a space or folder.
   * @param signal - cancellation.
   * @returns the folder's resource id and its library path.
   * @throws LibraryError `not-found` for a file or a missing path; `denied` when the member may not open it.
   */
  async folder(path: string, signal: AbortSignal): Promise<{ id: string; path: string }> {
    const { space, inner } = locate(path, await this.spaces(signal))
    const [self] = await this.client.propfind(space.driveId, inner, 0, signal)
    const where = libraryPath(space.name, inner)
    if (self?.kind !== 'folder') throw new LibraryError('not-found', `${where} is a file, not a folder`)
    if (self.fileId === undefined) throw new LibraryError('protocol', `the file library did not report the id of ${where}`)
    return { id: self.fileId, path: where }
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
    if (!overwrite && await this.item(space, inner, signal) !== undefined) {
      throw new LibraryError('exists', `${libraryPath(space.name, inner)} already exists`)
    }
    const folder = inner.includes('/') ? inner.slice(0, inner.lastIndexOf('/')) : ''
    if (folder !== '') await this.client.createFolders(space.driveId, folder, signal)
    await this.client.upload(space.driveId, inner, bytes, signal)
    const [self] = await this.client.propfind(space.driveId, inner, 0, signal)
    if (self === undefined) throw new LibraryError('protocol', `${libraryPath(space.name, inner)} was saved but cannot be read back`)
    return entry(space, self)
  }
}
