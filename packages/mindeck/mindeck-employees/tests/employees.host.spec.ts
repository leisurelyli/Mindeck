/**
 * Digital employees become agent presets with their own persona, register from the cache before Mindeck Cloud
 * answers, stay registered once retired, follow the signed-in member, and leave with the plugin.
 */
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import AgentRegistry, { assembleContextFor } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import AgentPresets, { type PresetDefinition } from '@deepseek-ai/dsh-agent-preset-registry'
import LlmRuntime, { LlmAdapter, type LlmModelInfo, type StreamChunk } from '@deepseek-ai/dsh-llm'
import type { MindeckSession } from '@deepseek-ai/dsh-mindeck-account'
import * as Persona from '@deepseek-ai/dsh-persona'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt, { PERSONA_PREFIX_SECTION } from '@deepseek-ai/dsh-system-prompt'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { load } from 'js-yaml'
import { afterEach, expect, it, vi } from 'vitest'
import { withOwner, writeCache, EMPTY_CACHE, type CachedEmployee } from '../src/cache.ts'
import MindeckEmployees, { employeePersona, type Config, type MindeckEmployeeCatalog } from '../src/index.ts'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

interface CloudEmployee {
  id: string
  name: string
  avatar?: string
  tagline?: string
  instructions?: string
  starters?: readonly string[]
  skills?: readonly string[]
  draft?: boolean
  defaultModel?: string | null
  folders?: ReadonlyArray<{ driveId: string; itemId: string; path: string; label: string; accessible: boolean }>
}

/** Loopback `GET /api/desktop/employees` answering each token with its member's employees. */
async function employeeServer() {
  const state = {
    status: 200,
    byToken: {} as Record<string, CloudEmployee[]>,
    tokens: [] as string[],
    /** While set, answers wait for it. */
    hold: undefined as Promise<undefined> | undefined,
  }
  const server = createServer((request, response) => {
    const token = (request.headers.authorization ?? '').replace(/^Bearer /u, '')
    state.tokens.push(token)
    void (async () => {
      await state.hold
      response.writeHead(state.status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(state.status === 200
        ? { employees: (state.byToken[token] ?? []).map(employee => ({ ...employee, updatedAt: '2026-11-01T00:00:00.000Z' })) }
        : { error: { code: 'SIGN_IN_REQUIRED', message: '请先登录。' } }))
    })()
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
  /** Hold every answer until the returned function runs. */
  const holdAnswers = () => {
    const gate = Promise.withResolvers<undefined>()
    state.hold = gate.promise
    return () => { state.hold = undefined; gate.resolve(undefined) }
  }
  return { url: `http://127.0.0.1:${address.port}/api/desktop/employees`, state, holdAnswers }
}

/** The base preset: the persona this plugin replaces, and a row whose `!!js` condition must survive the copy. */
const STANDARD: PresetDefinition = {
  id: 'standard', name: 'Standard', order: 1,
  plugins: [
    { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: 'You are a coding agent powered by the {{model}} model.' } },
    { id: 'windows-only', name: '@deepseek-ai/dsh-windows-only', disabled: { __jsExpr: 'process.platform !== \'mindeck-test\'' } },
  ],
}

async function fixture() {
  const cloud = await employeeServer()
  const cacheDir = await mkdtemp(join(tmpdir(), 'mindeck-employees-'))
  cleanups.push(() => rm(cacheDir, { recursive: true, force: true }))
  const session = (userId: string, token: string): MindeckSession => ({
    cloudUrl: 'https://cloud.example.com', token,
    bootstrap: {
      user: { id: userId, name: '林晓', email: 'lin@example.com', role: 'admin', department: null },
      company: { name: '星河科技' }, device: { id: 'd1' },
      endpoints: {
        console: 'https://cloud.example.com', models: 'https://cloud.example.com/models', skills: 'https://cloud.example.com/skills',
        anthropicBaseUrl: 'https://cloud.example.com', openaiBaseUrl: 'https://cloud.example.com', employees: cloud.url,
      },
    },
  })
  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  ctx.baseUrl = new URL('./', import.meta.url).href
  await ctx.plugin(Loader)
  // The Loader imports bare plugin names through Node's module loader, which reads built output; tests use source.
  Object.assign(ctx.loader, {
    internal: {
      import: async (name: string): Promise<object> => name === '@deepseek-ai/dsh-persona'
        ? Persona
        : await import(/* @vite-ignore */ name) as object,
    },
  })
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt, { personaPrefix: '' })
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(AgentPresets, { default: 'mindeck-general' })
  await ctx.plugin(TypertRegistry)
  await ctx.plugin({
    inject: ['agentPresets'],
    async* apply(child: Context) { yield await child.agentPresets.register(STANDARD) },
  })
  let current: MindeckSession | undefined = session('u1', 'token-u1')
  const account = {
    session: vi.fn(async () => current),
    rejectToken: vi.fn(async (token: string) => {
      if (current?.token !== token) return
      current = undefined
      ctx.emit('mindeck-account/changed')
    }),
  }
  ctx.provide('mindeckAccount', account as never)
  const change = (next: MindeckSession | undefined) => { current = next; ctx.emit('mindeck-account/changed') }
  const config: Config = {
    basePreset: 'standard', generalPersona: 'You are a work assistant powered by the {{model}} model.',
    cacheDir, refreshIntervalMs: 600_000, retryIntervalMs: 1000, requestTimeoutMs: 10_000,
    modelProviders: ['mindeck-anthropic', 'mindeck-openai'],
  }
  /** The roster as the preset chip lists it, without the base preset. */
  const roster = async () => (await ctx.agentPresets.list()).filter(preset => preset.id.startsWith('mindeck-'))
    .map(({ id, name, description }) => ({ id, name, description }))
  const ids = async () => (await roster()).map(preset => preset.id)
  const cacheFile = join(cacheDir, 'employees.json')
  return { ctx, cloud, account, session, change, config, roster, ids, cacheFile }
}

