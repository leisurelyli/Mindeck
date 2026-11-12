/** File-library tools and the panel Remote against a loopback Mindeck Cloud token endpoint and OpenCloud. */
import { once } from 'node:events'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local'
import type { MindeckSession } from '@deepseek-ai/dsh-mindeck-account'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { executeModelToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { afterEach, expect, it, vi } from 'vitest'
import MindeckFiles, { type Config } from '../src/index.ts'
import { fakeOpenCloud } from './fake-opencloud.ts'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

/** Loopback `POST /api/desktop/files/token` issuing the OpenCloud tokens in order. */
async function tokenServer(opencloud: string) {
  const state = { status: 200, issued: 0, tokens: ['oc-token-1', 'oc-token-2'] }
  const server = createServer((request, reply) => {
    if (request.headers.authorization !== 'Bearer desktop-token-1' || state.status === 401) { reply.writeHead(401).end(); return }
    if (state.status !== 200) { reply.writeHead(state.status).end(); return }
    const token = state.tokens[Math.min(state.issued, state.tokens.length - 1)]
    state.issued += 1
    reply.writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify({ token, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(), url: `${opencloud}/` }))
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
  return { url: `http://127.0.0.1:${address.port}/api/desktop/files/token`, state }
}

async function fixture(options: { files?: boolean } = {}) {
  const oc = await fakeOpenCloud([
    { id: 'drive-personal', name: '林晓', driveType: 'personal', writable: true, total: 3000 },
    { id: 'drive-company', name: '星河科技', driveType: 'project', writable: false },
    { id: 'drive-dept', name: '研发部', driveType: 'project', writable: true },
  ])
  cleanups.push(() => oc.close())
  const cloud = await tokenServer(oc.url)
  const base = await mkdtemp(join(tmpdir(), 'mindeck-files-'))
  cleanups.push(() => rm(base, { recursive: true, force: true }))
  const workspace = join(base, 'workspace')
  const downloads = join(base, 'downloads')
  await mkdir(workspace)
  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  let current: MindeckSession | undefined = {
    cloudUrl: 'http://127.0.0.1', token: 'desktop-token-1',
    bootstrap: {
      user: { id: 'u1', name: '林晓', email: 'lin@example.com', role: 'user', department: null },
      company: { name: '星河科技' }, device: { id: 'd1' },
      endpoints: {
        console: 'http://127.0.0.1', models: 'http://127.0.0.1/models', skills: 'http://127.0.0.1/skills',
        anthropicBaseUrl: 'http://127.0.0.1', openaiBaseUrl: 'http://127.0.0.1',
        files: options.files === false ? null : { url: oc.url, token: cloud.url },
      },
    },
  }
  const account = {
    session: vi.fn(async () => current),
    rejectToken: vi.fn(async (token: string) => {
      if (current?.token !== token) return
      current = undefined
      ctx.emit('mindeck-account/changed')
    }),
  }
  ctx.provide('mindeckAccount', account as never)
  ctx.provide('workingDirectory', { ensure: async () => workspace } as never)
  await ctx.plugin(TypertRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  await ctx.plugin(LocalFileSystem, { cwd: workspace }).await()
  const config: Config = {
    downloadDir: downloads, downloadRetentionDays: 7, requestTimeoutMs: 10_000,
    maxDownloadBytes: 1024, maxUploadBytes: 2048, maxSearchResults: 20,
  }
  await ctx.plugin(MindeckFiles, config)
  await vi.waitFor(async () => { expect(await ctx.mindeckFiles.getAvailability()).toBe(options.files === false ? 'not-configured' : 'ready') })
  let call = 0
  const run = async (name: string, args: Record<string, unknown>) => {
    call += 1
    const result = await executeModelToolFixture(ctx, {
      callId: `call-${call}` as never, name, arguments: args, signal: new AbortController().signal,
    })
    const text = result.content.map(block => block.type === 'text' ? block.text : '').join('')
    return { ...result, text }
  }
  const signOut = () => { current = undefined; ctx.emit('mindeck-account/changed') }
  return { ctx, oc, cloud, account, workspace, downloads, run, signOut }
}

it('lists the spaces and folders, and saves a workspace file with its folders', async () => {
  const f = await fixture()
  const spaces = await f.run('library_list', {})
  expect(spaces.isError).toBe(false)
  expect(spaces.value).toEqual({ path: '/', entries: [
    { path: '/Personal', name: 'Personal', kind: 'space' },
    { path: '/星河科技', name: '星河科技', kind: 'space' },
    { path: '/研发部', name: '研发部', kind: 'space' },
  ] })

  await writeFile(join(f.workspace, 'weekly.md'), '# 周报\n')
  const saved = await f.run('library_upload', { from: 'weekly.md', to: '/研发部/周报/2026/' })
  expect(saved.value).toEqual({ path: '/研发部/周报/2026/weekly.md', size: 9, overwritten: false })
  expect(saved.text).toBe('Saved /研发部/周报/2026/weekly.md (9 B).')
  const listed = await f.run('library_list', { path: 'library:/研发部/周报' })
  expect(listed.value).toMatchObject({ path: '/研发部/周报', entries: [{ path: '/研发部/周报/2026', kind: 'folder', writable: true }] })
  expect((await f.run('library_list', { path: 'library:"/研发部/周报"' })).value).toEqual(listed.value)

  const again = await f.run('library_upload', { from: 'weekly.md', to: '/研发部/周报/2026/weekly.md' })
  expect(again.isError).toBe(true)
  expect(again.text).toContain('pass overwrite: true')
  await writeFile(join(f.workspace, 'weekly.md'), '# 周报 v2\n')
  const replaced = await f.run('library_upload', { from: 'weekly.md', to: '/研发部/周报/2026/weekly.md', overwrite: true })
  expect(replaced.value).toEqual({ path: '/研发部/周报/2026/weekly.md', size: 12, overwritten: true })
  expect(new TextDecoder().decode(f.oc.state.nodes.get('drive-dept')?.get('周报/2026/weekly.md')?.content)).toBe('# 周报 v2\n')
})

it('reports read-only spaces, full spaces, oversized files, and unknown spaces in terms the model can act on', async () => {
  const f = await fixture()
  await writeFile(join(f.workspace, 'note.md'), 'hello')
  const denied = await f.run('library_upload', { from: 'note.md', to: '/星河科技/note.md' })
  expect(denied.isError).toBe(true)
  expect(denied.text).toContain('may not')
  const unknown = await f.run('library_upload', { from: 'note.md', to: '/市场部/note.md' })
  expect(unknown.text).toContain('the spaces are "Personal", "星河科技", "研发部"')
  await writeFile(join(f.workspace, 'big.txt'), 'x'.repeat(1600))
  await f.run('library_upload', { from: 'big.txt', to: '/Personal/one.txt' })
  const full = await f.run('library_upload', { from: 'big.txt', to: '/Personal/two.txt' })
  expect(full.text).toContain('no room left')
  await writeFile(join(f.workspace, 'huge.txt'), 'x'.repeat(2049))
  const huge = await f.run('library_upload', { from: 'huge.txt', to: '/Personal/huge.txt' })
  expect(huge.text).toContain('upload limit')
})

it('searches names, downloads into the session directory, and renews a refused token once', async () => {
  const f = await fixture()
  f.oc.put('drive-company', '制度/报销制度.md', '# 报销\n')
  f.oc.put('drive-dept', '周报/报销统计.csv', 'a,b\n')
  const found = await f.run('library_search', { query: '报销' })
  expect((found.value as { entries: Array<{ path: string }> }).entries.map(entry => entry.path).sort())
    .toEqual(['/星河科技/制度/报销制度.md', '/研发部/周报/报销统计.csv'])
  expect(found.text).toContain('read-only')

  f.oc.state.tokens.clear()
  f.oc.state.tokens.add('oc-token-2')
  const downloaded = await f.run('library_download', { path: '/星河科技/制度/报销制度.md' })
  expect(downloaded.isError).toBe(false)
  const { localPath } = downloaded.value as { localPath: string }
  expect(localPath).toBe(join(f.downloads, 'shared', '星河科技', '制度', '报销制度.md'))
  expect(await readFile(localPath, 'utf8')).toBe('# 报销\n')
  expect(f.cloud.state.issued).toBe(2)

  f.oc.put('drive-dept', 'big.bin', 'x'.repeat(2000))
  const tooLarge = await f.run('library_download', { path: '/研发部/big.bin' })
  expect(tooLarge.text).toContain('limit is 1024')
  const folder = await f.run('library_download', { path: '/研发部/周报' })
  expect(folder.text).toContain('is a folder')
})

it('hides the tools without a file library and ends the session when Mindeck Cloud refuses it', async () => {
  const off = await fixture({ files: false })
  const hidden = await off.run('library_list', {})
  expect(hidden.isError).toBe(true)

  const f = await fixture()
  f.cloud.state.status = 401
  f.oc.state.tokens.clear()
  const refused = await f.run('library_list', {})
  expect(refused.isError).toBe(true)
  expect(f.account.rejectToken).toHaveBeenCalledWith('desktop-token-1')
  await vi.waitFor(async () => { expect(await f.ctx.mindeckFiles.getAvailability()).toBe('signed-out') })
  await expect(f.ctx.mindeckFiles.spaces(new AbortController().signal)).rejects.toMatchObject({ code: 'mindeck-files/signed-out' })
})

it('serves the panel the spaces, a folder, and search results', async () => {
  const f = await fixture()
  f.oc.put('drive-dept', '周报/第一周.md', 'w1')
  const signal = new AbortController().signal
  expect((await f.ctx.mindeckFiles.spaces(signal)).map(space => [space.path, space.kind]))
    .toEqual([['/Personal', 'personal'], ['/星河科技', 'project'], ['/研发部', 'project']])
  const entries = await f.ctx.mindeckFiles.list('/研发部/周报', signal)
  expect(entries).toEqual([{
    path: '/研发部/周报/第一周.md', name: '第一周.md', kind: 'file', size: 2, modified: '2026-11-01T00:00:00.000Z', writable: true,
  }])
  expect(await f.ctx.mindeckFiles.search('  ', signal)).toEqual([])
  await expect(f.ctx.mindeckFiles.list('/研发部/不存在', signal)).rejects.toMatchObject({ code: 'mindeck-files/not-found' })
  f.signOut()
  await vi.waitFor(async () => { expect(await f.ctx.mindeckFiles.getAvailability()).toBe('signed-out') })
})
