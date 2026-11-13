/**
 * Company models for Mindeck Desktop. The plugin reads the signed-in member's model catalog from Mindeck
 * Cloud and serves it through pi-ai routes that call the Cloud gateway with the desktop session token:
 * `mindeck-anthropic`, `mindeck-openai`, and `mindeck-openai-responses`, each registered while it has
 * models.
 * @module @deepseek-ai/dsh-mindeck-models
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { AdapterRegistrationHandle } from '@deepseek-ai/dsh-llm'
import { createPiAiAdapter, piAiAuthFrom } from '@deepseek-ai/dsh-llm-pi-ai'
import type { PiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import type {} from '@deepseek-ai/dsh-mindeck-account'
import { deadline } from '@deepseek-ai/dsh-timeout'
import { deepEqualJson } from '@deepseek-ai/dsh-util-values'
import { fetchCatalog, routeProfiles } from './catalog.ts'
import { GatewayAdapter, SIGN_IN_REQUIRED_CODE } from './gateway-adapter.ts'

export { parseCatalog, routeProfiles, ROUTES } from './catalog.ts'
export type { CatalogModel, ModelApi, ParsedCatalog } from './catalog.ts'
export {
  ACCOUNT_UNAVAILABLE_CODE, GatewayAdapter, mapGatewayFailure, readGatewayFailure, SESSION_ENDED_CODE, SIGN_IN_REQUIRED_CODE,
} from './gateway-adapter.ts'

export const name = 'mindeck-models'
export const inject = ['llm', 'mindeckAccount']

/** Deployment options. */
export interface Config {
  /** Interval between catalog refreshes while signed in, in milliseconds. */
  refreshIntervalMs: number
  /** Timeout of one catalog request in milliseconds. */
  requestTimeoutMs: number
  /** Context window assumed for a model whose catalog entry has none. */
  defaultContextWindow: number
  /** Output limit assumed for a model whose catalog entry has none. */
  defaultMaxTokens: number
}

export const Config: z<Config> = z.object({
  refreshIntervalMs: z.natural().min(60_000).default(600_000)
    .description('Interval between model catalog refreshes while signed in, in milliseconds.'),
  requestTimeoutMs: z.natural().min(1000).default(15_000)
    .description('Timeout of one model catalog request in milliseconds.'),
  defaultContextWindow: z.natural().min(1024).default(128_000)
    .description('Context window assumed for a model whose catalog entry has none.'),
  defaultMaxTokens: z.natural().min(256).default(8192)
    .description('Output limit assumed for a model whose catalog entry has none.'),
})

/** Register the member's company models while a Mindeck session exists. */
export function apply(ctx: Context, config: Config): void {
  const lifetime = new AbortController()
  ctx.effect(() => () => { lifetime.abort() }, 'mindeck-models: catalog requests')
  // Read through a function: a check after `await` must not reuse an earlier narrowing.
  const stopped = (): boolean => lifetime.signal.aborted
  let catalog: Readonly<Record<string, PiAiProviderProfile>> = {}
  let registration: AdapterRegistrationHandle | undefined

  const token = async (): Promise<string | undefined> => (await ctx.mindeckAccount.session())?.token
  const adapter = new GatewayAdapter(createPiAiAdapter(ctx, {
    profiles: () => catalog,
    resolveApiKey: async () => {
      const current = await token()
      // The transcript shows this message as written; Mindeck Cloud explains its own refusals in Chinese as well.
      if (current === undefined) throw new LlmError('已退出 Mindeck 公司账号，请登录后重试。', SIGN_IN_REQUIRED_CODE)
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
    modelMissing: () => { refresh() },
  })

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
        await load().catch((error: unknown) => {
          if (!stopped()) ctx.logger.warn('mindeck-models: keeping the current model catalog; refresh failed', error)
        })
      } while (rerunRequested() && !stopped())
    })().finally(() => { running = undefined })
  }

  const load = async (): Promise<void> => {
    const session = await ctx.mindeckAccount.session()
    if (stopped()) return
    if (session === undefined) { publish({}); return }
    using limit = deadline(lifetime.signal, config.requestTimeoutMs, 'MINDECK_MODELS_TIMEOUT')
    const listing = await fetchCatalog(session.bootstrap.endpoints.models, session.token, limit.signal)
    if (stopped()) return
    if (listing === 'sign-in-required') {
      await ctx.mindeckAccount.rejectToken(session.token)
      publish({})
      return
    }
    if (listing.skipped.length > 0) {
      ctx.logger.warn(`mindeck-models: skipped ${listing.skipped.length} catalog entries in an unknown format`)
    }
    const { profiles: next, conflicting } = routeProfiles(listing.models, session.bootstrap.company.name, {
      contextWindow: config.defaultContextWindow, maxTokens: config.defaultMaxTokens,
    })
    if (conflicting.length > 0) {
      ctx.logger.warn(`mindeck-models: left out models with a second gateway address: ${conflicting.join(', ')}`)
    }
    publish(next)
  }

  ctx.on('mindeck-account/changed', () => { refresh() })
  ctx.effect(() => {
    const timer = setInterval(() => { refresh() }, config.refreshIntervalMs)
    return () => { clearInterval(timer) }
  }, 'mindeck-models: catalog refresh timer')
  refresh()
}