const LEGAL: CloudEmployee = {
  id: 'e1', name: '法务专员', avatar: 'legal', tagline: '审合同，答劳动用工问题', instructions: '先确认合同类型。',
  starters: ['帮我审一份采购合同'], skills: ['contract-review'],
}
const SALES: CloudEmployee = { id: 'e2', name: '销售助理', avatar: 'sales', tagline: '写方案和报价', draft: true }

/** Read the cards stream until a frame satisfies the check. */
async function cardsMatching(ctx: Context, check: (catalog: MindeckEmployeeCatalog) => boolean): Promise<MindeckEmployeeCatalog> {
  const stop = new AbortController()
  try {
    for await (const frame of ctx.mindeckEmployees.watch(stop.signal)) if (check(frame)) return frame
    throw new Error('the cards stream ended')
  } finally { stop.abort() }
}

it('registers the general assistant and each employee on the base preset\'s rows with its own persona', async () => {
  const f = await fixture()
  f.cloud.state.byToken['token-u1'] = [LEGAL, SALES]
  await f.ctx.plugin(MindeckEmployees, f.config)
  await vi.waitFor(async () => {
    expect(await f.roster()).toEqual([
      { id: 'mindeck-general', name: { en: 'General assistant', zh: '通用助手' }, description: { en: 'Writing, analysis, research, files: ask anything.', zh: '写作、分析、整理资料、处理文件，什么都可以问。' } },
      { id: 'mindeck-employee-e1', name: '法务专员', description: '审合同，答劳动用工问题' },
      { id: 'mindeck-employee-e2', name: { en: '销售助理 (draft)', zh: '销售助理（草稿）' }, description: '写方案和报价' },
    ])
  })
  expect(f.cloud.state.tokens).toContain('token-u1')
  expect((await f.ctx.agentPresets.list()).filter(preset => preset.broken !== undefined)).toEqual([])

  // The base rows are copied with their `!!js` condition; only the persona config changes.
  const document = await f.ctx.agentPresets.readDocument('mindeck-employee-e1')
  expect(document.content).toContain('!!js')
  expect(load(document.content, { schema: entryListSchema })).toEqual([
    { ...STANDARD.plugins[0], config: { prefix: employeePersona({ name: '法务专员', tagline: LEGAL.tagline ?? '', instructions: '先确认合同类型。', skills: ['contract-review'], folders: [] }) } },
    STANDARD.plugins[1],
  ])

  // A conversation switched to the employee renders the employee's persona and names the employee.
  const created = await f.ctx.agents.create({
    sessionId: SessionId('session-1'),
    setup: async (agentCtx: Context) => { await f.ctx.agentPresets.mount(agentCtx, 'mindeck-general') },
  })
  const agent = created.agent
  expect(f.ctx.mindeckEmployees.employeeForSession(SessionId('session-1'))).toBeUndefined()
  await f.ctx.agentPresets.select(agent, 'mindeck-employee-e1')
  const prompt = await f.ctx.systemPrompt.assemble(assembleContextFor(agent))
  expect(prompt.sections.find(section => section.name === PERSONA_PREFIX_SECTION)?.text).toBe(employeePersona({
    name: '法务专员', tagline: '审合同，答劳动用工问题', instructions: '先确认合同类型。', skills: ['contract-review'], folders: [],
  }))
  expect(f.ctx.mindeckEmployees.employeeForSession(SessionId('session-1'))).toBe('e1')
  expect(f.ctx.mindeckEmployees.employeeForSession(SessionId('no-such-session'))).toBeUndefined()

  const catalog = await cardsMatching(f.ctx, frame => frame.cards.length === 3)
  expect(catalog.cards).toEqual([
    { kind: 'general', presetId: 'mindeck-general' },
    { kind: 'employee', presetId: 'mindeck-employee-e1', employeeId: 'e1', name: '法务专员', avatar: 'legal',
      tagline: '审合同，答劳动用工问题', starters: ['帮我审一份采购合同'], draft: false, folders: [], model: null },
    { kind: 'employee', presetId: 'mindeck-employee-e2', employeeId: 'e2', name: '销售助理', avatar: 'sales',
      tagline: '写方案和报价', starters: [], draft: true, folders: [], model: null },
  ])
})

