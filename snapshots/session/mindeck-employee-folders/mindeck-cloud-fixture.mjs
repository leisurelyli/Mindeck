/**
 * Mindeck Cloud and its file library for the mindeck-employee-folders scenario. A loopback server answers the
 * digital-employee listing, the file-library token, and the OpenCloud drive list, folder reads, and search REPORT that
 * the file-library tools send; the `mindeckAccount` service keeps the desktop signed in to it; and the root Session
 * takes the digital employee's preset before its first turn. The search reads the KQL the desktop writes: an unquoted
 * `scope:<id>`, `name:"*q*"`, `content:"q"`, and an `AND` group of `content:` parts; a text match carries
 * `oc:highlights` with each matching run in `<mark>`.
 */
import { applyLoopbackServerEffect } from '../loopback-fixture-server.mjs'

/** Cordis plugin name. */
export const name = 'mindeck-cloud-fixture'

/** The preset roster the root Session's employee preset comes from. */
export const inject = ['agentPresets']

/** Resource id of the company's policy folder, which the employee consults. */
const RULES_ID = 'drive-company$rules!folder'

/** The one digital employee the member can use. */
const EMPLOYEE = {
  id: 'policy-desk',
  name: '制度问答',
  avatar: 'hr',
  tagline: '解答差旅、报销和休假制度',
  instructions: '先给结论，再说明依据。',
  starters: ['出差住宿标准是多少？'],
  skills: [],
  draft: false,
  defaultModel: 'deepseek-v4-flash',
  folders: [
    { driveId: 'drive-company', itemId: RULES_ID, path: '心言智创 / 制度', label: '企业制度', accessible: true },
    { driveId: 'drive-dept', itemId: 'drive-dept$specs!folder', path: '研发部 / 规范', label: '研发规范', accessible: false },
  ],
}

/** Agent preset mindeck-employees registers for the employee. */
const PRESET = `mindeck-employee-${EMPLOYEE.id}`

/** Drives the member can open; the department drive of the second folder is not among them. */
const DRIVES = [
  { id: 'drive-personal', name: '林晓', driveType: 'personal' },
  { id: 'drive-company', name: '心言智创', driveType: 'project' },
]

/** Library items by drive and path; folders have no text. */
const ITEMS = [
  { drive: 'drive-personal', path: '', id: 'drive-personal$root!folder' },
  { drive: 'drive-company', path: '', id: 'drive-company$root!folder' },
  { drive: 'drive-company', path: '制度', id: RULES_ID },
  {
    drive: 'drive-company', path: '制度/差旅费用管理办法.md', id: 'drive-company$travel!file',
    text: '# 差旅费用管理办法\n\n第五条 住宿费实行限额标准：北京、上海、广州、深圳每人每晚不超过 600 元，其他城市每人每晚不超过 450 元。\n\n第六条 城市间交通费凭票据实报实销。\n',
  },
  {
    drive: 'drive-company', path: '制度/员工考勤与休假管理制度.md', id: 'drive-company$leave!file',
    text: '# 员工考勤与休假管理制度\n\n第八条 工作满 1 年不满 10 年的，年休假 5 天；满 10 年不满 20 年的，年休假 10 天。\n',
  },
  { drive: 'drive-company', path: '公告', id: 'drive-company$notices!folder' },
  {
    drive: 'drive-company', path: '公告/2026 年会通知.md', id: 'drive-company$party!file',
    text: '年会在杭州举行，外地同事的住宿由行政部统一安排，标准间两人一间。\n',
  },
]

const MODIFIED = new Date(Date.UTC(2026, 10, 1)).toUTCString()

function escapeXml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function bytes(item) {
  return item.text === undefined ? undefined : Buffer.from(item.text, 'utf8')
}

function davResponse(item, highlights) {
  const folder = item.text === undefined
  const href = `/opencloud/dav/spaces/${encodeURIComponent(item.drive)}/${item.path.split('/').filter(Boolean).map(encodeURIComponent).join('/')}${folder && item.path !== '' ? '/' : ''}`
  const size = folder ? '' : `<d:getcontentlength>${bytes(item).byteLength}</d:getcontentlength>`
  const type = folder ? '<d:resourcetype><d:collection/></d:resourcetype>' : '<d:resourcetype/>'
  const marked = highlights === undefined ? '' : `<oc:highlights>${escapeXml(highlights)}</oc:highlights>`
  return `<d:response><d:href>${escapeXml(href)}</d:href><d:propstat><d:prop>${size}<d:getlastmodified>${MODIFIED}</d:getlastmodified>`
    + `${type}<oc:permissions>S</oc:permissions><oc:fileid>${escapeXml(item.id)}</oc:fileid>${marked}</d:prop>`
    + '<d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>'
}

function multistatus(parts) {
  return `<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">${parts.join('')}</d:multistatus>`
}

