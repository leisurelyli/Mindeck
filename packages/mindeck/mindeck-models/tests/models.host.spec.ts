/** Company models follow the Mindeck session and call the gateway with its token. */
import { once } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { QUOTA_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm'
import type { MindeckSession } from '@deepseek-ai/dsh-mindeck-account'
import { SessionId } from '@deepseek-ai/dsh-session'
import { afterEach, expect, it, vi } from 'vitest'
import { assemble } from '../../../llm/llm-pi-ai/tests/assemble.ts'
import { anthropicTextEvents, closeMockServers, mockServer } from '../../../llm/llm-pi-ai/tests/mock-server.ts'
import * as MindeckModels from '../src/index.ts'

const cleanups: Array<() => Promise<void>> = []
/** Options with a fresh cache directory removed after the test. */
function options(overrides: Partial<MindeckModels.Config> = {}): MindeckModels.Config {
  const cacheDir = mkdtempSync(join(tmpdir(), 'mindeck-models-'))
  cleanups.push(async () => { rmSync(cacheDir, { recursive: true, force: true }) })
  return {
    refreshIntervalMs: 600_000, retryIntervalMs: 15_000, cacheDir, requestTimeoutMs: 15_000,
    defaultContextWindow: 128_000, defaultMaxTokens: 8192, searchCount: 10, ...overrides,
  }
}
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  await closeMockServers()
})

