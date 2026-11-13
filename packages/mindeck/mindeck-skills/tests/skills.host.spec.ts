/** Company skills follow the Mindeck session, download only changed skills, leave with sign-out, and are listed for the skills page. */
import { once } from 'node:events'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import type { MindeckSession } from '@deepseek-ai/dsh-mindeck-account'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { afterEach, expect, it, vi } from 'vitest'
import MindeckSkills, { type Config, type MindeckSkillCatalog } from '../src/index.ts'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

interface CloudSkill {
  name: string
  hash: string
  description: string
  displayName?: string | null
  category?: string | null
  recommended?: boolean
  searchKeys?: string[]
}

/** Loopback `/api/desktop/skills` with a mutable skill list. */
async function skillServer() {
  const state = { status: 200, skills: [] as CloudSkill[], requests: [] as string[], missing: [] as string[] }
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname
    state.requests.push(path)
    const reply = (status: number, body: unknown) => {
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(body))
    }
    if (state.status !== 200) { reply(state.status, { error: { code: 'SIGN_IN_REQUIRED', message: '请先登录。' } }); return }
    if (path === '/api/desktop/skills') { reply(200, { skills: state.skills.map(skill => ({ ...skill, version: 1 })) }); return }
    const skill = state.skills.find(entry => path === `/api/desktop/skills/${entry.name}` && !state.missing.includes(entry.name))
    if (skill === undefined) { reply(404, { error: { code: 'SKILL_NOT_FOUND', message: '不存在' } }); return }
    reply(200, {
      name: skill.name, hash: skill.hash, version: 1, description: skill.description,
      files: [
        { path: 'SKILL.md', encoding: 'utf8', content: `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n# ${skill.name}\n` },
        { path: 'scripts/run.sh', encoding: 'utf8', content: 'echo ok\n' },
      ],
    })
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
  return { url: `http://127.0.0.1:${address.port}/api/desktop/skills`, state }
}

async function fixture() {
  const cloud = await skillServer()
  const base = await mkdtemp(join(tmpdir(), 'mindeck-skills-'))
  cleanups.push(() => rm(base, { recursive: true, force: true }))
  const session = (userId: string, token: string): MindeckSession => ({
    cloudUrl: 'http://127.0.0.1', token,
    bootstrap: {
      user: { id: userId, name: '林晓', email: 'lin@example.com', role: 'user', department: null },
      company: { name: '星河科技' }, device: { id: 'd1' },
      endpoints: {
        console: 'http://127.0.0.1', models: 'http://127.0.0.1/models', skills: cloud.url,
        anthropicBaseUrl: 'http://127.0.0.1', openaiBaseUrl: 'http://127.0.0.1',
      },
    },
  })
  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  let current: MindeckSession | undefined = session('u1', 'desktop-token-1')
  const account = {
    session: vi.fn(async () => current),
    rejectToken: vi.fn(async (token: string) => {
      if (current?.token !== token) return
      current = undefined
      ctx.emit('mindeck-account/changed')
    }),
  }
  ctx.provide('mindeckAccount', account as never)
  await ctx.plugin(TypertRegistry)
  await ctx.plugin(SkillRegistry)
  const change = (next: MindeckSession | undefined) => { current = next; ctx.emit('mindeck-account/changed') }
  const names = async () => (await ctx.skills.list()).filter(skill => skill.source === 'custom').map(skill => skill.name).sort()
  const config: Config = {
    cacheDir: base, refreshIntervalMs: 600_000, requestTimeoutMs: 10_000, maxSkillBytes: 1024 * 1024, maxSkillFiles: 50,
  }
  return { ctx, cloud, base, account, session, change, names, config }
}

const downloads = (requests: string[]) => requests.filter(path => path !== '/api/desktop/skills').sort()

it('downloads listed skills, refreshes only changed ones, and prunes removed ones', async () => {
  const f = await fixture()
  f.cloud.state.skills = [
    { name: 'weekly-report', hash: 'h1', description: 'Write the weekly report.' },
    { name: 'contract-review', hash: 'c1', description: 'Review a contract.' },
  ]
  await f.ctx.plugin(MindeckSkills, f.config)
  await vi.waitFor(async () => { expect(await f.names()).toEqual(['contract-review', 'weekly-report']) })
  const skill = await f.ctx.skills.get('weekly-report')
  expect(skill?.description).toBe('Write the weekly report.')
  expect(await readdir(join(f.base, 'skills', 'weekly-report', 'scripts'))).toEqual(['run.sh'])

  f.cloud.state.requests.length = 0
  f.cloud.state.skills = [{ name: 'weekly-report', hash: 'h2', description: 'Write the weekly report, version 2.' }]
  f.change(f.session('u1', 'desktop-token-1'))
  await vi.waitFor(async () => { expect(await f.names()).toEqual(['weekly-report']) })
  expect(downloads(f.cloud.state.requests)).toEqual(['/api/desktop/skills/weekly-report'])
  await vi.waitFor(async () => { expect((await f.ctx.skills.get('weekly-report'))?.description).toBe('Write the weekly report, version 2.') })

  f.cloud.state.requests.length = 0
  f.change(f.session('u1', 'desktop-token-1'))
  await vi.waitFor(() => { expect(f.cloud.state.requests).toEqual(['/api/desktop/skills']) })
})

