/** OpenCloud spaces through the Graph API and their files through WebDAV, authorized by a Mindeck file-library token. */
import { XMLParser } from 'fast-xml-parser'
import { z } from 'zod'

/** Why a file-library operation failed; each code has one model-facing and one member-facing explanation. */
export type LibraryFailureCode =
  | 'not-configured' | 'signed-out' | 'not-found' | 'denied' | 'exists' | 'quota' | 'too-large' | 'unavailable' | 'protocol'

/** A file-library failure with a stable code. */
export class LibraryError extends Error {
  /**
   * @param code - failure category.
   * @param message - explanation for the model and the logs.
   * @param options - underlying cause.
   */
  constructor(readonly code: LibraryFailureCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'LibraryError'
  }
}

/** Address and bearer token for the member's OpenCloud. */
export interface OpenCloudAccess {
  /** OpenCloud base URL without a trailing slash. */
  readonly url: string
  readonly token: string
}

/**
 * Supplies OpenCloud access. `renew` asks for a fresh token after OpenCloud refused the previous one.
 * Throws {@link LibraryError} `not-configured` or `signed-out` when no access is possible.
 */
export type AccessSource = (signal: AbortSignal, renew: boolean) => Promise<OpenCloudAccess>

/** Kind of an OpenCloud drive the member can open. */
export type SpaceKind = 'personal' | 'project' | 'shares'

/** One drive the member can open. */
export interface OpenCloudDrive {
  readonly id: string
  readonly kind: SpaceKind
  /** Drive name in OpenCloud: the member's name, the company or department name, or `Shares`. */
  readonly name: string
  /** Page that opens the drive in the OpenCloud web app. */
  readonly webUrl: string
  /** Bytes used, when OpenCloud reports them. */
  readonly used?: number
  /** Byte limit, when the drive has one. */
  readonly total?: number
}

/** One file or folder inside a drive. */
export interface OpenCloudItem {
  readonly driveId: string
  /** Path inside the drive with `/` separators and no leading slash; empty for the drive root. */
  readonly path: string
  readonly kind: 'file' | 'folder'
  /** Bytes of a file, or of a folder's content. */
  readonly size?: number
  /** RFC 1123 modification time as OpenCloud reports it. */
  readonly modified?: string
  readonly contentType?: string
  /** OpenCloud permission letters; `W` (file) or `CK` (folder) allow writing. */
  readonly permissions?: string
  /** OpenCloud resource id; `{url}/f/{fileId}` opens the item in the web app. */
  readonly fileId?: string
}

const driveSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  driveType: z.string(),
  webUrl: z.string().optional(),
  quota: z.object({ used: z.number().optional(), total: z.number().optional() }).optional(),
})

const KINDS: Readonly<Record<string, SpaceKind>> = { personal: 'personal', project: 'project', virtual: 'shares' }

const PROPFIND_BODY = '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop>'
  + '<d:getcontentlength/><d:getlastmodified/><d:resourcetype/><d:getcontenttype/><oc:size/><oc:permissions/><oc:fileid/>'
  + '</d:prop></d:propfind>'

const parser = new XMLParser({
  ignoreAttributes: true, removeNSPrefix: true, processEntities: true, parseTagValue: false,
  isArray: name => name === 'response' || name === 'propstat',
})

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * @param path - path inside a drive.
 * @returns the percent-encoded WebDAV path suffix.
 */
function davPath(path: string): string {
  return path.split('/').filter(part => part.length > 0).map(encodeURIComponent).join('/')
}

/**
 * Read a WebDAV multistatus body into drive items.
 * @param xml - response body.
 * @param driveId - only responses under this drive are kept; empty keeps every drive.
 * @returns items in response order.
 * @throws LibraryError `protocol` when the body is not a multistatus.
 */
