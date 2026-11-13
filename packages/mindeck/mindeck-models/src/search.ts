/** Company web search: the DeepSeek Search API reached through the Mindeck Cloud gateway with the desktop session. */
import { z } from 'zod'
import { WebError, type WebSearchProvider, type WebSearchRequest, type WebSearchResult } from '@deepseek-ai/dsh-web'
import { EMPLOYEE_HEADER } from './gateway-adapter.ts'

/** Stable id the company search provider registers under. */
export const MINDECK_SEARCH_PROVIDER_ID = 'mindeck-search'

/** Longest `ori_question` the DeepSeek Search API accepts, in characters. */
const ORIGINAL_QUESTION_MAX_CHARS = 128

const statusSchema = z.object({ enabled: z.boolean(), url: z.url() })

/** Whether the company offers web search now, as `GET /api/desktop/web-search` reports it. */
export type SearchStatus = z.infer<typeof statusSchema>

/**
 * Read whether the company offers web search.
 * @param url - the bootstrap `endpoints.webSearch` URL.
 * @param token - desktop session token.
 * @param signal - cancellation and timeout.
 * @returns the status, or `sign-in-required` when Mindeck Cloud rejects the token.
 * @throws Error when Mindeck Cloud is unreachable, fails, or answers in an unknown format.
 */
export async function fetchSearchStatus(url: string, token: string, signal: AbortSignal): Promise<SearchStatus | 'sign-in-required'> {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, redirect: 'error', signal })
  if (response.status === 401) return 'sign-in-required'
  if (!response.ok) throw new Error(`Mindeck Cloud web search status request failed with HTTP ${response.status}`)
  const parsed = statusSchema.safeParse(await response.json())
  if (!parsed.success) throw new Error('Mindeck Cloud returned a web search status in an unknown format')
  return parsed.data
}

const resultSchema = z.object({ results: z.array(z.unknown()) })

/** One DeepSeek Search API result; the API may leave text fields empty or out. */
const resultItemSchema = z.object({
  url: z.string().min(1),
  title: z.string().nullish(),
  snippet: z.string().nullish(),
  summary: z.string().nullish(),
  date: z.string().nullish(),
})

/**
 * @param value - text field of one result.
 * @returns the text when it has content, otherwise undefined.
 */
const present = (value: string | null | undefined): string | undefined =>
  value === null || value === undefined || value.length === 0 ? undefined : value

const failureSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) })

/**
 * Project a DeepSeek Search API answer into the web service's sources.
 * @param body - untrusted JSON relayed by the gateway.
 * @returns sources in provider order.
 * @throws {@link WebError} `WEB_PROVIDER_ERROR` when the body has no `results` list.
 */
export function mapSearchResults(body: unknown): WebSearchResult {
  const parsed = resultSchema.safeParse(body)
  if (!parsed.success) throw new WebError('Mindeck Cloud returned search results in an unknown format', 'WEB_PROVIDER_ERROR')
  const sources: Array<WebSearchResult['sources'][number]> = []
  // A result without an address cannot be cited; it is left out and the rest are kept.
  for (const raw of parsed.data.results) {
    const item = resultItemSchema.safeParse(raw)
    if (!item.success) continue
    const title = present(item.data.title)
    const snippet = present(item.data.snippet)
    const summary = present(item.data.summary)
    const publishedAt = present(item.data.date)
    sources.push({
      url: item.data.url,
      ...title === undefined ? {} : { title },
      ...snippet === undefined ? {} : { snippet },
      ...summary === undefined ? {} : { summary },
      ...publishedAt === undefined ? {} : { publishedAt },
    })
  }
  return { sources, truncated: false }
}

/** Live inputs of the company search provider. */
export interface MindeckSearchHooks {
  /** The current search status, or undefined while signed out or not yet read. */
  status: () => SearchStatus | undefined
  /** Desktop session token, or undefined while signed out. */
  token: () => Promise<string | undefined>
  /** Results requested per search when the caller sets no smaller bound. */
  count: () => number
  /** The member's question that led to the current search, when known. */
  originalQuestion: () => string | undefined
  /** Mindeck Cloud id of the digital employee whose conversation runs the current search, when it has one. */
  employee: () => string | undefined
  /** End a session the gateway rejected. */
  sessionEnded: (token: string) => void
}

/**
 * Searches through the Mindeck Cloud gateway, which uses the company's DeepSeek key and counts
 * each search against the member's quota. Gateway refusals reach the model in the gateway's
 * own wording, so the member reads why a search failed.
 */
export class MindeckSearchProvider implements WebSearchProvider {
  readonly id = MINDECK_SEARCH_PROVIDER_ID
  readonly title = 'Mindeck'
  readonly description: NonNullable<WebSearchProvider['description']> = {
    en: 'Searches the web through Mindeck Cloud with the key your company configures. Each search counts toward your quota.',
    zh: '通过 Mindeck Cloud 使用企业配置的密钥联网搜索，每次搜索计入你的额度。',
  }

  /** @param hooks - live status, session, and settings, read at each call. */
  constructor(private readonly hooks: MindeckSearchHooks) {}

  /** Usable once Mindeck Cloud has reported the company's search status for the signed-in member. */
  available(): boolean {
    return this.hooks.status() !== undefined
  }

  /** Searches can run while the company offers them, so the model sees no search tool otherwise. */
  ready(): Promise<boolean> {
    return Promise.resolve(this.hooks.status()?.enabled === true)
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const status = this.hooks.status()
    const token = await this.hooks.token()
    if (status === undefined || token === undefined) {
      throw new WebError('已退出 Mindeck 企业账号，请登录后重试。', 'WEB_PROVIDER_UNAVAILABLE')
    }
    if (!status.enabled) throw new WebError('企业没有开启联网搜索。', 'WEB_PROVIDER_UNAVAILABLE')
    const question = this.hooks.originalQuestion()?.trim().slice(0, ORIGINAL_QUESTION_MAX_CHARS)
    const count = Math.min(this.hooks.count(), request.maxResults ?? Number.POSITIVE_INFINITY)
    const employee = this.hooks.employee()
    let response: Response
    try {
      response = await fetch(status.url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`, 'content-type': 'application/json',
          ...employee === undefined ? {} : { [EMPLOYEE_HEADER]: employee },
        },
        body: JSON.stringify({ query: request.query, count, ...question ? { ori_question: question } : {} }),
        redirect: 'error',
        ...signal === undefined ? {} : { signal },
      })
    } catch (error) {
      if (signal?.aborted === true) throw new WebError('Mindeck search aborted', 'WEB_ABORTED', { cause: error })
      throw new WebError('无法连接 Mindeck Cloud，请检查网络后重试。', 'WEB_PROVIDER_ERROR', { cause: error })
    }
    const body: unknown = await response.json().catch((error: unknown) => {
      throw new WebError(`Mindeck Cloud answered the search with an unreadable body (HTTP ${response.status})`, 'WEB_PROVIDER_ERROR', { cause: error })
    })
    if (response.ok) return mapSearchResults(body)
    if (response.status === 401) this.hooks.sessionEnded(token)
    const failure = failureSchema.safeParse(body)
    const message = failure.success ? failure.data.error.message : `Mindeck Cloud 搜索失败（HTTP ${response.status}）。`
    throw new WebError(message, 'WEB_PROVIDER_ERROR')
  }
}
