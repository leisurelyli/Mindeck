// @vitest-environment jsdom
/** The sign-in gate and the settings page follow Host state and report outcomes in the member's words. */
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { MindeckAccountView, MindeckSignInAttemptId } from '../src/types.ts'
import { en } from '../src/client/locales.ts'
import type { MindeckAccountSnapshot, MindeckReminderSnapshot, OperationOutcome } from '../src/client/operations.ts'
import { SignInGate, type SignInGateProps } from '../src/client/SignInGate.tsx'
import { AccountSection, type AccountSectionProps } from '../src/client/AccountSection.tsx'
import { QuotaNotice, type QuotaNoticeProps } from '../src/client/QuotaNotice.tsx'
import { cloudUrlInText } from '../src/client/address.ts'
import { QuotaDock, type QuotaDockProps } from '../src/client/QuotaDock.tsx'
import { AccountMenu, type AccountMenuProps } from '../src/client/AccountMenu.tsx'
import type { MindeckQuota } from '../src/types.ts'

afterEach(cleanup)

const attemptId = brandString<MindeckSignInAttemptId>('attempt-1')
const signedOut: MindeckAccountView = {
  cloudUrl: null, status: 'signed-out', user: null, companyName: null, notice: null, attempt: null, quota: null,
}
const signedIn: MindeckAccountView = {
  cloudUrl: 'https://cloud.example.com', status: 'signed-in', companyName: '星河科技', notice: null, attempt: null, quota: null,
  user: { id: 'user-1', name: '林晓', email: 'lin@example.com', role: 'admin', department: null },
}

function fixture(view: MindeckAccountView | undefined, failed = false) {
  const account = createSnapshotStore<MindeckAccountSnapshot>({ view, failed })
  const reminders = createSnapshotStore<MindeckReminderSnapshot>({ dismissed: [] })
  const ok: OperationOutcome = { ok: true }
  const operations = {
    connect: vi.fn(async (_input: string): Promise<OperationOutcome> => ok),
    startSignIn: vi.fn(async (): Promise<OperationOutcome> => ok),
    cancelSignIn: vi.fn(async (_id: MindeckSignInAttemptId) => {}),
    signOut: vi.fn(async (): Promise<OperationOutcome> => ok),
    refreshQuota: vi.fn(() => {}),
    dismissReminder: vi.fn((key: string) => { reminders.set({ dismissed: [...reminders.getSnapshot().dismissed, key] }) }),
  }
  // Global standard hooks are unused by these components; the renderer supplies them in production.
  const props = {
    t: makeTranslate(en), useAccount: bindSnapshotSelector(account), useReminders: bindSnapshotSelector(reminders),
    close: () => {}, wide: true, openSettings: () => {}, ...operations,
  } as SignInGateProps & AccountSectionProps & Omit<QuotaNoticeProps, 'matched'> & QuotaDockProps & AccountMenuProps
  const set = (next: MindeckAccountView) => { act(() => { account.set({ view: next, failed: false }) }) }
  return { props, operations, set }
}

it('stays hidden until the state arrives and while signed in', () => {
  const loading = fixture(undefined)
  const view = render(<SignInGate {...loading.props} />)
  expect(view.queryByRole('dialog')).toBeNull()
  cleanup()
  const member = fixture(signedIn)
  expect(render(<SignInGate {...member.props} />).queryByRole('dialog')).toBeNull()
  cleanup()
  const broken = fixture(undefined, true)
  expect(render(<SignInGate {...broken.props} />).getByRole('alert').textContent).toBe(en.streamFailed)
})

