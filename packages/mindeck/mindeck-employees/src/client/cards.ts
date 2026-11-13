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
 * Pick the character a fallback avatar shows.
 * @param name - the card's name.
 * @returns the first character shown when the avatar image is unavailable.
 */
export function avatarInitial(name: string): string {
  return Array.from(name.trim())[0] ?? ''
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
