/** Member-facing names of library paths: the fixed space names in the member's language. */
import { PERSONAL_SPACE, SHARED_SPACE } from '../reference.ts'
import type { MindeckFilesKey } from './locales.ts'

/** Name and place of one library item as the member reads it. */
export interface LibraryLabel {
  /** Item name; a space's member-facing name for a space path. */
  readonly name: string
  /** Space and folders that hold the item, joined with ` / `; empty for a space. */
  readonly location: string
}

/**
 * Name a library path for the member: `/Personal/报告/周报.md` reads as `周报.md` in `我的文件 / 报告`.
 * @param path - library path; a trailing `/` is ignored.
 * @param t - translator of the panel namespace.
 * @returns the item name and the place that holds it.
 */
export function libraryLabel(path: string, t: (key: MindeckFilesKey) => string): LibraryLabel {
  const segments = path.split('/').filter(segment => segment !== '')
  const parts = segments.map((segment, index) => index > 0 ? segment
    : segment === PERSONAL_SPACE ? t('personal') : segment === SHARED_SPACE ? t('shares') : segment)
  return { name: parts.at(-1) ?? '', location: parts.slice(0, -1).join(' / ') }
}
