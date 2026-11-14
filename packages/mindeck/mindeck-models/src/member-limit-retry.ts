/** The one retry of a conversation's model request that a company limit refused. */
import { randomUUID } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import type { Context } from '@deepseek-ai/cordis'
import type { RequestErrorAction } from '@deepseek-ai/dsh-agent'
import { RetryId } from '@deepseek-ai/dsh-llm-retry'
import type {} from '@deepseek-ai/dsh-llm-retry/types'
import { LIMIT_WAIT_CODE } from './gateway-adapter.ts'

/** `policyKey` of the retry records this module writes, apart from every base retry policy's key. */
export const MEMBER_LIMIT_POLICY_KEY = 'mindeck-models/member-limit'

/**
 * Wait out a {@link LIMIT_WAIT_CODE} failure once and retry the request. The wait is recorded as a one-of-one retry
 * (`llm/retry`, then `llm/retry-started` when it ends), so the transcript counts the attempts the company limit
 * allows rather than the route's provider retries. Stopping the turn or disposing the plugin ends the wait without a
 * retry, and the loop reports the refusal.
 * @param ctx - plugin context that owns the listener.
 * @param lifetime - aborted when the plugin is disposed.
 */
export function retryMemberLimits(ctx: Context, lifetime: AbortSignal): void {
  ctx.on('agent/request-error', async ({ agent, turn, step, provider, failure, signal }, next): Promise<RequestErrorAction> => {
    const delayMs = failure.providerRetryAfterMs
    if (failure.code !== LIMIT_WAIT_CODE || delayMs === undefined) return next()
    const stop = AbortSignal.any([signal, lifetime])
    if (stop.aborted) return undefined
    const retryId = RetryId(randomUUID())
    agent.session.append('llm/retry', {
      retryId, turn, step, provider, mode: 'normal', policyKey: MEMBER_LIMIT_POLICY_KEY, retry: 1, maxRetries: 1, delayMs, failure,
    })
    try { await sleep(delayMs, undefined, { signal: stop }) }
    catch (_aborted) { return undefined } // The turn stopped or the plugin was disposed during the wait.
    agent.session.append('llm/retry-started', { retryId, turn, step, retry: 1 })
    return { kind: 'retry' }
  })
}
