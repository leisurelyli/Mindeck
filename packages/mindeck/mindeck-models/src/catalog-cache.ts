/** The member's last model catalog, kept on disk so the models stay selectable while Mindeck Cloud is unreachable at start. */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'
import { type CatalogModel, withSettings } from './catalog.ts'

/** Whose catalog a cache file holds; a file written for another Cloud or member is ignored. */
export interface CatalogOwner {
  readonly cloudUrl: string
  readonly userId: string
}

const cachedModelSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().nullable(),
  recommended: z.boolean(),
  api: z.enum(['anthropic-messages', 'openai-completions', 'openai-responses']),
  baseUrl: z.url(),
  contextWindow: z.number().int().positive().nullable(),
  maxOutputTokens: z.number().int().positive().nullable(),
  input: z.array(z.enum(['text', 'image'])),
  // Checked again on reading, as the Cloud catalog is: a file saved before an upgrade may hold settings pi-ai now refuses.
  reasoningEfforts: z.unknown().optional(),
  defaultReasoning: z.unknown().optional(),
  compat: z.unknown().optional(),
})

const cacheSchema = z.object({
  version: z.literal(1),
  cloudUrl: z.string(),
  userId: z.string(),
  models: z.array(cachedModelSchema),
})

/**
 * Read the cached catalog of one member. Each model keeps the thinking and compatibility settings pi-ai accepts.
 * @param file - cache file path.
 * @param owner - the signed-in member.
 * @returns the cached models, or undefined when the file is missing, unreadable, or holds another member's catalog.
 */
export async function readCachedCatalog(file: string, owner: CatalogOwner): Promise<CatalogModel[] | undefined> {
  let text: string
  try { text = await readFile(file, 'utf8') }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
  let body: unknown
  try { body = JSON.parse(text) }
  catch { return undefined } // SyntaxError: a damaged file holds no catalog; the next save replaces it.
  const parsed = cacheSchema.safeParse(body)
  if (!parsed.success || parsed.data.cloudUrl !== owner.cloudUrl || parsed.data.userId !== owner.userId) return undefined
  // A refused setting is left out without a report; the Cloud's next answer reports its own.
  return parsed.data.models.map(({ reasoningEfforts, defaultReasoning, compat, ...model }) =>
    withSettings(model, { reasoningEfforts, defaultReasoning, compat }).model)
}

/**
 * Replace the cached catalog; a reader sees the previous file or the new one, never a partial write.
 * @param file - cache file path.
 * @param owner - the member the catalog belongs to.
 * @param models - the catalog to keep.
 */
export async function writeCachedCatalog(file: string, owner: CatalogOwner, models: readonly CatalogModel[]): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify({ version: 1, ...owner, models })}\n`, 'utf8')
  await rename(temporary, file)
}
