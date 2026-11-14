/**
 * The digital employees each member last received on this computer, kept so their agent presets register
 * before Mindeck Cloud answers and so conversations with a retired employee can continue.
 */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'
import type { CloudEmployee } from './cloud.ts'

/** The member a listing belongs to: one account on one Mindeck Cloud. */
export interface EmployeeOwner {
  readonly cloudUrl: string
  readonly userId: string
}

/** One cached employee; a retired one has left the Cloud listing and keeps its last known definition. */
export interface CachedEmployee extends CloudEmployee {
  readonly retired: boolean
}

/** Every member's cached employees on this computer. */
export interface EmployeeCache {
  /** The member who signed in last, whose employees register while signed out; null before any sign-in. */
  readonly last: EmployeeOwner | null
  /** Each member's employees: current ones in Cloud order, then retired ones. */
  readonly owners: ReadonlyArray<EmployeeOwner & { readonly employees: readonly CachedEmployee[] }>
}

/** A cache with no member. */
export const EMPTY_CACHE: EmployeeCache = { last: null, owners: [] }

const ownerSchema = z.object({ cloudUrl: z.string(), userId: z.string() })
const folderSchema = z.object({
  driveId: z.string(), itemId: z.string(), path: z.string(), label: z.string(), accessible: z.boolean(),
})
// Default models and folders came after version 1, so files written before them read with neither.
const employeeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  avatar: z.string(),
  tagline: z.string(),
  instructions: z.string(),
  starters: z.array(z.string()),
  skills: z.array(z.string()),
  draft: z.boolean(),
  retired: z.boolean(),
  defaultModel: z.string().nullable().default(null),
  folders: z.array(folderSchema).default([]),
})
const cacheSchema = z.object({
  version: z.literal(1),
  last: ownerSchema.nullable(),
  owners: z.array(ownerSchema.extend({ employees: z.array(employeeSchema) })),
})

/**
 * Compare two members.
 * @param a - one member.
 * @param b - another member, or none.
 * @returns whether both name the same account on the same Mindeck Cloud.
 */
export function sameOwner(a: EmployeeOwner, b: EmployeeOwner | null | undefined): boolean {
  return b != null && a.cloudUrl === b.cloudUrl && a.userId === b.userId
}

/**
 * Read one member's cached employees.
 * @param cache - the cache.
 * @param owner - the member.
 * @returns the member's cached employees, or an empty list.
 */
export function employeesOf(cache: EmployeeCache, owner: EmployeeOwner): readonly CachedEmployee[] {
  return cache.owners.find(entry => sameOwner(entry, owner))?.employees ?? []
}

/**
 * Record a member's employees and make that member the last one.
 * @param cache - the current cache.
 * @param owner - the member.
 * @param employees - the member's employees; omitted keeps the cached ones.
 * @returns the new cache.
 */
export function withOwner(cache: EmployeeCache, owner: EmployeeOwner, employees?: readonly CachedEmployee[]): EmployeeCache {
  const entry = { cloudUrl: owner.cloudUrl, userId: owner.userId, employees: employees ?? employeesOf(cache, owner) }
  return {
    last: { cloudUrl: owner.cloudUrl, userId: owner.userId },
    owners: [...cache.owners.filter(other => !sameOwner(other, owner)), entry],
  }
}

/**
 * Merge a new Cloud listing into a member's cached employees. Listed employees come first in Cloud order;
 * cached employees missing from the listing stay, marked retired, after them in their previous order.
 * @param cached - the member's cached employees.
 * @param listed - the employees Mindeck Cloud lists now.
 * @returns the member's employees to cache and register.
 */
export function mergeListing(cached: readonly CachedEmployee[], listed: readonly CloudEmployee[]): CachedEmployee[] {
  const current = new Set(listed.map(employee => employee.id))
  return [
    ...listed.map(employee => ({ ...employee, retired: false })),
    ...cached.filter(employee => !current.has(employee.id)).map(employee => ({ ...employee, retired: true })),
  ]
}

/**
 * Read the cache; a missing, damaged, or unknown file reads as empty.
 * @param file - cache file path.
 * @returns the cache.
 * @throws Error when the file exists but cannot be read.
 */
export async function readCache(file: string): Promise<EmployeeCache> {
  let text: string
  try { text = await readFile(file, 'utf8') }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return EMPTY_CACHE
    throw error
  }
  let body: unknown
  try { body = JSON.parse(text) }
  catch { return EMPTY_CACHE } // SyntaxError: a damaged file holds no listing; the next save replaces it.
  const parsed = cacheSchema.safeParse(body)
  return parsed.success ? { last: parsed.data.last, owners: parsed.data.owners } : EMPTY_CACHE
}

/**
 * Replace the cache; a reader sees the previous file or the new one, never a partial write.
 * @param file - cache file path.
 * @param cache - the cache to keep.
 */
export async function writeCache(file: string, cache: EmployeeCache): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const temporary = `${file}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify({ version: 1, ...cache }, null, 2)}\n`, 'utf8')
  await rename(temporary, file)
}
