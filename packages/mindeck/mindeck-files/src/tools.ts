/** Model-facing file-library tools: list, search, download into a session directory, and save a workspace file. */
import { mkdir, utimes, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-fs'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-working-directory'
import { defineTool, type ToolExecution } from '@deepseek-ai/dsh-tools'
import { splitLibraryPath } from './library.ts'
import { libraryPathOf } from './reference.ts'
import type { LibraryEntry, LibraryService } from './library-service.ts'
import { LibraryError } from './opencloud.ts'
import type { LibraryPassagePart } from './types.ts'


const entrySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    path: { type: 'string', required: true },
    name: { type: 'string', required: true },
    kind: { type: 'string', required: true, enum: ['space', 'folder', 'file'] },
    size: { type: 'integer' },
    modified: { type: 'string' },
    writable: { type: 'boolean' },
  },
} as const

/** One listed item in the canonical tool value. */
interface EntryValue {
  path: string
  name: string
  kind: 'space' | 'folder' | 'file'
  size?: number
  modified?: string
  writable?: boolean
}

const PATH_HELP = 'A library path starts with a space name, such as /Personal/reports/weekly.md; library_list without a path lists the spaces. '
  + 'The member sees /Personal as their own files and /Shared with me as items others shared, named in the member\'s language. '
  + 'A message cites an item as library:"/path"; these tools accept that form as a path.'


