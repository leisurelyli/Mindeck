/**
 * The company file library for Mindeck Desktop: agent tools that list, search, download, and save files in the
 * member's OpenCloud spaces, and the `mindeckFiles` Remote that the sidebar panel reads.
 * @module @deepseek-ai/dsh-mindeck-files
 */
import { readdir, rm, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { followChanges } from '@deepseek-ai/dsh-mindeck-account'
import type {} from '@deepseek-ai/dsh-tools'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { FilesAccess } from './access.ts'
import { LibraryService } from './library-service.ts'
import { LibraryError, OpenCloudClient, type LibraryFailureCode } from './opencloud.ts'
import { registerLibraryTools } from './tools.ts'
import type { LibraryAvailability, LibraryEntryView, LibrarySpaceView } from './types.ts'

export { localName } from './tools.ts'
export { LIBRARY_REFERENCE_PREFIX } from './reference.ts'
export { PERSONAL_SPACE, SHARED_SPACE } from './library.ts'
export type { LibraryAvailability, LibraryEntryView, LibrarySpaceView } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    mindeckFiles: MindeckFiles
  }
}

/** Deployment options. */
export interface Config {
  /** Directory of downloaded library files; empty means `mindeck/library-downloads` under the DeepSeek Harness home. */
  downloadDir: string
  /** Days a session's downloads are kept after their last change. */
  downloadRetentionDays: number
  /** Timeout of one request to Mindeck Cloud or the file library, in milliseconds. */
  requestTimeoutMs: number
  /** Largest file a download accepts, in bytes. */
  maxDownloadBytes: number
  /** Largest workspace file an upload sends, in bytes. */
  maxUploadBytes: number
  /** Most search results returned. */
  maxSearchResults: number
}

const MiB = 1024 * 1024

/**
 * Resolve where library downloads are written; an empty setting selects `mindeck/library-downloads` under the DSH home.
 * @param config - deployment options.
 * @returns the absolute download directory.
 */
export function resolveDownloadDir(config: Pick<Config, 'downloadDir'>): string {
  return config.downloadDir === '' ? join(resolveDshHome(), 'mindeck', 'library-downloads') : resolve(config.downloadDir)
}

type RemoteCode = 'signed-out' | 'not-configured' | 'not-found' | 'denied' | 'exists' | 'quota' | 'too-large' | 'unavailable'

const REMOTE_CODES: Readonly<Record<LibraryFailureCode, RemoteCode>> = {
  'signed-out': 'signed-out', 'not-configured': 'not-configured', 'not-found': 'not-found', denied: 'denied',
  exists: 'exists', quota: 'quota', 'too-large': 'too-large', unavailable: 'unavailable', protocol: 'unavailable',
}

/** File-library tools and the panel's Remote for the signed-in member. */
export default class MindeckFiles extends TypertRemoteService {
  static inject = ['tools', 'fs', 'workingDirectory', 'mindeckAccount', 'typert']
  static Config: z<Config> = z.object({
    downloadDir: z.string().default('')
      .description('Directory of downloaded library files; empty means `mindeck/library-downloads` under the DeepSeek Harness home.'),
    downloadRetentionDays: z.natural().min(1).default(7)
      .description('Days a session\'s downloads are kept after their last change.'),
    requestTimeoutMs: z.natural().min(1000).default(60_000)
      .description('Timeout of one request to Mindeck Cloud or the file library, in milliseconds.'),
    maxDownloadBytes: z.natural().min(1024).default(100 * MiB)
      .description('Largest file a download accepts, in bytes.'),
    maxUploadBytes: z.natural().min(1024).default(100 * MiB)
      .description('Largest workspace file an upload sends, in bytes.'),
    maxSearchResults: z.natural().min(1).max(200).default(30)
      .description('Most search results returned.'),
  })

  private readonly access: FilesAccess
  private readonly library: LibraryService
  private availability: LibraryAvailability = 'signed-out'
  private readonly listeners = new Set<() => void>()
  private readonly lifetime = new AbortController()
  private readonly registerTools: () => () => void
  private unregisterTools: (() => void) | undefined
  private refreshes = 0

  /** @param ctx - Host with the tools, filesystem, working-directory, and Mindeck account services. @param options - deployment options. */
  constructor(ctx: Context, private readonly options: Config) {
    super(ctx, 'mindeckFiles', { namespace: 'mindeckFiles' })
    const config = options
    this.access = new FilesAccess(ctx.mindeckAccount, config.requestTimeoutMs)
    this.library = new LibraryService(
      new OpenCloudClient((signal, renew) => this.access.get(signal, renew), config.requestTimeoutMs),
      { maxDownloadBytes: config.maxDownloadBytes, maxUploadBytes: config.maxUploadBytes },
    )
    const downloadDir = resolveDownloadDir(config)
    this.registerTools = () => registerLibraryTools(ctx, {
      library: () => this.library, downloadDir, maxSearchResults: config.maxSearchResults,
    })
    ctx.effect(() => () => {
      this.lifetime.abort()
      this.unregisterTools?.()
      this.unregisterTools = undefined
    }, 'mindeck-files: availability reads and tools')
    ctx.on('mindeck-account/changed', () => {
      this.access.clear()
      void this.refresh()
    })
    void this.refresh()
    void pruneDownloads(downloadDir, config.downloadRetentionDays * 24 * 60 * 60 * 1000).catch((error: unknown) => {
      ctx.logger.warn('mindeck-files: could not remove old downloads', error)
    })
  }

