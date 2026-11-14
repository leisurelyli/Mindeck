/** The member's model catalog from Mindeck Cloud and the pi-ai routes that serve it. */
import { z } from 'zod'
import { assertModelProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import type {
  PiAiCompatProfile, PiAiModelProfile, PiAiModelRoute, PiAiProviderProfile, PiAiReasoningEfforts,
} from '@deepseek-ai/dsh-llm-pi-ai'

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
  // Read as they come: a setting pi-ai refuses drops that setting, never the model.
  reasoningEfforts: z.unknown().optional(),
  defaultReasoning: z.unknown().optional(),
  compat: z.unknown().optional(),
})

/** A thinking level, as pi-ai names it. */
export type ReasoningLevel = NonNullable<PiAiModelProfile['reasoning']>

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
  /**
   * Thinking levels the company offers, each with the value the request sends for it; `false` marks a model that
   * does not think. Null offers no levels, so the model selector shows none and the model's own default applies.
   */
  readonly reasoningEfforts: false | PiAiReasoningEfforts | null
  /** Level a conversation starts at; null starts without a level. */
  readonly defaultReasoning: ReasoningLevel | null
  /** pi-ai request compatibility switches for the model's client API; null leaves them to pi-ai's detection. */
  readonly compat: PiAiCompatProfile | null
}

/** Catalog fields of a model that pi-ai checks; a refused one is left out and the model stays usable. */
export type SettingField = 'reasoningEfforts' | 'defaultReasoning' | 'compat'

/** A catalog setting left out of a model because pi-ai refuses it. */
export interface IgnoredSetting {
  readonly model: string
  readonly field: SettingField
  /** pi-ai's diagnostic, naming the route, the model, and the value at fault. */
  readonly reason: string
}

/** A catalog response: the usable models and what could not be read. */
export interface ParsedCatalog {
  readonly models: readonly CatalogModel[]
  /** Positions of entries skipped because they do not match the catalog format. */
  readonly skipped: readonly number[]
  /** Settings left out of usable models. */
  readonly ignored: readonly IgnoredSetting[]
}

/**
 * Each setting with the model profile field it becomes, in checking order: the default level must name one of the
 * levels kept before it.
 */
const SETTINGS: ReadonlyArray<readonly [SettingField, 'reasoningEfforts' | 'reasoning' | 'compat']> = [
  ['reasoningEfforts', 'reasoningEfforts'],
  ['defaultReasoning', 'reasoning'],
  ['compat', 'compat'],
]

/**
 * The entry pi-ai accepts on the route, or its reason for refusing it.
 * @param route - the route the model joins.
 * @param entry - candidate model profile.
 * @returns the entry, typed, or pi-ai's diagnostic.
 */
function accepted(route: PiAiModelRoute, entry: unknown): PiAiModelProfile | string {
  try { assertModelProfile(route, entry) }
  catch (error) { return String(error) }
  return entry
}

/**
 * Attach the thinking and compatibility settings pi-ai accepts for the model's client API, checked as a
 * `providers` write checks them. A refused setting is left out and reported; the model stays usable without it.
 * @param model - the model's other fields.
 * @param settings - the settings as the catalog sent them; undefined and null set nothing.
 * @returns the model with its accepted settings, and the settings left out.
 */
export function withSettings(
  model: Omit<CatalogModel, SettingField>,
  settings: Readonly<Partial<Record<SettingField, unknown>>>,
): { model: CatalogModel; ignored: IgnoredSetting[] } {
  const route = { provider: ROUTES[model.api], api: model.api, baseURL: model.baseUrl }
  let entry: PiAiModelProfile = { id: model.id }
  const ignored: IgnoredSetting[] = []
  for (const [field, key] of SETTINGS) {
    const value = settings[field]
    if (value === undefined || value === null) continue
    const result = accepted(route, { ...entry, [key]: value })
    if (typeof result === 'string') ignored.push({ model: model.id, field, reason: result })
    else entry = result
  }
  return {
    model: {
      ...model,
      reasoningEfforts: entry.reasoningEfforts ?? null,
      defaultReasoning: entry.reasoning ?? null,
      compat: entry.compat ?? null,
    },
    ignored,
  }
}

/**
 * Read a `GET /api/desktop/models` body. A malformed entry is skipped so that one model the desktop
 * does not understand never hides the others, and a setting pi-ai refuses is left out of its model.
 * @param body - parsed JSON response.
 * @returns the readable models in catalog order.
 * @throws Error when the body is not a catalog.
 */
export function parseCatalog(body: unknown): ParsedCatalog {
  const list = z.object({ models: z.array(z.unknown()) }).safeParse(body)
  if (!list.success) throw new Error('Mindeck Cloud returned a model catalog in an unknown format')
  const models: CatalogModel[] = []
  const skipped: number[] = []
  const ignored: IgnoredSetting[] = []
  list.data.models.forEach((entry, index) => {
    const parsed = modelSchema.safeParse(entry)
    if (!parsed.success) { skipped.push(index); return }
    const { inputModalities, description, recommended, reasoningEfforts, defaultReasoning, compat, ...base } = parsed.data
    const input = inputModalities.includes('image') ? ['text', 'image'] as const : ['text'] as const
    const read = withSettings(
      { ...base, description: description ?? null, recommended: recommended ?? false, input },
      { reasoningEfforts, defaultReasoning, compat },
    )
    models.push(read.model)
    ignored.push(...read.ignored)
  })
  return { models, skipped, ignored }
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
 * for the same API is left out and reported. Each model carries its own thinking levels, initial level, and
 * compatibility switches, so a change to them never moves the model to another route.
 * @param models - the member's models in catalog order.
 * @param companyName - name shown for every route.
 * @param defaults - sizes for models the catalog does not size.
 * @param options - the retry wait of every route.
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
        ...model.reasoningEfforts === null ? {} : { reasoningEfforts: model.reasoningEfforts },
        ...model.defaultReasoning === null ? {} : { reasoning: model.defaultReasoning },
        ...model.compat === null ? {} : { compat: model.compat },
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
