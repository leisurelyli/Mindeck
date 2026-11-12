/** Library paths: `/<space>/<folders>/<file>`, where a space is one OpenCloud drive named for the model and the panel. */
import { LibraryError, type OpenCloudDrive, type SpaceKind } from './opencloud.ts'

/** Space name of the member's own drive. */
export const PERSONAL_SPACE = 'Personal'
/** Space name of the items other members share with the member. */
export const SHARED_SPACE = 'Shared with me'

/** One space of the file library. */
export interface LibrarySpace {
  /** Unique name; the first segment of a library path. */
  readonly name: string
  readonly kind: SpaceKind
  readonly driveId: string
  /** Page that opens the space in the OpenCloud web app. */
  readonly webUrl: string
  readonly used?: number
  readonly total?: number
}

/** A library path split into its space and the path inside the space. */
export interface LibraryLocation {
  readonly space: LibrarySpace
  /** Path inside the space with `/` separators; empty for the space root. */
  readonly inner: string
}

/**
 * Name each drive: the personal drive is {@link PERSONAL_SPACE}, the shares drive {@link SHARED_SPACE}, and a
 * company or department space keeps its OpenCloud name. A repeated name gets the start of its drive id appended.
 * @param drives - drives in display order.
 * @returns spaces in the same order with unique names.
 */
export function nameSpaces(drives: readonly OpenCloudDrive[]): LibrarySpace[] {
  const taken = new Set<string>()
  return drives.map((drive) => {
    const base = drive.kind === 'personal' ? PERSONAL_SPACE : drive.kind === 'shares' ? SHARED_SPACE : drive.name.replaceAll('/', '-')
    const name = taken.has(base) ? `${base} (${drive.id.slice(0, 8)})` : base
    taken.add(name)
    const { used, total } = drive
    return {
      name, kind: drive.kind, driveId: drive.id, webUrl: drive.webUrl,
      ...used === undefined ? {} : { used }, ...total === undefined ? {} : { total },
    }
  })
}

/**
 * Split a library path into its space name and the segments inside the space.
 * @param path - library path such as `/Personal/reports/weekly.md`; the leading slash is optional.
 * @returns the space name and the path segments inside it.
 * @throws LibraryError `not-found` for an empty path, a `.` or `..` segment, or a backslash.
 */
export function splitLibraryPath(path: string): { space: string; segments: string[] } {
  if (path.includes('\\')) throw new LibraryError('not-found', `"${path}" is not a library path: use "/" between folders`)
  const segments = path.split('/').filter(part => part.length > 0)
  if (segments.some(part => part === '.' || part === '..')) {
    throw new LibraryError('not-found', `"${path}" is not a library path: "." and ".." are not allowed`)
  }
  const [space, ...rest] = segments
  if (space === undefined) throw new LibraryError('not-found', 'the library path is empty; start it with a space name such as /Personal')
  return { space, segments: rest }
}

/**
 * Find the space that a library path starts with.
 * @param path - library path.
 * @param spaces - the member's spaces.
 * @returns the space and the path inside it.
 * @throws LibraryError `not-found` when no space has the path's first segment as its name.
 */
export function locate(path: string, spaces: readonly LibrarySpace[]): LibraryLocation {
  const { space: name, segments } = splitLibraryPath(path)
  const space = spaces.find(candidate => candidate.name === name)
  if (space === undefined) {
    throw new LibraryError('not-found', `no space is named "${name}"; the spaces are ${spaces.map(item => `"${item.name}"`).join(', ')}`)
  }
  return { space, inner: segments.join('/') }
}

/**
 * Join a space name and a path inside it into a library path.
 * @param space - space name.
 * @param inner - path inside the space.
 * @returns the library path.
 */
export function libraryPath(space: string, inner: string): string {
  return inner === '' ? `/${space}` : `/${space}/${inner}`
}
