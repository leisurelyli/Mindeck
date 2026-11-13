/** Loopback OpenCloud subset: `/graph/v1.0/me/drives` and WebDAV PROPFIND, GET, PUT, MKCOL, and search REPORT. */
import { once } from 'node:events'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

/** One stored item; folders have no content. */
interface Node {
  readonly kind: 'file' | 'folder'
  content?: Uint8Array
  modified: Date
}

/** One drive of the fake server. */
export interface FakeDrive {
  readonly id: string
  readonly name: string
  readonly driveType: 'personal' | 'project' | 'virtual'
  /** Whether the member may write into this drive. */
  readonly writable: boolean
  /** Byte limit; a PUT over it answers 507. */
  readonly total?: number
}

async function body(request: IncomingMessage): Promise<Uint8Array> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  return new Uint8Array(Buffer.concat(chunks))
}

function escape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * @param drives - drives the member can open.
 * @returns the server URL, its state, and a closer.
 */
export async function fakeOpenCloud(drives: readonly FakeDrive[]) {
  const state = {
    tokens: new Set<string>(['oc-token-1']),
    requests: [] as string[],
    nodes: new Map<string, Map<string, Node>>(drives.map(drive => [drive.id, new Map([['', { kind: 'folder', modified: new Date(0) }]])])),
  }
  const href = (driveId: string, path: string, folder: boolean) =>
    `/dav/spaces/${encodeURIComponent(driveId)}/${path.split('/').filter(Boolean).map(encodeURIComponent).join('/')}${folder && path !== '' ? '/' : ''}`
  const response = (driveId: string, path: string, node: Node, writable: boolean) => {
    const size = node.kind === 'file' ? `<d:getcontentlength>${node.content?.byteLength ?? 0}</d:getcontentlength>` : ''
    const type = node.kind === 'folder' ? '<d:resourcetype><d:collection/></d:resourcetype>' : '<d:resourcetype/>'
    const permissions = node.kind === 'folder' ? (writable ? 'RDNVCK' : 'S') : (writable ? 'RDNVW' : 'S')
    return `<d:response><d:href>${escape(href(driveId, path, node.kind === 'folder'))}</d:href><d:propstat><d:prop>${size}`
      + `<d:getlastmodified>${node.modified.toUTCString()}</d:getlastmodified>${type}<oc:permissions>${permissions}</oc:permissions>`
      + '</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>'
  }
  const multistatus = (parts: string[]) =>
    `<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">${parts.join('')}</d:multistatus>`
  const handle = async (request: IncomingMessage, reply: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    state.requests.push(`${request.method} ${decodeURIComponent(url.pathname)}`)
    const token = /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1]
    if (token === undefined || !state.tokens.has(token)) { reply.writeHead(401).end(); return }
    if (url.pathname === '/graph/v1.0/me/drives') {
      reply.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ value: drives.map(drive => ({
        id: drive.id, name: drive.name, driveType: drive.driveType, webUrl: `http://opencloud.test/f/${drive.id}`,
        quota: { used: 0, total: drive.total ?? 0 },
      })) }))
      return
    }
    if (url.pathname === '/dav/spaces/' && request.method === 'REPORT') {
      const pattern = /<oc:pattern>name:"\*(.*)\*"<\/oc:pattern>/.exec(new TextDecoder().decode(await body(request)))?.[1] ?? ''
      const parts: string[] = []
      for (const drive of drives) {
        for (const [path, node] of state.nodes.get(drive.id) ?? []) {
          const name = path.slice(path.lastIndexOf('/') + 1)
          if (path !== '' && name.includes(pattern)) parts.push(response(drive.id, path, node, drive.writable))
        }
      }
      reply.writeHead(207, { 'content-type': 'application/xml' }).end(multistatus(parts))
      return
    }
    const match = /^\/dav\/spaces\/([^/]+)\/?(.*)$/.exec(url.pathname)
    const drive = drives.find(item => item.id === decodeURIComponent(match?.[1] ?? ''))
    const nodes = drive === undefined ? undefined : state.nodes.get(drive.id)
    if (match === null || drive === undefined || nodes === undefined) { reply.writeHead(404).end(); return }
    const path = (match[2] ?? '').split('/').filter(Boolean).map(decodeURIComponent).join('/')
    const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
    const node = nodes.get(path)
    switch (request.method) {
      case 'PROPFIND': {
        if (node === undefined) { reply.writeHead(404).end(); return }
        const parts = [response(drive.id, path, node, drive.writable)]
        if (request.headers.depth === '1' && node.kind === 'folder') {
          for (const [childPath, child] of nodes) {
            const childParent = childPath.includes('/') ? childPath.slice(0, childPath.lastIndexOf('/')) : ''
            if (childPath !== '' && childPath !== path && childParent === path) parts.push(response(drive.id, childPath, child, drive.writable))
          }
        }
        reply.writeHead(207, { 'content-type': 'application/xml' }).end(multistatus(parts))
        return
      }
      case 'GET': {
        if (node?.kind !== 'file') { reply.writeHead(404).end(); return }
        reply.writeHead(200, { 'content-length': String(node.content?.byteLength ?? 0) }).end(node.content)
        return
      }
      case 'PUT': {
        const content = await body(request)
        if (!drive.writable) { reply.writeHead(403).end(); return }
        if (nodes.get(parent)?.kind !== 'folder') { reply.writeHead(409).end(); return }
        // Like OpenCloud, PUT replaces an existing file even when the request carries `If-None-Match: *`.
        const used = [...nodes.values()].reduce((sum, item) => sum + (item.content?.byteLength ?? 0), 0) - (node?.content?.byteLength ?? 0)
        if (drive.total !== undefined && used + content.byteLength > drive.total) { reply.writeHead(507).end(); return }
        nodes.set(path, { kind: 'file', content, modified: new Date() })
        reply.writeHead(node === undefined ? 201 : 204).end()
        return
      }
      case 'MKCOL': {
        if (!drive.writable) { reply.writeHead(403).end(); return }
        if (node !== undefined) { reply.writeHead(405).end(); return }
        if (nodes.get(parent)?.kind !== 'folder') { reply.writeHead(409).end(); return }
        nodes.set(path, { kind: 'folder', modified: new Date() })
        reply.writeHead(201).end()
        return
      }
      default: reply.writeHead(405).end()
    }
  }
  const server = createServer((request, reply) => {
    handle(request, reply).catch((error: unknown) => { reply.writeHead(500).end(String(error)) })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Expected a loopback listener')
  const put = (driveId: string, path: string, content: string) => {
    const nodes = state.nodes.get(driveId)
    if (nodes === undefined) throw new Error(`unknown drive ${driveId}`)
    const parts = path.split('/')
    for (let index = 1; index < parts.length; index += 1) {
      const folder = parts.slice(0, index).join('/')
      if (!nodes.has(folder)) nodes.set(folder, { kind: 'folder', modified: new Date(0) })
    }
    nodes.set(path, { kind: 'file', content: new TextEncoder().encode(content), modified: new Date(Date.UTC(2026, 10, 1)) })
  }
  const close = async () => {
    const closed = new Promise<void>((resolve) => { server.close(() => { resolve() }) })
    server.closeAllConnections()
    await closed
  }
  return { url: `http://127.0.0.1:${address.port}`, state, put, close }
}