/** A company model route listing the given models. */
class CatalogAdapter extends LlmAdapter {
  constructor(private readonly models: readonly LlmModelInfo[]) { super() }
  async * stream(): AsyncIterable<StreamChunk> { throw new Error('no requests in this test') }
  override async listModels(provider: string): Promise<LlmModelInfo[]> {
    return this.models.filter(model => model.provider === provider)
  }
}

const RULES: CloudEmployee = {
  id: 'e3', name: '制度问答', avatar: 'hr', tagline: '答报销、请假和考勤的问题', defaultModel: 'glm-4.6',
  folders: [
    { driveId: 'drive-company', itemId: 'space$company!rules', path: '企业空间 / 制度文件', label: '企业制度', accessible: true },
    { driveId: 'drive-dept', itemId: 'space$dept!specs', path: '研发部 / 规范', label: '研发规范', accessible: false },
  ],
}

it('starts conversations with an employee on its default model and names its folders and model on the card', async () => {
  const f = await fixture()
  f.cloud.state.byToken['token-u1'] = [RULES, { ...LEGAL, defaultModel: 'retired-model' }]
  f.ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'mindeck-openai', model: 'deepseek-chat' }) } as never)
  await f.ctx.plugin(MindeckEmployees, f.config)
  await vi.waitFor(async () => { expect(await f.ids()).toContain('mindeck-employee-e3') })

  // The company catalog arrives after the listing; the card names the model once it does.
  const without = await cardsMatching(f.ctx, frame => frame.cards.length === 3)
  expect(without.cards[1]).toMatchObject({ employeeId: 'e3', model: null })
  f.ctx.llm.registerAdapter(['mindeck-openai'], new CatalogAdapter([
    { provider: 'mindeck-openai', id: 'deepseek-chat', name: 'DeepSeek V3' },
    { provider: 'mindeck-openai', id: 'glm-4.6', name: 'GLM 4.6' },
  ]))
  f.ctx.emit('llm/models-updated', 'mindeck-openai')
  const catalog = await cardsMatching(f.ctx, frame => frame.cards[1]?.kind === 'employee' && frame.cards[1].model !== null)
  expect(catalog.cards.slice(1)).toEqual([
    { kind: 'employee', presetId: 'mindeck-employee-e3', employeeId: 'e3', name: '制度问答', avatar: 'hr',
      tagline: '答报销、请假和考勤的问题', starters: [], draft: false, model: 'GLM 4.6', folders: [
        { label: '企业制度', path: '企业空间 / 制度文件', accessible: true },
        { label: '研发规范', path: '研发部 / 规范', accessible: false },
      ] },
    expect.objectContaining({ employeeId: 'e1', model: null }),
  ])

  // As the session controller does, a conversation starts on the deployment default until it records a choice.
  const create = async (id: string, preset: string) => (await f.ctx.agents.create({
    sessionId: SessionId(id), meta: { agentPreset: preset }, agentOptions: { provider: 'mindeck-openai', model: 'deepseek-chat' },
    setup: async (agentCtx: Context) => { await f.ctx.agentPresets.mount(agentCtx, preset) },
  })).agent

  // A new conversation with the employee runs its default model; the member's model stays for the others.
  const rules = await create('session-rules', 'mindeck-employee-e3')
  expect(rules.model.current()).toEqual({ provider: 'mindeck-openai', model: 'glm-4.6' })
  expect(f.ctx.mindeckEmployees.foldersForSession(SessionId('session-rules'))).toEqual([
    { itemId: 'space$company!rules', label: '企业制度', path: '/企业空间/制度文件', accessible: true },
    { itemId: 'space$dept!specs', label: '研发规范', path: '/研发部/规范', accessible: false },
  ])
  const general = await create('session-general', 'mindeck-general')
  expect(general.model.current()).toEqual({ provider: 'mindeck-openai', model: 'deepseek-chat' })
  expect(f.ctx.mindeckEmployees.foldersForSession(SessionId('session-general'))).toBeUndefined()

  // A blank conversation switched to the employee takes its model, and switched away gives it back.
  await f.ctx.agentPresets.select(general, 'mindeck-employee-e3')
  await vi.waitFor(() => { expect(general.model.current()).toEqual({ provider: 'mindeck-openai', model: 'glm-4.6' }) })
  await f.ctx.agentPresets.select(general, 'mindeck-general')
  await vi.waitFor(() => { expect(general.model.current()).toEqual({ provider: 'mindeck-openai', model: 'deepseek-chat' }) })

  // A model the member picked stays when the preset changes to one without a default model.
  await f.ctx.agentPresets.select(rules, 'mindeck-general')
  await vi.waitFor(() => { expect(rules.model.current()?.model).toBe('deepseek-chat') })
  await f.ctx.agentPresets.select(rules, 'mindeck-employee-e3')
  await vi.waitFor(() => { expect(rules.model.current()?.model).toBe('glm-4.6') })
  rules.model.select({ provider: 'mindeck-openai', model: 'deepseek-chat' })
  await f.ctx.agentPresets.select(rules, 'mindeck-general')
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(rules.model.current()?.model).toBe('deepseek-chat')

  // A default model the member's company models do not list leaves the conversation on the member's model.
  const legal = await create('session-legal', 'mindeck-employee-e1')
  expect(legal.model.current()).toEqual({ provider: 'mindeck-openai', model: 'deepseek-chat' })
  expect(f.ctx.mindeckEmployees.foldersForSession(SessionId('session-legal'))).toEqual([])
})