  private async refresh(): Promise<void> {
    const sequence = ++this.refreshes
    const session = await this.ctx.mindeckAccount.session()
    // A later refresh read a newer session; this result is stale.
    if (this.lifetime.signal.aborted || sequence !== this.refreshes) return
    const next: LibraryAvailability = session === undefined ? 'signed-out'
      : session.bootstrap.endpoints.files == null ? 'not-configured' : 'ready'
    if (next === this.availability) return
    this.availability = next
    // The tools exist only while the library is usable, so the model never sees tools that cannot work.
    if (next === 'ready') this.unregisterTools ??= this.registerTools()
    else { this.unregisterTools?.(); this.unregisterTools = undefined }
    for (const listener of this.listeners) listener()
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      if (!(error instanceof LibraryError)) throw error
      throw new RemoteError(`mindeck-files/${REMOTE_CODES[error.code]}`, error.message, {}, { cause: error })
    }
  }

  /**
   * Read the current availability after refreshing it from the account and Mindeck Cloud.
   * @returns whether the member can use the file library now.
   */
  @Remote
  async getAvailability(): Promise<LibraryAvailability> {
    await this.refresh()
    return this.availability
  }

  /**
   * Stream availability.
   * @param signal - stream lifetime.
   * @returns the current availability, then every change.
   */
  @Remote({ mode: 'stream' })
  async *watch(signal: AbortSignal): AsyncIterable<LibraryAvailability> {
    yield* followChanges(this.listeners, signal, this.lifetime.signal, () => this.getAvailability())
  }

  /**
   * List the spaces the member can open.
   * @param signal - caller cancellation.
   * @returns the member's spaces, personal first.
   */
  @Remote
  async spaces(signal: AbortSignal): Promise<LibrarySpaceView[]> {
    return await this.run(async () => (await this.library.spaces(signal)).map(space => ({
      path: `/${space.name}`, name: space.name, kind: space.kind, webUrl: space.webUrl,
      ...space.used === undefined ? {} : { used: space.used }, ...space.total === undefined ? {} : { total: space.total },
    })))
  }

  /**
   * List one space or folder.
   * @param path - library path of a space or folder.
   * @param signal - caller cancellation.
   * @returns the folder's entries, folders first.
   */
  @Remote
  async list(path: string, signal: AbortSignal): Promise<LibraryEntryView[]> {
    return await this.run(async () => (await this.library.list(path, signal)).map(entry => ({ ...entry })))
  }

  /**
   * Search file and folder names across the member's spaces; a blank query returns no entries.
   * @param query - text contained in names.
   * @param signal - caller cancellation.
   * @returns matching files and folders, at most `maxSearchResults`.
   */
  @Remote
  async search(query: string, signal: AbortSignal): Promise<LibraryEntryView[]> {
    return await this.run(async () => {
      const text = query.trim()
      return text === '' ? [] : (await this.library.search(text, this.options.maxSearchResults, signal)).map(entry => ({ ...entry }))
    })
  }
  /**
   * Save a file from the member's computer into a library folder.
   * @param folder - library path of a space or folder.
   * @param name - file name without folders.
   * @param contentBase64 - file content in base64, at most `maxUploadBytes` once decoded.
   * @param overwrite - replace a file of the same name; the library keeps the replaced content as a version.
   * @param signal - caller cancellation.
   * @returns the saved file.
   */
  @Remote
  async upload(folder: string, name: string, contentBase64: string, overwrite: boolean, signal: AbortSignal): Promise<LibraryEntryView> {
    return await this.run(async () => {
      if (name === '' || name === '.' || name === '..' || /[\\/\0]/u.test(name)) {
        throw new LibraryError('denied', `"${name}" is not a file name`)
      }
      if (contentBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(contentBase64)) {
        throw new LibraryError('protocol', `the content of "${name}" is not base64`)
      }
      // Refuse an oversized file before decoding it.
      if (contentBase64.length / 4 * 3 - (contentBase64.match(/=+$/u)?.[0].length ?? 0) > this.options.maxUploadBytes) {
        throw new LibraryError('too-large', `"${name}" is larger than the upload limit of ${this.options.maxUploadBytes} bytes`)
      }
      const content = Buffer.from(contentBase64, 'base64')
      // Without overwrite, the library refuses an existing name with `exists`.
      return { ...await this.library.write(`${folder.replace(/\/+$/u, '')}/${name}`, content, overwrite, signal) }
    })
  }


}

/**
 * Remove session download directories unchanged for longer than `maxAgeMs`.
 * @param dir - download directory.
 * @param maxAgeMs - retention.
 */
async function pruneDownloads(dir: string, maxAgeMs: number): Promise<void> {
  let names: string[]
  try { names = await readdir(dir) } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return
    throw error
  }
  const cutoff = Date.now() - maxAgeMs
  for (const name of names) {
    const path = join(dir, name)
    if ((await stat(path)).mtimeMs < cutoff) await rm(path, { recursive: true, force: true })
  }
}
