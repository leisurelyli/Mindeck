/**
 * Mindeck Cloud for the mindeck-model-reasoning scenario. A loopback server answers the model catalog with one
 * DeepSeek model that carries the company's thinking levels, default level, and request compatibility switches, and
 * its gateway forwards Chat Completions requests unchanged to DeepSeek with `DEEPSEEK_API_KEY`, as the Cloud gateway
 * forwards them with the company key. The `mindeckAccount` service keeps the desktop signed in, and the root Session
 * waits until the company routes are registered. Replay substitutes the model stream, so it never reaches the gateway.
 */
import { applyLoopbackServerEffect } from '../loopback-fixture-server.mjs'

/** Cordis plugin name. */
export const name = 'mindeck-cloud-fixture'

/** The LLM service the company routes register with. */
export const inject = ['llm']

/** The route mindeck-models registers for the model's client API. */
const ROUTE = 'mindeck-openai'

/** The one company model, as `GET /api/desktop/models` describes it once the company has set its thinking. */
const MODEL = {
  id: 'deepseek-v4-flash',
  displayName: 'DeepSeek V4 Flash',
  description: '日常问答与写作',
  recommended: true,
  protocol: 'openai',
  api: 'openai-completions',
  contextWindow: 1_000_000,
  maxOutputTokens: 32_768,
  inputModalities: ['text'],
  reasoningEfforts: { off: null, low: 'low', high: 'high', max: 'max' },
  defaultReasoning: 'high',
  compat: {
    thinkingFormat: 'deepseek',
    maxTokensField: 'max_tokens',
    supportsDeveloperRole: false,
    requiresReasoningContentOnAssistantMessages: true,
  },
}

async function body(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return Buffer.concat(chunks)
}

function json(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(value))
}

/** Forward one gateway request to DeepSeek and stream its answer back. */
async function forward(request, response) {
  const key = process.env.DEEPSEEK_API_KEY
  if (key === undefined || key === '') {
    return json(response, 502, { error: { message: 'The fixture gateway needs DEEPSEEK_API_KEY to record.' } })
  }
  const upstream = await fetch(`${process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com'}/chat/completions`, {
    method: 'POST',
    headers: { 'authorization': `Bearer ${key}`, 'content-type': 'application/json' },
    body: await body(request),
  })
  response.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/json' })
  if (upstream.body !== null) for await (const chunk of upstream.body) response.write(chunk)
  response.end()
}

/**
 * Start the loopback Mindeck Cloud, provide the signed-in account, and hold the root Session until the routes exist.
 * @param ctx - Cordis context; the effect disposes the server with the fiber.
 */
export async function apply(ctx) {
  let origin
  const session = () => ({
    cloudUrl: origin,
    token: 'snapshot-desktop-token-0123456789',
    bootstrap: {
      user: { id: 'user-lin', name: '林晓', email: 'lin@xinghe.com', role: 'user', department: { id: 'dept-sales', name: '销售部' } },
      company: { name: '心言智创', adminContact: null },
      device: { id: 'device-1' },
      endpoints: {
        console: origin, models: `${origin}/api/desktop/models`, skills: `${origin}/api/desktop/skills`,
        anthropicBaseUrl: `${origin}/api/gateway/anthropic`, openaiBaseUrl: `${origin}/api/gateway/openai/v1`,
      },
    },
  })
  const ready = Promise.withResolvers()
  ctx.provide('mindeckAccount', {
    session: async () => { await ready.promise; return session() },
    rejectToken: async () => {},
    requestSync: () => {},
  })
  ctx.on('agent/created', async ({ agent }) => {
    if (agent.session.header.parentSession !== undefined) return
    // mindeck-models registers the company route once the catalog arrives.
    for (let attempt = 0; !ctx.llm.listProviders().some(provider => provider.id === ROUTE); attempt += 1) {
      if (attempt === 300) throw new Error(`mindeck-cloud-fixture: ${ROUTE} was never registered`)
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }, { prepend: true })
  await applyLoopbackServerEffect(ctx, {
    label: 'mindeck-cloud-fixture',
    requestListener: (request, response) => {
      void (async () => {
        const path = new URL(request.url ?? '/', origin).pathname
        if (path === '/api/desktop/models') {
          return json(response, 200, { models: [{ ...MODEL, baseUrl: `${origin}/api/gateway/openai/v1` }] })
        }
        if (path === '/api/gateway/openai/v1/chat/completions' && request.method === 'POST') return forward(request, response)
        response.writeHead(404).end()
      })().catch((error) => {
        if (response.headersSent) response.destroy(error)
        else response.writeHead(500).end(String(error))
      })
    },
    onListening: (address) => {
      origin = `http://127.0.0.1:${address.port}`
      ready.resolve(undefined)
    },
    onCleanup: () => {},
  })
}