it('reads the employees again when a sync reports changed employees, and not for other topics', async () => {
  const f = await fixture()
  f.cloud.state.byToken['token-u1'] = [LEGAL]
  await f.ctx.plugin(MindeckEmployees, f.config)
  await vi.waitFor(async () => { expect(await f.ids()).toEqual(['mindeck-general', 'mindeck-employee-e1']) })
  const asked = f.cloud.state.tokens.length

  f.cloud.state.byToken['token-u1'] = [LEGAL, SALES]
  f.ctx.emit('mindeck-account/revised', new Set(['models', 'skills', 'inbox']))
  f.ctx.emit('mindeck-account/revised', new Set(['employees']))
  await vi.waitFor(async () => { expect(await f.ids()).toEqual(['mindeck-general', 'mindeck-employee-e1', 'mindeck-employee-e2']) })
  expect(f.cloud.state.tokens).toHaveLength(asked + 1)
})

it('registers cached employees before Mindeck Cloud answers, keeps retired ones, and leaves with the plugin', async () => {
  const f = await fixture()
  f.cloud.state.byToken['token-u1'] = [LEGAL, SALES]
  const first = await f.ctx.plugin(MindeckEmployees, f.config)
  await vi.waitFor(async () => { expect(await f.ids()).toEqual(['mindeck-general', 'mindeck-employee-e1', 'mindeck-employee-e2']) })
  await first.dispose()
  expect(await f.ids()).toEqual([])

  // The next start registers the saved employees while Mindeck Cloud has not answered.
  f.cloud.state.byToken['token-u1'] = [SALES]
  f.cloud.state.tokens.length = 0
  const release = f.cloud.holdAnswers()
  await f.ctx.plugin(MindeckEmployees, f.config)
  await vi.waitFor(() => { expect(f.cloud.state.tokens).toEqual(['token-u1']) })
  expect(await f.ids()).toEqual(['mindeck-general', 'mindeck-employee-e1', 'mindeck-employee-e2'])

  // Mindeck Cloud no longer lists the legal employee: earlier conversations keep its preset, the cards drop it.
  release()
  await vi.waitFor(async () => {
    expect(await f.roster()).toEqual([
      { id: 'mindeck-general', name: { en: 'General assistant', zh: '通用助手' }, description: { en: 'Writing, analysis, research, files: ask anything.', zh: '写作、分析、整理资料、处理文件，什么都可以问。' } },
      { id: 'mindeck-employee-e2', name: { en: '销售助理 (draft)', zh: '销售助理（草稿）' }, description: '写方案和报价' },
      {
        id: 'mindeck-employee-e1', name: { en: '法务专员 (deactivated)', zh: '法务专员（已停用）' },
        description: { en: 'An administrator deactivated this digital employee. Earlier conversations can continue.', zh: '管理员已停用这位数字员工，可以继续之前的对话。' },
      },
    ])
  })
  const catalog = await cardsMatching(f.ctx, frame => frame.cards.length === 2)
  expect(catalog.cards.map(card => card.presetId)).toEqual(['mindeck-general', 'mindeck-employee-e2'])
  const saved = JSON.parse(await readFile(f.cacheFile, 'utf8')) as { owners: Array<{ employees: Array<{ id: string; retired: boolean }> }> }
  expect(saved.owners[0]?.employees.map(({ id, retired }) => ({ id, retired }))).toEqual([{ id: 'e2', retired: false }, { id: 'e1', retired: true }])
})

