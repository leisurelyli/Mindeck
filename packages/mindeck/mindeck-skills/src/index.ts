/**
 * Company skills for Mindeck Desktop. The plugin keeps a local copy of the skills Mindeck Cloud offers
 * the signed-in member and serves it through a filesystem skill provider named `mindeck`.
 * @module @deepseek-ai/dsh-mindeck-skills
 */
import { access } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type {} from '@deepseek-ai/dsh-mindeck-account'
import type { SkillProviderControl } from '@deepseek-ai/dsh-skill'
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem'
import { deadline } from '@deepseek-ai/dsh-timeout'
import { cacheLayout, clearCache, installSkill, pruneSkills, readManifest, skillFiles, writeManifest } from './cache.ts'
import type { CacheLayout } from './cache.ts'
import { listSkills, readSkill, SkillSignInRequired } from './cloud.ts'

export { cacheLayout, isSafeSkillPath, skillFiles } from './cache.ts'
export type { CacheLayout, CacheManifest, SkillLimits } from './cache.ts'

export const name = 'mindeck-skills'
export const inject = ['skills', 'mindeckAccount']

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

export const Config: z<Config> = z.object({
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

/**
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

/** Keep the member's company skills in the local cache and serve them while signed in. */
export function apply(ctx: Context, config: Config): void {
  const layout = cacheLayout(resolveCacheDir(config))
  const lifetime = new AbortController()
  ctx.effect(() => () => { lifetime.abort() }, 'mindeck-skills: Cloud requests')
  const stopped = (): boolean => lifetime.signal.aborted

  let control: SkillProviderControl | undefined
  let provider: FileSystemSkillProvider | undefined
  ctx.skills.registerProvider((registration) => {
    control = registration
    provider = new FileSystemSkillProvider(ctx, registration, {
      providerName: PROVIDER_NAME, includeDefaultRoots: false, customSkillDirs: [layout.skills], watch: false,
    })
    return provider
  })
  ctx.effect(function* () {
    yield async () => { await provider?.dispose() }
  }, 'mindeck-skills: provider')

  let running: Promise<void> | undefined
  let again = false
  // Read through a function: `sync` may request a rerun while this loop awaits it.
  const rerunRequested = (): boolean => again
  /** Synchronize once; a request made while one runs reruns it afterwards. */
  function refresh(): void {
    if (stopped()) return
    if (running !== undefined) { again = true; return }
    running = (async () => {
      do {
        again = false
        await sync(layout).catch((error: unknown) => {
          if (!stopped()) ctx.logger.warn('mindeck-skills: keeping the cached skills; refresh failed', error)
        })
      } while (rerunRequested() && !stopped())
    })().finally(() => { running = undefined })
  }

  const sync = async (layout: CacheLayout): Promise<void> => {
    const session = await ctx.mindeckAccount.session()
    if (stopped()) return
    const manifest = await readManifest(layout)
    if (session === undefined) {
      if (manifest !== undefined) { await clearCache(layout); control?.invalidate() }
      return
    }
    const owner = { cloudUrl: session.cloudUrl, userId: session.bootstrap.user.id }
    let cached = manifest?.skills ?? {}
    if (manifest !== undefined && (manifest.cloudUrl !== owner.cloudUrl || manifest.userId !== owner.userId)) {
      await clearCache(layout)
      control?.invalidate()
      cached = {}
    }
    const request = async <T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> => {
      using limit = deadline(lifetime.signal, config.requestTimeoutMs, 'MINDECK_SKILLS_TIMEOUT')
      return await run(limit.signal)
    }
    const url = session.bootstrap.endpoints.skills
    let listed
    try { listed = await request(signal => listSkills(url, session.token, signal)) }
    catch (error) {
      if (error instanceof SkillSignInRequired) { await ctx.mindeckAccount.rejectToken(session.token); return }
      throw error
    }
    if (stopped()) return
    const next: Record<string, string> = {}
    let changed = false
    for (const summary of listed) {
      if (cached[summary.name] === summary.hash && await isInstalled(layout, summary.name)) {
        next[summary.name] = summary.hash
        continue
      }
      try {
        const detail = await request(signal => readSkill(url, summary.name, session.token, signal))
        if (stopped()) return
        await installSkill(layout, detail.name, skillFiles(detail, { maxBytes: config.maxSkillBytes, maxFiles: config.maxSkillFiles }))
        next[summary.name] = detail.hash
        changed = true
      } catch (error) {
        if (error instanceof SkillSignInRequired) { await ctx.mindeckAccount.rejectToken(session.token); return }
        if (stopped()) return
        // Keep the previous copy of this skill, if any, and retry it on the next refresh.
        ctx.logger.warn(`mindeck-skills: could not update skill "${summary.name}"`, error)
        const previous = cached[summary.name]
        if (previous !== undefined) next[summary.name] = previous
      }
    }
    const removed = await pruneSkills(layout, new Set(Object.keys(next)))
    await writeManifest(layout, { ...owner, skills: next })
    if (changed || removed.length > 0) control?.invalidate()
  }

  ctx.on('mindeck-account/changed', () => { refresh() })
  ctx.effect(() => {
    const timer = setInterval(() => { refresh() }, config.refreshIntervalMs)
    return () => { clearInterval(timer) }
  }, 'mindeck-skills: refresh timer')
  refresh()
}