it('asks for the Cloud address, keeps the input on failure, and starts sign-in when it is accepted', async () => {
  const f = fixture(signedOut)
  const view = render(<SignInGate {...f.props} />)
  expect(view.getByRole('dialog', { name: en.gateTitle })).toBeTruthy()
  const input = view.getByLabelText(en.cloudUrlLabel)
  const submit = view.getByRole('button', { name: en.continue })
  expect(submit.hasAttribute('disabled')).toBe(true)
  f.operations.connect.mockResolvedValueOnce({ ok: false, reason: 'notMindeckCloud' })
  fireEvent.change(input, { target: { value: 'cloud.example.com' } })
  fireEvent.click(submit)
  expect(await view.findByRole('alert')).toHaveProperty('textContent', en.notMindeckCloud)
  expect(f.operations.connect).toHaveBeenCalledWith('cloud.example.com')
  expect((input as HTMLInputElement).value).toBe('cloud.example.com')

  fireEvent.change(input, { target: { value: 'cloud.example.com ' } })
  expect(view.queryByRole('alert')).toBeNull()
  fireEvent.click(view.getByRole('button', { name: en.continue }))
  await vi.waitFor(() => { expect(f.operations.connect).toHaveBeenCalledTimes(2) })
  f.set({ ...signedOut, cloudUrl: 'https://cloud.example.com', attempt: { id: attemptId, phase: 'requesting' } })
  expect(view.getByRole('status').textContent).toContain(en.requesting)
})

it('shows the code to confirm in the browser and cancels the attempt', async () => {
  const f = fixture({
    ...signedOut, cloudUrl: 'https://cloud.example.com',
    attempt: { id: attemptId, phase: 'waiting', userCode: 'ABCDEFGH', verificationUrl: 'https://cloud.example.com/device?user_code=ABCDEFGH' },
  })
  const view = render(<SignInGate {...f.props} />)
  expect(view.getByText('ABCD-EFGH')).toBeTruthy()
  const open = view.getByRole('link', { name: en.openBrowser })
  expect(open.getAttribute('href')).toBe('https://cloud.example.com/device?user_code=ABCDEFGH')
  expect(open.getAttribute('target')).toBe('_blank')
  fireEvent.click(view.getByRole('button', { name: en.cancel }))
  await vi.waitFor(() => { expect(f.operations.cancelSignIn).toHaveBeenCalledWith(attemptId) })
  f.set({ ...signedOut, cloudUrl: 'https://cloud.example.com', attempt: { id: attemptId, phase: 'cancelled' } })
  expect(view.getByRole('button', { name: en.signIn })).toBeTruthy()
  expect(view.queryByRole('alert')).toBeNull()
})

it('counts the code down, says when it reconnects, and opens the browser once in the window that chose Sign in', async () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null)
  try {
    const ready: MindeckAccountView = { ...signedOut, cloudUrl: 'https://cloud.example.com' }
    const url = 'https://cloud.example.com/device?user_code=ABCDEFGH'
    const attempt = { id: attemptId, phase: 'waiting', userCode: 'ABCDEFGH', verificationUrl: url, expiresAt: Date.now() + 125_000 } as const
    const waiting: MindeckAccountView = { ...ready, attempt }
    // Two windows show the same attempt; only the second one chose Sign in.
    const watcher = fixture(ready)
    render(<SignInGate {...watcher.props} />)
    const f = fixture(ready)
    render(<SignInGate {...f.props} />)
    fireEvent.click(screen.getAllByRole('button', { name: en.signIn })[1] as HTMLElement)
    await vi.waitFor(() => { expect(f.operations.startSignIn).toHaveBeenCalledOnce() })
    watcher.set(waiting)
    f.set(waiting)
    expect(open).toHaveBeenCalledOnce()
    expect(open).toHaveBeenCalledWith(url, '_blank', 'noopener,noreferrer')
    expect(screen.getAllByText('The code expires in 2:05.')).toHaveLength(2)

    f.set({ ...ready, attempt: { ...attempt, retrying: true } })
    expect(screen.getByText(en.reconnecting).getAttribute('role')).toBe('status')
    expect(open).toHaveBeenCalledOnce()
    expect(watcher.operations.startSignIn).not.toHaveBeenCalled()
  } finally {
    open.mockRestore()
  }
})

