/** Loopback Mindeck Cloud with the desktop sign-in endpoints, driven by each test. */
import { once } from 'node:events'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

/** How the device token endpoint answers the next polls. */
export type TokenOutcome = 'issue' | 'deny' | 'expire'

/** Request log and controls of one fake Cloud. */
export interface FakeCloud {
  readonly url: string
  /** Every request as `METHOD /path`. */
  readonly requests: string[]
  /** Device reports received through `PUT /api/desktop/device`. */
  readonly devices: unknown[]
  /** Pending sign-in reports received through `PUT /api/desktop/device-request`. */
  readonly deviceRequests: unknown[]
  /** Status that answers pending sign-in reports; 404 imitates a Cloud without the endpoint. */
  deviceRequestStatus: number
  /** Tokens that still authenticate. */
  readonly tokens: Set<string>
  /** Polls whose connection is closed without an answer, before any other outcome. */
  droppedPolls: number
  /** Polls that answer `authorization_pending` before {@link outcome} applies. */
  pendingPolls: number
  outcome: TokenOutcome
  /** Display name returned by bootstrap; change it to observe revalidation. */
  userName: string
  /** Body of `GET /api/desktop/quota`; `sign-in-required` answers 401. */
  quota: unknown
  /** Wait until the token endpoint has been polled `count` times in total. */
  polled: (count: number) => Promise<void>
  close: () => Promise<void>
}

const bootstrap = (url: string, name: string) => ({
  user: { id: 'user-1', name, email: 'lin@example.com', role: 'user', department: { id: 'dep-1', name: '研发部' } },
  company: { name: '星河科技' },
  device: { id: 'session-1', expiresAt: '2027-01-01T00:00:00.000Z' },
  endpoints: {
    console: url, models: `${url}/api/desktop/models`, skills: `${url}/api/desktop/skills`,
    anthropicBaseUrl: `${url}/api/gateway/anthropic`, openaiBaseUrl: `${url}/api/gateway/openai/v1`, files: null,
  },
})

async function body(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  const text = Buffer.concat(chunks).toString('utf8')
  return text === '' ? undefined : JSON.parse(text)
}

function reply(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(value))
}

/**
 * Start a fake Mindeck Cloud on a loopback port.
 * @returns the running Cloud; close it in teardown.
 */
export async function startFakeCloud(): Promise<FakeCloud> {
  let polls = 0
  const waiters: Array<{ count: number; resolve: () => void }> = []
  let issued = 0
  const server = createServer((request, response) => {
    void (async () => {
      const path = new URL(request.url ?? '/', 'http://localhost').pathname
      cloud.requests.push(`${request.method} ${path}`)
      const payload = await body(request)
      const token = /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1]
      const signedIn = token !== undefined && cloud.tokens.has(token)
      const signInRequired = () => { reply(response, 401, { error: { code: 'SIGN_IN_REQUIRED', message: '请先登录。' } }) }
      if (path === '/api/auth/device/code' && request.method === 'POST') {
        reply(response, 200, {
          device_code: 'device-code-1', user_code: 'ABCD-EFGH',
          verification_uri_complete: `${cloud.url}/device?user_code=ABCD-EFGH`, expires_in: 600, interval: 0.01,
        })
      } else if (path === '/api/auth/device/token' && request.method === 'POST') {
        polls++
        for (const waiter of waiters.splice(0)) {
          if (polls >= waiter.count) waiter.resolve()
          else waiters.push(waiter)
        }
        if (cloud.droppedPolls > 0) { cloud.droppedPolls--; request.socket.destroy(); return }
        if (cloud.pendingPolls > 0) { cloud.pendingPolls--; reply(response, 400, { error: 'authorization_pending' }); return }
        if (cloud.outcome === 'deny') { reply(response, 400, { error: 'access_denied' }); return }
        if (cloud.outcome === 'expire') { reply(response, 400, { error: 'expired_token' }); return }
        const issuedToken = `desktop-token-${++issued}-0123456789`
        cloud.tokens.add(issuedToken)
        reply(response, 200, { access_token: issuedToken, token_type: 'Bearer' })
      } else if (path === '/api/desktop/quota' && request.method === 'GET') {
        if (!signedIn || cloud.quota === 'sign-in-required') signInRequired()
        else reply(response, 200, cloud.quota)
      } else if (path === '/api/desktop/bootstrap' && request.method === 'GET') {
        if (!signedIn) signInRequired()
        else reply(response, 200, bootstrap(cloud.url, cloud.userName))
      } else if (path === '/api/desktop/device-request' && request.method === 'PUT') {
        if (cloud.deviceRequestStatus === 204) cloud.deviceRequests.push(payload)
        response.writeHead(cloud.deviceRequestStatus)
        response.end()
      } else if (path === '/api/desktop/device' && request.method === 'PUT') {
        if (!signedIn) { signInRequired(); return }
        cloud.devices.push(payload)
        reply(response, 200, { ok: true })
      } else if (path === '/api/desktop/sign-out' && request.method === 'POST') {
        if (!signedIn) { signInRequired(); return }
        cloud.tokens.delete(token)
        reply(response, 200, { ok: true })
      } else {
        reply(response, 404, { error: { code: 'NOT_FOUND', message: 'not found' } })
      }
    })().catch((error: unknown) => { response.destroy(error instanceof Error ? error : new Error(String(error))) })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Expected a loopback listener')
  const cloud: FakeCloud = {
    url: `http://127.0.0.1:${address.port}`,
    requests: [], devices: [], deviceRequests: [], deviceRequestStatus: 204, tokens: new Set(), droppedPolls: 0, pendingPolls: 0, outcome: 'issue', userName: '林晓',
    quota: {
      monthStartDate: '2026-11-01', resetDate: '2026-12-01', timezone: 'Asia/Shanghai',
      user: { limit: 50, used: 12.5, source: 'default' }, department: { limit: null, used: 30, source: 'none' },
    },
    polled: count => polls >= count ? Promise.resolve() : new Promise((resolve) => { waiters.push({ count, resolve }) }),
    close: async () => {
      if (!server.listening) return
      const closed = new Promise<void>((resolve, reject) => {
        server.close((error) => { if (error === undefined) resolve(); else reject(error) })
      })
      server.closeAllConnections()
      await closed
    },
  }
  return cloud
}
