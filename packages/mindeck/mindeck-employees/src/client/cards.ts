/** Pure layout and draft rules of the digital-employee cards and page. */
import type { MindeckEmployeeCard, MindeckEmployeeCatalog } from '../types.ts'

/** Cards the row shows; the digital-employee page lists every card. */
export const COLLAPSED_CARDS = 6

/**
 * Choose the cards to show: the first cards and, when the selected card lies beyond them, the selected card in place
 * of the last one so the selection stays visible.
 * @param cards - every card, general assistant first.
 * @param selected - preset of the Session, if any.
 * @returns the cards to render, in catalog order.
 */
export function visibleCards(cards: readonly MindeckEmployeeCard[], selected: string | undefined): readonly MindeckEmployeeCard[] {
  if (cards.length <= COLLAPSED_CARDS) return cards
  const first = cards.slice(0, COLLAPSED_CARDS)
  const chosen = cards.find(card => card.presetId === selected)
  if (chosen === undefined || first.includes(chosen)) return first
  return [...first.slice(0, COLLAPSED_CARDS - 1), chosen]
}

/**
 * Whether the company offers at least one digital employee besides the general assistant.
 * @param catalog - the streamed cards, if any.
 * @returns whether the cards and the digital-employee page appear.
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