function value(entry: LibraryEntry): EntryValue {
  return {
    path: entry.path, name: entry.name, kind: entry.kind, writable: entry.writable,
    ...entry.size === undefined ? {} : { size: entry.size }, ...entry.modified === undefined ? {} : { modified: entry.modified },
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatEntries(entries: readonly EntryValue[]): string {
  return entries.map((entry) => {
    const facts = [entry.kind, ...entry.size === undefined || entry.kind !== 'file' ? [] : [formatSize(entry.size)],
      ...entry.modified === undefined ? [] : [entry.modified.slice(0, 10)], ...entry.writable === false ? ['read-only'] : []]
    return `${entry.path}${entry.kind === 'file' ? '' : '/'} (${facts.join(', ')})`
  }).join('\n')
}

/** Characters Windows does not allow in a file name, and control characters. */
const UNSAFE_CHARACTERS = /[<>:"|?*]|\p{Cc}/gu
const RESERVED_NAME = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i

/**
 * Turn one library path segment into a local file name.
 * @param segment - one library path segment.
 * @returns a name every desktop filesystem accepts.
 */
export function localName(segment: string): string {
  const cleaned = segment.replace(UNSAFE_CHARACTERS, '_').replace(/[. ]+$/, '')
  if (cleaned === '') return '_'
  return RESERVED_NAME.test(cleaned) ? `_${cleaned}` : cleaned
}

/** A folder that a conversation's digital employee consults. */
export interface ConversationFolder {
  /** OpenCloud resource id. */
  readonly itemId: string
  /** Name the company gave the material. */
  readonly label: string
  /** Library path the conversation's instructions name the folder by. */
  readonly path: string
  /** Whether the member may open it, as Mindeck Cloud judges it. */
  readonly accessible: boolean
}

/** Deployment inputs of the tools. */
export interface LibraryToolOptions {
  /** Library operations for the signed-in member. */
  readonly library: () => LibraryService
  /** Directory under which each session's downloads are kept. */
  readonly downloadDir: string
  /** Most search results returned to the model. */
  readonly maxSearchResults: number
  /** Whether the library indexes document text, so a search also matches it. */
  readonly fullText: boolean
  /** The folders a conversation's digital employee consults; undefined for a conversation without one. */
  readonly conversationFolders: (sessionId: SessionId) => readonly ConversationFolder[] | undefined
}

/**
 * Write a passage for the model, each matching run in `**`.
 * @param passage - passage parts.
 * @returns one line of text.
 */
export function passageText(passage: readonly LibraryPassagePart[]): string {
  return passage.map(part => part.match ? `**${part.text}**` : part.text).join('')
}

/**
 * Compare library paths as the model writes them: with or without the reference prefix and a final `/`.
 * @param path - library path or reference.
 * @returns the path with one leading `/` and none at the end.
 */
function folderKey(path: string): string {
  return `/${libraryPathOf(path.trim()).split('/').filter(part => part !== '').join('/')}`
}

/**
 * Register the four file-library tools.
 * @param ctx - plugin context with `tools`, `fs`, and `workingDirectory`.
 * @param options - library access and limits.
 * @returns disposer that removes the four tools.
 */
export function registerLibraryTools(ctx: Context, options: LibraryToolOptions): () => void {
  const disposers: Array<() => void> = []
  disposers.push(ctx.tools.register(defineTool({
    name: 'library_list',
    description: `List the spaces of the company file library, or the folders and files in one space or folder. ${PATH_HELP}`,
    parameters: {
      path: { type: 'string', description: 'Library path of a space or folder. Omit to list the spaces.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: { path: { type: 'string', required: true }, entries: { type: 'array', required: true, items: entrySchema } },
      },
      render: (_args, result) => [{
        type: 'text',
        text: result.entries.length === 0 ? `${result.path} is empty.` : `${result.path}\n${formatEntries(result.entries)}`,
      }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const library = options.library()
      const path = args.path === undefined ? '' : libraryPathOf(args.path.trim())
      if (path === '' || path === '/') {
        const spaces = await library.spaces(exec.signal)
        return { path: '/', entries: spaces.map(space => ({ path: `/${space.name}`, name: space.name, kind: 'space' as const })) }
      }
      return { path, entries: (await library.list(path, exec.signal)).map(value) }
    },
  })))

  /** The folder a search stays in: a folder of the conversation's employee by its path or name, or any library folder. */
  const searchFolder = async (requested: string, exec: ToolExecution): Promise<{ id: string; path: string }> => {
    const key = folderKey(requested)
    const listed = exec.agent === undefined ? undefined : options.conversationFolders(exec.agent.session.id)
    const known = listed?.find(folder => folderKey(folder.path) === key || folder.label === requested.trim())
    if (known === undefined) return await options.library().folder(key, exec.signal)
    if (!known.accessible) {
      throw new LibraryError('denied', `the member cannot open "${known.label}" (${known.path}): the company has not `
        + 'given their department access to this folder, so its files cannot be searched or read for them. Tell the '
        + 'member, and that a company administrator can give them access.')
    }
    return { id: known.itemId, path: known.path }
  }
  disposers.push(ctx.tools.register(defineTool({
    name: 'library_search',
    description: options.fullText
      ? 'Find files in the company file library by a phrase in their name or text, in every space the member can open or in one folder. A file found by its text comes with the passage that matched.'
      : 'Find files and folders in the company file library whose names contain the given text, in every space the member can open or in one folder. The library searches names only: the text inside documents cannot be searched.',
    parameters: {
      query: {
        type: 'string', required: true,
        description: options.fullText
          ? 'A short phrase from the question, such as two to six Chinese characters. Chinese matches character by character, so a whole sentence finds less.'
          : 'Text contained in the file or folder name.',
      },
      folder: { type: 'string', description: 'Library path of a folder to search, subfolders included. Omit to search every space.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          query: { type: 'string', required: true },
          folder: { type: 'string' },
          entries: {
            type: 'array', required: true,
            items: { ...entrySchema, properties: { ...entrySchema.properties, passage: { type: 'string' } } },
          },
        },
      },
      render: (_args, result) => {
        const place = result.folder === undefined ? '' : ` in ${result.folder}`
        if (result.entries.length === 0) {
          return [{
            type: 'text',
            text: options.fullText
              ? `Nothing${place} matches "${result.query}". Search again with another phrase from the question.`
              : `No names${place} contain "${result.query}".`,
          }]
        }
        return [{
          type: 'text',
          text: result.entries.map(entry => `${formatEntries([entry])}${entry.passage === undefined ? '' : `\n  ${entry.passage}`}`).join('\n'),
        }]
      },
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const query = args.query.trim()
      if (query === '') throw new LibraryError('not-found', 'the search text is empty')
      const folder = args.folder === undefined || args.folder.trim() === '' ? undefined : await searchFolder(args.folder, exec)
      const entries = await options.library().search(query, {
        limit: options.maxSearchResults, fullText: options.fullText, ...folder === undefined ? {} : { folder: folder.id },
      }, exec.signal)
      return {
        query, ...folder === undefined ? {} : { folder: folder.path },
        entries: entries.map(entry => ({ ...value(entry), ...entry.passage === undefined ? {} : { passage: passageText(entry.passage) } })),
      }
    },
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'library_download',
    description: 'Download a file from the company file library to this computer and return its local path. Read the local copy with your file tools; copy it into the workspace before changing it, and use library_upload to save changes back.',
    parameters: {
      path: { type: 'string', required: true, description: 'Library path of the file.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          localPath: { type: 'string', required: true },
          size: { type: 'integer', required: true },
        },
      },
      render: (_args, result) => [{
        type: 'text', text: `Downloaded ${result.path} (${formatSize(result.size)}) to ${result.localPath}. This copy is read-only for the library: changes reach the library only through library_upload.`,
      }],
    },
    async execute(args, exec) {
      const path = libraryPathOf(args.path)
      const { space, segments } = splitLibraryPath(path)
      const { entry, bytes } = await options.library().read(path, exec.signal)
      const sessionDir = resolve(options.downloadDir, localName(exec.agent?.session.id ?? 'shared'))
      const localPath = resolve(sessionDir, localName(space), ...segments.map(localName))
      if (!localPath.startsWith(sessionDir + sep)) {
        throw new LibraryError('not-found', `${path} cannot be stored on this computer`)
      }
      await mkdir(dirname(localPath), { recursive: true })
      await writeFile(localPath, bytes, { signal: exec.signal })
      // Retention counts from the session directory's own time, which nested writes do not change.
      const now = new Date()
      await utimes(sessionDir, now, now)
      return { path: entry.path, localPath, size: bytes.byteLength }
    },
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'library_upload',
    description: 'Save a file from the workspace into the company file library. Missing folders are created. An existing file is replaced only with overwrite; the library keeps the replaced content as a version.',
    parameters: {
      from: { type: 'string', required: true, description: 'Path of the file in the workspace, absolute or relative to the working directory.' },
      to: { type: 'string', required: true, description: 'Library path of the new file, or of a folder ending with "/" to keep the file name.' },
      overwrite: { type: 'boolean', description: 'Replace a file that already exists at the destination. Defaults to false.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          size: { type: 'integer', required: true },
          overwritten: { type: 'boolean', required: true },
        },
      },
      render: (_args, result) => [{
        type: 'text', text: `${result.overwritten ? 'Replaced' : 'Saved'} ${result.path} (${formatSize(result.size)}).`,
      }],
    },
    async execute(args, exec) {
      const bytes = await readWorkspaceFile(ctx, args.from, options.library().limits.maxUploadBytes, exec)
      const library = options.library()
      let to = libraryPathOf(args.to)
      if (to.endsWith('/') || (await library.stat(to, exec.signal))?.kind === 'folder') {
        to = `${to.replace(/\/+$/, '')}/${basename(args.from)}`
      }
      const existing = await library.stat(to, exec.signal)
      if (existing?.kind === 'folder') throw new LibraryError('exists', `${to} is a folder`)
      if (existing !== undefined && args.overwrite !== true) {
        throw new LibraryError('exists', `${existing.path} already exists; pass overwrite: true to replace it, or choose another name`)
      }
      const saved = await library.write(to, bytes, args.overwrite === true, exec.signal)
      return { path: saved.path, size: bytes.byteLength, overwritten: existing !== undefined }
    },
  })))
  return () => { for (const dispose of disposers.splice(0)) dispose() }
}

async function readWorkspaceFile(ctx: Context, path: string, maxBytes: number, exec: ToolExecution): Promise<Uint8Array> {
  const cwd = exec.agent === undefined ? undefined : await ctx.workingDirectory.ensure(exec.agent, exec.signal)
  const target = await ctx.fs.resolve(path, { ...cwd === undefined ? {} : { cwd }, signal: exec.signal })
  const info = await ctx.fs.stat(target, exec.signal)
  if (info === undefined) throw new LibraryError('not-found', `${target.displayPath} does not exist`)
  if (info.type !== 'file') throw new LibraryError('not-found', `${target.displayPath} is not a file`)
  try {
    return await ctx.fs.readBytes(target, exec.signal, maxBytes)
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'FS_TOO_LARGE') {
      throw new LibraryError('too-large', `${target.displayPath} is larger than the ${maxBytes}-byte upload limit`, { cause: error })
    }
    throw error
  }
}

