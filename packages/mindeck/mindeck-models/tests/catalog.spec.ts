/** Catalog entries become company-named pi-ai routes per client API, and gateway refusals keep the Cloud's own words. */
import { expect, it, vi } from 'vitest'
import { QUOTA_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm'
import {
  mapGatewayFailure, memberLimitOf, parseCatalog, RATE_LIMITED_CODE, readGatewayFailure, routeProfiles, SESSION_ENDED_CODE,
} from '../src/index.ts'

const entry = (id: string, api: string, baseUrl = 'https://cloud.example.com/gateway/anthropic') => ({
  id, displayName: id.toUpperCase(), protocol: api.startsWith('openai') ? 'openai' : 'anthropic', api, baseUrl,
  contextWindow: 64_000, maxOutputTokens: null, inputModalities: ['text', 'image'],
})

it('skips catalog entries it cannot read and groups the rest by client API', () => {
  const catalog = parseCatalog({ models: [
    entry('chat', 'anthropic-messages'),
    { id: 'broken' },
    entry('gpt', 'openai-completions', 'https://cloud.example.com/gateway/openai/v1'),
    entry('elsewhere', 'anthropic-messages', 'https://other.example.com/gateway/anthropic'),
    { ...entry('text-only', 'anthropic-messages'), inputModalities: ['text', 'audio'], contextWindow: null, description: '写作', recommended: true },
  ] })
  expect(catalog.skipped).toEqual([1])
  expect(catalog.models.map(model => model.id)).toEqual(['chat', 'gpt', 'elsewhere', 'text-only'])
  expect(catalog.models.map(model => [model.description, model.recommended])).toEqual([
    [null, false], [null, false], [null, false], ['写作', true],
  ])
  expect(() => parseCatalog({ data: [] })).toThrow('unknown format')

  const { profiles, conflicting } = routeProfiles(catalog.models, '星河科技', { contextWindow: 128_000, maxTokens: 8192 }, {
    maxRetryWaitMs: 60_000,
  })
  expect(conflicting).toEqual(['elsewhere'])
  const retryPolicy = { mode: 'normal', backoff: { maxDelayMs: 60_000 } }
  expect(profiles).toEqual({
    'mindeck-anthropic': {
      displayName: '星河科技', api: 'anthropic-messages', baseURL: 'https://cloud.example.com/gateway/anthropic',
      defaultContextWindow: 128_000, defaultMaxTokens: 8192, retryPolicy,
      models: [
        { id: 'chat', name: 'CHAT', input: ['text', 'image'], contextWindow: 64_000 },
        { id: 'text-only', name: 'TEXT-ONLY', input: ['text'] },
      ],
    },
    'mindeck-openai': {
      displayName: '星河科技', api: 'openai-completions', baseURL: 'https://cloud.example.com/gateway/openai/v1',
      defaultContextWindow: 128_000, defaultMaxTokens: 8192, retryPolicy,
      models: [{ id: 'gpt', name: 'GPT', input: ['text', 'image'], contextWindow: 64_000 }],
    },
  })
})

it('reads the gateway message from either SDK format', () => {
  expect(readGatewayFailure('402 {"type":"error","error":{"type":"billing_error","message":"本月额度已用完。"}}'))
    .toEqual({ status: 402, text: '本月额度已用完。' })
  expect(readGatewayFailure('401 请先登录。')).toEqual({ status: 401, text: '请先登录。' })
  expect(readGatewayFailure('{"message":"模型不存在。","type":"model_not_found","code":"model_not_found"}'))
    .toEqual({ text: '模型不存在。' })
  expect(readGatewayFailure('socket hang up')).toEqual({})
  expect(readGatewayFailure('502 {not json')).toEqual({ status: 502 })
  expect(readGatewayFailure('429: {"message":"请求太频繁。","type":"rate_limit_exceeded","reason":"MEMBER_RATE_LIMIT"}'))
    .toEqual({ status: 429, text: '请求太频繁。', reason: 'MEMBER_RATE_LIMIT' })
})

it('ends the session on 401, stops on 402, and refreshes the catalog on 404', () => {
  const hooks = {
    token: async () => 'token', sessionEnded: vi.fn(), modelMissing: vi.fn(), notes: () => undefined, rateLimited: vi.fn(), minuteLimitWaitMs: 60_000,
  }
  const failure = (message: string) => ({ message, code: 'PI_AI_ERROR' })
  expect(mapGatewayFailure(failure('401 {"error":{"message":"登录已失效。"}}'), 'token-1', hooks, false))
    .toEqual({ message: '登录已失效。', code: SESSION_ENDED_CODE, status: 401 })
  expect(hooks.sessionEnded).toHaveBeenCalledWith('token-1')
  expect(mapGatewayFailure(failure('402 本月额度已用完。'), 'token-1', hooks, false))
    .toEqual({ message: '本月额度已用完。', code: QUOTA_EXCEEDED_CODE, status: 402 })
  expect(mapGatewayFailure(failure('403 账号已停用。'), 'token-1', hooks, false)).toMatchObject({ code: 'ACCOUNT_UNAVAILABLE', status: 403, message: '账号已停用。' })
  expect(mapGatewayFailure(failure('403'), 'token-1', hooks, false)).toMatchObject({ code: 'ACCOUNT_UNAVAILABLE', message: '账号暂时无法使用企业模型，请联系管理员。' })
  expect(mapGatewayFailure(failure('404 模型不存在。'), 'token-1', hooks, false)).toMatchObject({ code: 'UNKNOWN_MODEL' })
  expect(hooks.modelMissing).toHaveBeenCalledOnce()
  expect(mapGatewayFailure({ message: '502 上游不可用。', code: 'SERVER' }, 'token-1', hooks, false))
    .toEqual({ message: '上游不可用。', code: 'SERVER', status: 502 })
  const network = { message: 'fetch failed', code: 'TRANSPORT' }
  expect(mapGatewayFailure(network, 'token-1', hooks, false)).toBe(network)
  expect(hooks.sessionEnded).toHaveBeenCalledOnce()
})

it('waits once for a company limit, by its reason, and explains a refusal that lasts; a provider\'s own 429 keeps the base retries', () => {
  const hooks = {
    token: async () => 'token', sessionEnded: vi.fn(), modelMissing: vi.fn(), notes: () => undefined, rateLimited: vi.fn(), minuteLimitWaitMs: 45_000,
  }
  // Anthropic reports the whole body with the status; OpenAI reports the error object after `429:`.
  const minute = { message: '429 {"type":"error","error":{"type":"rate_limit_error","message":"请求太频繁，请在 37 秒后重试。请求编号：r1","reason":"MEMBER_RATE_LIMIT"}}', code: 'RATE_LIMIT' }
  const running = { message: '429: {"message":"同时进行的请求太多。请求编号：r2","type":"rate_limit_exceeded","reason":"MEMBER_CONCURRENCY_LIMIT"}', code: 'RATE_LIMIT' }
  const provider = { message: '429 {"error":{"message":"Too many requests","type":"rate_limit_exceeded"}}', code: 'RATE_LIMIT' }
  expect([minute, running, provider].map(memberLimitOf)).toEqual(['minute', 'concurrency', undefined])
  expect(memberLimitOf({ message: '402 {"error":{"message":"x","reason":"MEMBER_RATE_LIMIT"}}', code: 'QUOTA' })).toBeUndefined()

  expect(mapGatewayFailure(minute, 'token-1', hooks, false)).toEqual({
    message: '请求较多，已达到企业设定的每分钟请求上限，稍后自动继续。', code: 'RATE_LIMIT', status: 429, providerRetryAfterMs: 45_000,
  })
  expect(mapGatewayFailure(running, 'token-1', hooks, false)).toMatchObject({ code: 'RATE_LIMIT', providerRetryAfterMs: 3000 })
  expect(mapGatewayFailure(minute, 'token-1', hooks, true)).toEqual({
    message: '这段对话的请求超过了企业设定的每分钟上限，可以稍后再试；如果经常遇到，请联系管理员。', code: RATE_LIMITED_CODE, status: 429,
  })
  const lasting = mapGatewayFailure(running, 'token-1', hooks, true)
  expect(lasting.code).toBe(RATE_LIMITED_CODE)
  expect(lasting.message).toMatch(/^同时进行的请求超过了企业设定的上限/)
  const fromProvider = mapGatewayFailure(provider, 'token-1', hooks, true)
  expect(fromProvider).toEqual({ message: '模型服务商暂时限流，稍后自动重试。服务商说明：Too many requests', code: 'RATE_LIMIT', status: 429 })
  expect(hooks.rateLimited).toHaveBeenCalledTimes(5)
})