/** The items a search pattern finds, text matches with their highlight. */
function search(pattern) {
  const scope = /^scope:(\S+) AND /u.exec(pattern)?.[1]
  const name = /name:"\*(.*?)\*"/u.exec(pattern)?.[1] ?? ''
  const content = / OR content:"([^"]*)"/u.exec(pattern)?.[1]
  const group = / OR \((content:"[^"]*"(?: AND content:"[^"]*")*)\)/u.exec(pattern)?.[1]
  const parts = group === undefined ? [] : [...group.matchAll(/content:"([^"]*)"/gu)].map(match => match[1])
  const root = scope === undefined ? undefined : ITEMS.find(item => item.id === scope)
  if (scope !== undefined && root === undefined) return []
  const found = []
  for (const item of ITEMS) {
    if (item.path === '') continue
    if (root !== undefined && (item.drive !== root.drive || (root.path !== '' && !item.path.startsWith(`${root.path}/`)))) continue
    const text = item.text ?? ''
    const terms = content !== undefined && content !== '' && text.includes(content) ? [content]
      : parts.length > 0 && parts.every(part => text.includes(part)) ? parts : []
    if (terms.length > 0) {
      found.push(davResponse(item, terms.reduce((marked, term) => marked.split(term).join(`<mark>${term}</mark>`), text)))
    } else if (item.path.slice(item.path.lastIndexOf('/') + 1).includes(name)) {
      found.push(davResponse(item, ''))
    }
  }
  return found
}

async function body(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

function json(response, value) {
  response.writeHead(200, { 'content-type': 'application/json' })
  response.end(JSON.stringify(value))
}

/**
 * Start the loopback Mindeck Cloud, provide the signed-in account, and put the root Session on the employee's preset.
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
        files: { url: `${origin}/opencloud`, token: `${origin}/api/desktop/files/token`, fullText: true },
        employees: `${origin}/api/desktop/employees`,
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
    // mindeck-employees registers the employee's preset once the listing arrives.
    for (let attempt = 0; !(await ctx.agentPresets.list()).some(preset => preset.id === PRESET); attempt += 1) {
      if (attempt === 300) throw new Error(`mindeck-cloud-fixture: ${PRESET} was never registered`)
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    await ctx.agentPresets.select(agent, PRESET)
  }, { prepend: true })
  await applyLoopbackServerEffect(ctx, {
    label: 'mindeck-cloud-fixture',
    requestListener: (request, response) => {
      void (async () => {
        const url = new URL(request.url ?? '/', origin)
        const path = decodeURIComponent(url.pathname)
        if (path === '/api/desktop/employees') return json(response, { employees: [EMPLOYEE], fullText: true })
        if (path === '/api/desktop/files/token' && request.method === 'POST') {
          return json(response, { token: 'snapshot-files-token', expiresAt: '2099-01-01T00:00:00.000Z', url: `${origin}/opencloud` })
        }
        if (path === '/opencloud/graph/v1.0/me/drives') {
          return json(response, { value: DRIVES.map(drive => ({ ...drive, webUrl: `${origin}/opencloud/f/${drive.id}` })) })
        }
        if (path === '/opencloud/dav/spaces/' && request.method === 'REPORT') {
          const escaped = /<oc:pattern>(.*)<\/oc:pattern>/su.exec(await body(request))?.[1] ?? ''
          const pattern = escaped.replace(/&lt;/gu, '<').replace(/&gt;/gu, '>').replace(/&amp;/gu, '&')
          response.writeHead(207, { 'content-type': 'application/xml' })
          return response.end(multistatus(search(pattern)))
        }
        const dav = /^\/opencloud\/dav\/spaces\/([^/]+)\/?(.*)$/u.exec(path)
        const inner = dav?.[2]?.replace(/\/$/u, '') ?? ''
        const item = dav === null ? undefined : ITEMS.find(entry => entry.drive === dav[1] && entry.path === inner)
        if (item !== undefined && request.method === 'PROPFIND') {
          const children = request.headers.depth === '1' && item.text === undefined
            ? ITEMS.filter(entry => entry.drive === item.drive && entry.path !== '' && entry.path !== item.path
              && entry.path.slice(0, Math.max(0, entry.path.lastIndexOf('/'))) === item.path)
            : []
          response.writeHead(207, { 'content-type': 'application/xml' })
          return response.end(multistatus([item, ...children].map(entry => davResponse(entry))))
        }
        if (item?.text !== undefined && request.method === 'GET') {
          response.writeHead(200, { 'content-length': String(bytes(item).byteLength) })
          return response.end(bytes(item))
        }
        response.writeHead(404).end()
      })().catch((error) => { response.writeHead(500).end(String(error)) })
    },
    onListening: (address) => {
      origin = `http://127.0.0.1:${address.port}`
      ready.resolve(undefined)
    },
    onCleanup: () => {},
  })
}
