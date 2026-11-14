/** Device sign-in, the stored session, and its end against a loopback Mindeck Cloud. */
import { hostname } from 'node:os'
import { Context } from '@deepseek-ai/cordis'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { afterEach, expect, it, vi } from 'vitest'
import { MemoryCredentials } from '../../../credentials/credentials/tests/memory.ts'
import { liveConfig } from '../../../settings/settings/tests/live-config.ts'
import MindeckAccount, { answerContext, feedbackOf, MINDECK_ACCOUNT_KEY, type MindeckAccountView } from '../src/index.ts'
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
      user: { used: 12.5, limit: 50 }, granted: 0, department: { used: 30, limit: null }, companyBudgetPercent: null,
      resetDate: '2026-12-01', request: null,
    })
  })
  f.cloud.quota = { resetDate: '2026-12-01', user: { limit: 50, used: 40 }, department: null, companyBudget: { usedPercent: 101.5 } }
  expect((await f.account().refreshQuota(new AbortController().signal)).quota).toEqual({
    user: { used: 40, limit: 50 }, granted: 0, department: null, companyBudgetPercent: 101.5, resetDate: '2026-12-01', request: null,
  })
  f.cloud.quota = { broken: true }
  expect((await f.account().refreshQuota(new AbortController().signal)).quota?.user.used).toBe(40)
  await f.account().signOut()
  expect((await f.state()).quota).toBeNull()

  await signIn(f)
  f.cloud.quota = 'sign-in-required'
  const ended = await f.account().refreshQuota(new AbortController().signal)
  expect(ended).toMatchObject({ status: 'signed-out', notice: 'session-expired', quota: null })
})

const pendingRequest = {
  id: 'qr-1', status: 'pending', month: '2026-11-01', reason: '月底赶项目', createdAt: '2026-11-14T02:32:00.000Z',
  decidedAt: null, decidedByName: null, decision: null, amount: null, decisionNote: null,
}
const usedUp = (request: unknown) => ({
  monthStartDate: '2026-11-01', resetDate: '2026-12-01', timezone: 'Asia/Shanghai',
  user: { limit: 80, used: 80, granted: 30, source: 'default' }, department: null, companyBudget: null, request,
})

it('asks for more quota, withdraws the request, and reads the quota again after Mindeck Cloud answers or refuses', async () => {
  const f = await fixture()
  const signal = new AbortController().signal
  await expect(f.account().requestQuota('多做几次评审', signal)).rejects.toMatchObject({ code: 'mindeck-account/signed-out' })
  await signIn(f)
  f.cloud.quota = usedUp({ request: null, canRequest: true, blocker: null })
  expect((await f.account().refreshQuota(signal)).quota).toMatchObject({
    user: { used: 80, limit: 80 }, granted: 30, request: { request: null, canRequest: true, blocker: null },
  })

  f.cloud.quotaRequestAnswer = { status: 201, body: { request: pendingRequest } }
  f.cloud.quota = usedUp({ request: pendingRequest, canRequest: false, blocker: 'pending' })
  const asked = await f.account().requestQuota('  多做几次评审  ', signal)
  expect(f.cloud.quotaRequests).toEqual([{ reason: '多做几次评审' }])
  expect(asked.quota?.request).toEqual({ request: pendingRequest, canRequest: false, blocker: 'pending' })
  await f.account().requestQuota('   ', signal)
  expect(f.cloud.quotaRequests.at(-1)).toEqual({ reason: null })

  // A request made on another device meanwhile: the refusal explains it, and the quota shows that request.
  f.cloud.quotaRequestAnswer = { status: 409, body: { error: { code: 'QUOTA_REQUEST_PENDING', message: '你已经有一条等待处理的提额申请，处理结果会通知你。' } } }
  await expect(f.account().requestQuota('', signal)).rejects.toMatchObject({
    code: 'mindeck-account/quota-request-refused',
    details: { code: 'QUOTA_REQUEST_PENDING', message: '你已经有一条等待处理的提额申请，处理结果会通知你。' },
  })

  const cancelled = { ...pendingRequest, status: 'cancelled', decidedAt: '2026-11-14T03:00:00.000Z' }
  f.cloud.withdrawAnswer = { status: 200, body: { request: cancelled } }
  f.cloud.quota = usedUp({ request: cancelled, canRequest: true, blocker: null })
  expect((await f.account().withdrawQuotaRequest(signal)).quota?.request).toMatchObject({ canRequest: true, request: { status: 'cancelled' } })
  f.cloud.withdrawAnswer = { status: 409, body: { error: { code: 'QUOTA_REQUEST_DECIDED', message: '这条申请已经批准了，不能再撤回。' } } }
  await expect(f.account().withdrawQuotaRequest(signal)).rejects.toMatchObject({
    code: 'mindeck-account/quota-request-refused', details: { code: 'QUOTA_REQUEST_DECIDED' },
  })

  f.cloud.quotaRequestAnswer = { status: 500, body: { error: { code: 'INTERNAL', message: '服务器出错了。' } } }
  await expect(f.account().requestQuota('', signal)).rejects.toMatchObject({ code: 'mindeck-account/unreachable' })
  f.cloud.signOutReason = 'SIGNED_OUT_BY_ADMIN'
  f.cloud.tokens.clear()
  await expect(f.account().withdrawQuotaRequest(signal)).rejects.toMatchObject({ code: 'mindeck-account/signed-out' })
  expect(await f.state()).toMatchObject({ status: 'signed-out', notice: 'signed-out-by-admin', adminContact: '企业微信找周敏' })
})

