/** Device sign-in, the stored session, and its end against a loopback Mindeck Cloud. */
import { hostname } from 'node:os'
import { Context } from '@deepseek-ai/cordis'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { afterEach, expect, it, vi } from 'vitest'
import { MemoryCredentials } from '../../../credentials/credentials/tests/memory.ts'
import { liveConfig } from '../../../settings/settings/tests/live-config.ts'
import MindeckAccount, { MINDECK_ACCOUNT_KEY, type MindeckAccountView } from '../src/index.ts'
import { startFakeCloud } from './fake-cloud.ts'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function fixture(options: { cloudUrl?: string } = {}) {
  const cloud = await startFakeCloud()
  cleanups.push(() => cloud.close())
  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  await ctx.plugin(MemoryCredentials)
  await ctx.plugin(TypertRegistry)
  const updates: Array<{ ns: string; patch: Record<string, unknown> }> = []
  const loaded: { live?: Awaited<ReturnType<typeof liveConfig>> } = {}
  ctx.provide('settings', {
    configure: () => () => {},
    update: async (ns: string, patch: Record<string, unknown>) => { updates.push({ ns, patch }); await loaded.live?.update(patch) },
  } as never)
  const live = await liveConfig(ctx, MindeckAccount, { cloudUrl: options.cloudUrl ?? cloud.url, requestTimeoutMs: 5000 })
  loaded.live = live
  const account = () => ctx.mindeckAccount
  const state = () => account().getState()
  const phase = async () => (await state()).attempt?.phase
  return { ctx, cloud, live, updates, account, state, phase }
}

async function signIn(f: Awaited<ReturnType<typeof fixture>>): Promise<string> {
  await f.account().startSignIn('1.2.3')
  await vi.waitFor(async () => { expect(await f.phase()).toBe('succeeded') })
  const session = await f.account().session()
  if (session === undefined) throw new Error('Expected a stored session')
  return session.token
}

it('checks that an address is a Mindeck Cloud before storing it', async () => {
  const f = await fixture({ cloudUrl: '' })
  const signal = new AbortController().signal
  expect((await f.state()).cloudUrl).toBeNull()
  await expect(f.account().startSignIn('1.2.3')).rejects.toMatchObject({ code: 'mindeck-account/no-cloud-url' })
  await expect(f.account().setCloudUrl('ftp://files.example.com', signal))
    .rejects.toMatchObject({ code: 'mindeck-account/invalid-cloud-url', details: { reason: 'format' } })
  await expect(f.account().setCloudUrl(`${f.cloud.url}/elsewhere`, signal))
    .rejects.toMatchObject({ code: 'mindeck-account/invalid-cloud-url', details: { reason: 'not-mindeck-cloud' } })
  const closed = await startFakeCloud()
  await closed.close()
  await expect(f.account().setCloudUrl(closed.url, signal))
    .rejects.toMatchObject({ code: 'mindeck-account/invalid-cloud-url', details: { reason: 'unreachable' } })
  expect(f.updates).toEqual([])

  const view = await f.account().setCloudUrl(` ${f.cloud.url}/ `, signal)
  expect(view.cloudUrl).toBe(f.cloud.url)
  expect(f.updates).toEqual([{ ns: 'MindeckAccount', patch: { cloudUrl: f.cloud.url } }])
  expect(f.live.entry.options.config).toMatchObject({ cloudUrl: f.cloud.url })
})

