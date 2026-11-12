/** Skill listing and skill content from Mindeck Cloud's desktop API. */
import { z } from 'zod'

const summarySchema = z.object({
  name: z.string().min(1),
  hash: z.string().min(1),
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
export interface SkillSummary {
  readonly name: string
  readonly hash: string
}

/** One file of a skill, relative to the skill directory with `/` separators. */
export interface SkillFile {
  readonly path: string
  readonly encoding: 'utf8' | 'base64'
  readonly content: string
}

/** Every file of one skill's current version. */
export interface SkillDetail extends SkillSummary {
  readonly files: readonly SkillFile[]
}

/** Mindeck Cloud refused the session token (HTTP 401). */
export class SkillSignInRequired extends Error {
  constructor() { super('Mindeck Cloud requires signing in again') }
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
 * @returns the skills in Cloud order.
 * @throws SkillSignInRequired when the token is refused; Error for other failures.
 */
export async function listSkills(url: string, token: string, signal: AbortSignal): Promise<SkillSummary[]> {
  const parsed = z.object({ skills: z.array(summarySchema) }).safeParse(await getJson(url, token, signal))
  if (!parsed.success) throw new Error('Mindeck Cloud returned a skill listing in an unknown format')
  return parsed.data.skills
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
