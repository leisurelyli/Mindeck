/** Search and grouping of the skills page, and the draft text that uses a skill. */
import type { MindeckSkillView } from '../types.ts'

/** Heading of one section: the recommended skills, a company category, or the ungrouped company skills. */
export type SectionHeading =
  | { readonly kind: 'recommended' }
  | { readonly kind: 'category'; readonly name: string }
  | { readonly kind: 'other' }

/** One titled group of skills. */
export interface SkillSection {
  readonly key: string
  readonly heading: SectionHeading
  readonly skills: readonly MindeckSkillView[]
}

/**
 * Whether a skill matches a search: one of its texts contains the query, or one of its pinyin keys
 * does. A single letter only matches the start of a key, so it does not match nearly every Chinese name.
 * @param texts - names and description.
 * @param keys - lowercase pinyin keys.
 * @param query - text the member typed.
 * @returns whether the skill stays listed.
 */
export function matchesSkill(texts: readonly (string | null)[], keys: readonly string[], query: string): boolean {
  const text = query.trim().toLowerCase()
  if (text === '') return true
  const compact = text.replace(/\s+/gu, '')
  return texts.some(value => value?.toLowerCase().includes(text) === true)
    || keys.some(key => compact.length > 1 ? key.includes(compact) : key.startsWith(compact))
}

/**
 * Group the page: the company's recommended skills, then each company category in Chinese reading order,
 * then the ungrouped skills. Sections without a matching skill are left out.
 * @param company - company skills in Mindeck Cloud order.
 * @param query - search text.
 * @returns the non-empty sections.
 */
export function skillSections(company: readonly MindeckSkillView[], query: string): SkillSection[] {
  const shown = company.filter(skill =>
    matchesSkill([skill.name, skill.displayName, skill.category, skill.description], skill.searchKeys, query))
  const sections: SkillSection[] = []
  const add = (key: string, heading: SectionHeading, skills: readonly MindeckSkillView[]): void => {
    if (skills.length > 0) sections.push({ key, heading, skills })
  }
  add('recommended', { kind: 'recommended' }, shown.filter(skill => skill.recommended))
  const rest = shown.filter(skill => !skill.recommended)
  // Chinese reading order, as Mindeck Cloud orders the skills themselves.
  const collator = new Intl.Collator('zh-CN')
  const categories = [...new Set(rest.flatMap(skill => skill.category === null ? [] : [skill.category]))]
    .sort((a, b) => collator.compare(a, b))
  for (const name of categories) add(`category:${name}`, { kind: 'category', name }, rest.filter(skill => skill.category === name))
  add('other', { kind: 'other' }, rest.filter(skill => skill.category === null))
  return sections
}

/**
 * Text that puts a skill at the start of a draft: a leading `/name ` replaces the skill already there.
 * @param draft - current draft text.
 * @param name - skill to use.
 * @returns the replaced span's end and the inserted text.
 */
export function skillInsertion(draft: string, name: string): { readonly end: number; readonly text: string } {
  const leading = /^\/[a-z0-9][a-z0-9-]*(?:\s+|$)/u.exec(draft)
  return { end: leading?.[0].length ?? 0, text: `/${name} ` }
}
