/** Digital-employee listing from Mindeck Cloud's desktop API. */
import { isSkillName } from '@deepseek-ai/dsh-skill'
import { z } from 'zod'

/** Most starter requests one employee offers. */
export const MAX_STARTERS = 4

/** A library folder a digital employee consults, as Mindeck Cloud lists it. */
export interface EmployeeFolder {
  /** OpenCloud drive id of the folder's space. */
  readonly driveId: string
  /** OpenCloud resource id of the folder; it stays valid when the folder is renamed or moved. */
  readonly itemId: string
  /** Space and folder names as Mindeck Cloud last resolved them, joined with ` / `, such as `企业空间 / 制度文件`. */
  readonly path: string
  /** Name the company gave the material, such as `企业制度`. */
  readonly label: string
  /** Whether the member's department may open the folder, as Mindeck Cloud judges it by space membership. */
  readonly accessible: boolean
}

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
  /**
   * Model id (the `id` of `GET {endpoints.models}`) new conversations with the employee start on; null when the
   * employee has none or the member may not use it.
   */
  readonly defaultModel: string | null
  /** Library folders the employee consults, each resource id once. */
  readonly folders: readonly EmployeeFolder[]
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
  defaultModel: z.string().nullish(),
  folders: z.array(z.unknown()).nullish(),
})

/** One line of text: each run of white space, line breaks included, becomes one space. */
function oneLine(text: string): string {
  return text.replace(/\s+/gu, ' ').trim()
}

const folderSchema = z.object({
  driveId: z.string().min(1),
  itemId: z.string().min(1),
  path: z.string().transform(oneLine),
  label: z.string().transform(oneLine).pipe(z.string().min(1)),
  accessible: z.boolean().nullish(),
})

/**
 * Validate an employee's folders; unusable entries and repeated resource ids are left out.
 * @param entries - untrusted folder entries.
 * @returns the usable folders in Cloud order; an entry without `accessible` counts as accessible, so OpenCloud decides.
 */
function parseFolders(entries: readonly unknown[]): EmployeeFolder[] {
  const seen = new Set<string>()
  const folders: EmployeeFolder[] = []
  for (const entry of entries) {
    const parsed = folderSchema.safeParse(entry)
    if (!parsed.success || seen.has(parsed.data.itemId)) continue
    seen.add(parsed.data.itemId)
    const { driveId, itemId, path, label, accessible } = parsed.data
    folders.push({ driveId, itemId, path: path === '' ? label : path, label, accessible: accessible !== false })
  }
  return folders
}

/**
 * Validate one listing body; unusable entries and repeated ids are left out. A Mindeck Cloud that predates default
 * models and library folders lists employees without them.
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
    const { id, name, avatar, tagline, instructions, starters, skills, draft, defaultModel, folders } = parsed.data
    seen.add(id)
    employees.push({
      id, name,
      avatar: avatar != null && AVATAR_KEY.test(avatar) ? avatar : 'general',
      tagline: tagline?.trim() ?? '',
      instructions: instructions?.trim() ?? '',
      starters: [...new Set((starters ?? []).map(text => text.trim()).filter(text => text !== ''))].slice(0, MAX_STARTERS),
      skills: [...new Set((skills ?? []).map(skill => skill.trim()).filter(isSkillName))],
      draft: draft === true,
      defaultModel: defaultModel != null && defaultModel.trim() !== '' ? defaultModel.trim() : null,
      folders: parseFolders(folders ?? []),
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