export function parseMultistatus(xml: string, driveId = ''): OpenCloudItem[] {
  let parsed: unknown
  try { parsed = parser.parse(xml) } catch (error) {
    throw new LibraryError('protocol', 'OpenCloud returned an unreadable WebDAV response', { cause: error })
  }
  const status = record(parsed).multistatus
  if (status === undefined) throw new LibraryError('protocol', 'OpenCloud returned a WebDAV response without multistatus')
  const responses = record(status).response
  const items: OpenCloudItem[] = []
  for (const response of Array.isArray(responses) ? responses : []) {
    const href = text(record(response).href)
    if (href === undefined) continue
    const match = /\/dav\/spaces\/([^/]+)\/?(.*)$/.exec(href)
    if (match === null) continue
    const id = decodeURIComponent(match[1] ?? '')
    if (driveId !== '' && id !== driveId) continue
    const path = (match[2] ?? '').split('/').filter(part => part.length > 0).map(decodeURIComponent).join('/')
    const props: Record<string, unknown> = {}
    const propstats = record(response).propstat
    for (const propstat of Array.isArray(propstats) ? propstats : []) {
      if (!/\s200\s/.test(` ${String(record(propstat).status)} `)) continue
      Object.assign(props, record(record(propstat).prop))
    }
    const folder = 'collection' in record(props.resourcetype)
    const size = Number(text(props.getcontentlength) ?? text(props.size))
    const modified = text(props.getlastmodified)
    const contentType = text(props.getcontenttype)
    const permissions = text(props.permissions)
    const fileId = text(props.fileid)
    items.push({
      driveId: id, path, kind: folder ? 'folder' : 'file',
      ...Number.isFinite(size) ? { size } : {},
      ...modified === undefined ? {} : { modified },
      ...contentType === undefined ? {} : { contentType },
      ...permissions === undefined ? {} : { permissions },
      ...fileId === undefined ? {} : { fileId },
    })
  }
  return items
}

/** Graph and WebDAV operations for one member; every call retries once with a renewed token after HTTP 401. */
export class OpenCloudClient {
  /**
   * @param access - token source.
   * @param timeoutMs - limit of one HTTP exchange, including the response body.
   */
  constructor(private readonly access: AccessSource, private readonly timeoutMs: number) {}

