// @vitest-environment jsdom
/** The account UI follows the Host stream, maps Remote failures, syncs on focus and reconnection, and leaves with the plugin. */
import { Context, Service } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { StaticRemoteAccess } from '@deepseek-ai/dsh-client-test-runtime'
import { RemoteError, type RemoteResult, type TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { MindeckAccountView } from '../src/types.ts'
import type { AccountView } from '@deepseek-ai/dsh-deepseek-account/types'
import type { MindeckAccountInjected } from '../src/client/operations.ts'
import { mountAccount } from '../src/client/mount.ts'
import { MindeckOnboarding } from '../src/client/MindeckOnboarding.tsx'

const contribution: TypertRemoteContribution = { package: '@deepseek-ai/dsh-mindeck-account', descriptors: [] }
const signedOut: MindeckAccountView = {
  cloudUrl: 'https://cloud.example.com', welcomed: true, status: 'signed-out', user: null, companyName: null, notice: null, attempt: null, quota: null, adminContact: null, personalDeepSeek: false, sync: null, release: null,
}

/** Host state frames the fake `watch` stream delivers in order. */
class Frames {
  private readonly queue: MindeckAccountView[] = []
  private wake: (() => void) | undefined
  push(view: MindeckAccountView): void { this.queue.push(view); this.wake?.() }
  async *stream(signal: AbortSignal): AsyncIterable<MindeckAccountView> {
    while (!signal.aborted) {
      const next = this.queue.shift()
      if (next !== undefined) { yield next; continue }
      await new Promise<void>((resolve) => {
        this.wake = resolve
        signal.addEventListener('abort', () => { resolve() }, { once: true })
      })
    }
  }
}

async function fixture() {
  const ctx = new Context()
  const frames = new Frames()
  const unmount = vi.fn(async () => {})
  class TestRemote extends Service {
    constructor() { super(ctx, 'remote') }
    async $mount(value: TypertRemoteContribution) { expect(value).toBe(contribution); return unmount }
    $stream<T>(spec: { open: (signal: AbortSignal) => AsyncIterable<T> }) {
      const lifetime = new AbortController()
      const source = spec.open(lifetime.signal)
      return {
        async *[Symbol.asyncIterator]() { for await (const value of source) yield { value, accept: () => {} } },
        dispose: async () => { lifetime.abort() },
      }
    }
  }
  new TestRemote()
  const ok = <T>(value: T): RemoteResult<T> => ({ ok: true, value })
  const remote = {
    watch: (signal: AbortSignal) => frames.stream(signal),
    setCloudUrl: vi.fn(async (_input: string): Promise<RemoteResult<MindeckAccountView>> => ok(signedOut)),
    startSignIn: vi.fn(async (_version: string): Promise<RemoteResult<MindeckAccountView>> => ok(signedOut)),
    cancelSignIn: vi.fn(async (): Promise<RemoteResult<MindeckAccountView>> => ok(signedOut)),
    signOut: vi.fn(async (): Promise<RemoteResult<MindeckAccountView>> => ok(signedOut)),
    refreshQuota: vi.fn(async (): Promise<RemoteResult<MindeckAccountView>> => ok(signedOut)),
    finishWelcome: vi.fn(async (): Promise<RemoteResult<MindeckAccountView>> => ok(signedOut)),
    syncNow: vi.fn(async (): Promise<RemoteResult<MindeckAccountView>> => ok(signedOut)),
    syncSoon: vi.fn(async (): Promise<RemoteResult<undefined>> => ok(undefined)),
    prepareFeedback: vi.fn(async (_session: string, _message: string, _attach: boolean): Promise<RemoteResult<undefined>> => ok(undefined)),
  }
  ctx.provide('remote.mindeckAccount', remote as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  new StaticRemoteAccess(ctx)
  await ctx.plugin(SlotRegistry)
  ctx.slots.register({ name: 'root', children: {
    'shell.overlay': { kind: 'list', scope: 'root' },
    'settings.launcher': { kind: 'single', scope: 'root' },
    'settings.section': { kind: 'list', scope: 'root' },
    'settings.section.icon': { kind: 'list', scope: 'root', inline: true },
    'shell.quota-notice': { kind: 'chain', scope: 'root' },
    'conversation.input.dock': { kind: 'list', scope: 'root' },
    'feedback.dialog.options': { kind: 'list', scope: 'session' },
  } } as never, () => null)
  return { ctx, frames, remote, unmount }
}

function operations(entry: { inject?: unknown } | undefined): MindeckAccountInjected {
  if (typeof entry?.inject !== 'function') throw new Error('Expected an injected account face')
  return (entry.inject as () => MindeckAccountInjected)()
}

it('registers the sign-in stage, launcher, section, its icon, the quota notice and reminder, then withdraws them before the Remote', async () => {
  const f = await fixture()
  try {
    const dispose = await mountAccount(f.ctx, contribution)
    expect(f.ctx.slots.entries('shell.overlay').map(entry => entry.component)).toEqual([MindeckOnboarding])
    expect(f.ctx.slots.entries('settings.launcher')).toHaveLength(1)
    // The DeepSeek account launcher registers at the default priority beside it; the lower priority renders.
    const deepseekLauncher = f.ctx.slots.register({ name: 'settings.launcher' } as never, () => null)
    expect(f.ctx.slots.entries('settings.launcher').map(entry => entry.options.priority ?? 0).sort()).toEqual([-1, 0])
    deepseekLauncher()
    // Before the base DeepSeek account page (order -10), which takes the DeepSeek name beside it.
    expect(f.ctx.slots.entries('settings.section').map(entry => entry.options)).toMatchObject([{ id: 'mindeck-account', order: -20 }])
    expect(f.ctx.locale.bind('settings.account')('nav')).toBe('DeepSeek account')
    expect(f.ctx.slots.entries('settings.section.icon').map(entry => entry.options.id)).toEqual(['mindeck-account'])
    expect(f.ctx.slots.entries('conversation.input.dock').map(entry => entry.options.id)).toEqual(['mindeck-quota'])
    const [quota] = f.ctx.slots.entries('shell.quota-notice')
    const notice = { message: 'm', dismiss: () => {}, keepOpen: () => () => {} }
    expect(quota?.select?.({ ...notice, code: 'QUOTA' } as never)).toMatchObject({ code: 'QUOTA' })
    expect(quota?.select?.({ ...notice, code: 'ACCOUNT_QUOTA' } as never)).toBeNull()
    const face = operations(f.ctx.slots.entries('settings.section')[0])
    expect(face.hooks.account.getSnapshot()).toEqual({ view: undefined, failed: false })
    f.frames.push(signedOut)
    await vi.waitFor(() => { expect(face.hooks.account.getSnapshot().view).toEqual(signedOut) })
    face.refreshQuota()
    expect(f.remote.refreshQuota).toHaveBeenCalledOnce()
    face.finishWelcome()
    expect(f.remote.finishWelcome).toHaveBeenCalledOnce()
    face.dismissReminder('2026-12-01:user:warning')
    face.dismissReminder('2026-12-01:user:warning')
    expect(face.hooks.reminders.getSnapshot()).toEqual({ dismissed: ['2026-12-01:user:warning'] })

    await dispose()
    expect(f.ctx.slots.entries('shell.overlay')).toHaveLength(0)
    expect(f.ctx.slots.entries('settings.launcher')).toHaveLength(0)
    expect(f.ctx.slots.entries('settings.section')).toHaveLength(0)
    expect(f.ctx.slots.entries('settings.section.icon')).toHaveLength(0)
    expect(f.ctx.slots.entries('shell.quota-notice')).toHaveLength(0)
    expect(f.ctx.slots.entries('conversation.input.dock')).toHaveLength(0)
    expect(face.hooks.account.getSnapshot()).toEqual({ view: undefined, failed: false })
    expect(f.ctx.locale.bind('settings.account')('nav')).toBe('nav')
    expect(f.unmount).toHaveBeenCalledOnce()
  } finally { await f.ctx.fiber.dispose() }
})

it('starts sign-in only after the address is accepted and names each refusal', async () => {
  const f = await fixture()
  try {
    await mountAccount(f.ctx, contribution)
    const face = operations(f.ctx.slots.entries('shell.overlay')[0])
    const refuse = (reason: 'format' | 'unreachable' | 'not-mindeck-cloud') => ({
      ok: false as const, error: new RemoteError('mindeck-account/invalid-cloud-url', 'refused', { reason }),
    })
    f.remote.setCloudUrl.mockResolvedValueOnce(refuse('format'))
    expect(await face.connect('ftp://x')).toEqual({ ok: false, reason: 'invalidFormat' })
    f.remote.setCloudUrl.mockResolvedValueOnce(refuse('unreachable'))
    expect(await face.connect('cloud.example.com')).toEqual({ ok: false, reason: 'unreachable' })
    f.remote.setCloudUrl.mockResolvedValueOnce(refuse('not-mindeck-cloud'))
    expect(await face.connect('example.com')).toEqual({ ok: false, reason: 'notMindeckCloud' })
    f.remote.setCloudUrl.mockResolvedValueOnce({ ok: false, error: new RemoteError('mindeck-account/signed-in', 'signed in', {}) })
    expect(await face.connect('cloud.example.com')).toEqual({ ok: false, reason: 'cloudLocked' })
    expect(f.remote.startSignIn).not.toHaveBeenCalled()

    expect(await face.connect('cloud.example.com')).toEqual({ ok: true })
    expect(f.remote.setCloudUrl).toHaveBeenLastCalledWith('cloud.example.com')
    expect(f.remote.startSignIn).toHaveBeenCalledOnce()
    f.remote.signOut.mockResolvedValueOnce({ ok: false, error: new RemoteError('mindeck-account/storage', 'store failed', {}) })
    expect(await face.signOut()).toEqual({ ok: false, reason: 'storage' })
    expect(await face.signOut()).toEqual({ ok: true })
  } finally { await f.ctx.fiber.dispose() }
})

it('signs out a personal DeepSeek account the company does not allow, and leaves an allowed one', async () => {
  const f = await fixture()
  const deepseek: Array<AccountView> = []
  let wake: (() => void) | undefined
  const account = {
    async *watch(signal: AbortSignal): AsyncIterable<AccountView> {
      while (!signal.aborted) {
        const next = deepseek.shift()
        if (next !== undefined) { yield next; continue }
        await new Promise<void>((resolve) => { wake = resolve; signal.addEventListener('abort', () => { resolve() }, { once: true }) })
      }
    },
    signOut: vi.fn(async (): Promise<RemoteResult<AccountView>> => ({ ok: true, value: stored })),
    startSignIn: vi.fn(),
    cancelSignIn: vi.fn(),
  }
  const stored: AccountView = {
    status: 'credential-stored', attempt: null,
    links: { usageUrl: 'https://platform.deepseek.com/usage', topUpUrl: 'https://platform.deepseek.com/top_up' },
  }
  const member: MindeckAccountView = {
    ...signedOut, status: 'signed-in', companyName: '星河科技',
    user: { id: 'u1', name: '林晓', email: 'lin@example.com', role: 'user', department: null },
  }
  try {
    f.ctx.provide('remote.account', account as never)
    await mountAccount(f.ctx, contribution)
    const face = operations(f.ctx.slots.entries('settings.section')[0])
    f.frames.push({ ...member, personalDeepSeek: true })
    deepseek.push(stored); wake?.()
    await vi.waitFor(() => { expect(face.hooks.personal.getSnapshot().view).toEqual(stored) })
    await vi.waitFor(() => { expect(face.hooks.account.getSnapshot().view?.personalDeepSeek).toBe(true) })
    expect(account.signOut).not.toHaveBeenCalled()

    f.frames.push({ ...member, personalDeepSeek: false })
    await vi.waitFor(() => { expect(account.signOut).toHaveBeenCalledOnce() })
  } finally { await f.ctx.fiber.dispose() }
})

it('starts a personal DeepSeek sign-in on Desktop with the transport origin', async () => {
  const f = await fixture()
  const links = { usageUrl: 'https://platform.deepseek.com/usage', topUpUrl: 'https://platform.deepseek.com/top_up' }
  const started: AccountView = {
    status: 'signed-out', links,
    attempt: { id: 'a1' as never, phase: 'waiting-browser', authorizeUrl: 'https://platform.deepseek.com/authorize' } as never,
  }
  const account = {
    async *watch(signal: AbortSignal): AsyncIterable<AccountView> {
      yield { status: 'signed-out', attempt: null, links }
      await new Promise<void>((resolve) => { signal.addEventListener('abort', () => { resolve() }, { once: true }) })
    },
    signOut: vi.fn(),
    startSignIn: vi.fn(async (): Promise<RemoteResult<AccountView>> => ({ ok: true, value: started })),
    cancelSignIn: vi.fn(),
  }
  const desktop = globalThis as typeof globalThis & { dshDesktop?: unknown; __DSH_TRANSPORT__?: { streamBaseUrl: string } }
  desktop.dshDesktop = {}
  desktop.__DSH_TRANSPORT__ = { streamBaseUrl: 'http://127.0.0.1:52131' }
  try {
    await f.ctx.plugin({ inject: ['remote', 'slots', 'locale', 'remoteAccess'], apply: async (ctx: Context) => { await mountAccount(ctx, contribution) } })
    f.ctx.provide('remote.account', account as never)
    const face = operations(f.ctx.slots.entries('settings.section')[0])
    await vi.waitFor(() => { expect(face.hooks.personal.getSnapshot().available).toBe(true) })
    await expect(face.startPersonalSignIn()).resolves.toEqual({ ok: true })
    expect(account.startSignIn).toHaveBeenCalledWith(expect.anything(), 'http://127.0.0.1:52131', 'desktop')
  } finally {
    delete desktop.dshDesktop
    delete desktop.__DSH_TRANSPORT__
    await f.ctx.fiber.dispose()
  }
})

it('provides the composer service once the conversation services exist and withdraws it with the UI', async () => {
  const f = await fixture()
  try {
    const dispose = await mountAccount(f.ctx, contribution)
    expect(f.ctx.get('mindeckComposer')).toBeUndefined()
    f.ctx.provide('sessions', { list: { getSnapshot: () => ({ byId: {} }) }, scope: () => undefined } as never)
    f.ctx.provide('workspaces', { list: { getSnapshot: () => ({ items: [] }) } } as never)
    f.ctx.provide('uiWorkspace', { startSession: vi.fn() } as never)
    expect(f.ctx.get('mindeckComposer')).toBeUndefined()
    f.ctx.provide('remote.agentPresets', { list: vi.fn() } as never)
    await vi.waitFor(() => { expect(f.ctx.get('mindeckComposer')).toBeDefined() })
    expect(f.ctx.get('mindeckComposer')?.draft('s1' as never)).toBeUndefined()
    await dispose()
    expect(f.ctx.get('mindeckComposer')).toBeUndefined()
  } finally { await f.ctx.fiber.dispose() }
})

it('syncs when the window regains focus or the network returns, on request, and stops listening with the UI', async () => {
  const f = await fixture()
  try {
    const dispose = await mountAccount(f.ctx, contribution)
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('online'))
    expect(f.remote.syncSoon).toHaveBeenCalledTimes(2)
    const face = operations(f.ctx.slots.entries('settings.section')[0])
    expect(await face.syncNow()).toEqual({ ok: true })
    f.remote.syncNow.mockResolvedValueOnce({ ok: false, error: new RemoteError('mindeck-account/storage', 'x', {}) })
    expect(await face.syncNow()).toEqual({ ok: false, reason: 'storage' })
    await dispose()
    window.dispatchEvent(new Event('focus'))
    expect(f.remote.syncSoon).toHaveBeenCalledTimes(2)
  } finally { await f.ctx.fiber.dispose() }
})

it('sends the feedback dialog\'s round choice before a rating down is recorded, and overrides the dialog hint', async () => {
  const f = await fixture()
  const hooks = new Set<(sessionId: string, target: unknown) => Promise<void>>()
  f.ctx.provide('feedbackUi', {
    openSession: () => {},
    beforeSubmit: (hook: (sessionId: string, target: unknown) => Promise<void>) => { hooks.add(hook); return () => { hooks.delete(hook) } },
  } as never)
  try {
    const dispose = await mountAccount(f.ctx, contribution)
    expect(f.ctx.locale.bind('feedback')('dialog.hint')).toBe('Describe what happened (optional)')
    await vi.waitFor(() => { expect(hooks.size).toBe(1) })
    const [entry] = f.ctx.slots.entries('feedback.dialog.options')
    expect(entry?.options.id).toBe('mindeck-account')
    const face = (entry?.inject as (sessionId: string) => { choose: (attach: boolean) => void })('s1')
    const [hook] = [...hooks]
    const negative = { kind: 'message', messageId: 'm1', rating: 'negative' }
    face.choose(true)
    await hook?.('s1', negative)
    await hook?.('s2', negative)
    face.choose(false)
    await hook?.('s1', negative)
    await hook?.('s1', { kind: 'message', messageId: 'm1', rating: 'positive' })
    await hook?.('s1', { kind: 'session' })
    expect(f.remote.prepareFeedback.mock.calls).toEqual([['s1', 'm1', true], ['s2', 'm1', false], ['s1', 'm1', false]])
    f.remote.prepareFeedback.mockResolvedValueOnce({ ok: false, error: new RemoteError('typert/unavailable' as never, 'Host gone', {} as never) } as never)
    await expect(hook?.('s1', negative)).rejects.toThrow('Host gone')

    await dispose()
    expect(hooks.size).toBe(0)
    expect(f.ctx.slots.entries('feedback.dialog.options')).toHaveLength(0)
    expect(f.ctx.locale.bind('feedback')('dialog.hint')).toBe('dialog.hint')
  } finally { await f.ctx.fiber.dispose() }
})
