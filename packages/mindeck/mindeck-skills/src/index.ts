/**
 * Company skills for Mindeck Desktop. The plugin keeps a local copy of the skills Mindeck Cloud offers
 * the signed-in member, serves it through a filesystem skill provider named `mindeck`, and streams how
 * the skills are listed, and serves their instructions, to the skills page.
 * @module @deepseek-ai/dsh-mindeck-skills
 */
import { access } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { followChanges } from '@deepseek-ai/dsh-mindeck-account'
import type { SkillProviderControl } from '@deepseek-ai/dsh-skill'
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem'
import { deadline } from '@deepseek-ai/dsh-timeout'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { deepEqualJson } from '@deepseek-ai/dsh-util-values'
import { cacheLayout, clearCache, installSkill, pruneSkills, readManifest, skillFiles, writeManifest } from './cache.ts'
import type { CacheLayout } from './cache.ts'
import { listSkills, readSkill, SkillSignInRequired } from './cloud.ts'
import type { MindeckSkillCatalog, MindeckSkillView } from './types.ts'

export { cacheLayout, isSafeSkillPath, skillFiles } from './cache.ts'
export type { CacheLayout, CacheManifest, SkillLimits } from './cache.ts'
export type { MindeckSkillCatalog, MindeckSkillView } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    mindeckSkills: MindeckSkills
  }
}

/** Name of the skill provider that serves the cached skills. */
export const PROVIDER_NAME = 'mindeck'

/** Deployment options. */
export interface Config {
  /** Cache directory; empty means `mindeck` under the DeepSeek Harness home (`$DSH_HOME` or `~/.dsh`). */
  cacheDir: string
  /** Interval between skill refreshes while signed in, in milliseconds. */
  refreshIntervalMs: number
  /** Timeout of one Mindeck Cloud request in milliseconds. */
  requestTimeoutMs: number
  /** Largest accepted skill, in bytes of decoded file content. */
  maxSkillBytes: number
  /** Most files accepted in one skill. */
  maxSkillFiles: number
}

/**
 * Resolve the skill cache directory; an empty setting selects `mindeck` under the DSH home.
 * @param config - deployment options.
 * @returns the absolute cache directory.
 */
export function resolveCacheDir(config: Pick<Config, 'cacheDir'>): string {
  return config.cacheDir === '' ? join(resolveDshHome(), 'mindeck') : resolve(config.cacheDir)
}

/** Whether a cached skill directory still has its SKILL.md. */
async function isInstalled(layout: CacheLayout, skill: string): Promise<boolean> {
  try { await access(join(layout.skills, skill, 'SKILL.md')); return true }
  catch (_error) { return false } // Removed outside Mindeck: download it again.
}

const SIGNED_OUT: MindeckSkillCatalog = { company: null, skills: [] }

/**
 * Keeps the member's company skills in the local cache, serves them while signed in, and lists them and their
 * instructions for the skills page.
 */
export default class MindeckSkills extends TypertRemoteService {
  static inject = ['skills', 'mindeckAccount', 'typert']
  static Config: z<Config> = z.object({
    cacheDir: z.string().default('')
      .description('Cache directory; empty means `mindeck` under the DeepSeek Harness home.'),
    refreshIntervalMs: z.natural().min(60_000).default(600_000)
      .description('Interval between skill refreshes while signed in, in milliseconds.'),
    requestTimeoutMs: z.natural().min(1000).default(30_000)
      .description('Timeout of one Mindeck Cloud request in milliseconds.'),
    maxSkillBytes: z.natural().min(1024).default(5 * 1024 * 1024)
      .description('Largest accepted skill, in bytes of decoded file content.'),
    maxSkillFiles: z.natural().min(1).default(300)
      .description('Most files accepted in one skill.'),
  })

  private readonly layout: CacheLayout
  private readonly lifetime = new AbortController()
  private control: SkillProviderControl | undefined
  private catalog: MindeckSkillCatalog = SIGNED_OUT
  private readonly listeners = new Set<() => void>()
  private running: Promise<void> | undefined
  private again = false

