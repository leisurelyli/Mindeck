/** Loopback Mindeck Cloud inbox endpoints of the desktop API, driven by each test. */
import { once } from 'node:events'
import { createServer, type IncomingMessage } from 'node:http'

/** One stored inbox item, newest first in {@link FakeInbox.items}. */
export interface FakeItem {
  type: string
  id: string
  kind: string
  level: string
  title: string
  body: string | null
  link: string | null
  related: { type: string; id: string } | null
  createdAt: string
  readAt: string | null
}

/** Request log and controls of one fake inbox. */
export interface FakeInbox {
  /** The bootstrap's `endpoints.inbox`. */
  readonly url: string
  /** Items newest first. */
  items: FakeItem[]
  /** Token that authenticates; any other answers 401. */
  token: string
  /** Status of the next answers; 200 answers normally, 0 closes the connection without an answer. */
  status: number
  /** Whether the next page request refuses its cursor with 400 `INVALID_REQUEST`. */
  refuseCursor: boolean
  /** Every request as `METHOD path?query`. */
  readonly requests: string[]
  /** Bodies of `POST /read`. */
  readonly reads: unknown[]
  close: () => Promise<void>
}

/**
 * @param index - position from the newest item.
 * @param overrides - fields to change.
 * @returns a personal notification created `index` minutes before 08:20 on 2026-11-13.
 */
export function notification(index: number, overrides: Partial<FakeItem> = {}): FakeItem {
  return {
    type: 'notification', id: `n${index}`, kind: 'quota-request.approved', level: 'info',
    title: `提额申请已批准 ${index}`, body: '本月可用额度增加 ¥50，审批人张伟。', link: 'https://cloud.example.com/usage',
    related: { type: 'quota_request', id: `q${index}` },
    createdAt: new Date(Date.UTC(2026, 10, 13, 8, 20 - index)).toISOString(), readAt: null, ...overrides,
  }
}

async function read(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  const text = Buffer.concat(chunks).toString('utf8')
  return text === '' ? undefined : JSON.parse(text)
}

/** @returns a running fake inbox; close it in teardown. */
export async function startFakeInbox(): Promise<FakeInbox> {
  const unread = () => inbox.items.filter(item => item.readAt === null).length
  const server = createServer((request, response) => {
    void (async () => {
      const address = new URL(request.url ?? '/', 'http://localhost')
      inbox.requests.push(`${request.method} ${address.pathname}${address.search}`)
      const body = await read(request)
      const reply = (status: number, value: unknown) => {
        response.writeHead(status, { 'content-type': 'application/json', 'x-request-id': `req-${inbox.requests.length}` })
        response.end(JSON.stringify(value))
      }
      if (request.headers.authorization !== `Bearer ${inbox.token}`) {
        reply(401, { error: { code: 'SIGN_IN_REQUIRED', message: '登录已失效，请在 Mindeck 中重新登录。' } })
        return
      }
      if (inbox.status === 0) { request.socket.destroy(); return }
      if (inbox.status !== 200) { reply(inbox.status, { error: { code: 'INTERNAL', message: '服务器出错了。' } }); return }
      if (address.pathname === '/api/desktop/inbox' && request.method === 'GET') {
        const cursor = address.searchParams.get('cursor')
        if (cursor !== null && inbox.refuseCursor) {
          inbox.refuseCursor = false
          reply(400, { error: { code: 'INVALID_REQUEST', message: '消息列表的分页参数不正确，请重新打开企业消息。', requestId: 'req-cursor' } })
          return
        }
        const start = cursor === null ? 0 : Number(cursor)
        const limit = Number(address.searchParams.get('limit') ?? '20')
        const end = start + limit
        reply(200, { items: inbox.items.slice(start, end), nextCursor: end < inbox.items.length ? String(end) : null, unread: unread() })
      } else if (address.pathname === '/api/desktop/inbox/read' && request.method === 'POST') {
        inbox.reads.push(body)
        const target = body as { all?: true; items?: Array<{ type: string; id: string }> }
        const now = new Date().toISOString()
        for (const item of inbox.items) {
          if (item.readAt !== null) continue
          if (target.all === true || target.items?.some(ref => ref.type === item.type && ref.id === item.id) === true) item.readAt = now
        }
        reply(200, { unread: unread() })
      } else {
        reply(404, { error: { code: 'NOT_FOUND', message: 'not found' } })
      }
    })()
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Expected a loopback listener')
  const inbox: FakeInbox = {
    url: `http://127.0.0.1:${address.port}/api/desktop/inbox`,
    items: [], token: 'desktop-token-1', status: 200, refuseCursor: false, requests: [], reads: [],
    close: async () => {
      if (!server.listening) return
      const closed = new Promise<void>((resolve) => { server.close(() => { resolve() }) })
      server.closeAllConnections()
      await closed
    },
  }
  return inbox
}
