/**
 * Company models for Mindeck Desktop. The plugin reads the signed-in member's model catalog from Mindeck
 * Cloud and serves it through pi-ai routes that call the Cloud gateway with the desktop session token:
 * `mindeck-anthropic`, `mindeck-openai`, and `mindeck-openai-responses`, each registered while it has
 * models. While the web service is present it also registers the `mindeck-search` provider, which searches
 * through the gateway with the company's DeepSeek key and is ready only while the company offers search.
 * @module @deepseek-ai/dsh-mindeck-models
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { AdapterRegistrationHandle } from '@deepseek-ai/dsh-llm'
import { createPiAiAdapter, piAiAuthFrom } from '@deepseek-ai/dsh-llm-pi-ai'
import type { PiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import type {} from '@deepseek-ai/dsh-mindeck-account'
import type {} from '@deepseek-ai/dsh-mindeck-employees'
import { deadline, MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { deepEqualJson } from '@deepseek-ai/dsh-util-values'
import { join, resolve } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type { Session } from '@deepseek-ai/dsh-session'
import { type CatalogModel, fetchCatalog, routeProfiles } from './catalog.ts'
import { readCachedCatalog, writeCachedCatalog } from './catalog-cache.ts'
import { EMPLOYEE_HEADER, GatewayAdapter, type ModelNotes, SIGN_IN_REQUIRED_CODE } from './gateway-adapter.ts'
import { fetchSearchStatus, MindeckSearchProvider, type SearchStatus } from './search.ts'

export { parseCatalog, routeProfiles, ROUTES } from './catalog.ts'
export type { CatalogModel, ModelApi, ParsedCatalog } from './catalog.ts'
export {
  ACCOUNT_UNAVAILABLE_CODE, EMPLOYEE_HEADER, GatewayAdapter, mapGatewayFailure, memberLimitOf, RATE_LIMITED_CODE, readGatewayFailure,
  RECOMMENDED_BADGE, SESSION_ENDED_CODE, SIGN_IN_REQUIRED_CODE,
} from './gateway-adapter.ts'
export type { GatewayFailure, GatewayHooks, MemberLimit, ModelNotes } from './gateway-adapter.ts'
export { fetchSearchStatus, mapSearchResults, MINDECK_SEARCH_PROVIDER_ID, MindeckSearchProvider } from './search.ts'
export type { MindeckSearchHooks, SearchStatus } from './search.ts'

export const name = 'mindeck-models'
export const inject = ['llm', 'mindeckAccount']

/** Deployment options. */
export interface Config {
  /**
   * Interval between full catalog refreshes while signed in, in milliseconds. The account's sync refreshes the catalog
   * as soon as Mindeck Cloud reports a change, so this interval only bounds the delay on a Mindeck Cloud without sync.
   */
  refreshIntervalMs: number
  /** First wait after a failed catalog read, in milliseconds; it doubles after each failure up to `refreshIntervalMs`. */
  retryIntervalMs: number
  /** Directory of the last catalog kept for the next start; empty means `mindeck` under the DeepSeek Harness home. */
  cacheDir: string
  /** Timeout of one catalog request in milliseconds. */
  requestTimeoutMs: number
  /** Context window assumed for a model whose catalog entry has none. */
  defaultContextWindow: number
  /** Output limit assumed for a model whose catalog entry has none. */
  defaultMaxTokens: number
  /** Results requested per web search, from 1 through 50; a smaller bound set by the caller wins. */
  searchCount: number
  /**
   * Milliseconds to wait before the one retry of a request the company's per-minute limit refused. The gateway's
   * `Retry-After` does not reach the desktop, so the default covers the limit's whole one-minute window.
   */
  minuteLimitWaitMs: number
}

export const Config: z<Config> = z.object({
  refreshIntervalMs: z.natural().min(60_000).default(600_000)
    .description('Interval between full model catalog refreshes while signed in, in milliseconds; a sync refreshes sooner.'),
  retryIntervalMs: z.natural().min(1000).default(15_000)
    .description('First wait after a failed model catalog read, in milliseconds; it doubles up to refreshIntervalMs.'),
  cacheDir: z.string().default('')
    .description('Directory of the last model catalog kept for the next start; empty means `mindeck` under the DeepSeek Harness home.'),
  requestTimeoutMs: z.natural().min(1000).default(15_000)
    .description('Timeout of one model catalog request in milliseconds.'),
  defaultContextWindow: z.natural().min(1024).default(128_000)
    .description('Context window assumed for a model whose catalog entry has none.'),
  defaultMaxTokens: z.natural().min(256).default(8192)
    .description('Output limit assumed for a model whose catalog entry has none.'),
  searchCount: z.natural().min(1).max(50).default(10)
    .description('Results requested per web search, from 1 through 50; a smaller bound set by the caller wins.'),
  minuteLimitWaitMs: z.natural().min(1000).max(MAX_TIMER_DELAY_MS).default(60_000)
    .description('Milliseconds to wait before the one retry of a request the company\'s per-minute limit refused.'),
})

