/** The member's model catalog from Mindeck Cloud and the pi-ai routes that serve it. */
import { z } from 'zod'
import type { PiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'

/** Client API a model is called through, as the Cloud catalog names it. */
export type ModelApi = 'anthropic-messages' | 'openai-completions' | 'openai-responses'

/** Harness route of each client API; a route is registered only while it has models. */
export const ROUTES: Readonly<Record<ModelApi, string>> = {
  'anthropic-messages': 'mindeck-anthropic',
  'openai-completions': 'mindeck-openai',
  'openai-responses': 'mindeck-openai-responses',
}

const modelSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().nullable().optional(),
  recommended: z.boolean().optional(),
  api: z.enum(['anthropic-messages', 'openai-completions', 'openai-responses']),
  baseUrl: z.url(),
  contextWindow: z.number().int().positive().nullable(),
  maxOutputTokens: z.number().int().positive().nullable(),
  inputModalities: z.array(z.string()),
})

/** One model the member may use, as `GET /api/desktop/models` describes it. */
export interface CatalogModel {
  readonly id: string
  readonly displayName: string
  /** What the company says the model is good for; null when it says nothing. */
  readonly description: string | null
  /** Whether the company recommends the model; recommended models come first in the catalog. */
  readonly recommended: boolean
  readonly api: ModelApi
  /** Gateway base URL in the client SDK's convention. */
  readonly baseUrl: string
  readonly contextWindow: number | null
  readonly maxOutputTokens: number | null
  readonly input: ReadonlyArray<'text' | 'image'>
}

/** A catalog response: the usable models and the entries that could not be read. */
export interface ParsedCatalog {
  readonly models: readonly CatalogModel[]
  /** Positions of entries skipped because they do not match the catalog format. */
  readonly skipped: readonly number[]
}

/**
 * Read a `GET /api/desktop/models` body. A malformed entry is skipped so that one model the desktop
 * does not understand never hides the others.
 * @param body - parsed JSON response.
 * @returns the readable models in catalog order.
 * @throws Error when the body is not a catalog.
 */
export function parseCatalog(body: unknown): ParsedCatalog {
  const list = z.object({ models: z.array(z.unknown()) }).safeParse(body)
  if (!list.success) throw new Error('Mindeck Cloud returned a model catalog in an unknown format')
  const models: CatalogModel[] = []
  const skipped: number[] = []
  list.data.models.forEach((entry, index) => {
    const parsed = modelSchema.safeParse(entry)
    if (!parsed.success) { skipped.push(index); return }
    const { inputModalities, description, recommended, ...model } = parsed.data
    const input = inputModalities.includes('image') ? ['text', 'image'] as const : ['text'] as const
    models.push({ ...model, description: description ?? null, recommended: recommended ?? false, input })
  })
  return { models, skipped }
}

/** Sizes used for a model whose catalog entry leaves them unset. */
export interface ModelDefaults {
  readonly contextWindow: number
  readonly maxTokens: number
}

/** How every route calls the gateway. */
export interface RouteOptions {
  /** Longest provider-requested wait, in milliseconds, before the base retry policy retries a refused request. */
  readonly maxRetryWaitMs: number
}

/**
 * Group catalog models into one pi-ai profile per client API, each named after the company: members choose
 * models, not protocols. A route's endpoint is its first model's gateway URL; a later model with another URL
 * for the same API is left out and reported.
 * @param models - the member's models in catalog order.
 * @param companyName - name shown for every route.
 * @param defaults - sizes for models the catalog does not size.
 * @param options - the retry wait and the output limit field of every route.
 * @returns profiles keyed by route, and the ids of models left out.
 */
export function routeProfiles(
  models: readonly CatalogModel[],
  companyName: string,
  defaults: ModelDefaults,
  options: RouteOptions,
): { profiles: Record<string, PiAiProviderProfile>; conflicting: string[] } {
  const groups = new Map<ModelApi, CatalogModel[]>()
  const conflicting: string[] = []
  for (const model of models) {
    const group = groups.get(model.api)
    if (group === undefined) groups.set(model.api, [model])
    else if (group[0]?.baseUrl === model.baseUrl) group.push(model)
    else conflicting.push(model.id)
  }
  const profiles: Record<string, PiAiProviderProfile> = {}
  for (const [api, group] of groups) {
    const first = group[0]
    if (first === undefined) continue
    profiles[ROUTES[api]] = {
      displayName: companyName,
      api,
      baseURL: first.baseUrl,
      defaultContextWindow: defaults.contextWindow,
      defaultMaxTokens: defaults.maxTokens,
      // A company limit asks for up to a minute's wait, longer than the base policy's default ceiling.
      retryPolicy: { mode: 'normal', backoff: { maxDelayMs: options.maxRetryWaitMs } },
      models: group.map(model => ({
        id: model.id,
        name: model.displayName,
        input: [...model.input],
        ...model.contextWindow === null ? {} : { contextWindow: model.contextWindow },
        ...model.maxOutputTokens === null ? {} : { maxTokens: model.maxOutputTokens },
      })),
    }
  }
  return { profiles, conflicting }
}

/**
 * Fetch the member's catalog.
 * @param url - the bootstrap `endpoints.models` URL.
 * @param token - desktop session token.
 * @param signal - cancellation and timeout.
 * @returns the catalog, or `sign-in-required` when Mindeck Cloud rejects the token.
 * @throws Error when Mindeck Cloud is unreachable or answers with another failure.
 */
export async function fetchCatalog(url: string, token: string, signal: AbortSignal): Promise<ParsedCatalog | 'sign-in-required'> {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, redirect: 'error', signal })
  if (response.status === 401) return 'sign-in-required'
  if (!response.ok) throw new Error(`Mindeck Cloud model catalog request failed with HTTP ${response.status}`)
  const body: unknown = await response.json()
  return parseCatalog(body)
}
