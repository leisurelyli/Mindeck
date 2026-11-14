/** Mindeck Cloud gateway failures mapped to Harness failure codes and account actions. */
import { LlmAdapter, QUOTA_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm'
import type { ImageAttachmentRef, ImageRequestTarget } from '@deepseek-ai/dsh-attachment'
import type {
  GenerateOptions, LlmFailure, LlmImageRequestPricing, LlmModelBadge, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo,
  PreparedAdapterCall, ResolvedRetryPolicy, StreamChunk,
} from '@deepseek-ai/dsh-llm'

/** Failure code of a request Mindeck Cloud refused because the desktop session ended. */
export const SESSION_ENDED_CODE = 'ACCOUNT_TOKEN_INVALID'

/**
 * Failure code of a request Mindeck Cloud refused because the member's account cannot use models now, such as a
 * disabled account or an initial password still to change. Its message is the Cloud's explanation.
 */
export const ACCOUNT_UNAVAILABLE_CODE = 'ACCOUNT_UNAVAILABLE'

/** Failure code of a model request made while no Mindeck account is signed in. */
export const SIGN_IN_REQUIRED_CODE = 'MINDECK_SIGN_IN_REQUIRED'

/**
 * Failure code of a request the company's per-member limit refused again after the desktop waited once; it is not
 * retried, so a runaway loop stops instead of waiting forever.
 */
export const RATE_LIMITED_CODE = 'MINDECK_RATE_LIMITED'

/**
 * Failure code of a conversation's first request in a row that a company limit refused. Its `providerRetryAfterMs`
 * is the wait before the one retry `retryMemberLimits` makes; the base retry policy does not retry it.
 */
export const LIMIT_WAIT_CODE = 'MINDECK_LIMIT_WAIT'

/** Retry code the base retry policy waits on, for a provider's own 429. */
const RATE_LIMIT_CODE = 'RATE_LIMIT'

/**
 * Which company limit refused a request, by the `error.reason` of the gateway's 429: `minute` for the requests per
 * minute (`MEMBER_RATE_LIMIT`), `concurrency` for the requests running at once (`MEMBER_CONCURRENCY_LIMIT`). A 429
 * without a reason comes from the model provider.
 */
export type MemberLimit = 'minute' | 'concurrency'

const MEMBER_LIMIT_REASONS: Readonly<Record<string, MemberLimit>> = {
  MEMBER_RATE_LIMIT: 'minute',
  MEMBER_CONCURRENCY_LIMIT: 'concurrency',
}

/**
 * The gateway's fixed `Retry-After` of a request refused for the requests running at once, in milliseconds; the wait
 * when the 429 carries no usable `error.retryAfter`.
 */
const CONCURRENCY_RETRY_AFTER_MS = 3000

/** What the transcript says while the desktop waits out a company limit once. */
const LIMIT_WAIT_MESSAGES: Readonly<Record<MemberLimit, string>> = {
  minute: '请求较多，已达到企业设定的每分钟请求上限，稍后自动继续。',
  concurrency: '同时进行的请求较多，已达到企业设定的上限，稍后自动继续。',
}

/** What the transcript says when a company limit refused the request again after the wait. */
const LIMIT_LASTING_MESSAGES: Readonly<Record<MemberLimit, string>> = {
  minute: '这段对话的请求超过了企业设定的每分钟上限，可以稍后再试；如果经常遇到，请联系管理员。',
  concurrency: '同时进行的请求超过了企业设定的上限，可以等其他任务完成后再试；如果经常遇到，请联系管理员。',
}

/** Gateway request header naming the Mindeck Cloud id of the digital employee a conversation talks to. */
export const EMPLOYEE_HEADER = 'x-mindeck-employee'

/** What the company says about one catalog model. */
export interface ModelNotes {
  readonly description: string | null
  readonly recommended: boolean
}

/** Mark of a model the company recommends, beside its name in model pickers. */
export const RECOMMENDED_BADGE = { text: { en: 'Recommended', zh: '推荐' }, tone: 'info' } as const satisfies LlmModelBadge

/** What the gateway adapter does after a refused request, and what it adds to model listings. */
export interface GatewayHooks {
  /** Read the token a request is about to use; undefined while signed out. */
  readonly token: () => Promise<string | undefined>
  /** Mindeck Cloud refused `token` (HTTP 401). */
  readonly sessionEnded: (token: string) => void
  /** Mindeck Cloud no longer offers the requested model to this member (HTTP 404). */
  readonly modelMissing: () => void
  /** The company's notes on a catalog model, by model id; undefined for a model the catalog does not list. */
  readonly notes: (model: string) => ModelNotes | undefined
  /** Mindeck Cloud or the model provider refused a request as too many (HTTP 429). */
  readonly rateLimited: () => void
  /**
   * Milliseconds the desktop waits before its one retry of a request the per-minute company limit refused when the
   * 429 carries no usable `error.retryAfter`. The 429's `Retry-After` header does not reach the adapter, so this
   * covers the limit's whole window.
   */
  readonly minuteLimitWaitMs: number
  /** Longest `error.retryAfter` the desktop waits out, in milliseconds; a longer one counts as unusable. */
  readonly maxLimitWaitMs: number
}

/** What a provider failure says about the gateway's answer. */
export interface GatewayFailure {
  readonly status?: number
  /** The gateway's or the provider's message. */
  readonly text?: string
  /** `error.reason`, which the gateway sets on failures the desktop tells apart. */
  readonly reason?: string
  /**
   * `error.retryAfter`, the whole seconds the gateway asks the desktop to wait before retrying a request a company
   * limit refused; present only when it is a positive integer.
   */
  readonly retryAfter?: number
}

/**
 * Read the gateway's own message from a provider failure. The client SDKs report the gateway's JSON
 * error body, the error object inside it, or its message, with or without the HTTP status.
 * @param message - failure text from the client SDK.
 * @returns the HTTP status, the gateway message, `error.reason`, and a usable `error.retryAfter`, when the text carries
 *   them.
 */
export function readGatewayFailure(message: string): GatewayFailure {
  const status = /^\s*(\d{3})\b/.exec(message)?.[1]
  const json = message.indexOf('{')
  let text: string | undefined
  let reason: string | undefined
  let retryAfter: number | undefined
  if (json >= 0) {
    try {
      const body: unknown = JSON.parse(message.slice(json))
      // Anthropic reports the whole body (`{ error: { message } }`); OpenAI reports the error object itself.
      const error = typeof body === 'object' && body !== null && 'error' in body ? body.error : body
      const inner = typeof error === 'object' && error !== null && 'message' in error ? error.message : undefined
      if (typeof inner === 'string' && inner.length > 0) text = inner
      const code = typeof error === 'object' && error !== null && 'reason' in error ? error.reason : undefined
      if (typeof code === 'string' && code.length > 0) reason = code
      const after = typeof error === 'object' && error !== null && 'retryAfter' in error ? error.retryAfter : undefined
      if (typeof after === 'number' && Number.isSafeInteger(after) && after > 0) retryAfter = after
    } catch (_error) {
      // Not a JSON body: the SDK already reduced the response to its message, read below.
    }
  }
  if (text === undefined && status !== undefined) {
    const rest = message.replace(/^\s*\d{3}\b\s*/, '').trim()
    if (rest.length > 0 && !rest.startsWith('{')) text = rest
  }
  return {
    ...status === undefined ? {} : { status: Number(status) },
    ...text === undefined ? {} : { text },
    ...reason === undefined ? {} : { reason },
    ...retryAfter === undefined ? {} : { retryAfter },
  }
}

/**
 * Tell which company limit refused a request.
 * @param failure - failure reported by the pi-ai adapter.
 * @returns the limit named by the gateway's 429, or undefined for any other failure, a provider's own 429 included.
 */
export function memberLimitOf(failure: LlmFailure): MemberLimit | undefined {
  const read = readGatewayFailure(failure.message)
  const { reason } = read
  if ((failure.status ?? read.status) !== 429 || reason === undefined || !Object.hasOwn(MEMBER_LIMIT_REASONS, reason)) return undefined
  return MEMBER_LIMIT_REASONS[reason]
}

/**
 * Map one failed request: a refused session ends the local session, an exhausted quota stops retries
 * and shows the Cloud's explanation, and a missing model refreshes the catalog. A company limit's first refusal becomes
 * {@link LIMIT_WAIT_CODE} with the wait the gateway's `error.retryAfter` asks for, up to `hooks.maxLimitWaitMs`, or
 * else the limit's fallback wait; its refusal of the retry stops with an explanation. A provider's own 429 keeps the
 * base retry policy.
 * @param failure - failure reported by the pi-ai adapter.
 * @param token - token the request used.
 * @param hooks - account actions.
 * @param repeated - whether a company limit already refused the previous request of the same conversation.
 * @returns the failure to report.
 */
export function mapGatewayFailure(failure: LlmFailure, token: string | undefined, hooks: GatewayHooks, repeated: boolean): LlmFailure {
  const read = readGatewayFailure(failure.message)
  const status = failure.status ?? read.status
  const message = read.text ?? failure.message
  switch (status) {
    case 401:
      if (token !== undefined) hooks.sessionEnded(token)
      return { ...failure, status, code: SESSION_ENDED_CODE, message }
    case 402:
      return { ...failure, status, code: QUOTA_EXCEEDED_CODE, message }
    case 403:
      return { ...failure, status, code: ACCOUNT_UNAVAILABLE_CODE, message: read.text ?? '账号暂时无法使用企业模型，请联系管理员。' }
    case 404:
      hooks.modelMissing()
      return { ...failure, status, code: 'UNKNOWN_MODEL', message }
    case 429: {
      hooks.rateLimited()
      const limit = memberLimitOf({ ...failure, status })
      if (limit === undefined) {
        return { ...failure, status, code: RATE_LIMIT_CODE, message: `模型服务商暂时限流，请稍后再试。${read.text === undefined ? '' : `服务商说明：${read.text}`}` }
      }
      if (repeated) return { ...failure, status, code: RATE_LIMITED_CODE, message: LIMIT_LASTING_MESSAGES[limit] }
      const asked = read.retryAfter === undefined ? undefined : read.retryAfter * 1000
      const wait = asked !== undefined && asked <= hooks.maxLimitWaitMs ? asked
        : limit === 'concurrency' ? CONCURRENCY_RETRY_AFTER_MS : hooks.minuteLimitWaitMs
      return { ...failure, status, code: LIMIT_WAIT_CODE, message: LIMIT_WAIT_MESSAGES[limit], providerRetryAfterMs: wait }
    }
    case undefined:
      return failure
    default:
      return { ...failure, status, message }
  }
}

/**
 * Delegating adapter that applies {@link mapGatewayFailure} to every error finish. It remembers, per conversation,
 * that a company limit refused the last request, until a request of that conversation finishes otherwise or the
 * limit refuses it again. Auxiliary requests, such as a conversation's title, carry a `purpose`; they neither read
 * nor change that record, so a refused title request between a refusal and its retry does not reset it.
 */
export class GatewayAdapter extends LlmAdapter {
  /** Conversations whose last request a company limit refused. */
  private readonly limited = new Set<string>()

  /** @param inner - the pi-ai adapter serving the routes. @param hooks - account actions. */
  constructor(private readonly inner: LlmAdapter, private readonly hooks: GatewayHooks) { super() }

  override providerInfo(provider: string): LlmProviderInfo { return this.inner.providerInfo(provider) }
  override providerRetryPolicy(provider: string): ResolvedRetryPolicy | undefined { return this.inner.providerRetryPolicy(provider) }
  override imageRequestPricing(provider: string, model: string): LlmImageRequestPricing | undefined {
    return this.inner.imageRequestPricing(provider, model)
  }

  override imageRequestTarget(provider: string, model: string, image: ImageAttachmentRef): ImageRequestTarget {
    return this.inner.imageRequestTarget(provider, model, image)
  }

  /**
   * List the route's models with the company's description and a recommendation badge.
   * @param provider - route id.
   * @returns the inner listing, annotated.
   */
  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return (await this.inner.listModels(provider)).map((model) => {
      const notes = this.hooks.notes(model.id)
      if (notes === undefined) return model
      return {
        ...model,
        ...notes.description === null ? {} : { description: notes.description },
        ...notes.recommended ? { badge: RECOMMENDED_BADGE } : {},
      }
    })
  }
  override resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo> {
    return this.inner.resolveModel(provider, model, signal)
  }

  override async prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall> {
    const call = await this.inner.prepareCall(provider, model, signal)
    return { model: call.model, stream: options => this.guard(call.stream(options), options) }
  }

  stream(options: GenerateOptions): AsyncIterable<StreamChunk> { return this.guard(this.inner.stream(options), options) }

  // The packages that make auxiliary requests declare their purposes, so any string may arrive here.
  private async *guard(
    source: AsyncIterable<StreamChunk>, options: Pick<GenerateOptions<string>, 'sessionId' | 'purpose'>,
  ): AsyncIterable<StreamChunk> {
    const token = await this.hooks.token()
    // A request outside a conversation's own requests has no earlier request to compare with.
    const conversation = options.sessionId === undefined || options.purpose !== undefined ? undefined : String(options.sessionId)
    for await (const chunk of source) {
      if (chunk.type === 'finish' && chunk.reason.kind === 'error') {
        const { failure } = chunk.reason
        const repeated = conversation !== undefined && this.limited.has(conversation)
        if (conversation !== undefined && memberLimitOf(failure) !== undefined && !repeated) this.limited.add(conversation)
        else if (conversation !== undefined) this.limited.delete(conversation)
        yield { ...chunk, reason: { kind: 'error', failure: mapGatewayFailure(failure, token, this.hooks, repeated) } }
      } else {
        if (chunk.type === 'finish' && conversation !== undefined) this.limited.delete(conversation)
        yield chunk
      }
    }
  }
}
