/** Device sign-in, the stored session, and its end against a loopback Mindeck Cloud. */
import { hostname } from 'node:os'
import { Context } from '@deepseek-ai/cordis'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { afterEach, expect, it, vi } from 'vitest'
import { MemoryCredentials } from '../../../credentials/credentials/tests/memory.ts'
import { liveConfig } from '../../../settings/settings/tests/live-config.ts'
import MindeckAccount, { feedbackOf, MINDECK_ACCOUNT_KEY, type MindeckAccountView } from '../src/index.ts'
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
  const nested = await startFakeCloud({ basePath: '/mindeck' })
  cleanups.push(() => nested.close())
  await expect(f.account().setCloudUrl(`${new URL(nested.url).origin}/elsewhere`, signal))
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

it('resolves a pasted page link, such as an invitation, to the Mindeck Cloud it belongs to', async () => {
  const f = await fixture({ cloudUrl: '' })
  const signal = new AbortController().signal
  expect((await f.account().setCloudUrl(`${f.cloud.url}/invite/abc123`, signal)).cloudUrl).toBe(f.cloud.url)
  expect(f.cloud.requests.filter(request => request.endsWith('/api/desktop/bootstrap'))).toEqual(['GET /api/desktop/bootstrap'])

  const nested = await startFakeCloud({ basePath: '/mindeck' })
  cleanups.push(() => nested.close())
  expect((await f.account().setCloudUrl(`${nested.url}/invite/abc123`, signal)).cloudUrl).toBe(nested.url)
  // The origin answers first and is not a Cloud; the first path prefix is.
  expect(nested.requests).toEqual(['GET /outside-base-path', 'GET /api/desktop/bootstrap'])
})