it('clears the cache on sign-out and for another member, and ends a refused session', async () => {
  const f = await fixture()
  f.cloud.state.skills = [{ name: 'weekly-report', hash: 'h1', description: 'Write the weekly report.' }]
  await f.ctx.plugin(MindeckSkills, f.config)
  await vi.waitFor(async () => { expect(await f.names()).toEqual(['weekly-report']) })

  f.change(undefined)
  await vi.waitFor(async () => { expect(await f.names()).toEqual([]) })
  expect(await readdir(f.base)).toEqual([])

  f.cloud.state.requests.length = 0
  f.change(f.session('u2', 'desktop-token-2'))
  await vi.waitFor(async () => { expect(await f.names()).toEqual(['weekly-report']) })
  expect(downloads(f.cloud.state.requests)).toEqual(['/api/desktop/skills/weekly-report'])

  f.cloud.state.status = 401
  f.change(f.session('u2', 'desktop-token-2'))
  await vi.waitFor(() => { expect(f.account.rejectToken).toHaveBeenCalledWith('desktop-token-2') })
  await vi.waitFor(async () => { expect(await f.names()).toEqual([]) })
})

it('lists installed skills for the skills page, from the saved listing until Mindeck Cloud answers', async () => {
  const f = await fixture()
  f.cloud.state.skills = [
    { name: 'weekly-report', hash: 'h1', description: '写周报。', displayName: '周报助手', category: '写作', recommended: true, searchKeys: ['ZhouBao', 'zb'] },
    { name: 'contract-review', hash: 'c1', description: 'Review a contract.' },
  ]
  const first = await f.ctx.plugin(MindeckSkills, f.config)
  const frames: MindeckSkillCatalog[] = []
  const stop = new AbortController()
  const reading = (async () => { for await (const frame of f.ctx.mindeckSkills.watch(stop.signal)) frames.push(frame) })()
  const listed: MindeckSkillCatalog = {
    company: '星河科技',
    skills: [
      { name: 'weekly-report', displayName: '周报助手', category: '写作', description: '写周报。', recommended: true, searchKeys: ['zhoubao', 'zb'] },
      { name: 'contract-review', displayName: null, category: null, description: 'Review a contract.', recommended: false, searchKeys: [] },
    ],
  }
  await vi.waitFor(() => { expect(frames.at(-1)).toEqual(listed) })

  // A skill whose download fails is not listed: it cannot be used.
  f.cloud.state.skills = [...f.cloud.state.skills, { name: 'broken', hash: 'b1', description: 'No files.' }]
  f.cloud.state.missing = ['broken']
  f.change(f.session('u1', 'desktop-token-1'))
  await vi.waitFor(() => { expect(f.cloud.state.requests).toContain('/api/desktop/skills/broken') })
  await vi.waitFor(() => { expect(frames.at(-1)).toEqual(listed) })

  f.change(undefined)
  await vi.waitFor(() => { expect(frames.at(-1)).toEqual({ company: null, skills: [] }) })
  stop.abort()
  await reading

  // The next start lists the saved skills while Mindeck Cloud cannot be reached.
  f.cloud.state.skills = f.cloud.state.skills.filter(skill => skill.name !== 'broken')
  f.change(f.session('u1', 'desktop-token-1'))
  await vi.waitFor(async () => { expect(await f.names()).toEqual(['contract-review', 'weekly-report']) })
  await first.dispose()
  f.cloud.state.status = 503
  await f.ctx.plugin(MindeckSkills, f.config)
  const again: MindeckSkillCatalog[] = []
  const stopAgain = new AbortController()
  const readingAgain = (async () => { for await (const frame of f.ctx.mindeckSkills.watch(stopAgain.signal)) again.push(frame) })()
  await vi.waitFor(() => { expect(again.at(-1)).toEqual(listed) })
  stopAgain.abort()
  await readingAgain
})