/** Loopback `GET /api/desktop/models` answering with the current catalog. */
async function catalogServer() {
  const state = { status: 200, models: [] as unknown[], requests: 0, tokens: [] as string[] }
  const server = createServer((request, response) => {
    state.requests++
    state.tokens.push(request.headers.authorization ?? '')
    response.writeHead(state.status, { 'content-type': 'application/json' })
    response.end(JSON.stringify(state.status === 200 ? { models: state.models } : { error: { code: 'SIGN_IN_REQUIRED', message: '请先登录。' } }))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Expected a loopback listener')
  cleanups.push(async () => {
    const closed = new Promise<void>((resolve) => { server.close(() => { resolve() }) })
    server.closeAllConnections()
    await closed
  })
  return { url: `http://127.0.0.1:${address.port}/api/desktop/models`, state }
}

async function fixture(gatewayUrl: string) {
  const catalog = await catalogServer()
  const model = (id: string, api = 'anthropic-messages') => ({
    id, displayName: id, protocol: 'anthropic', api, baseUrl: gatewayUrl,
    contextWindow: 64_000, maxOutputTokens: 4096, inputModalities: ['text'],
  })
  const session = (token: string): MindeckSession => ({
    cloudUrl: 'http://127.0.0.1', token,
    bootstrap: {
      user: { id: 'u1', name: '林晓', email: 'lin@example.com', role: 'user', department: null },
      company: { name: '星河科技' }, device: { id: 'd1' },
      endpoints: {
        console: 'http://127.0.0.1', models: catalog.url, skills: 'http://127.0.0.1/skills',
        anthropicBaseUrl: gatewayUrl, openaiBaseUrl: gatewayUrl,
      },
    },
  })
  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  let current: MindeckSession | undefined = session('desktop-token-1')
  const account = {
    session: vi.fn(async () => current),
    rejectToken: vi.fn(async (token: string) => {
      if (current?.token !== token) return
      current = undefined
      ctx.emit('mindeck-account/changed')
    }),
    requestSync: vi.fn(),
  }
  let selection = { provider: 'deepseek-official', model: 'deepseek-chat' }
  const defaults = {
    currentSelection: () => selection,
    saveSelection: vi.fn(async (next: typeof selection) => { selection = next }),
  }
  ctx.provide('mindeckAccount', account as never)
  ctx.provide('agentDefaultModel', defaults as never)
  await ctx.plugin(LlmRuntime)
  const updated = vi.fn<(route: string) => void>()
  ctx.on('llm/models-updated', updated)
  const signIn = (token: string) => { current = session(token); ctx.emit('mindeck-account/changed') }
  const signOut = () => { current = undefined; ctx.emit('mindeck-account/changed') }
  // The session ends before the account announces it, as when a request starts during sign-out.
  const loseSession = () => { current = undefined }
  const providers = () => ctx.llm.listProviders().map(provider => provider.id).filter(id => id.startsWith('mindeck-')).sort()
  return { ctx, catalog, model, account, defaults, updated, signIn, signOut, loseSession, providers, selection: () => selection }
}

it('registers one route per client API while signed in and withdraws them after sign-out', async () => {
  const f = await fixture('http://127.0.0.1:9/gateway/anthropic')
  f.catalog.state.models = [f.model('deepseek-chat'), f.model('deepseek-reasoner'), f.model('gpt-4.1', 'openai-completions')]
  await f.ctx.plugin(MindeckModels, options())
  await vi.waitFor(() => { expect(f.providers()).toEqual(['mindeck-anthropic', 'mindeck-openai']) })
  expect(f.catalog.state.tokens[0]).toBe('Bearer desktop-token-1')
  expect(f.ctx.llm.listProviders().filter(provider => provider.id.startsWith('mindeck-')).map(provider => provider.name))
    .toEqual(['星河科技', '星河科技'])
  expect((await f.ctx.llm.listModels('mindeck-anthropic')).map(model => model.id)).toEqual(['deepseek-chat', 'deepseek-reasoner'])
  await vi.waitFor(() => { expect(f.selection()).toEqual({ provider: 'mindeck-anthropic', model: 'deepseek-chat' }) })

  // A refresh with an unchanged catalog changes nothing; a narrower one drops the empty route.
  f.updated.mockClear()
  f.signIn('desktop-token-1')
  await vi.waitFor(() => { expect(f.catalog.state.requests).toBe(2) })
  expect(f.updated).not.toHaveBeenCalled()
  f.catalog.state.models = [f.model('deepseek-reasoner')]
  f.signIn('desktop-token-1')
  await vi.waitFor(() => { expect(f.providers()).toEqual(['mindeck-anthropic']) })
  expect(f.updated.mock.calls.map(([route]) => route).sort()).toEqual(['mindeck-anthropic', 'mindeck-openai'])
  await vi.waitFor(() => { expect(f.selection()).toEqual({ provider: 'mindeck-anthropic', model: 'deepseek-reasoner' }) })

  f.signOut()
  await vi.waitFor(() => { expect(f.providers()).toEqual([]) })
})

it('marks recommended models and lists the company\'s description', async () => {
  const f = await fixture('http://127.0.0.1:9/gateway/anthropic')
  f.catalog.state.models = [{ ...f.model('deepseek-chat'), description: '日常写作', recommended: true }, f.model('deepseek-reasoner')]
  await f.ctx.plugin(MindeckModels, options())
  await vi.waitFor(() => { expect(f.providers()).toEqual(['mindeck-anthropic']) })
  const [chat, reasoner] = await f.ctx.llm.listModels('mindeck-anthropic')
  expect(chat).toMatchObject({ id: 'deepseek-chat', description: '日常写作', badge: MindeckModels.RECOMMENDED_BADGE })
  expect(reasoner).not.toHaveProperty('badge')
  expect(reasoner).not.toHaveProperty('description')
})

it('serves the member\'s saved catalog while Mindeck Cloud is unreachable and reads again soon after a failure', async () => {
  const f = await fixture('http://127.0.0.1:9/gateway/anthropic')
  const config = options({ retryIntervalMs: 1000 })
  f.catalog.state.models = [f.model('deepseek-chat')]
  const first = await f.ctx.plugin(MindeckModels, config)
  await vi.waitFor(() => { expect(f.providers()).toEqual(['mindeck-anthropic']) })
  await vi.waitFor(() => {
    const saved = JSON.parse(readFileSync(join(config.cacheDir, 'models-catalog.json'), 'utf8')) as { userId: string; models: { id: string }[] }
    expect(saved).toMatchObject({ userId: 'u1', models: [{ id: 'deepseek-chat' }] })
  })
  await first.dispose()
  expect(f.providers()).toEqual([])

  // The next start finds Mindeck Cloud failing: the saved models stay selectable, and the read is retried.
  f.catalog.state.status = 503
  f.catalog.state.requests = 0
  await f.ctx.plugin(MindeckModels, config)
  await vi.waitFor(() => { expect(f.providers()).toEqual(['mindeck-anthropic']) })
  expect((await f.ctx.llm.listModels('mindeck-anthropic')).map(model => model.id)).toEqual(['deepseek-chat'])
  f.catalog.state.status = 200
  f.catalog.state.models = [f.model('deepseek-reasoner')]
  await vi.waitFor(async () => {
    expect((await f.ctx.llm.listModels('mindeck-anthropic')).map(model => model.id)).toEqual(['deepseek-reasoner'])
  }, { timeout: 5000 })
  expect(f.catalog.state.requests).toBeGreaterThanOrEqual(2)
})

it('reads the catalog again when a sync reports changed models or web search, and only then', async () => {
  const f = await fixture('http://127.0.0.1:9/gateway/anthropic')
  f.catalog.state.models = [f.model('deepseek-chat')]
  await f.ctx.plugin(MindeckModels, options())
  await vi.waitFor(() => { expect(f.providers()).toEqual(['mindeck-anthropic']) })
  expect(f.catalog.state.requests).toBe(1)

  f.ctx.emit('mindeck-account/revised', new Set(['skills', 'employees', 'inbox']))
  f.catalog.state.models = [f.model('deepseek-chat'), f.model('gpt-4.1', 'openai-completions')]
  f.ctx.emit('mindeck-account/revised', new Set(['models']))
  await vi.waitFor(() => { expect(f.providers()).toEqual(['mindeck-anthropic', 'mindeck-openai']) })
  expect(f.catalog.state.requests).toBe(2)
  f.ctx.emit('mindeck-account/revised', new Set(['webSearch']))
  await vi.waitFor(() => { expect(f.catalog.state.requests).toBe(3) })
})

it('ends the session when Mindeck Cloud refuses the catalog request', async () => {
  const f = await fixture('http://127.0.0.1:9/gateway/anthropic')
  f.catalog.state.status = 401
  await f.ctx.plugin(MindeckModels, options())
  await vi.waitFor(() => { expect(f.account.rejectToken).toHaveBeenCalledWith('desktop-token-1') })
  expect(f.providers()).toEqual([])
})

it('sends the session token to the gateway and reports quota, sign-out, and session refusals in Mindeck and Cloud words', async () => {
  const gateway = await mockServer([
    { events: anthropicTextEvents },
    { status: 402, body: JSON.stringify({ type: 'error', error: { type: 'billing_error', message: '本月额度已用完，请联系管理员。' } }) },
    { status: 401, body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: '登录已失效，请重新登录。' } }) },
  ])
  const f = await fixture(`${gateway.url}/gateway/anthropic`)
  f.catalog.state.models = [f.model('deepseek-chat')]
  await f.ctx.plugin(MindeckModels, options())
  await vi.waitFor(() => { expect(f.providers()).toEqual(['mindeck-anthropic']) })
  const request = { provider: 'mindeck-anthropic', model: 'deepseek-chat', messages: [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'hi' }] }] }

  const ok = await assemble(f.ctx, request)
  expect(ok.finish).toEqual({ kind: 'stop' })
  expect(new URL(gateway.paths[0] ?? '', gateway.url).pathname).toBe('/gateway/anthropic/v1/messages')
  expect(gateway.headers[0]?.['x-api-key']).toBe('desktop-token-1')

  const quota = await assemble(f.ctx, request)
  expect(quota.finish).toMatchObject({ kind: 'error', failure: { code: QUOTA_EXCEEDED_CODE, status: 402, message: '本月额度已用完，请联系管理员。' } })
  expect(f.account.rejectToken).not.toHaveBeenCalled()

  f.loseSession()
  const signedOut = await assemble(f.ctx, request)
  expect(signedOut.finish).toMatchObject({ kind: 'error', failure: { code: MindeckModels.SIGN_IN_REQUIRED_CODE, message: '已退出 Mindeck 企业账号，请登录后重试。' } })
  expect(gateway.paths).toHaveLength(2)
  f.signIn('desktop-token-1')

  const ended = await assemble(f.ctx, request)
  expect(ended.finish).toMatchObject({ kind: 'error', failure: { code: MindeckModels.SESSION_ENDED_CODE, message: '登录已失效，请重新登录。' } })
  expect(f.account.rejectToken).toHaveBeenCalledWith('desktop-token-1')
  await vi.waitFor(() => { expect(f.providers()).toEqual([]) })
})

