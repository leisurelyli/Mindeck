/** Catalog entries become one pi-ai route per client API, and gateway refusals keep the Cloud's own words. */
import { expect, it, vi } from 'vitest'
import { QUOTA_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm'
import { mapGatewayFailure, parseCatalog, readGatewayFailure, routeProfiles, SESSION_ENDED_CODE } from '../src/index.ts'

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
    { ...entry('text-only', 'anthropic-messages'), inputModalities: ['text', 'audio'], contextWindow: null },
  ] })
  expect(catalog.skipped).toEqual([1])
  expect(catalog.models.map(model => model.id)).toEqual(['chat', 'gpt', 'elsewhere', 'text-only'])
  expect(() => parseCatalog({ data: [] })).toThrow('unknown format')

  const { profiles, conflicting } = routeProfiles(catalog.models, '星河科技', { contextWindow: 128_000, maxTokens: 8192 })
  expect(conflicting).toEqual(['elsewhere'])
  expect(profiles).toEqual({
    'mindeck-anthropic': {
      displayName: '星河科技 · Anthropic', api: 'anthropic-messages', baseURL: 'https://cloud.example.com/gateway/anthropic',
      defaultContextWindow: 128_000, defaultMaxTokens: 8192,
      models: [
        { id: 'chat', name: 'CHAT', input: ['text', 'image'], contextWindow: 64_000 },
        { id: 'text-only', name: 'TEXT-ONLY', input: ['text'] },
      ],
    },
    'mindeck-openai': {
      displayName: '星河科技 · OpenAI', api: 'openai-completions', baseURL: 'https://cloud.example.com/gateway/openai/v1',
      defaultContextWindow: 128_000, defaultMaxTokens: 8192,
      models: [{ id: 'gpt', name: 'GPT', input: ['text', 'image'], contextWindow: 64_000 }],
    },
  })
  const single = routeProfiles([catalog.models[0]!], '星河科技', { contextWindow: 1, maxTokens: 1 }).profiles
  expect(single['mindeck-anthropic']?.displayName).toBe('星河科技')
})

it('reads the gateway message from either SDK format', () => {
  expect(readGatewayFailure('402 {"type":"error","error":{"type":"billing_error","message":"本月额度已用完。"}}'))
    .toEqual({ status: 402, text: '本月额度已用完。' })
  expect(readGatewayFailure('401 请先登录。')).toEqual({ status: 401, text: '请先登录。' })
  expect(readGatewayFailure('socket hang up')).toEqual({})
  expect(readGatewayFailure('502 {not json')).toEqual({ status: 502 })
})

it('ends the session on 401, stops on 402, and refreshes the catalog on 404', () => {
  const hooks = { token: async () => 'token', sessionEnded: vi.fn(), modelMissing: vi.fn() }
  const failure = (message: string) => ({ message, code: 'PI_AI_ERROR' })
  expect(mapGatewayFailure(failure('401 {"error":{"message":"登录已失效。"}}'), 'token-1', hooks))
    .toEqual({ message: '登录已失效。', code: SESSION_ENDED_CODE, status: 401 })
  expect(hooks.sessionEnded).toHaveBeenCalledWith('token-1')
  expect(mapGatewayFailure(failure('402 本月额度已用完。'), 'token-1', hooks))
    .toEqual({ message: '本月额度已用完。', code: QUOTA_EXCEEDED_CODE, status: 402 })
  expect(mapGatewayFailure(failure('403 账号已停用。'), 'token-1', hooks)).toMatchObject({ code: 'AUTH', status: 403 })
  expect(mapGatewayFailure(failure('404 模型不存在。'), 'token-1', hooks)).toMatchObject({ code: 'UNKNOWN_MODEL' })
  expect(hooks.modelMissing).toHaveBeenCalledOnce()
  expect(mapGatewayFailure({ message: '502 上游不可用。', code: 'SERVER' }, 'token-1', hooks))
    .toEqual({ message: '上游不可用。', code: 'SERVER', status: 502 })
  const network = { message: 'fetch failed', code: 'TRANSPORT' }
  expect(mapGatewayFailure(network, 'token-1', hooks)).toBe(network)
  expect(hooks.sessionEnded).toHaveBeenCalledOnce()
})
