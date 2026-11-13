/** Digital-employee listing from Mindeck Cloud's desktop API. */
import { isSkillName } from '@deepseek-ai/dsh-skill'
import { z } from 'zod'

/** Most starter requests one employee offers. */
export const MAX_STARTERS = 4

/** One digital employee as Mindeck Cloud lists it, after validation. */
export interface CloudEmployee {
  /** Cloud id; letters, digits, `-`, and `_`, so it can name an agent preset. */
  readonly id: string
  readonly name: string
  readonly avatar: string
  readonly tagline: string
  /** The company's role instructions, used verbatim in the employee's persona. */
  readonly instructions: string
  readonly starters: readonly string[]
  /** Company skill names suggested for the role. */
  readonly skills: readonly string[]
  readonly draft: boolean
}

/** A listing read from Mindeck Cloud. */
export interface EmployeeListing {
  /** Employees in Cloud order, each id once. */
  readonly employees: readonly CloudEmployee[]
  /** Entries left out because their format or id was not usable. */
  readonly skipped: number
}

const EMPLOYEE_ID = /^[A-Za-z0-9_-]{1,128}$/
const AVATAR_KEY = /^[a-z0-9-]{1,32}$/

const employeeSchema = z.object({
  id: z.string().regex(EMPLOYEE_ID),
  name: z.string().trim().min(1),
  avatar: z.string().nullish(),
  tagline: z.string().nullish(),
  instructions: z.string().nullish(),
  starters: z.array(z.string()).nullish(),
  skills: z.array(z.string()).nullish(),
  draft: z.boolean().nullish(),
})

/**
 * Validate one listing body; unusable entries and repeated ids are left out.
 * @param body - untrusted JSON from `GET {endpoints.employees}`.
 * @returns the usable employees in Cloud order and the number left out.
 * @throws Error when the body is not an employee listing.
 */
export function parseEmployees(body: unknown): EmployeeListing {
  const listing = z.object({ employees: z.array(z.unknown()) }).safeParse(body)
  if (!listing.success) throw new Error('Mindeck Cloud returned a digital-employee listing in an unknown format')
  const seen = new Set<string>()
  const employees: CloudEmployee[] = []
  for (const entry of listing.data.employees) {
    const parsed = employeeSchema.safeParse(entry)
    if (!parsed.success || seen.has(parsed.data.id)) continue
    const { id, name, avatar, tagline, instructions, starters, skills, draft } = parsed.data
    seen.add(id)
    employees.push({
      id, name,
      avatar: avatar != null && AVATAR_KEY.test(avatar) ? avatar : 'general',
      tagline: tagline?.trim() ?? '',
      instructions: instructions?.trim() ?? '',
      starters: [...new Set((starters ?? []).map(text => text.trim()).filter(text => text !== ''))].slice(0, MAX_STARTERS),
      skills: [...new Set((skills ?? []).map(skill => skill.trim()).filter(isSkillName))],
      draft: draft === true,
    })
  }
  return { employees, skipped: listing.data.employees.length - employees.length }
}

/**
 * List the digital employees the member can use; an administrator also receives their own drafts.
 * @param url - the bootstrap `endpoints.employees` URL.
 * @param token - desktop session token.
 * @param signal - cancellation and timeout.
 * @returns the listing, or `sign-in-required` when Mindeck Cloud rejects the token.
 * @throws Error when Mindeck Cloud is unreachable, fails, or answers in an unknown format.
 */
export async function fetchEmployees(url: string, token: string, signal: AbortSignal): Promise<EmployeeListing | 'sign-in-required'> {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, redirect: 'error', signal })
  if (response.status === 401) return 'sign-in-required'
  if (!response.ok) throw new Error(`Mindeck Cloud digital-employee request failed with HTTP ${response.status}`)
  return parseEmployees(await response.json())
}
