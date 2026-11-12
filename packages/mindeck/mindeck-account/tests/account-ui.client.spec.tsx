// @vitest-environment jsdom
/** The sign-in gate and the settings page follow Host state and report outcomes in the member's words. */
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { MindeckAccountView, MindeckSignInAttemptId } from '../src/types.ts'
import { en } from '../src/client/locales.ts'
import type { MindeckAccountSnapshot, OperationOutcome } from '../src/client/operations.ts'
import { SignInGate, type SignInGateProps } from '../src/client/SignInGate.tsx'
import { AccountSection, type AccountSectionProps } from '../src/client/AccountSection.tsx'
import { QuotaNotice, type QuotaNoticeProps } from '../src/client/QuotaNotice.tsx'

afterEach(cleanup)

const attemptId = brandString<MindeckSignInAttemptId>('attempt-1')
const signedOut: MindeckAccountView = {
  cloudUrl: null, status: 'signed-out', user: null, companyName: null, notice: null, attempt: null,
}
const signedIn: MindeckAccountView = {
  cloudUrl: 'https://cloud.example.com', status: 'signed-in', companyName: '星河科技', notice: null, attempt: null,
  user: { id: 'user-1', name: '林晓', email: 'lin@example.com', role: 'admin', department: null },
}

function fixture(view: MindeckAccountView | undefined, failed = false) {
  const account = createSnapshotStore<MindeckAccountSnapshot>({ view, failed })
  const ok: OperationOutcome = { ok: true }
  const operations = {
    connect: vi.fn(async (_input: string): Promise<OperationOutcome> => ok),
    startSignIn: vi.fn(async (): Promise<OperationOutcome> => ok),
    cancelSignIn: vi.fn(async (_id: MindeckSignInAttemptId) => {}),
    signOut: vi.fn(async (): Promise<OperationOutcome> => ok),
  }
  // Global standard hooks are unused by these components; the renderer supplies them in production.
  const props = {
    t: makeTranslate(en), useAccount: bindSnapshotSelector(account), close: () => {}, ...operations,
  } as SignInGateProps & AccountSectionProps & Omit<QuotaNoticeProps, 'matched'>
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
  expect(within(dialog).getByText(en.quotaDescription)).toBeTruthy()
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
})
