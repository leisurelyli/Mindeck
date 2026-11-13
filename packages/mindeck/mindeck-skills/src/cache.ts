/** The local copy of the member's skills: one directory per skill plus a manifest of their hashes. */
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { isSkillName } from '@deepseek-ai/dsh-skill'
import { z } from 'zod'
import type { SkillDetail } from './cloud.ts'
import type { MindeckSkillView } from './types.ts'

/** Owner and content of the cached skills. */
export interface CacheManifest {
  readonly cloudUrl: string
  readonly userId: string
  /** Content hash of each cached skill by name. */
  readonly skills: Readonly<Record<string, string>>
  /** How the cached skills are listed, in Mindeck Cloud order; empty in a manifest written before listings were kept. */
  readonly listing: readonly MindeckSkillView[]
}

const viewSchema = z.object({
  name: z.string(),
  displayName: z.string().nullable(),
  category: z.string().nullable(),
  description: z.string(),
  recommended: z.boolean(),
  searchKeys: z.array(z.string()),
})

const manifestSchema = z.object({
  version: z.literal(1),
  cloudUrl: z.string(),
  userId: z.string(),
  skills: z.record(z.string(), z.string()),
  listing: z.array(viewSchema).default([]),
})

/** Limits applied to one downloaded skill. */
export interface SkillLimits {
  readonly maxBytes: number
  readonly maxFiles: number
}

/** Directories of one cache. */
export interface CacheLayout {
  /** Skill root the filesystem provider reads; holds only skill directories. */
  readonly skills: string
  /** Same-volume directory where a skill is assembled before it replaces the cached copy. */
  readonly staging: string
  readonly manifest: string
}

/**
 * Name the locations inside the skill cache.
 * @param base - cache directory.
 * @returns the skill root, staging directory, and manifest path inside it.
 */
export function cacheLayout(base: string): CacheLayout {
  return { skills: join(base, 'skills'), staging: join(base, 'staging'), manifest: join(base, 'skills.json') }
}

/**
 * Read the manifest; a missing or unreadable one means an empty cache.
 * @param layout - cache directories.
 * @returns the manifest, or undefined.
 */
export async function readManifest(layout: CacheLayout): Promise<CacheManifest | undefined> {
  let text: string
  try { text = await readFile(layout.manifest, 'utf8') }
  catch (_error) { return undefined } // No manifest yet: the cache starts empty.
  let parsed: unknown
  try { parsed = JSON.parse(text) }
  catch (_error) { return undefined } // A torn write: rebuild the cache from Mindeck Cloud.
  const result = manifestSchema.safeParse(parsed)
  if (!result.success) return undefined
  const { cloudUrl, userId, skills, listing } = result.data
  return { cloudUrl, userId, skills, listing }
}

/**
 * Replace the manifest atomically.
 * @param layout - cache directories.
 * @param manifest - the new manifest.
 */
export async function writeManifest(layout: CacheLayout, manifest: CacheManifest): Promise<void> {
  await mkdir(dirname(layout.manifest), { recursive: true })
  const temporary = `${layout.manifest}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify({ version: 1, ...manifest }, null, 2)}\n`)
  await rename(temporary, layout.manifest)
}

/**
 * Check a file path from Mindeck Cloud before writing it under a skill directory.
 * @param path - relative path with `/` separators.
 * @returns whether the path stays inside the skill directory on every platform.
 */
export function isSafeSkillPath(path: string): boolean {
  if (path.length === 0 || path.length > 512 || path.startsWith('/') || /[\\:*?"<>|\0]/.test(path)) return false
  return path.split('/').every(segment => segment.length > 0 && segment !== '.' && segment !== '..'
    && !/[. ]$/.test(segment) && !/^(?:con|prn|aux|nul|com\d|lpt\d)(?:\..*)?$/i.test(segment))
}

/**
 * Decode and check every file of a skill.
 * @param detail - files from Mindeck Cloud.
 * @param limits - size and file-count limits.
 * @returns each file's path and bytes.
 * @throws Error naming the first problem.
 */
export function skillFiles(detail: SkillDetail, limits: SkillLimits): Array<{ path: string; bytes: Buffer }> {
  if (!isSkillName(detail.name)) throw new Error(`skill name "${detail.name}" is not valid`)
  if (detail.files.length > limits.maxFiles) throw new Error(`skill "${detail.name}" has more than ${limits.maxFiles} files`)
  const seen = new Set<string>()
  let total = 0
  const files = detail.files.map((file) => {
    if (!isSafeSkillPath(file.path)) throw new Error(`skill "${detail.name}" has an unsafe file path`)
    const key = file.path.toLowerCase()
    if (seen.has(key)) throw new Error(`skill "${detail.name}" repeats the file path ${file.path}`)
    seen.add(key)
    const bytes = Buffer.from(file.content, file.encoding === 'base64' ? 'base64' : 'utf8')
    total += bytes.byteLength
    if (total > limits.maxBytes) throw new Error(`skill "${detail.name}" is larger than ${limits.maxBytes} bytes`)
    return { path: file.path, bytes }
  })
  if (!seen.has('skill.md')) throw new Error(`skill "${detail.name}" has no SKILL.md`)
  return files
}

/**
 * Write a skill into the staging directory, then replace its cached copy.
 * @param layout - cache directories.
 * @param name - skill name, already validated.
 * @param files - decoded files.
 */
export async function installSkill(
  layout: CacheLayout, name: string, files: ReadonlyArray<{ path: string; bytes: Buffer }>,
): Promise<void> {
  const staged = join(layout.staging, `${name}-${randomUUID()}`)
  try {
    for (const file of files) {
      const target = join(staged, ...file.path.split('/'))
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, file.bytes)
    }
    await mkdir(layout.skills, { recursive: true })
    const target = join(layout.skills, name)
    await rm(target, { recursive: true, force: true })
    await rename(staged, target)
  } finally {
    await rm(staged, { recursive: true, force: true })
  }
}

/**
 * Remove cached skills that are not listed.
 * @param layout - cache directories.
 * @param keep - names to keep.
 * @returns the names removed.
 */
export async function pruneSkills(layout: CacheLayout, keep: ReadonlySet<string>): Promise<string[]> {
  let entries: string[]
  try { entries = await readdir(layout.skills) }
  catch (_error) { return [] } // No skill root yet: nothing is cached.
  const removed = entries.filter(entry => !keep.has(entry))
  for (const entry of removed) await rm(join(layout.skills, entry), { recursive: true, force: true })
  return removed
}

/**
 * Remove every cached skill and the manifest.
 * @param layout - cache directories.
 */
export async function clearCache(layout: CacheLayout): Promise<void> {
  await rm(layout.manifest, { force: true })
  await rm(layout.skills, { recursive: true, force: true })
  await rm(layout.staging, { recursive: true, force: true })
}