it('keeps the presets after sign-out and swaps them for another member\'s cached ones', async () => {
  const f = await fixture()
  f.cloud.state.byToken['token-u1'] = [LEGAL]
  const other: CachedEmployee = {
    id: 'e9', name: '人事专员', avatar: 'hr', tagline: '', instructions: '', starters: [], skills: [], draft: false, retired: false,
    defaultModel: null, folders: [],
  }
  // u2 used this computer before; the plugin starts with u1 signed in.
  await writeCache(f.cacheFile, withOwner(EMPTY_CACHE, { cloudUrl: 'https://cloud.example.com', userId: 'u2' }, [other]))
  await f.ctx.plugin(MindeckEmployees, f.config)
  await vi.waitFor(async () => { expect(await f.ids()).toEqual(['mindeck-general', 'mindeck-employee-e1']) })

  f.change(undefined)
  await vi.waitFor(() => { expect(f.account.session).toHaveBeenCalledTimes(3) })
  expect(await f.ids()).toEqual(['mindeck-general', 'mindeck-employee-e1'])

  f.cloud.state.byToken['token-u2'] = [other, SALES]
  const release = f.cloud.holdAnswers()
  f.change(f.session('u2', 'token-u2'))
  await vi.waitFor(async () => { expect(await f.ids()).toEqual(['mindeck-general', 'mindeck-employee-e9']) })
  release()
  await vi.waitFor(async () => { expect(await f.ids()).toEqual(['mindeck-general', 'mindeck-employee-e9', 'mindeck-employee-e2']) })
})

it('ends the session when Mindeck Cloud refuses the token and keeps the registered presets', async () => {
  const f = await fixture()
  f.cloud.state.byToken['token-u1'] = [LEGAL]
  await f.ctx.plugin(MindeckEmployees, f.config)
  await vi.waitFor(async () => { expect(await f.ids()).toEqual(['mindeck-general', 'mindeck-employee-e1']) })
  f.cloud.state.status = 401
  f.change(f.session('u1', 'token-u1'))
  await vi.waitFor(() => { expect(f.account.rejectToken).toHaveBeenCalledWith('token-u1') })
  expect(await f.ids()).toEqual(['mindeck-general', 'mindeck-employee-e1'])
})

it('registers the general assistant while signed out without asking Mindeck Cloud', async () => {
  const f = await fixture()
  f.change(undefined)
  await f.ctx.plugin(MindeckEmployees, f.config)
  await vi.waitFor(async () => { expect(await f.ids()).toEqual(['mindeck-general']) })
  expect(f.cloud.state.tokens).toEqual([])
})

it('reports a base preset that is not registered and registers nothing', async () => {
  const f = await fixture()
  const warn = vi.spyOn(f.ctx.logger, 'warn').mockImplementation(() => {})
  await f.ctx.plugin(MindeckEmployees, { ...f.config, basePreset: 'no-such-preset' })
  await vi.waitFor(() => { expect(warn.mock.calls.some(([message]) => String(message).includes('refresh failed'))).toBe(true) })
  expect(await f.ids()).toEqual([])
  expect(f.account.session).not.toHaveBeenCalled()
})

