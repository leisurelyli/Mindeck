/** Composer reference form of a library path, shared by the Host tools and the Client panel. */

/** Prefix that composer references put before a library path; the tools accept paths with or without it. */
export const LIBRARY_REFERENCE_PREFIX = 'library:'

/** A library reference found in message text. */
export interface LibraryReferenceMatch {
  /** UTF-16 offset of the prefix. */
  readonly start: number
  /** UTF-16 offset after the reference, including a closing quote. */
  readonly end: number
  /** Library path; a folder path ends with `/`. */
  readonly path: string
}

/**
 * The path is always quoted, so a reference ends at a clear point inside a sentence, before punctuation or text typed
 * right after it; a folder path ends with `/`. Example: `library:"/Shared with me/weekly report.md"`.
 * @param path - library path.
 * @param folder - whether the entry is a folder.
 * @returns the reference text.
 */
export function libraryReference(path: string, folder: boolean): string {
  return `${LIBRARY_REFERENCE_PREFIX}"${folder && !path.endsWith('/') ? `${path}/` : path}"`
}

/**
 * Read the library path out of a reference.
 * @param text - a library path, or a reference with or without quotes.
 * @returns the library path, or the text unchanged when it has no reference prefix.
 */
export function libraryPathOf(text: string): string {
  if (!text.startsWith(LIBRARY_REFERENCE_PREFIX)) return text
  const rest = text.slice(LIBRARY_REFERENCE_PREFIX.length)
  return rest.length >= 2 && rest.startsWith('"') && rest.endsWith('"') ? rest.slice(1, -1) : rest
}

/**
 * Find the first quoted reference at or after an offset. It ends at the first closing quote on the same line, so a path
 * that itself contains a quote is not found.
 * @param text - message text.
 * @param from - inclusive UTF-16 offset where the search starts.
 * @returns the reference, or undefined when none follows.
 */
export function findLibraryReference(text: string, from: number): LibraryReferenceMatch | undefined {
  const pattern = /library:"(\/[^"\n]*)"/gu
  pattern.lastIndex = from
  const found = pattern.exec(text)
  return found === null ? undefined : { start: found.index, end: found.index + found[0].length, path: found[1] ?? '' }
}
