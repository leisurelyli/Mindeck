/** Mindeck Cloud gateway failures mapped to Harness failure codes and account actions. */
import { LlmAdapter, QUOTA_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm'
import type { ImageAttachmentRef, ImageRequestTarget } from '@deepseek-ai/dsh-attachment'
import type {
  GenerateOptions, LlmFailure, LlmImageRequestPricing, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo,
  PreparedAdapterCall, ResolvedRetryPolicy, StreamChunk,
} from '@deepseek-ai/dsh-llm'

/** Failure code of a request Mindeck Cloud refused because the desktop session ended. */
export const SESSION_ENDED_CODE = 'ACCOUNT_TOKEN_INVALID'

/** What the gateway adapter does after a refused request. */
export interface GatewayHooks {
  /** Read the token a request is about to use; undefined while signed out. */
  readonly token: () => Promise<string | undefined>
  /** Mindeck Cloud refused `token` (HTTP 401). */
  readonly sessionEnded: (token: string) => void
  /** Mindeck Cloud no longer offers the requested model to this member (HTTP 404). */
  readonly modelMissing: () => void
}

/**
 * Read the gateway's own message from a provider failure. The client SDKs report the gateway's JSON
 * error body, the error object inside it, or its message, with or without the HTTP status.
 * @param message - failure text from the client SDK.
 * @returns the HTTP status and the gateway message, when the text carries them.
 */
export function readGatewayFailure(message: string): { status?: number; text?: string } {
  const status = /^\s*(\d{3})\b/.exec(message)?.[1]
  const json = message.indexOf('{')
  let text: string | undefined
  if (json >= 0) {
    try {
      const body: unknown = JSON.parse(message.slice(json))
      // Anthropic reports the whole body (`{ error: { message } }`); OpenAI reports the error object itself.
      const error = typeof body === 'object' && body !== null && 'error' in body ? body.error : body
      const inner = typeof error === 'object' && error !== null && 'message' in error ? error.message : undefined
      if (typeof inner === 'string' && inner.length > 0) text = inner
    } catch (_error) {
      // Not a JSON body: the SDK already reduced the response to its message, read below.
    }
  }
  if (text === undefined && status !== undefined) {
    const rest = message.replace(/^\s*\d{3}\b\s*/, '').trim()
    if (rest.length > 0 && !rest.startsWith('{')) text = rest
  }
  return { ...status === undefined ? {} : { status: Number(status) }, ...text === undefined ? {} : { text } }
}

/**
 * Map one failed request: a refused session ends the local session, an exhausted quota stops retries
 * and shows the Cloud's explanation, and a missing model refreshes the catalog.
 * @param failure - failure reported by the pi-ai adapter.
 * @param token - token the request used.
 * @param hooks - account actions.
 * @returns the failure to report.
 */
export function mapGatewayFailure(failure: LlmFailure, token: string | undefined, hooks: GatewayHooks): LlmFailure {
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
      return { ...failure, status, code: 'AUTH', message }
    case 404:
      hooks.modelMissing()
      return { ...failure, status, code: 'UNKNOWN_MODEL', message }
    case undefined:
      return failure
    default:
      return { ...failure, status, message }
  }
}

/** Delegating adapter that applies {@link mapGatewayFailure} to every error finish. */
export class GatewayAdapter extends LlmAdapter {
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

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> { return this.inner.listModels(provider) }
  override resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo> {
    return this.inner.resolveModel(provider, model, signal)
  }

  override async prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall> {
    const call = await this.inner.prepareCall(provider, model, signal)
    return { model: call.model, stream: options => this.guard(call.stream(options)) }
  }

  stream(options: GenerateOptions): AsyncIterable<StreamChunk> { return this.guard(this.inner.stream(options)) }

  private async *guard(source: AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk> {
    const token = await this.hooks.token()
    for await (const chunk of source) {
      if (chunk.type === 'finish' && chunk.reason.kind === 'error') {
        yield { ...chunk, reason: { kind: 'error', failure: mapGatewayFailure(chunk.reason.failure, token, this.hooks) } }
      } else {
        yield chunk
      }
    }
  }
}