it('keeps the presets while Mindeck Cloud fails, retries soon, and reports what it cannot register', async () => {
  const f = await fixture()
  const warn = vi.spyOn(f.ctx.logger, 'warn').mockImplementation(() => {})
  // Another plugin already holds one employee's preset id: that employee gets no card.
  await f.ctx.plugin({
    inject: ['agentPresets'],
    async* apply(child: Context) { yield await child.agentPresets.register({ id: 'mindeck-employee-e2', plugins: STANDARD.plugins }) },
  })
  f.cloud.state.byToken['token-u1'] = [LEGAL, SALES]
  await f.ctx.plugin(MindeckEmployees, f.config)
  await vi.waitFor(async () => { expect(await f.ids()).toEqual(['mindeck-general', 'mindeck-employee-e1', 'mindeck-employee-e2']) })
  await vi.waitFor(() => { expect(warn.mock.calls.some(([message]) => String(message).includes('"mindeck-employee-e2"'))).toBe(true) })
  const catalog = await cardsMatching(f.ctx, frame => frame.cards.length === 2)
  expect(catalog.cards.map(card => card.presetId)).toEqual(['mindeck-general', 'mindeck-employee-e1'])

  f.cloud.state.status = 503
  f.cloud.state.tokens.length = 0
  f.change(f.session('u1', 'token-u1'))
  await vi.waitFor(() => { expect(warn.mock.calls.some(([message]) => String(message).includes('refresh failed'))).toBe(true) })
  expect(await f.ids()).toContain('mindeck-employee-e1')

  // The retry reads the listing again, which now also holds an entry in an unknown format.
  f.cloud.state.status = 200
  f.cloud.state.byToken['token-u1'] = [LEGAL, { id: 'bad id', name: '无效' }]
  await vi.waitFor(() => { expect(f.cloud.state.tokens.length).toBeGreaterThanOrEqual(2) }, { timeout: 5000 })
  await vi.waitFor(() => { expect(warn.mock.calls.some(([message]) => String(message).includes('skipped 1'))).toBe(true) })
})

it('leaves started conversations alone and chooses the model once a reused conversation is published', async () => {
  const f = await fixture()
  f.cloud.state.byToken['token-u1'] = [RULES]
  await f.ctx.plugin(MindeckEmployees, f.config)
  await vi.waitFor(async () => { expect(await f.ids()).toContain('mindeck-employee-e3') })
  // A route that fails to list its models is skipped; the next one still names the default model.
  f.ctx.llm.registerAdapter(['mindeck-anthropic'], new class extends CatalogAdapter {
    override async listModels(): Promise<LlmModelInfo[]> { throw new Error('catalog unavailable') }
  }([]))
  f.ctx.llm.registerAdapter(['mindeck-openai'], new CatalogAdapter([{ provider: 'mindeck-openai', id: 'glm-4.6', name: 'GLM 4.6' }]))
  const options = { provider: 'mindeck-openai', model: 'deepseek-chat' }

  // A stored blank conversation reused under the employee records the preset before its Agent is published.
  f.ctx.emit('agent-preset/selected', SessionId('session-reused'), 'mindeck-employee-e3')
  const reused = (await f.ctx.agents.create({
    sessionId: SessionId('session-reused'), meta: { agentPreset: 'mindeck-employee-e3' }, agentOptions: options,
    setup: async (agentCtx: Context) => { await f.ctx.agentPresets.mount(agentCtx, 'mindeck-employee-e3') },
  })).agent
  expect(reused.model.current()).toEqual({ provider: 'mindeck-openai', model: 'glm-4.6' })

  // A conversation that has started keeps its model.
  const started = (await f.ctx.agents.create({
    sessionId: SessionId('session-started'), meta: { agentPreset: 'mindeck-general' }, agentOptions: options,
    setup: async (agentCtx: Context) => { await f.ctx.agentPresets.mount(agentCtx, 'mindeck-general') },
  })).agent
  started.session.append('turn/start', { turn: 1 })
  started.session.append('agent-preset/selected', { agentPreset: 'mindeck-employee-e3' })
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(f.ctx.mindeckEmployees.employeeForSession(SessionId('session-started'))).toBe('e3')
  expect(started.model.current()).toEqual(options)
})