it('signs in with a device code, reports the device, and stores the session without exposing its token', async () => {
  const f = await fixture()
  const changed = vi.fn()
  f.ctx.on('mindeck-account/changed', changed)
  const frames: MindeckAccountView[] = []
  const watching = new AbortController()
  const watch = (async () => { for await (const frame of f.account().watch(watching.signal)) frames.push(frame) })()
  cleanups.push(async () => { watching.abort(); await watch })

  f.cloud.pendingPolls = Number.POSITIVE_INFINITY
  const started = await f.account().startSignIn('1.2.3')
  expect(started.attempt?.phase).toBe('requesting')
  await vi.waitFor(async () => {
    expect((await f.state()).attempt).toMatchObject({
      phase: 'waiting', userCode: 'ABCD-EFGH', verificationUrl: `${f.cloud.url}/device?user_code=ABCD-EFGH`,
    })
  })
  // Joining the running attempt does not request another code.
  await f.account().startSignIn('1.2.3')
  await f.cloud.polled(2)
  f.cloud.pendingPolls = 0
  const token = await signIn(f)

  const view = await f.state()
  expect(view).toMatchObject({
    cloudUrl: f.cloud.url, status: 'signed-in', companyName: '星河科技', notice: null,
    user: { name: '林晓', email: 'lin@example.com', role: 'user', department: { name: '研发部' } },
  })
  expect(view.attempt).not.toHaveProperty('userCode')
  expect(JSON.stringify(view)).not.toContain(token)
  expect(f.cloud.requests.filter(request => request === 'POST /api/auth/device/code')).toHaveLength(1)
  expect(f.cloud.devices).toEqual([{ name: hostname(), platform: process.platform, appVersion: '1.2.3' }])
  expect(await f.ctx.credentials.readRecord(MINDECK_ACCOUNT_KEY)).toMatchObject({ kind: 'grant', payload: { version: 1, token } })
  expect(changed).toHaveBeenCalled()
  await vi.waitFor(() => { expect(frames.at(-1)?.status).toBe('signed-in') })
  expect(frames[0]?.status).toBe('signed-out')

  await expect(f.account().setCloudUrl('https://other.example.com', new AbortController().signal))
    .rejects.toMatchObject({ code: 'mindeck-account/signed-in' })
  const signedOut = await f.account().signOut()
  expect(signedOut).toMatchObject({ status: 'signed-out', user: null, notice: null })
  expect(await f.ctx.credentials.readRecord(MINDECK_ACCOUNT_KEY)).toBeUndefined()
  expect(await f.account().session()).toBeUndefined()
  await vi.waitFor(() => { expect(f.cloud.tokens.has(token)).toBe(false) })
})

it('reports declined and expired codes and cancels a waiting attempt', async () => {
  const f = await fixture()
  f.cloud.outcome = 'deny'
  await f.account().startSignIn('1.2.3')
  await vi.waitFor(async () => { expect((await f.state()).attempt).toMatchObject({ phase: 'failed', errorCode: 'denied' }) })

  f.cloud.outcome = 'expire'
  await f.account().startSignIn('1.2.3')
  await vi.waitFor(async () => { expect((await f.state()).attempt).toMatchObject({ phase: 'failed', errorCode: 'expired' }) })

  f.cloud.pendingPolls = Number.POSITIVE_INFINITY
  const waiting = await f.account().startSignIn('1.2.3')
  await vi.waitFor(async () => { expect(await f.phase()).toBe('waiting') })
  const id = waiting.attempt?.id
  if (id === undefined) throw new Error('Expected an attempt')
  expect((await f.account().cancelSignIn(id)).attempt).toEqual({ id, phase: 'cancelled' })
  expect((await f.state()).status).toBe('signed-out')
  const next = await f.account().startSignIn('1.2.3')
  expect(next.attempt?.id).not.toBe(id)
})

it('ends the session only for the token Mindeck Cloud rejected', async () => {
  const f = await fixture()
  const token = await signIn(f)
  await f.account().rejectToken('an-older-token-0123456789')
  expect((await f.state()).status).toBe('signed-in')
  await f.account().rejectToken(token)
  expect(await f.state()).toMatchObject({ status: 'signed-out', notice: 'session-expired' })
  f.cloud.pendingPolls = Number.POSITIVE_INFINITY
  expect((await f.account().startSignIn('1.2.3')).notice).toBeNull()
})

it('revalidates the stored session when the plugin starts', async () => {
  const f = await fixture()
  const token = await signIn(f)
  const restart = async (timeout: number) => {
    await f.live.replace({ cloudUrl: f.cloud.url, requestTimeoutMs: timeout })
  }

  f.cloud.userName = '林晓（研发）'
  await restart(5001)
  await vi.waitFor(async () => { expect((await f.state()).user?.name).toBe('林晓（研发）') })

  await f.cloud.close()
  await restart(5002)
  await new Promise(resolve => setTimeout(resolve, 50))
  expect((await f.state()).status).toBe('signed-in')

  const revived = await startFakeCloud()
  cleanups.push(() => revived.close())
  await f.ctx.credentials.modifyRecord(MINDECK_ACCOUNT_KEY, async (record) => {
    if (record?.kind !== 'grant') throw new Error('Expected the stored grant')
    return { kind: 'grant', payload: { ...record.payload as object, cloudUrl: revived.url } }
  })
  expect(revived.tokens.has(token)).toBe(false)
  await f.live.replace({ cloudUrl: revived.url, requestTimeoutMs: 5003 })
  await vi.waitFor(async () => { expect(await f.state()).toMatchObject({ status: 'signed-out', notice: 'session-expired' }) })
})