  private async send(path: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
    const limited = AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)])
    const attempt = async (renew: boolean): Promise<Response> => {
      const { url, token } = await this.access(limited, renew)
      try {
        return await fetch(`${url}${path}`, {
          ...init, redirect: 'error', signal: limited, headers: { ...init.headers as Record<string, string>, authorization: `Bearer ${token}` },
        })
      } catch (error) {
        if (signal.aborted) throw error
        throw new LibraryError('unavailable', 'the file library did not respond', { cause: error })
      }
    }
    const first = await attempt(false)
    if (first.status !== 401) return first
    await first.body?.cancel()
    const second = await attempt(true)
    if (second.status === 401) {
      await second.body?.cancel()
      throw new LibraryError('signed-out', 'the file library refused the Mindeck sign-in')
    }
    return second
  }

  private static failure(response: Response, action: string): LibraryError {
    const { status } = response
    void response.body?.cancel()
    if (status === 404 || status === 409) return new LibraryError('not-found', `${action}: the path does not exist`)
    if (status === 403) return new LibraryError('denied', `${action}: the member may not do this here`)
    if (status === 412) return new LibraryError('exists', `${action}: an item with this name already exists`)
    if (status === 413) return new LibraryError('too-large', `${action}: the file is too large for the file library`)
    if (status === 507) return new LibraryError('quota', `${action}: the space has no room left`)
    if (status >= 500) return new LibraryError('unavailable', `${action}: the file library failed with HTTP ${status}`)
    return new LibraryError('protocol', `${action}: unexpected HTTP ${status}`)
  }

  /**
   * List the member's OpenCloud drives.
   * @param signal - cancellation.
   * @returns the drives the member can open, personal first.
   */
  async drives(signal: AbortSignal): Promise<OpenCloudDrive[]> {
    const response = await this.send('/graph/v1.0/me/drives', { headers: { accept: 'application/json' } }, signal)
    if (!response.ok) throw OpenCloudClient.failure(response, 'list spaces')
    const parsed = z.object({ value: z.array(z.unknown()) }).safeParse(await response.json())
    if (!parsed.success) throw new LibraryError('protocol', 'OpenCloud returned spaces in an unknown format')
    const drives: OpenCloudDrive[] = []
    for (const entry of parsed.data.value) {
      const drive = driveSchema.safeParse(entry)
      if (!drive.success) continue
      const kind = KINDS[drive.data.driveType]
      if (kind === undefined) continue
      const { used, total } = drive.data.quota ?? {}
      drives.push({
        id: drive.data.id, kind, name: drive.data.name, webUrl: drive.data.webUrl ?? '',
        ...used === undefined ? {} : { used }, ...total === undefined || total === 0 ? {} : { total },
      })
    }
    const order: Record<SpaceKind, number> = { personal: 0, project: 1, shares: 2 }
    return drives.sort((a, b) => order[a.kind] - order[b.kind])
  }

  /**
   * Read one item with WebDAV PROPFIND, and for depth `1` also a folder's children.
   * @param driveId - drive.
   * @param path - folder or file inside the drive.
   * @param depth - `0` for the item itself, `1` for a folder and its children.
   * @param signal - cancellation.
   * @returns the item followed by its children when `depth` is `1`.
   */
  async propfind(driveId: string, path: string, depth: 0 | 1, signal: AbortSignal): Promise<OpenCloudItem[]> {
    const response = await this.send(`/dav/spaces/${encodeURIComponent(driveId)}/${davPath(path)}`, {
      method: 'PROPFIND', headers: { depth: String(depth), 'content-type': 'application/xml' }, body: PROPFIND_BODY,
    }, signal)
    if (response.status !== 207) throw OpenCloudClient.failure(response, `read ${path === '' ? 'the space' : path}`)
    return parseMultistatus(await response.text(), driveId)
  }

  /**
   * Download one file with WebDAV GET.
   * @param driveId - drive.
   * @param path - file inside the drive.
   * @param maxBytes - largest accepted file.
   * @param signal - cancellation.
   * @returns the file content.
   * @throws LibraryError `too-large` when the file exceeds `maxBytes`.
   */
  async download(driveId: string, path: string, maxBytes: number, signal: AbortSignal): Promise<Uint8Array> {
    const response = await this.send(`/dav/spaces/${encodeURIComponent(driveId)}/${davPath(path)}`, { method: 'GET' }, signal)
    if (!response.ok) throw OpenCloudClient.failure(response, `download ${path}`)
    const declared = Number(response.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > maxBytes) {
      await response.body?.cancel()
      throw new LibraryError('too-large', `download ${path}: the file has ${declared} bytes; the limit is ${maxBytes}`)
    }
    const chunks: Uint8Array[] = []
    let total = 0
    for await (const chunk of response.body ?? []) {
      total += chunk.byteLength
      if (total > maxBytes) {
        throw new LibraryError('too-large', `download ${path}: the file is larger than the ${maxBytes}-byte limit`)
      }
      chunks.push(chunk)
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return bytes
  }

  /**
   * Create or replace a file; OpenCloud keeps the replaced content as a version. OpenCloud replaces an existing file even
   * when the request carries `If-None-Match: *`, so a caller that must not replace one checks for it first.
   * @param driveId - drive.
   * @param path - file inside the drive; its folder must exist.
   * @param bytes - content.
   * @param signal - cancellation.
   */
  async upload(driveId: string, path: string, bytes: Uint8Array, signal: AbortSignal): Promise<void> {
    const response = await this.send(`/dav/spaces/${encodeURIComponent(driveId)}/${davPath(path)}`, {
      // Library bytes come from ordinary (not shared) array buffers.
      method: 'PUT', body: bytes as Uint8Array<ArrayBuffer>,
    }, signal)
    if (!response.ok) throw OpenCloudClient.failure(response, `save ${path}`)
    await response.body?.cancel()
  }

  /**
   * Create each missing folder of `path`.
   * @param driveId - drive.
   * @param path - folder inside the drive.
   * @param signal - cancellation.
   */
  async createFolders(driveId: string, path: string, signal: AbortSignal): Promise<void> {
    const parts = path.split('/').filter(part => part.length > 0)
    for (let index = 1; index <= parts.length; index += 1) {
      const response = await this.send(`/dav/spaces/${encodeURIComponent(driveId)}/${davPath(parts.slice(0, index).join('/'))}`, {
        method: 'MKCOL',
      }, signal)
      // 405: the folder exists.
      if (!response.ok && response.status !== 405) throw OpenCloudClient.failure(response, `create folder ${parts.slice(0, index).join('/')}`)
      await response.body?.cancel()
    }
  }

  /**
   * Search file and folder names in every drive the member can open.
   * @param query - text contained in the name.
   * @param limit - most results.
   * @param signal - cancellation.
   * @returns matching items, in OpenCloud's relevance order.
   */
  async search(query: string, limit: number, signal: AbortSignal): Promise<OpenCloudItem[]> {
    const pattern = `name:"*${query.replace(/["\\]/g, ' ').trim()}*"`
    const escaped = pattern.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const body = '<?xml version="1.0"?><oc:search-files xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop>'
      + '<d:getcontentlength/><d:getlastmodified/><d:resourcetype/><d:getcontenttype/><oc:size/><oc:permissions/><oc:fileid/></d:prop>'
      + `<oc:search><oc:pattern>${escaped}</oc:pattern><oc:limit>${limit}</oc:limit></oc:search></oc:search-files>`
    const response = await this.send('/dav/spaces/', { method: 'REPORT', headers: { 'content-type': 'application/xml' }, body }, signal)
    if (response.status !== 207) throw OpenCloudClient.failure(response, 'search')
    return parseMultistatus(await response.text())
  }
}
