// @vitest-environment jsdom
/**
 * The full-screen sign-in follows the Host account state on the base first-run page: it covers the workspace until
 * the first state, welcomes a device once, takes the company address, shows the code to confirm, explains every
 * failure where the member can act on it, and greets the member before fading into the workspace.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { MindeckAccountView, MindeckSignInAttempt, MindeckSignInAttemptId } from '../src/types.ts'
import { cloudUrlInText } from '../src/client/address.ts'
import { en } from '../src/client/locales.ts'
import { MindeckOnboarding, type MindeckOnboardingProps } from '../src/client/MindeckOnboarding.tsx'
import type { MindeckAccountSnapshot, OperationOutcome } from '../src/client/operations.ts'
import { baseFactories, noFactories } from './base-factories.client.tsx'

const reduced = { value: false }
beforeEach(() => {
  reduced.value = false
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduced-motion') && reduced.value, media: query }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })

const attemptId = brandString<MindeckSignInAttemptId>('attempt-1')
const cloudUrl = 'https://cloud.example.com'
const firstRun: MindeckAccountView = {
  cloudUrl: null, welcomed: false, status: 'signed-out', user: null, companyName: null, notice: null, attempt: null, quota: null,
  adminContact: null, personalDeepSeek: false,
}
const returning: MindeckAccountView = { ...firstRun, cloudUrl, welcomed: true }
const member: MindeckAccountView = {
  ...returning, status: 'signed-in', companyName: '心言智创',
  user: { id: 'u1', name: '王磊', email: 'wanglei@xinghe.com', role: 'user', department: null },
}
const attempt = (value: Omit<MindeckSignInAttempt, 'id'>): MindeckAccountView => ({ ...returning, attempt: { id: attemptId, ...value } })

function stage(view: MindeckAccountView | undefined, options: { failed?: boolean; factories?: typeof baseFactories } = {}) {
  const account = createSnapshotStore<MindeckAccountSnapshot>({ view, failed: options.failed ?? false })
  const ok: OperationOutcome = { ok: true }
  const operations = {
    connect: vi.fn(async (_input: string): Promise<OperationOutcome> => ok),
    startSignIn: vi.fn(async (): Promise<OperationOutcome> => ok),
    cancelSignIn: vi.fn(async (_id: MindeckSignInAttemptId) => {}),
    finishWelcome: vi.fn(),
  }
  // The renderer supplies the remaining injected operations and global hooks; the stage reads none of them.
  const props = {
    t: makeTranslate(en), useAccount: bindSnapshotSelector(account), renderFactorySlot: options.factories ?? baseFactories, ...operations,
  } as Partial<MindeckOnboardingProps> as MindeckOnboardingProps
  render(<MindeckOnboarding {...props} />)
  const set = (next: MindeckAccountView) => { act(() => { account.set({ view: next, failed: false }) }) }
  return { operations, set }
}

const heading = () => screen.queryByRole('heading', { level: 1 })?.textContent ?? null
const field = () => screen.getByLabelText<HTMLInputElement>(en.cloudUrlLabel)

it('covers the workspace with a blank stage until the first state, and explains a failed stream', () => {
  stage(undefined)
  expect(document.querySelector('[data-desktop-onboarding-page="loading"]')).not.toBeNull()
  expect(heading()).toBeNull()
  cleanup()
  stage(undefined, { failed: true })
  expect(heading()).toBe(en.streamFailedTitle)
  expect(screen.getByText(en.streamFailed)).toBeTruthy()
})

it('welcomes a device once, records it, and goes back and forth between the welcome and the address', () => {
  const f = stage(firstRun)
  expect(heading()).toBe(`${en.welcomeTitle} ${en.brand}`)
  fireEvent.click(screen.getByRole('button', { name: en.welcomeStart }))
  expect(f.operations.finishWelcome).toHaveBeenCalledOnce()
  expect(heading()).toBe(en.connectTitle)
  fireEvent.click(screen.getByRole('button', { name: en.back }))
  expect(heading()).toBe(`${en.welcomeTitle} ${en.brand}`)
  f.set({ ...firstRun, welcomed: true })
  fireEvent.click(screen.getByRole('button', { name: en.welcomeStart }))
  expect(heading()).toBe(en.connectTitle)
  expect(f.operations.finishWelcome).toHaveBeenCalledOnce()
})

it('starts at the address on a device that was welcomed, with a preconfigured address filled in and no way back', () => {
  stage({ ...firstRun, cloudUrl, welcomed: true })
  expect(heading()).toBe(en.connectTitle)
  expect(field().value).toBe(cloudUrl)
  expect(screen.queryByRole('button', { name: en.back })).toBeNull()
})

it('fills in a preconfigured address after the welcome on a first start', () => {
  stage({ ...firstRun, cloudUrl })
  fireEvent.click(screen.getByRole('button', { name: en.welcomeStart }))
  expect(field().value).toBe(cloudUrl)
})

it('connects a new address, keeps the input on a refusal, and signs in straight away at the known address', async () => {
  const f = stage({ ...firstRun, welcomed: true })
  const submit = screen.getByRole('button', { name: en.continue })
  expect(submit.hasAttribute('disabled')).toBe(true)
  f.operations.connect.mockResolvedValueOnce({ ok: false, reason: 'notMindeckCloud' })
  fireEvent.change(field(), { target: { value: 'cloud.example.com' } })
  fireEvent.submit(field().form!)
  expect((await screen.findByRole('alert')).textContent).toBe(en.notMindeckCloud)
  expect(f.operations.connect).toHaveBeenCalledWith('cloud.example.com')
  expect(field().value).toBe('cloud.example.com')
  expect(field().getAttribute('aria-invalid')).toBe('true')
  fireEvent.change(field(), { target: { value: 'cloud.example.com ' } })
  expect(screen.queryByRole('alert')).toBeNull()
  cleanup()

  const known = stage(returning)
  fireEvent.click(screen.getByRole('button', { name: en.continue }))
  await vi.waitFor(() => { expect(known.operations.startSignIn).toHaveBeenCalledOnce() })
  expect(known.operations.connect).not.toHaveBeenCalled()
})

it('takes the Cloud address out of a pasted activation message or invitation link', async () => {
  expect(cloudUrlInText('Mindeck Cloud 地址：https://cloud.example.com/mindeck。账号：lin@example.com')).toBe('https://cloud.example.com/mindeck')
  expect(cloudUrlInText('Open https://cloud.example.com. Then sign in')).toBe('https://cloud.example.com')
  expect(cloudUrlInText('cloud.example.com')).toBeUndefined()
  expect(cloudUrlInText('邀请你加入心言智创：https://cloud.example.com/invite/Ab3?from=mail#top 7 天内有效')).toBe('https://cloud.example.com/invite/Ab3')
  expect(cloudUrlInText('打开https://cloud.example.com登录')).toBe('https://cloud.example.com')
  const f = stage({ ...firstRun, welcomed: true })
  fireEvent.paste(field(), { clipboardData: { getData: () => [
    '你的 Mindeck 账号已开通。',
    'Mindeck Cloud 地址：https://cloud.example.com',
    '初始密码：Ab3dEf6hJk9m',
    '1. 在浏览器打开 https://cloud.example.com/sign-in 登录，按提示设置自己的密码。',
    '2. 下载并安装 Mindeck 桌面端：Windows 版 https://downloads.example.com/Mindeck-Setup.exe',
  ].join('\n') } })
  expect(field().value).toBe('https://cloud.example.com')
  // A bare invitation link loses its query; the Host resolves its page path to the Cloud.
  fireEvent.change(field(), { target: { value: '' } })
  fireEvent.paste(field(), { clipboardData: { getData: () => 'https://cloud.example.com/invite/Ab3?code=9' } })
  expect(field().value).toBe('https://cloud.example.com/invite/Ab3')
  fireEvent.submit(field().form!)
  await vi.waitFor(() => { expect(f.operations.connect).toHaveBeenCalledWith('https://cloud.example.com/invite/Ab3') })
})

it('shows the code, counts it down, says when it reconnects, and opens the browser once in the window that asked', async () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null)
  const url = 'https://cloud.example.com/device?user_code=ABCDEFGH'
  const waiting = attempt({ phase: 'waiting', userCode: 'ABCDEFGH', verificationUrl: url, expiresAt: Date.now() + 125_000 })
  // Two windows show the same attempt; only the second one asked to sign in.
  const watcher = stage(returning)
  const f = stage(returning)
  fireEvent.click(screen.getAllByRole('button', { name: en.continue })[1]!)
  await vi.waitFor(() => { expect(f.operations.startSignIn).toHaveBeenCalledOnce() })
  f.set(attempt({ phase: 'requesting' }))
  expect(screen.getByText(en.requesting)).toBeTruthy()
  // The actions keep their place but wait for the code.
  expect(screen.getByRole('button', { name: en.openBrowser }).hasAttribute('disabled')).toBe(true)
  expect(screen.getByRole('button', { name: en.copyLink }).hasAttribute('disabled')).toBe(true)
  watcher.set(waiting)
  f.set(waiting)
  expect(open).toHaveBeenCalledOnce()
  expect(open).toHaveBeenCalledWith(url, '_blank', 'noopener,noreferrer')
  expect(screen.getAllByText('ABCD-EFGH')).toHaveLength(2)
  expect(screen.getAllByText('The code expires in 2:05.')).toHaveLength(2)
  f.set({ ...waiting, attempt: { ...waiting.attempt!, retrying: true } })
  expect(screen.getByText(en.reconnecting).getAttribute('role')).toBe('status')
  fireEvent.click(screen.getAllByRole('button', { name: en.openBrowser })[0]!)
  expect(open).toHaveBeenCalledTimes(2)
  expect(watcher.operations.startSignIn).not.toHaveBeenCalled()
  open.mockRestore()
})

it('copies the link, goes back by cancelling the attempt, and keeps the member on the page while sign-in finishes', async () => {
  const writeText = vi.fn(async (_text: string) => {})
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  const url = 'https://cloud.example.com/device?user_code=ABCDEFGH'
  const f = stage(attempt({ phase: 'waiting', userCode: 'ABCDEFGH', verificationUrl: url }))
  fireEvent.click(screen.getByRole('button', { name: en.copyLink }))
  expect(await screen.findByRole('button', { name: en.copiedLink })).toBeTruthy()
  expect(writeText).toHaveBeenCalledWith(url)
  fireEvent.click(screen.getByRole('button', { name: en.back }))
  await vi.waitFor(() => { expect(f.operations.cancelSignIn).toHaveBeenCalledWith(attemptId) })
  f.set(attempt({ phase: 'cancelled' }))
  expect(heading()).toBe(en.connectTitle)
  expect(screen.queryByRole('alert')).toBeNull()
  f.set(attempt({ phase: 'registering' }))
  expect(screen.getByText(en.registering)).toBeTruthy()
  expect(screen.getByRole('button', { name: en.back }).hasAttribute('disabled')).toBe(true)
})

it.each([
  ['denied', en.denied], ['expired', en.expired], ['unreachable', en.unreachable], ['account-unavailable', en.accountUnavailable],
] as const)('returns to the address and explains an attempt that ended as %s', async (errorCode, text) => {
  const f = stage(attempt({ phase: 'failed', errorCode }))
  expect(heading()).toBe(en.connectTitle)
  expect(screen.getByRole('alert').textContent).toBe(text)
  expect(field().value).toBe(cloudUrl)
  fireEvent.click(screen.getByRole('button', { name: en.continue }))
  await vi.waitFor(() => { expect(f.operations.startSignIn).toHaveBeenCalledOnce() })
})

it('starts an ended session at the address with the reason, even on a device that was never welcomed', () => {
  stage({ ...firstRun, cloudUrl, notice: 'session-expired' })
  expect(heading()).toBe(en.connectTitle)
  expect(screen.getByRole('status').textContent).toBe(en.sessionExpired)
  expect(field().value).toBe(cloudUrl)
})

it('greets the member after a sign-in, then fades into the workspace and leaves it as it was', () => {
  vi.useFakeTimers()
  const f = stage(attempt({ phase: 'registering' }))
  f.set(member)
  expect(heading()).toBe('Welcome, 王磊')
  expect(screen.getByText('Connected to 心言智创. Opening your workspace…')).toBeTruthy()
  act(() => { vi.advanceTimersByTime(900) })
  expect(document.querySelector('[data-exiting]')).not.toBeNull()
  act(() => { vi.advanceTimersByTime(180) })
  expect(document.querySelector('[data-desktop-onboarding-page]')).toBeNull()
  // Signing out covers the workspace again, at the address; the Host keeps the succeeded attempt until the next one.
  const succeeded = attempt({ phase: 'succeeded' })
  f.set(succeeded)
  expect(heading()).toBe(en.connectTitle)
  expect(field().value).toBe(cloudUrl)
  expect(screen.queryByRole('alert')).toBeNull()
  f.set(member)
  f.set({ ...succeeded, notice: 'session-expired' })
  expect(heading()).toBe(en.connectTitle)
  expect(screen.getByRole('status').textContent).toBe(en.sessionExpired)
})

it('fades a signed-in start without a sign-in page, and skips the fade under reduced motion', () => {
  vi.useFakeTimers()
  const f = stage(undefined)
  f.set(member)
  expect(heading()).toBeNull()
  expect(document.querySelector('[data-exiting]')).not.toBeNull()
  act(() => { vi.advanceTimersByTime(180) })
  expect(document.querySelector('[data-desktop-onboarding-page]')).toBeNull()
  cleanup()
  reduced.value = true
  const still = stage(undefined)
  still.set(member)
  expect(document.querySelector('[data-desktop-onboarding-page]')).toBeNull()
})

it('signs in through a dialog in a composition without the base first-run page', async () => {
  const f = stage({ ...firstRun, cloudUrl }, { factories: noFactories })
  expect(screen.getByRole('dialog', { name: `${en.welcomeTitle} ${en.brand}` })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: en.welcomeStart }))
  expect(screen.getByRole('dialog', { name: en.connectTitle })).toBeTruthy()
  expect(field().value).toBe(cloudUrl)
  fireEvent.submit(field().closest('form')!)
  await vi.waitFor(() => { expect(f.operations.startSignIn).toHaveBeenCalledOnce() })
  f.set(attempt({ phase: 'registering' }))
  expect(screen.getByRole('button', { name: en.back }).hasAttribute('disabled')).toBe(true)
  f.set(member)
  expect(screen.queryByRole('dialog', { name: en.connectTitle })).toBeNull()
  // The greeting page has no actions and waits; the fallback still shows its title.
  expect(screen.getByRole('dialog', { name: 'Welcome, 王磊' })).toBeTruthy()
})
