/** Skill listing and skill content from Mindeck Cloud's desktop API. */
import { z } from 'zod'
import type { MindeckSkillView } from './types.ts'

const summarySchema = z.object({
  name: z.string().min(1),
  hash: z.string().min(1),
  displayName: z.string().nullish(),
  category: z.string().nullish(),
  description: z.string().default(''),
  recommended: z.boolean().default(false),
  searchKeys: z.array(z.string()).default([]),
})

const fileSchema = z.object({
  path: z.string().min(1),
  encoding: z.enum(['utf8', 'base64']),
  content: z.string(),
})

const detailSchema = z.object({
  name: z.string().min(1),
  hash: z.string().min(1),
  files: z.array(fileSchema),
})

/** One skill the member receives; `hash` identifies the content of its current version. */
export interface SkillSummary extends MindeckSkillView {
  readonly hash: string
}

/** One file of a skill, relative to the skill directory with `/` separators. */
export interface SkillFile {
  readonly path: string
  readonly encoding: 'utf8' | 'base64'
  readonly content: string
}

/** Every file of one skill's current version. */
export interface SkillDetail {
  readonly name: string
  readonly hash: string
  readonly files: readonly SkillFile[]
}

/** Mindeck Cloud refused the session token (HTTP 401). */
export class SkillSignInRequired extends Error {
  constructor() { super('Mindeck Cloud requires signing in again') }
}

function blankToNull(value: string | null | undefined): string | null {
  const text = value?.trim() ?? ''
  return text === '' ? null : text
}

async function getJson(url: string, token: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, redirect: 'error', signal })
  if (response.status === 401) throw new SkillSignInRequired()
  if (!response.ok) throw new Error(`Mindeck Cloud skill request failed with HTTP ${response.status}`)
  return await response.json()
}

/**
 * List the member's skills.
 * @param url - the bootstrap `endpoints.skills` URL.
 * @param token - desktop session token.
 * @param signal - cancellation and timeout.
 * @returns the skills in Cloud order; an older Mindeck Cloud without listing details yields empty ones.
 * @throws SkillSignInRequired when the token is refused; Error for other failures.
 */
export async function listSkills(url: string, token: string, signal: AbortSignal): Promise<SkillSummary[]> {
  const parsed = z.object({ skills: z.array(summarySchema) }).safeParse(await getJson(url, token, signal))
  if (!parsed.success) throw new Error('Mindeck Cloud returned a skill listing in an unknown format')
  return parsed.data.skills.map(skill => ({
    name: skill.name, hash: skill.hash, displayName: blankToNull(skill.displayName), category: blankToNull(skill.category),
    description: skill.description, recommended: skill.recommended, searchKeys: skill.searchKeys.map(key => key.toLowerCase()),
  }))
}

/**
 * Read every file of one skill.
 * @param url - the bootstrap `endpoints.skills` URL.
 * @param name - skill name from {@link listSkills}.
 * @param token - desktop session token.
 * @param signal - cancellation and timeout.
 * @returns the skill's files.
 * @throws SkillSignInRequired when the token is refused; Error for other failures.
 */
export async function readSkill(url: string, name: string, token: string, signal: AbortSignal): Promise<SkillDetail> {
  const parsed = detailSchema.safeParse(await getJson(`${url}/${encodeURIComponent(name)}`, token, signal))
  if (!parsed.success || parsed.data.name !== name) throw new Error(`Mindeck Cloud returned skill "${name}" in an unknown format`)
  return parsed.data
}
