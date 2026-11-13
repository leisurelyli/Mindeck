/** Search and grouping of the skills page. */
import type { MindeckSkillView } from '../types.ts'

/** One skill row of the page. */
export interface SkillRowView {
  /** Skill name, typed as `/name`. */
  readonly name: string
  /** Name shown first: the company's display name, or the skill name. */
  readonly title: string
  readonly description: string
  /** SKILL.md of the skill in this conversation, when the conversation lists it. */
  readonly path?: string
}

/** Heading of one section: the recommended skills, a company category, ungrouped company skills, or Mindeck's own skills. */
export type SectionHeading =
  | { readonly kind: 'recommended' }
  | { readonly kind: 'category'; readonly name: string }
  | { readonly kind: 'other' }
  | { readonly kind: 'built-in' }

/** One titled group of rows. */
export interface SkillSection {
  readonly key: string
  readonly heading: SectionHeading
  readonly rows: readonly SkillRowView[]
}

/** One skill of the conversation's catalog. */
export interface SessionSkill {
  readonly name: string
  readonly description: string
  readonly path?: string
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
 * Group the page: the company's recommended skills, then each company category in reading order,
 * then ungrouped company skills, then the conversation's other skills. Sections without a matching
 * skill are left out.
 * @param company - company skills in Mindeck Cloud order.
 * @param session - the conversation's skills, including the company's, or undefined before they are read.
 * @param query - search text.
 * @returns the non-empty sections.
 */
export function skillSections(
  company: readonly MindeckSkillView[], session: readonly SessionSkill[] | undefined, query: string,
): SkillSection[] {
  const paths = new Map((session ?? []).flatMap(skill => skill.path === undefined ? [] : [[skill.name, skill.path] as const]))
  const withPath = (name: string, title: string, description: string): SkillRowView => {
    const path = paths.get(name)
    return { name, title, description, ...path === undefined ? {} : { path } }
  }
  const row = (skill: MindeckSkillView): SkillRowView => withPath(skill.name, skill.displayName ?? skill.name, skill.description)
  const shown = company.filter(skill =>
    matchesSkill([skill.name, skill.displayName, skill.category, skill.description], skill.searchKeys, query))
  const sections: SkillSection[] = []
  const add = (key: string, heading: SectionHeading, rows: readonly SkillRowView[]): void => {
    if (rows.length > 0) sections.push({ key, heading, rows })
  }
  add('recommended', { kind: 'recommended' }, shown.filter(skill => skill.recommended).map(row))
  const rest = shown.filter(skill => !skill.recommended)
  // Chinese reading order, as Mindeck Cloud orders the skills themselves.
  const collator = new Intl.Collator('zh-CN')
  const categories = [...new Set(rest.flatMap(skill => skill.category === null ? [] : [skill.category]))]
    .sort((a, b) => collator.compare(a, b))
  for (const name of categories) {
    add(`category:${name}`, { kind: 'category', name }, rest.filter(skill => skill.category === name).map(row))
  }
  add('other', { kind: 'other' }, rest.filter(skill => skill.category === null).map(row))
  const companyNames = new Set(company.map(skill => skill.name))
  add('built-in', { kind: 'built-in' }, (session ?? [])
    .filter(skill => !companyNames.has(skill.name) && matchesSkill([skill.name, skill.description], [], query))
    .map(skill => withPath(skill.name, skill.name, skill.description)))
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