it('says who signed this computer out when Mindeck Cloud names it, and that the sign-in expired otherwise', async () => {
  const f = await fixture()
  f.cloud.syncEnabled = true
  await signIn(f)
  f.cloud.signOutReason = 'SIGNED_OUT_BY_MEMBER'
  f.cloud.tokens.clear()
  await f.account().syncNow()
  expect(await f.state()).toMatchObject({ status: 'signed-out', notice: 'signed-out-by-member', adminContact: '企业微信找周敏' })

  // A reason this desktop does not know reads as an expired sign-in.
  await signIn(f)
  f.cloud.signOutReason = 'SIGNED_OUT_BY_ROBOT'
  f.cloud.tokens.clear()
  await f.account().syncNow()
  expect(await f.state()).toMatchObject({ status: 'signed-out', notice: 'session-expired' })

  // Another plugin reports the refusal without its body; the account asks Mindeck Cloud why.
  const token = await signIn(f)
  expect((await f.state()).notice).toBeNull()
  f.cloud.signOutReason = 'SIGNED_OUT_BY_ADMIN'
  f.cloud.tokens.clear()
  await f.account().rejectToken(token)
  expect((await f.state()).notice).toBe('session-expired')
  await vi.waitFor(async () => { expect((await f.state()).notice).toBe('signed-out-by-admin') })
  expect((await f.state()).adminContact).toBe('企业微信找周敏')
  f.cloud.pendingPolls = Number.POSITIVE_INFINITY
  expect(await f.account().startSignIn('1.2.3')).toMatchObject({ notice: null, adminContact: null })
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
  f.cloud.files = { url: `${f.cloud.url}/files`, token: `${f.cloud.url}/api/desktop/files/token`, fullText: true }
  await signIn(f)
  await f.cloud.close()
  await f.live.replace({ cloudUrl: f.cloud.url, requestTimeoutMs: 5001 })
  expect(await f.state()).toMatchObject({ status: 'signed-in', adminContact: '企业微信找周敏', personalDeepSeek: true })
  const session = await f.account().session()
  expect(session?.bootstrap.endpoints).toMatchObject({
    webSearch: `${f.cloud.url}/api/desktop/web-search`, employees: `${f.cloud.url}/api/desktop/employees`,
    files: { url: `${f.cloud.url}/files`, fullText: true },
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
  const live = { deriveMessages: () => [] }
  f.ctx.emit('session/event', live as never, put('negative', { category: 'task-result', note: '漏了风险' }) as never)
  f.ctx.emit('session/event', live as never, { seq: 10, time: 2, type: 'feedback/message-delete', data: { sessionId: 's1', messageId: 'm1' } } as never)
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

const text = (value: string) => ({ type: 'text', text: value })
const round = [
  { id: 'u0', role: 'user', source: { kind: 'user' }, content: [text('上一个问题')] },
  { id: 'a0', role: 'assistant', source: { kind: 'model', provider: 'mindeck-anthropic', model: 'deepseek-chat' }, content: [text('上一个回答')] },
  { id: 'u1', role: 'user', source: { kind: 'user' }, content: [text('这份合同有风险吗？'), { type: 'image' }] },
  { id: 'i1', role: 'user', source: { kind: 'skill-invocation', name: 'contract-review', form: 'instructions' }, content: [text('<skill_content>…')] },
  { id: 'a1', role: 'assistant', source: { kind: 'model', provider: 'mindeck-anthropic', model: 'deepseek-chat' }, content: [
    { type: 'reasoning', text: '先读合同' }, text('我先看一下条款。'),
    { type: 'tool-call', id: 'c1', name: 'skill', arguments: '{"name":"risk-notes"}' },
    { type: 'tool-call', id: 'c2', name: 'skill', arguments: '{"name":' },
    { type: 'tool-call', id: 'c3', name: 'read', arguments: '{"path":"a.docx"}' },
  ] },
  { id: 't1', role: 'tool', source: { kind: 'tool', callId: 'c1' }, toolCallId: 'c1', content: [text('<skill_content>…')] },
  { id: 'a2', role: 'assistant', source: { kind: 'model', provider: 'mindeck-openai', model: 'doubao-seed-2-1-pro-260915' }, content: [
    { type: 'tool-call', id: 'c4', name: 'skill', arguments: '{"name":"contract-review"}' }, text('有三处风险：'), text('付款期限过长。'),
  ] },
]

it('describes a rated answer\'s round: its model, the skills since the question, and the question and answer within Mindeck Cloud\'s limits', () => {
  expect(answerContext(round as never, 'a2')).toEqual({
    modelName: 'doubao-seed-2-1-pro-260915',
    skills: ['contract-review', 'risk-notes'],
    excerpt: { question: '这份合同有风险吗？', answer: '有三处风险：\n\n付款期限过长。' },
  })
  expect(answerContext(round as never, 'a0')).toEqual({ modelName: 'deepseek-chat', skills: [], excerpt: { question: '上一个问题', answer: '上一个回答' } })
  // A compacted answer, or a message that is not an answer, has no context.
  expect(answerContext(round as never, 'gone')).toBeUndefined()
  expect(answerContext(round as never, 'u1')).toBeUndefined()
  const long = [
    { id: 'u', role: 'user', source: { kind: 'user' }, content: [text('问'.repeat(5000))] },
    { id: 'a', role: 'assistant', source: { kind: 'model', provider: 'p', model: 'm'.repeat(300) }, content: [
      ...Array.from({ length: 60 }, (_, index) => ({ type: 'tool-call', id: `c${index}`, name: 'skill', arguments: JSON.stringify({ name: `s${index}` }) })),
      { type: 'tool-call', id: 'x', name: 'skill', arguments: JSON.stringify({ name: 'n'.repeat(201) }) },
      text('答'.repeat(4000)),
    ] },
  ]
  const clipped = answerContext(long as never, 'a')
  expect(clipped?.modelName).toHaveLength(200)
  expect(clipped?.skills).toHaveLength(50)
  expect(clipped?.excerpt.question).toBe(`${'问'.repeat(3999)}…`)
  expect(clipped?.excerpt.answer).toBe('答'.repeat(4000))
  // Without a typed prompt, the question is empty.
  expect(answerContext([round[1]] as never, 'a0')?.excerpt.question).toBe('')
})

it('sends a rating down with its round\'s model, digital employee, and skills, and attaches the question and answer only when the member chose to', async () => {
  const f = await fixture()
  await signIn(f)
  f.ctx.on('mindeck-account/employee', sessionId => sessionId === 's1' ? 'employee-legal' : undefined)
  const live = { deriveMessages: () => round }
  const put = (messageId: string) => ({
    seq: 9, time: 1, type: 'feedback/message-put',
    data: { sessionId: 's1', item: { messageId, rating: 'negative', category: 'task-result', version: 'v', createdAt: 1, updatedAt: 1 } },
  })
  const context = { modelName: 'doubao-seed-2-1-pro-260915', employeeId: 'employee-legal', skills: ['contract-review', 'risk-notes'] }
  f.ctx.emit('session/event', live as never, put('a2') as never)
  await vi.waitFor(() => { expect(f.cloud.feedback).toHaveLength(1) })
  expect(f.cloud.feedback[0]).toEqual({ kind: 'answer', ref: 's1/a2', category: 'task-result', ...context })

  await f.account().prepareFeedback('s1', 'a2', true)
  f.ctx.emit('session/event', live as never, put('a2') as never)
  await vi.waitFor(() => { expect(f.cloud.feedback).toHaveLength(2) })
  expect(f.cloud.feedback[1]).toEqual({
    kind: 'answer', ref: 's1/a2', category: 'task-result', ...context,
    excerpt: { question: '这份合同有风险吗？', answer: '有三处风险：\n\n付款期限过长。' },
  })
  // The choice holds for one rating; the next one leaves the excerpt out, which removes it on Mindeck Cloud.
  f.ctx.emit('session/event', live as never, put('a2') as never)
  await vi.waitFor(() => { expect(f.cloud.feedback).toHaveLength(3) })
  expect(f.cloud.feedback[2]).not.toHaveProperty('excerpt')
  await f.account().prepareFeedback('s1', 'a2', true)
  await f.account().prepareFeedback('s1', 'a2', false)
  f.ctx.emit('session/event', live as never, put('a2') as never)
  await vi.waitFor(() => { expect(f.cloud.feedback).toHaveLength(4) })
  expect(f.cloud.feedback[3]).not.toHaveProperty('excerpt')

  // A closed conversation's log gives the same context; a compacted answer sends the rating alone.
  const logged = round.map((message, index) => message.role === 'assistant'
    ? { seq: index, time: index, type: 'assistant/message', data: { turn: 1, step: index, message, stream: [] } }
    : { seq: index, time: index, type: message.role === 'user' ? 'user/message' : 'tool/result', data: message.role === 'user' ? message : { message } })
  await f.account().prepareFeedback('s1', 'a2', true)
  await f.ctx.parallel('feedback/committed', { events: [...logged, put('a2')] } as never)
  await vi.waitFor(() => { expect(f.cloud.feedback).toHaveLength(5) })
  expect(f.cloud.feedback[4]).toMatchObject({ ...context, excerpt: { question: '这份合同有风险吗？' } })
  f.ctx.emit('session/event', { deriveMessages: () => [] } as never, put('a2') as never)
  await vi.waitFor(() => { expect(f.cloud.feedback).toHaveLength(6) })
  expect(f.cloud.feedback[5]).toEqual({ kind: 'answer', ref: 's1/a2', category: 'task-result', employeeId: 'employee-legal' })
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

/** A signed-in fixture against a Mindeck Cloud with the sync endpoint, recording each sync's topics. */
async function syncFixture() {
  const f = await fixture()
  f.cloud.syncEnabled = true
  const revised: string[][] = []
  f.ctx.on('mindeck-account/revised', (topics) => { revised.push([...topics].sort()) })
  // Every answer emits `synced`, after the topics it changed.
  const synced = { count: 0, afterRevised: true }
  f.ctx.on('mindeck-account/synced', () => { synced.count++; synced.afterRevised &&= revised.length > 0 })
  await signIn(f)
  // The first answer of a session changes only the member's own state; the catalogs load with the session.
  await vi.waitFor(() => { expect(revised).toEqual([['inbox', 'quota-request']]) })
  const sync = async () => {
    const polls = f.cloud.syncTags.length
    f.account().requestSync('timer')
    await vi.waitFor(() => { expect(f.cloud.syncTags.length).toBeGreaterThan(polls) })
    // Let the answer reach the topics and the view.
    await vi.waitFor(async () => { expect((await f.state()).sync?.running).toBe(false) })
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  return { ...f, revised, synced, sync }
}

it('polls the sync endpoint with the last ETag and reports only the topics that changed', async () => {
  const f = await syncFixture()
  expect(f.cloud.syncTags).toEqual([null])
  expect(f.account().syncAnswer()).toEqual({ revisions: f.cloud.sync.revisions, me: f.cloud.sync.me })
  const syncedAt: unknown = expect.any(Number)
  expect((await f.state()).sync).toMatchObject({ supported: true, running: false, problem: null, syncedAt })

  const answered = f.synced.count
  await f.sync()
  expect(f.cloud.syncTags[1]).toMatch(/^"[\w-]{32}"$/)
  expect(f.revised).toHaveLength(1)
  // An unchanged answer names no topic but still tells that Mindeck Cloud answered.
  expect(f.synced).toEqual({ count: answered + 1, afterRevised: true })

  f.cloud.sync.revisions.models = 2
  f.cloud.sync.revisions.employees = 5
  await f.sync()
  expect(f.revised.at(-1)).toEqual(['employees', 'models'])

  // A topic this desktop does not know changes the answer but no topic.
  f.cloud.sync.revisions.future = 3
  await f.sync()
  expect(f.revised).toHaveLength(2)

  f.cloud.sync.me = { ...f.cloud.sync.me, inbox: { unread: 2, latestAt: '2026-11-13T08:20:00.000Z' } }
  await f.sync()
  expect(f.revised.at(-1)).toEqual(['inbox'])
  expect(f.account().syncAnswer()?.me.inbox).toEqual({ unread: 2, latestAt: '2026-11-13T08:20:00.000Z' })
})

it('reads the bootstrap again when policies or the recommended version change, so a turned-off personal DeepSeek applies at once', async () => {
  const f = await syncFixture()
  const changed = vi.fn()
  f.ctx.on('mindeck-account/changed', changed)
  expect(await f.state()).toMatchObject({ personalDeepSeek: true, release: null })

  f.cloud.personalDeepSeek = false
  f.cloud.sync.revisions.policies = 2
  await f.sync()
  expect((await f.state()).personalDeepSeek).toBe(false)
  expect(changed).toHaveBeenCalled()
  expect(f.revised.at(-1)).toEqual(['policies'])

  f.cloud.client = { recommendedVersion: '1.8.0', notes: '修复了资源库搜索。', downloads: { windows: 'https://dl.example.com/m.exe', macos: null } }
  f.cloud.sync.revisions.client = 2
  await f.sync()
  expect((await f.state()).release).toEqual({
    recommendedVersion: '1.8.0', notes: '修复了资源库搜索。', downloadUrl: process.platform === 'win32' ? 'https://dl.example.com/m.exe' : null,
  })
})

it('reports a changed department or role to every catalog and reads a decided quota request\'s quota', async () => {
  const f = await syncFixture()
  f.cloud.sync.me = { ...f.cloud.sync.me, accessRevision: 2 }
  await f.sync()
  expect(f.revised.at(-1)).toEqual(['access', 'employees', 'models', 'policies', 'skills'])

  const quotaReads = () => f.cloud.requests.filter(request => request === 'GET /api/desktop/quota').length
  const before = quotaReads()
  f.cloud.sync.me = { ...f.cloud.sync.me, quotaRequest: { id: 'q1', status: 'approved', month: '2026-11-01', decidedAt: '2026-11-13T08:19:58.000Z' } }
  await f.sync()
  expect(f.revised.at(-1)).toEqual(['quota-request'])
  expect(quotaReads()).toBe(before + 1)
})

it('syncs every topic when the member asks and shows the sync running', async () => {
  const f = await syncFixture()
  const frames: Array<MindeckAccountView['sync']> = []
  const watching = new AbortController()
  const watch = (async () => { for await (const frame of f.account().watch(watching.signal)) frames.push(frame.sync) })()
  cleanups.push(async () => { watching.abort(); await watch })

  // A scheduled sync already running is followed by the member's, which refreshes everything.
  const polls = f.cloud.syncTags.length
  f.account().requestSync('timer')
  const view = await f.account().syncNow()
  expect(f.cloud.syncTags).toHaveLength(polls + 2)
  expect(view.sync).toMatchObject({ running: false, problem: null })
  expect(f.revised.at(-1)).toEqual(['access', 'announcements', 'client', 'employees', 'inbox', 'models', 'policies', 'quota-request', 'skills', 'webSearch'])
  await vi.waitFor(() => { expect(frames.some(frame => frame?.running === true)).toBe(true) })

  // Prompts during a run are answered by it.
  const before = f.cloud.syncTags.length
  f.account().requestSync('timer')
  await f.account().syncSoon()
  await new Promise(resolve => setTimeout(resolve, 50))
  expect(f.cloud.syncTags).toHaveLength(before + 1)
})

it('stays quiet while Mindeck Cloud is unreachable or failing and recovers on the next sync', async () => {
  const f = await syncFixture()
  const answered = f.synced.count
  f.cloud.syncStatus = 0
  await f.sync()
  expect((await f.state())).toMatchObject({ status: 'signed-in', sync: { problem: 'unreachable' } })

  f.cloud.syncStatus = 500
  await f.sync()
  expect((await f.state()).sync?.problem).toBe('failed')
  expect(f.synced.count).toBe(answered)

  // A focus or network prompt syncs at once while the last sync failed.
  f.cloud.syncStatus = 200
  f.cloud.sync.revisions.skills = 4
  const polls = f.cloud.syncTags.length
  await f.account().syncSoon()
  await vi.waitFor(async () => { expect((await f.state()).sync?.problem).toBeNull() })
  expect(f.cloud.syncTags).toHaveLength(polls + 1)
  expect(f.revised.at(-1)).toEqual(['skills'])

  // Within the cool-down after a success, a prompt does not sync again.
  await f.account().syncSoon()
  await new Promise(resolve => setTimeout(resolve, 50))
  expect(f.cloud.syncTags).toHaveLength(polls + 1)
})

it('ends the session when the sync endpoint rejects the token and starts over for the next sign-in', async () => {
  const f = await syncFixture()
  f.cloud.tokens.clear()
  f.account().requestSync('timer')
  await vi.waitFor(async () => { expect(await f.state()).toMatchObject({ status: 'signed-out', notice: 'session-expired', sync: null }) })
  expect(f.account().syncAnswer()).toBeUndefined()
  // A scheduled sync while signed out asks nothing.
  const polls = f.cloud.syncTags.length
  f.account().requestSync('timer')
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(f.cloud.syncTags).toHaveLength(polls)

  await signIn(f)
  await vi.waitFor(() => { expect(f.revised.at(-1)).toEqual(['inbox', 'quota-request']) })
  expect(f.cloud.syncTags.at(-1)).toBeNull()
})

it('reads the bootstrap again instead on a Mindeck Cloud without the sync endpoint', async () => {
  const f = await fixture()
  const revised: string[][] = []
  f.ctx.on('mindeck-account/revised', (topics) => { revised.push([...topics].sort()) })
  await signIn(f)
  f.account().requestSync('timer')
  await new Promise(resolve => setTimeout(resolve, 50))
  expect(f.cloud.requests).not.toContain('GET /api/desktop/sync')
  expect(revised).toEqual([])
  expect((await f.state()).sync).toMatchObject({ supported: false, problem: null })

  f.cloud.userName = '林晓（研发）'
  const view = await f.account().syncNow()
  expect(view.user?.name).toBe('林晓（研发）')
  const syncedAt: unknown = expect.any(Number)
  expect(view.sync).toMatchObject({ supported: false, syncedAt })
  expect(revised).toHaveLength(1)
  expect(revised[0]).toHaveLength(10)

  await f.cloud.close()
  expect((await f.account().syncNow()).sync).toMatchObject({ problem: 'unreachable' })
})
