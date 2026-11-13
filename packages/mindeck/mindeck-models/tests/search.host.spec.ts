/** Company web search follows the Mindeck session and the company's search status. */
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import type { MindeckSession } from '@deepseek-ai/dsh-mindeck-account'
import WebRuntime, { WebError } from '@deepseek-ai/dsh-web'
import { afterEach, expect, it, vi } from 'vitest'
import * as MindeckModels from '../src/index.ts'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

/** Loopback Cloud answering the catalog, the search status, and searches. */
async function cloudServer() {
  const state: {
    enabled: boolean
    search: { status: number; body: unknown }
    searches: Array<{ authorization: string; employee?: string; body: unknown }>
  } = { enabled: true, search: { status: 200, body: { results: [] } }, searches: [] }
  const server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    request.on('end', () => {
      const reply = (status: number, body: unknown) => {
        response.writeHead(status, { 'content-type': 'application/json' })
        response.end(JSON.stringify(body))
      }
      if (request.url === '/api/desktop/models') { reply(200, { models: [] }); return }
      if (request.url === '/api/desktop/web-search') { reply(200, { enabled: state.enabled, url: `${origin}/gateway/v1/tools/search` }); return }
      if (request.url === '/gateway/v1/tools/search') {
        const employee = request.headers['x-mindeck-employee']
        const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        state.searches.push({
          authorization: request.headers.authorization ?? '',
          ...typeof employee === 'string' ? { employee } : {},
          body,
        })
        reply(state.search.status, state.search.body)
        return
      }
      reply(404, {})
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Expected a loopback listener')
  const origin = `http://127.0.0.1:${address.port}`
  cleanups.push(async () => {
    const closed = new Promise<void>((resolve) => { server.close(() => { resolve() }) })
    server.closeAllConnections()
    await closed
  })
  return { origin, state }
}

async function fixture() {
  const cloud = await cloudServer()
  const cacheDir = mkdtempSync(join(tmpdir(), 'mindeck-search-'))
  cleanups.push(async () => { rmSync(cacheDir, { recursive: true, force: true }) })
  const session = (token: string): MindeckSession => ({
    cloudUrl: cloud.origin, token,
    bootstrap: {
      user: { id: 'u1', name: '林晓', email: 'lin@example.com', role: 'user', department: null },
      company: { name: '星河科技' }, device: { id: 'd1' },
      endpoints: {
        console: cloud.origin, models: `${cloud.origin}/api/desktop/models`, skills: `${cloud.origin}/api/desktop/skills`,
        anthropicBaseUrl: `${cloud.origin}/gateway/anthropic`, openaiBaseUrl: `${cloud.origin}/gateway/openai/v1`,
        webSearch: `${cloud.origin}/api/desktop/web-search`,
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
  }
  ctx.provide('mindeckAccount', account as never)
  // The conversation running a search, as the agent registry reports it, and its digital employee.
  const initiator = { current: undefined as { id: string; session: { deriveMessages: () => [] } } | undefined }
  ctx.provide('agents', { currentInitiator: () => initiator.current } as never)
  ctx.provide('mindeckEmployees', { employeeForSession: (id: string) => id === 'session-legal' ? 'e1' : undefined } as never)
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(WebRuntime, { searchProvider: MindeckModels.MINDECK_SEARCH_PROVIDER_ID })
  const plugin = await ctx.plugin(MindeckModels, {
    refreshIntervalMs: 600_000, retryIntervalMs: 15_000, cacheDir, requestTimeoutMs: 15_000,
    defaultContextWindow: 128_000, defaultMaxTokens: 8192, searchCount: 8,
  })
  const refresh = () => { ctx.emit('mindeck-account/changed') }
  const signOut = () => { current = undefined; refresh() }
  /** Whether a model step would be offered web search; true as well while the provider cannot be selected. */
  const ready = () => ctx.web.searchReady('mindeck-anthropic')
  /** Resolves once a search reaches the gateway, then forgets the probing searches. */
  const selected = () => vi.waitFor(async () => {
    await ctx.web.search({ query: 'probe' }).catch(() => undefined)
    expect(cloud.state.searches.length).toBeGreaterThan(0)
  }).then(() => { cloud.state.searches.length = 0 })
  /** Resolves once the provider can no longer be selected, which happens without a request to Cloud. */
  const unselectable = () => vi.waitFor(async () => {
    await expect(ctx.web.search({ query: '天气' })).rejects.toMatchObject({ code: 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE' })
  })
  return { ctx, cloud, account, plugin, refresh, signOut, ready, selected, unselectable, initiator }
}

it('searches through the gateway with the session token while the company offers search', async () => {
  const f = await fixture()
  await f.selected()
  expect(await f.ready()).toBe(true)
  f.cloud.state.search.body = {
    results: [
      { url: 'https://example.com/a', title: '季度报告', snippet: '营收增长', summary: '营收同比增长 12%', date: '2026-11-01' },
      { url: 'https://example.com/b', title: '', snippet: '', date: null },
    ],
  }
  const result = await f.ctx.web.search({ query: '星河科技 季度报告', maxResults: 5 })
  expect(result.sources).toEqual([
    { url: 'https://example.com/a', title: '季度报告', snippet: '营收增长', summary: '营收同比增长 12%', publishedAt: '2026-11-01' },
    { url: 'https://example.com/b' },
  ])
  expect(f.cloud.state.searches).toEqual([
    { authorization: 'Bearer desktop-token-1', body: { query: '星河科技 季度报告', count: 5 } },
  ])
})

it('reports the gateway refusal in its own words and ends a rejected session', async () => {
  const f = await fixture()
  await f.selected()
  expect(await f.ready()).toBe(true)
  f.cloud.state.search = { status: 402, body: { error: { code: 'QUOTA_EXCEEDED', message: '你本月的额度已用完。' } } }
  await expect(f.ctx.web.search({ query: '天气' })).rejects.toThrow(new WebError('你本月的额度已用完。', 'WEB_PROVIDER_ERROR'))
  expect(f.account.rejectToken).not.toHaveBeenCalled()

  f.cloud.state.search = { status: 401, body: { error: { code: 'SIGN_IN_REQUIRED', message: '登录已失效。' } } }
  await expect(f.ctx.web.search({ query: '天气' })).rejects.toThrow('登录已失效。')
  expect(f.account.rejectToken).toHaveBeenCalledWith('desktop-token-1')
  await f.unselectable()
})

it('offers no search while the company has it off, cannot be selected after sign-out, and leaves with the plugin', async () => {
  const f = await fixture()
  await f.selected()
  expect(await f.ready()).toBe(true)
  f.cloud.state.enabled = false
  f.refresh()
  await vi.waitFor(async () => { expect(await f.ready()).toBe(false) })
  await expect(f.ctx.web.search({ query: '天气' })).rejects.toThrow(new WebError('企业没有开启联网搜索。', 'WEB_PROVIDER_UNAVAILABLE'))

  f.cloud.state.enabled = true
  f.refresh()
  await vi.waitFor(async () => { expect(await f.ready()).toBe(true) })
  await f.selected()
  f.signOut()
  await f.unselectable()

  await f.plugin.dispose()
  expect(f.ctx.web.listProviders().search.map(provider => provider.id)).not.toContain('mindeck-search')
})

it('names the digital employee whose conversation runs the search', async () => {
  const f = await fixture()
  await f.selected()
  f.initiator.current = { id: 'session-legal', session: { deriveMessages: () => [] } }
  await f.ctx.web.search({ query: '劳动合同法 试用期' })
  f.initiator.current = { id: 'session-general', session: { deriveMessages: () => [] } }
  await f.ctx.web.search({ query: '天气' })
  expect(f.cloud.state.searches.map(search => search.employee)).toEqual(['e1', undefined])
})

it('keeps results with empty or missing text and leaves out results without an address', () => {
  const sources = MindeckModels.mapSearchResults({
    results: [
      { title: '', site_name: 'DeepSeek', url: 'https://api-docs.deepseek.com/news', summary: '预览版上线', snippet: '百万上下文', date: null, content: '' },
      { title: '发布消息', url: 'https://stcn.com/article/1.html', date: '2026-04-24T16:00:00+00:00' },
      { title: '没有地址', snippet: '无法引用' },
    ],
  }).sources
  expect(sources).toEqual([
    { url: 'https://api-docs.deepseek.com/news', snippet: '百万上下文', summary: '预览版上线' },
    { url: 'https://stcn.com/article/1.html', title: '发布消息', publishedAt: '2026-04-24T16:00:00+00:00' },
  ])
  expect(() => MindeckModels.mapSearchResults({ error: 'x' })).toThrow(WebError)
})