it('takes the Cloud address out of a pasted account message', () => {
  expect(cloudUrlInText('Mindeck Cloud 地址：https://cloud.example.com/mindeck。账号：lin@example.com')).toBe('https://cloud.example.com/mindeck')
  expect(cloudUrlInText('Open https://cloud.example.com. Then sign in')).toBe('https://cloud.example.com')
  expect(cloudUrlInText('cloud.example.com')).toBeUndefined()
  const f = fixture(signedOut)
  const view = render(<SignInGate {...f.props} />)
  const input = view.getByLabelText(en.cloudUrlLabel) as HTMLInputElement
  fireEvent.paste(input, { clipboardData: { getData: () => '你的 Mindeck 账号已开通。\nMindeck Cloud 地址：https://cloud.example.com\n账号：lin@example.com' } })
  expect(input.value).toBe('https://cloud.example.com')
})

it('explains a failed attempt or an ended session and lets the member retry or change the address', async () => {
  const f = fixture({ ...signedOut, cloudUrl: 'https://cloud.example.com', attempt: { id: attemptId, phase: 'failed', errorCode: 'account-unavailable' } })
  const view = render(<SignInGate {...f.props} />)
  expect(view.getByRole('alert').textContent).toBe(en.accountUnavailable)
  fireEvent.click(view.getByRole('button', { name: en.retry }))
  await vi.waitFor(() => { expect(f.operations.startSignIn).toHaveBeenCalledOnce() })

  f.set({ ...signedOut, cloudUrl: 'https://cloud.example.com', notice: 'session-expired' })
  expect(view.getByRole('alert').textContent).toBe(en.sessionExpired)
  fireEvent.click(view.getByRole('button', { name: en.changeCloud }))
  expect((view.getByLabelText(en.cloudUrlLabel) as HTMLInputElement).value).toBe('https://cloud.example.com')
  fireEvent.click(view.getByRole('button', { name: en.cancel }))
  expect(view.getByText('https://cloud.example.com')).toBeTruthy()
})

it('shows the member and company in Settings and keeps the dialog open when sign-out fails', async () => {
  const f = fixture(signedIn)
  const view = render(<AccountSection {...f.props} />)
  expect(view.getByText('林晓')).toBeTruthy()
  expect(view.getByText('星河科技')).toBeTruthy()
  expect(view.getByText(en.noDepartment)).toBeTruthy()
  expect(view.getByText(en.admin)).toBeTruthy()
  expect(view.getByRole('link', { name: en.openConsole }).getAttribute('href')).toBe('https://cloud.example.com')

  f.operations.signOut.mockResolvedValueOnce({ ok: false, reason: 'storage' })
  fireEvent.click(view.getByRole('button', { name: en.signOut }))
  const dialog = view.getByRole('dialog', { name: en.signOutTitle })
  fireEvent.click(within(dialog).getByRole('button', { name: en.signOut }))
  expect(await view.findByText(en.storage)).toBeTruthy()
  fireEvent.click(within(dialog).getByRole('button', { name: en.signOut }))
  await vi.waitFor(() => { expect(view.queryByRole('dialog')).toBeNull() })
  expect(f.operations.signOut).toHaveBeenCalledTimes(2)
  f.set(signedOut)
  expect(view.getByLabelText(en.cloudUrlLabel)).toBeTruthy()
})

it('explains a used-up company quota with a link to the member usage page, and keeps the generic warning while signed out', () => {
  const notice = (dismiss: () => void) => ({ code: 'QUOTA' as const, message: 'Quota used up', dismiss, keepOpen: () => () => {} })
  const member = fixture(signedIn)
  const dismiss = vi.fn()
  const view = render(<QuotaNotice {...member.props} matched={notice(dismiss)} />)
  const dialog = view.getByRole('dialog', { name: en.quotaTitle })
  expect(within(dialog).getByText('Quota used up')).toBeTruthy()
  expect(member.operations.refreshQuota).toHaveBeenCalledOnce()
  const usage = within(dialog).getByRole('link', { name: en.quotaUsage })
  expect(usage.getAttribute('href')).toBe('https://cloud.example.com/usage')
  expect(usage.getAttribute('target')).toBe('_blank')
  fireEvent.click(within(dialog).getByRole('button', { name: en.quotaDismiss }))
  expect(dismiss).toHaveBeenCalledOnce()
  cleanup()
  const visitor = fixture(signedOut)
  const generic = render(<QuotaNotice {...visitor.props} matched={notice(vi.fn())} />)
  expect(generic.queryByRole('dialog')).toBeNull()
  expect(generic.getByText('Quota used up')).toBeTruthy()
  expect(visitor.operations.refreshQuota).not.toHaveBeenCalled()
  cleanup()
  const silent = fixture(signedIn)
  const fallback = render(<QuotaNotice {...silent.props} matched={{ ...notice(vi.fn()), message: ' ' }} />)
  expect(fallback.getByText(en.quotaDescription)).toBeTruthy()
})