/** Register the member's company models while a Mindeck session exists. */
export function apply(ctx: Context, config: Config): void {
  const lifetime = new AbortController()
  ctx.effect(() => () => { lifetime.abort() }, 'mindeck-models: catalog requests')
  // Read through a function: a check after `await` must not reuse an earlier narrowing.
  const stopped = (): boolean => lifetime.signal.aborted
  let catalog: Readonly<Record<string, PiAiProviderProfile>> = {}
  let notes: ReadonlyMap<string, ModelNotes> = new Map()
  let registration: AdapterRegistrationHandle | undefined
  const cacheFile = join(config.cacheDir === '' ? join(resolveDshHome(), 'mindeck') : resolve(config.cacheDir), 'models-catalog.json')

  const token = async (): Promise<string | undefined> => (await ctx.mindeckAccount.session())?.token
  const adapter = new GatewayAdapter(createPiAiAdapter(ctx, {
    profiles: () => catalog,
    resolveApiKey: async () => {
      const current = await token()
      // The transcript shows this message as written; Mindeck Cloud explains its own refusals in Chinese as well.
      if (current === undefined) throw new LlmError('已退出 Mindeck 企业账号，请登录后重试。', SIGN_IN_REQUIRED_CODE)
      return current
    },
    auth: piAiAuthFrom(ctx),
  }), {
    token,
    sessionEnded: (rejected) => {
      void ctx.mindeckAccount.rejectToken(rejected).catch((error: unknown) => {
        ctx.logger.warn('mindeck-models: could not end the rejected session', error)
      })
    },
    // The company may have withdrawn the model, so the other company lists are checked as well.
    modelMissing: () => { refresh(); ctx.mindeckAccount.requestSync() },
    notes: model => notes.get(model),
    // The company may have changed the limit meanwhile.
    rateLimited: () => { ctx.mindeckAccount.requestSync() },
    minuteLimitWaitMs: config.minuteLimitWaitMs,
  })

  // Gateway requests of a digital employee's conversation name the employee, so Mindeck Cloud can attribute them.
  ctx.on('llm-pi-ai/request-headers', (request, _headers, next) => {
    const prepared = next()
    const employee = request.sessionId === undefined || !Object.hasOwn(catalog, request.provider)
      ? undefined
      : ctx.get('mindeckEmployees')?.employeeForSession(request.sessionId)
    if (employee !== undefined) prepared.set(EMPLOYEE_HEADER, employee)
    return prepared
  })

  // Feedback on an answer names the conversation's digital employee, as its gateway requests do.
  ctx.on('mindeck-account/employee', sessionId => ctx.get('mindeckEmployees')?.employeeForSession(sessionId))

  let searchStatus: SearchStatus | undefined
  const search = new MindeckSearchProvider({
    status: () => searchStatus,
    token,
    count: () => config.searchCount,
    originalQuestion: () => latestUserQuestion(ctx.get('agents')?.currentInitiator()?.session),
    employee: () => {
      const initiator = ctx.get('agents')?.currentInitiator()
      return initiator === undefined ? undefined : ctx.get('mindeckEmployees')?.employeeForSession(initiator.id)
    },
    sessionEnded: (rejected) => {
      void ctx.mindeckAccount.rejectToken(rejected).catch((error: unknown) => {
        ctx.logger.warn('mindeck-models: could not end the rejected session', error)
      })
    },
  })
  ctx.inject(['web'], (child) => { child.web.registerSearchProvider(search) })

  /** Publish one catalog; registrations and listings change only when it differs. */
  const publish = (next: Record<string, PiAiProviderProfile>): void => {
    if (deepEqualJson(next, catalog)) return
    const previous = catalog
    const routes = Object.keys(next)
    // The registry reads route names through the adapter while registering, so the new catalog comes first.
    catalog = next
    try {
      if (routes.length === 0) {
        registration?.()
        registration = undefined
      } else if (registration === undefined) {
        registration = ctx.llm.registerAdapter(routes, adapter)
      } else {
        registration.replace(routes)
      }
    } catch (error) {
      catalog = previous
      throw error
    }
    for (const route of new Set([...Object.keys(previous), ...routes])) {
      if (!deepEqualJson(previous[route], next[route])) ctx.emit('llm/models-updated', route)
    }
    void ensureDefaultModel()
  }

  /** Point the default model at a company model when it names a model this desktop cannot use. */
  const ensureDefaultModel = async (): Promise<void> => {
    const defaults = ctx.get('agentDefaultModel')
    const route = Object.keys(catalog)[0]
    const first = route === undefined ? undefined : catalog[route]?.models?.[0]?.id
    if (defaults === undefined || route === undefined || first === undefined) return
    const selection = defaults.currentSelection()
    const own = catalog[selection.provider]
    const usable = own === undefined
      ? ctx.llm.listProviders().some(provider => provider.id === selection.provider)
      : own.models?.some(model => model.id === selection.model) === true
    if (usable) return
    try { await defaults.saveSelection({ provider: route, model: first }) }
    catch (error) { ctx.logger.warn('mindeck-models: could not save the default model', error) }
  }

  let retryDelay = config.retryIntervalMs
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  ctx.effect(() => () => { clearTimeout(retryTimer) }, 'mindeck-models: catalog retry timer')
  /** Read again soon after a failure, waiting twice as long after each further failure. */
  const scheduleRetry = (): void => {
    clearTimeout(retryTimer)
    if (stopped()) return
    const delay = retryDelay
    retryDelay = Math.min(retryDelay * 2, config.refreshIntervalMs)
    retryTimer = setTimeout(() => { refresh() }, delay)
  }

  let running: Promise<void> | undefined
  let again = false
  // Read through a function: `load` may request a rerun while this loop awaits it.
  const rerunRequested = (): boolean => again
  /** Read the catalog once; a request made while one runs reruns it afterwards. */
  function refresh(): void {
    if (stopped()) return
    if (running !== undefined) { again = true; return }
    running = (async () => {
      do {
        again = false
        await load().then(() => {
          retryDelay = config.retryIntervalMs
          clearTimeout(retryTimer)
        }, (error: unknown) => {
          if (stopped()) return
          ctx.logger.warn('mindeck-models: keeping the current model catalog; refresh failed', error)
          scheduleRetry()
        })
      } while (rerunRequested() && !stopped())
    })().finally(() => { running = undefined })
  }

  /** Publish the routes and model notes of one catalog for `companyName`. */
  const publishModels = (models: readonly CatalogModel[], companyName: string): void => {
    const { profiles: next, conflicting } = routeProfiles(models, companyName, {
      contextWindow: config.defaultContextWindow, maxTokens: config.defaultMaxTokens,
    }, { maxRetryWaitMs: config.minuteLimitWaitMs })
    if (conflicting.length > 0) {
      ctx.logger.warn(`mindeck-models: left out models with a second gateway address: ${conflicting.join(', ')}`)
    }
    notes = new Map(models.map(model => [model.id, { description: model.description, recommended: model.recommended }]))
    publish(next)
  }

  const load = async (): Promise<void> => {
    const session = await ctx.mindeckAccount.session()
    if (stopped()) return
    if (session === undefined) { notes = new Map(); searchStatus = undefined; publish({}); return }
    const owner = { cloudUrl: session.cloudUrl, userId: session.bootstrap.user.id }
    // Until Mindeck Cloud answers, the models of this member's last catalog stay selectable.
    if (Object.keys(catalog).length === 0) {
      const cached = await readCachedCatalog(cacheFile, owner).catch((error: unknown) => {
        ctx.logger.warn('mindeck-models: could not read the saved model catalog', error)
        return undefined
      })
      if (cached !== undefined && !stopped() && (await ctx.mindeckAccount.session())?.token === session.token) {
        publishModels(cached, session.bootstrap.company.name)
      }
    }
    using limit = deadline(lifetime.signal, config.requestTimeoutMs, 'MINDECK_MODELS_TIMEOUT')
    const listing = await fetchCatalog(session.bootstrap.endpoints.models, session.token, limit.signal)
    if (stopped()) return
    if (listing === 'sign-in-required') {
      await ctx.mindeckAccount.rejectToken(session.token)
      notes = new Map()
      searchStatus = undefined
      publish({})
      return
    }
    if (listing.skipped.length > 0) {
      ctx.logger.warn(`mindeck-models: skipped ${listing.skipped.length} catalog entries in an unknown format`)
    }
    publishModels(listing.models, session.bootstrap.company.name)
    await loadSearchStatus(session.bootstrap.endpoints.webSearch, session.token)
    await writeCachedCatalog(cacheFile, owner, listing.models).catch((error: unknown) => {
      ctx.logger.warn('mindeck-models: could not save the model catalog for the next start', error)
    })
  }

  /** Read whether the company offers web search; a failed read keeps the last answer for this session. */
  const loadSearchStatus = async (url: string | undefined, sessionToken: string): Promise<void> => {
    if (url === undefined) { searchStatus = undefined; return }
    using limit = deadline(lifetime.signal, config.requestTimeoutMs, 'MINDECK_MODELS_TIMEOUT')
    const status = await fetchSearchStatus(url, sessionToken, limit.signal).catch((error: unknown) => {
      ctx.logger.warn('mindeck-models: keeping the current web search status; refresh failed', error)
      return undefined
    })
    if (stopped() || status === undefined) return
    if (status === 'sign-in-required') { await ctx.mindeckAccount.rejectToken(sessionToken); return }
    searchStatus = status
  }

  ctx.on('mindeck-account/changed', () => { refresh() })
  ctx.on('mindeck-account/revised', (topics) => { if (topics.has('models') || topics.has('webSearch')) refresh() })
  ctx.effect(() => {
    const timer = setInterval(() => { refresh() }, config.refreshIntervalMs)
    return () => { clearInterval(timer) }
  }, 'mindeck-models: catalog refresh timer')
  refresh()
}

/**
 * Read the text of the latest prompt the member typed, the question behind the current search.
 * @param session - the initiating Session, when the search runs inside one.
 * @returns the prompt's joined text blocks, or undefined without a prompt.
 */
function latestUserQuestion(session: Session | undefined): string | undefined {
  const prompt = session?.deriveMessages().findLast(message => message.role === 'user' && message.source.kind === 'user')
  return prompt?.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
}