it('shows the welcome page until the member starts, signs in, or this device already has a session', async () => {
  const f = await fixture()
  expect((await f.state()).welcomed).toBe(false)
  expect((await f.account().finishWelcome()).welcomed).toBe(true)
  expect(f.updates).toEqual([{ ns: 'MindeckAccount', patch: { welcomed: true } }])
  await f.account().finishWelcome()
  expect(f.updates).toHaveLength(1)

  const fresh = await fixture()
  await signIn(fresh)
  await vi.waitFor(async () => { expect((await fresh.state()).welcomed).toBe(true) })
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
  expect(f.cloud.deviceRequests).toEqual([{ deviceCode: 'device-code-1', name: hostname(), platform: process.platform, appVersion: '1.2.3' }])
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

it('signs in without device details when Mindeck Cloud cannot store them', async () => {
  const f = await fixture()
  f.cloud.deviceRequestStatus = 404
  await signIn(f)
  expect(f.cloud.requests).toContain('PUT /api/desktop/device-request')
  expect(f.cloud.deviceRequests).toEqual([])
})

it('keeps waiting through a lost connection while polling and reports that it is reconnecting', async () => {
  const f = await fixture()
  f.cloud.droppedPolls = Number.POSITIVE_INFINITY
  f.cloud.pendingPolls = Number.POSITIVE_INFINITY
  await f.account().startSignIn('1.2.3')
  await vi.waitFor(async () => { expect((await f.state()).attempt).toMatchObject({ phase: 'waiting', retrying: true }) })
  f.cloud.droppedPolls = 0
  await vi.waitFor(async () => { expect((await f.state()).attempt).toMatchObject({ phase: 'waiting', retrying: false }) })
  f.cloud.pendingPolls = 0
  await signIn(f)
  expect((await f.state()).attempt).not.toHaveProperty('retrying')
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

it('reads the quota after sign-in and on request, and forgets it with the session', async () => {
  const f = await fixture()
  await signIn(f)
  await vi.waitFor(async () => {
    expect((await f.state()).quota).toEqual({
      user: { used: 12.5, limit: 50 }, department: { used: 30, limit: null }, companyBudgetPercent: null, resetDate: '2026-12-01',
    })
  })
  f.cloud.quota = { resetDate: '2026-12-01', user: { limit: 50, used: 40 }, department: null, companyBudget: { usedPercent: 101.5 } }
  expect((await f.account().refreshQuota(new AbortController().signal)).quota)
    .toEqual({ user: { used: 40, limit: 50 }, department: null, companyBudgetPercent: 101.5, resetDate: '2026-12-01' })
  f.cloud.quota = { broken: true }
  expect((await f.account().refreshQuota(new AbortController().signal)).quota?.user.used).toBe(40)
  await f.account().signOut()
  expect((await f.state()).quota).toBeNull()

  await signIn(f)
  f.cloud.quota = 'sign-in-required'
  const ended = await f.account().refreshQuota(new AbortController().signal)
  expect(ended).toMatchObject({ status: 'signed-out', notice: 'session-expired', quota: null })
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

it('keeps the company policy, contact, and endpoints of a stored session across a restart', async () => {
  const f = await fixture()
  await signIn(f)
  await f.cloud.close()
  await f.live.replace({ cloudUrl: f.cloud.url, requestTimeoutMs: 5001 })
  expect(await f.state()).toMatchObject({ status: 'signed-in', adminContact: '企业微信找周敏', personalDeepSeek: true })
  const session = await f.account().session()
  expect(session?.bootstrap.endpoints).toMatchObject({
    webSearch: `${f.cloud.url}/api/desktop/web-search`, employees: `${f.cloud.url}/api/desktop/employees`,
  })
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

it('sends written feedback, forwards answers rated down and taken back, and explains a refusal', async () => {
  const f = await fixture()
  const signal = new AbortController().signal
  await expect(f.account().sendFeedback('图表颜色看不清', signal)).rejects.toMatchObject({ code: 'mindeck-account/signed-out' })
  await signIn(f)
  await expect(f.account().sendFeedback('   ', signal)).rejects.toMatchObject({ code: 'mindeck-account/invalid-feedback' })
  await expect(f.account().sendFeedback('x'.repeat(2001), signal)).rejects.toMatchObject({ code: 'mindeck-account/invalid-feedback' })
  await f.account().sendFeedback('  图表颜色看不清  ', signal)
  expect(f.cloud.feedback).toEqual([{ kind: 'report', text: '图表颜色看不清' }])

  const put = (rating: 'positive' | 'negative', extra: Record<string, unknown> = {}) => ({
    seq: 9, time: 1, type: 'feedback/message-put',
    data: { sessionId: 's1', item: { messageId: 'm1', rating, version: 'v', createdAt: 1, updatedAt: 1, ...extra } },
  })
  f.ctx.emit('session/event', {} as never, put('negative', { category: 'task-result', note: '漏了风险' }) as never)
  f.ctx.emit('session/event', {} as never, { seq: 10, time: 2, type: 'feedback/message-delete', data: { sessionId: 's1', messageId: 'm1' } } as never)
  await vi.waitFor(() => { expect(f.cloud.feedback).toHaveLength(3) })
  expect(f.cloud.feedback.slice(1)).toEqual([
    { kind: 'answer', ref: 's1/m1', category: 'task-result', text: '漏了风险' },
    { kind: 'answer', ref: 's1/m1', withdrawn: true },
  ])
  await f.ctx.parallel('feedback/committed', { events: [put('negative')] } as never)
  await vi.waitFor(() => { expect(f.cloud.feedback.at(-1)).toEqual({ kind: 'answer', ref: 's1/m1' }) })

  f.cloud.feedbackStatus = 400
  await expect(f.account().sendFeedback('再试一次', signal)).rejects.toMatchObject({ code: 'mindeck-account/unreachable' })
  f.cloud.tokens.clear()
  await expect(f.account().sendFeedback('再试一次', signal)).rejects.toMatchObject({ code: 'mindeck-account/signed-out' })
  expect((await f.state()).status).toBe('signed-out')
})

it('sends down-rated answers and /feedback remarks, and keeps up-ratings on this computer apart from taking back', () => {
  const put = (rating: 'positive' | 'negative', extra: Record<string, unknown> = {}) => ({
    seq: 1, time: 1, type: 'feedback/message-put',
    data: { sessionId: 's1', item: { messageId: 'm1', rating, version: 'v', createdAt: 1, updatedAt: 1, ...extra } },
  }) as never
  expect(feedbackOf(put('negative', { note: '太长' }))).toEqual({ kind: 'answer', ref: 's1/m1', text: '太长' })
  expect(feedbackOf(put('positive', { note: '很好' }))).toEqual({ kind: 'answer', ref: 's1/m1', withdrawn: true })
  expect(feedbackOf({ seq: 2, time: 2, type: 'feedback/record', data: { text: '希望支持语音', category: 'other' } } as never))
    .toEqual({ kind: 'report', text: '希望支持语音', category: 'other' })
  expect(feedbackOf({ seq: 2, time: 2, type: 'feedback/record', data: {} } as never)).toBeUndefined()
  expect(feedbackOf({ seq: 3, time: 3, type: 'user/message', data: {} } as never)).toBeUndefined()
})