const withQuota = (quota: MindeckQuota): MindeckAccountView => ({ ...signedIn, quota })

it('reminds from 75% of the limit that runs out first, again from 95% and when used up, until dismissed', () => {
  const f = fixture(withQuota({ user: { used: 30, limit: 50 }, department: null, resetDate: '2026-12-01' }))
  const view = render(<QuotaDock {...f.props} />)
  expect(view.container.textContent).toBe('')

  f.set(withQuota({ user: { used: 40, limit: 50 }, department: { used: 100, limit: 1000 }, resetDate: '2026-12-01' }))
  const reminder = view.getByRole('status')
  expect(reminder.textContent).toContain('You have used 80% of your model quota this month (¥40.00 of ¥50.00). It resets on 12/1.')
  expect(reminder.getAttribute('data-level')).toBe('warning')
  expect(within(reminder).getByRole('link', { name: en.quotaUsage }).getAttribute('href')).toBe('https://cloud.example.com/usage')
  fireEvent.click(within(reminder).getByRole('button', { name: en.quotaDockDismiss }))
  expect(f.operations.dismissReminder).toHaveBeenCalledWith('2026-12-01:user:warning')
  expect(view.queryByRole('status')).toBeNull()

  f.set(withQuota({ user: { used: 48, limit: 50 }, department: null, resetDate: '2026-12-01' }))
  expect(view.getByRole('status').getAttribute('data-level')).toBe('urgent')
  f.set(withQuota({ user: { used: 1, limit: null }, department: { used: 1000, limit: 1000 }, resetDate: '2026-12-01' }))
  expect(view.getByRole('status').textContent).toContain('Your department\'s model quota for this month is used up (¥1000.00 of ¥1000.00).')
  f.set(withQuota({ user: { used: 0, limit: 0 }, department: null, resetDate: '2026-12-01' }))
  expect(view.getByRole('status').getAttribute('data-level')).toBe('out')
  f.set(withQuota({ user: { used: 99, limit: null }, department: null, resetDate: '2026-12-01' }))
  expect(view.queryByRole('status')).toBeNull()
  f.set({ ...signedOut, quota: null })
  expect(view.queryByRole('status')).toBeNull()
})

it('shows this month\'s quota in the account menu and refreshes it when the menu opens', async () => {
  const f = fixture(withQuota({ user: { used: 12.5, limit: 50 }, department: { used: 300, limit: 1000 }, resetDate: '2026-12-01' }))
  const view = render(<AccountMenu {...f.props} />)
  fireEvent.click(view.getByRole('button', { name: en.menu }))
  expect(f.operations.refreshQuota).toHaveBeenCalledOnce()
  expect(await screen.findByText('This month: ¥12.50 of ¥50.00')).toBeTruthy()
  expect(screen.getByText('Department: ¥300.00 of ¥1000.00')).toBeTruthy()
  cleanup()
  const unlimited = fixture(withQuota({ user: { used: 3, limit: null }, department: null, resetDate: '2026-12-01' }))
  render(<AccountMenu {...unlimited.props} />)
  fireEvent.click(screen.getByRole('button', { name: en.menu }))
  expect(await screen.findByText('This month: ¥3.00, no limit')).toBeTruthy()
  expect(screen.queryByText(/Department:/)).toBeNull()
})