it('reads the catalog again and asks the account to sync when the gateway no longer offers a model', async () => {
  const gateway = await mockServer([
    { status: 404, body: JSON.stringify({ type: 'error', error: { type: 'not_found_error', message: '模型不存在或已停用。' } }) },
  ])
  const f = await fixture(`${gateway.url}/gateway/anthropic`)
  f.catalog.state.models = [f.model('deepseek-chat')]
  await f.ctx.plugin(MindeckModels, options())
  await vi.waitFor(() => { expect(f.providers()).toEqual(['mindeck-anthropic']) })
  const missing = await assemble(f.ctx, { provider: 'mindeck-anthropic', model: 'deepseek-chat', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] })
  expect(missing.finish).toMatchObject({ kind: 'error', failure: { code: 'UNKNOWN_MODEL', status: 404 } })
  expect(f.account.requestSync).toHaveBeenCalledOnce()
  await vi.waitFor(() => { expect(f.catalog.state.requests).toBe(2) })
})

it('names the digital employee of a conversation in its gateway requests', async () => {
  const gateway = await mockServer([{ events: anthropicTextEvents }, { events: anthropicTextEvents }, { events: anthropicTextEvents }])
  const f = await fixture(`${gateway.url}/gateway/anthropic`)
  f.ctx.provide('mindeckEmployees', {
    employeeForSession: (sessionId: string) => sessionId === 'session-legal' ? 'e1' : undefined,
  } as never)
  f.catalog.state.models = [f.model('deepseek-chat')]
  await f.ctx.plugin(MindeckModels, options())
  await vi.waitFor(() => { expect(f.providers()).toEqual(['mindeck-anthropic']) })
  const request = { provider: 'mindeck-anthropic', model: 'deepseek-chat', messages: [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'hi' }] }] }

  expect((await assemble(f.ctx, { ...request, sessionId: SessionId('session-legal') })).finish).toEqual({ kind: 'stop' })
  await assemble(f.ctx, { ...request, sessionId: SessionId('session-general') })
  await assemble(f.ctx, request)
  expect(gateway.headers.map(headers => headers[MindeckModels.EMPLOYEE_HEADER])).toEqual(['e1', undefined, undefined])
})
