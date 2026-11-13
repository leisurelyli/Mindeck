/** Pure layout and draft rules of the digital-employee cards. */
import type { MindeckEmployeeCard } from '../types.ts'

/** Cards shown before the member expands the row. */
export const COLLAPSED_CARDS = 6

/**
 * Choose the cards to show. A collapsed row keeps its first cards and, when the selected card lies beyond them,
 * shows it in place of the last one so the selection stays visible.
 * @param cards - every card, general assistant first.
 * @param selected - preset of the Session, if any.
 * @param expanded - whether the member expanded the row.
 * @returns the cards to render, in catalog order.
 */
export function visibleCards(
  cards: readonly MindeckEmployeeCard[], selected: string | undefined, expanded: boolean,
): readonly MindeckEmployeeCard[] {
  if (expanded || cards.length <= COLLAPSED_CARDS) return cards
  const first = cards.slice(0, COLLAPSED_CARDS)
  const chosen = cards.find(card => card.presetId === selected)
  if (chosen === undefined || first.includes(chosen)) return first
  return [...first.slice(0, COLLAPSED_CARDS - 1), chosen]
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
