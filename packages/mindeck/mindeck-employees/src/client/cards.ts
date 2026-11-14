/** Pure listing and draft rules of the digital-employee page. */
import type { MindeckEmployeeCatalog } from '../types.ts'

/**
 * Whether the company offers at least one digital employee besides the general assistant.
 * @param catalog - the streamed cards, if any.
 * @returns whether the digital-employee page and its sidebar row appear.
 */
export function offersEmployees(catalog: MindeckEmployeeCatalog | undefined): boolean {
  return catalog?.cards.some(card => card.kind === 'employee') === true
}

/**
 * Place a starter request in a draft: it replaces a draft of only white space and otherwise starts a new line
 * after the existing text.
 * @param draft - the current draft text.
 * @param starter - the starter request.
 * @returns the text to insert and the draft range it replaces.
 */
export function starterInsertion(draft: string, starter: string): { text: string; start: number; end: number } {
  if (draft.trim() === '') return { text: starter, start: 0, end: draft.length }
  return { text: draft.endsWith('\n') ? starter : `\n${starter}`, start: draft.length, end: draft.length }
}

/**
 * Pick the text a fallback avatar shows, as Mindeck Cloud's console does: a leading Latin word or number, such as
 * `IT` for `IT 帮助台`, or else the first two characters, such as `合同` for `合同审查专员`.
 * @param name - the card's name.
 * @returns up to two characters shown when the avatar image is unavailable.
 */
export function avatarInitial(name: string): string {
  const trimmed = name.trim()
  const latin = /^[A-Za-z0-9]+/u.exec(trimmed)
  if (latin !== null) return latin[0].slice(0, 2).toUpperCase()
  return Array.from(trimmed).slice(0, 2).join('')
}

/** Number of tints a fallback avatar can take. */
const TINTS = 4

/**
 * Pick a stable tint for a fallback avatar, so one avatar key keeps one color.
 * @param key - the avatar key.
 * @returns a tint index from 0 through 3.
 */
export function avatarTint(key: string): number {
  let hash = 0
  for (const character of key) hash = (hash * 31 + (character.codePointAt(0) ?? 0)) % 9973
  return hash % TINTS
}