  /** @param ctx - Host with the skill registry and the Mindeck account. @param config - deployment options. */
  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'mindeckSkills', { namespace: 'mindeckSkills' })
    this.layout = cacheLayout(resolveCacheDir(config))
    ctx.effect(() => () => { this.lifetime.abort() }, 'mindeck-skills: Cloud requests')
    let provider: FileSystemSkillProvider | undefined
    ctx.skills.registerProvider((registration) => {
      this.control = registration
      provider = new FileSystemSkillProvider(ctx, registration, {
        providerName: PROVIDER_NAME, includeDefaultRoots: false, customSkillDirs: [this.layout.skills], watch: false,
      })
      return provider
    })
    ctx.effect(function* () {
      yield async () => { await provider?.dispose() }
    }, 'mindeck-skills: provider')
    ctx.on('mindeck-account/changed', () => { this.refresh() })
    ctx.effect(() => {
      const timer = setInterval(() => { this.refresh() }, config.refreshIntervalMs)
      return () => { clearInterval(timer) }
    }, 'mindeck-skills: refresh timer')
    this.refresh()
  }

  // Read through a method: a check after `await` must not reuse an earlier narrowing.
  private stopped(): boolean { return this.lifetime.signal.aborted }
  // Read through a method: `sync` may request a rerun while the refresh loop awaits it.
  private rerunRequested(): boolean { return this.again }

  /** Synchronize once; a request made while one runs reruns it afterwards. */
  private refresh(): void {
    if (this.stopped()) return
    if (this.running !== undefined) { this.again = true; return }
    this.running = (async () => {
      do {
        this.again = false
        await this.sync().catch((error: unknown) => {
          if (!this.stopped()) this.ctx.logger.warn('mindeck-skills: keeping the cached skills; refresh failed', error)
        })
      } while (this.rerunRequested() && !this.stopped())
    })().finally(() => { this.running = undefined })
  }

  /** Publish how the skills are listed; the skills page receives only changes. */
  private publish(next: MindeckSkillCatalog): void {
    if (deepEqualJson(next, this.catalog)) return
    this.catalog = next
    for (const listener of this.listeners) listener()
  }

  private async sync(): Promise<void> {
    const layout = this.layout
    const session = await this.ctx.mindeckAccount.session()
    if (this.stopped()) return
    const manifest = await readManifest(layout)
    if (session === undefined) {
      this.publish(SIGNED_OUT)
      if (manifest !== undefined) { await clearCache(layout); this.control?.invalidate() }
      return
    }
    const owner = { cloudUrl: session.cloudUrl, userId: session.bootstrap.user.id }
    const company = session.bootstrap.company.name
    let cached = manifest?.skills ?? {}
    if (manifest !== undefined && (manifest.cloudUrl !== owner.cloudUrl || manifest.userId !== owner.userId)) {
      await clearCache(layout)
      this.control?.invalidate()
      cached = {}
      this.publish({ company, skills: [] })
    } else {
      // Until Mindeck Cloud answers, the page lists the skills this member already has.
      this.publish({ company, skills: (manifest?.listing ?? []).filter(skill => cached[skill.name] !== undefined) })
    }
    const request = async <T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> => {
      using limit = deadline(this.lifetime.signal, this.config.requestTimeoutMs, 'MINDECK_SKILLS_TIMEOUT')
      return await run(limit.signal)
    }
    const url = session.bootstrap.endpoints.skills
    let listed
    try { listed = await request(signal => listSkills(url, session.token, signal)) }
    catch (error) {
      if (error instanceof SkillSignInRequired) { await this.ctx.mindeckAccount.rejectToken(session.token); return }
      throw error
    }
    if (this.stopped()) return
    const next: Record<string, string> = {}
    let changed = false
    for (const summary of listed) {
      if (cached[summary.name] === summary.hash && await isInstalled(layout, summary.name)) {
        next[summary.name] = summary.hash
        continue
      }
      try {
        const detail = await request(signal => readSkill(url, summary.name, session.token, signal))
        if (this.stopped()) return
        const limits = { maxBytes: this.config.maxSkillBytes, maxFiles: this.config.maxSkillFiles }
        await installSkill(layout, detail.name, skillFiles(detail, limits))
        next[summary.name] = detail.hash
        changed = true
      } catch (error) {
        if (error instanceof SkillSignInRequired) { await this.ctx.mindeckAccount.rejectToken(session.token); return }
        if (this.stopped()) return
        // Keep the previous copy of this skill, if any, and retry it on the next refresh.
        this.ctx.logger.warn(`mindeck-skills: could not update skill "${summary.name}"`, error)
        const previous = cached[summary.name]
        if (previous !== undefined) next[summary.name] = previous
      }
    }
    const removed = await pruneSkills(layout, new Set(Object.keys(next)))
    const listing: MindeckSkillView[] = listed.filter(skill => next[skill.name] !== undefined)
      .map(({ hash: _hash, ...view }) => view)
    await writeManifest(layout, { ...owner, skills: next, listing })
    if (changed || removed.length > 0) this.control?.invalidate()
    this.publish({ company, skills: listing })
  }

  /**
   * Stream the company skills the signed-in member has on this computer.
   * @param signal - stream lifetime.
   * @returns the current listing, then every change.
   */
  @Remote({ mode: 'stream' })
  async *watch(signal: AbortSignal): AsyncIterable<MindeckSkillCatalog> {
    yield* followChanges(this.listeners, signal, this.lifetime.signal, () => this.catalog)
  }

  /**
   * Read the instructions of a company skill the member has on this computer, as the agent receives them.
   * @param name - skill name from the listing.
   * @param signal - caller cancellation.
   * @returns the SKILL.md body without its front matter.
   * @throws RemoteError `mindeck-skills/not-found` when the listing has no such skill, its cached copy is gone, or
   * another provider's skill of that name takes precedence.
   */
  @Remote
  async instructions(name: string, signal: AbortSignal): Promise<string> {
    const missing = (): RemoteError<'mindeck-skills/not-found'> =>
      new RemoteError('mindeck-skills/not-found', `the member has no company skill named "${name}"`, {})
    if (!this.catalog.skills.some(skill => skill.name === name)) throw missing()
    const skill = await this.ctx.skills.get(name, { signal })
    // A skill of the same name from another provider takes precedence in the registry; it is not this listing's.
    if (skill?.provider !== PROVIDER_NAME) throw missing()
    return skill.content
  }
}
