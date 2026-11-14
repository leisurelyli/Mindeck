// @vitest-environment jsdom
/** The settings page, the quota dialog and reminder, and the launcher follow Host state and report outcomes in the member's words. */
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { MindeckAccountView } from '../src/types.ts'
import { en } from '../src/client/locales.ts'
import type { MindeckAccountSnapshot, MindeckReminderSnapshot, OperationOutcome } from '../src/client/operations.ts'
import { AccountSection, type AccountSectionProps } from '../src/client/AccountSection.tsx'
import { QuotaNotice, type QuotaNoticeProps } from '../src/client/QuotaNotice.tsx'
import { QuotaDock, type QuotaDockProps } from '../src/client/QuotaDock.tsx'
import { AccountMenu, type AccountMenuProps } from '../src/client/AccountMenu.tsx'
import { FeedbackOptions, type FeedbackOptionsProps } from '../src/client/FeedbackOptions.tsx'
import type { MindeckQuota } from '../src/types.ts'
import type { PersonalDeepSeekSnapshot } from '../src/client/personal-deepseek.ts'
import type { AccountView, SignInAttemptId } from '@deepseek-ai/dsh-deepseek-account/types'
import { baseFactories, noFactories } from './base-factories.client.tsx'

afterEach(cleanup)

const signedOut: MindeckAccountView = {
  cloudUrl: null, welcomed: true, status: 'signed-out', user: null, companyName: null, notice: null, attempt: null, quota: null, adminContact: null, personalDeepSeek: false, sync: null, release: null,
}
const signedIn: MindeckAccountView = {
  cloudUrl: 'https://cloud.example.com', welcomed: true, status: 'signed-in', companyName: '星河科技', notice: null, attempt: null, quota: null, adminContact: null, personalDeepSeek: false, sync: null, release: null,
  user: { id: 'user-1', name: '林晓', email: 'lin@example.com', role: 'admin', department: null },
}

const deepseekSignedOut: AccountView = {
  status: 'signed-out', attempt: null,
  links: { usageUrl: 'https://platform.deepseek.com/usage', topUpUrl: 'https://platform.deepseek.com/top_up' },
}

function fixture(view: MindeckAccountView | undefined, failed = false) {
  const account = createSnapshotStore<MindeckAccountSnapshot>({ view, failed })
  const reminders = createSnapshotStore<MindeckReminderSnapshot>({ dismissed: [] })
  const personal = createSnapshotStore<PersonalDeepSeekSnapshot>({ available: true, view: deepseekSignedOut, failed: false })
  const ok: OperationOutcome = { ok: true }
  const operations = {
    signOut: vi.fn(async (): Promise<OperationOutcome> => ok),
    refreshQuota: vi.fn(() => {}),
    sendFeedback: vi.fn(async (_text: string): Promise<OperationOutcome> => ok),
    dismissReminder: vi.fn((key: string) => { reminders.set({ dismissed: [...reminders.getSnapshot().dismissed, key] }) }),
    startPersonalSignIn: vi.fn(async (): Promise<OperationOutcome> => ok),
    cancelPersonalSignIn: vi.fn(async () => {}),
    signOutPersonal: vi.fn(async (): Promise<OperationOutcome> => ok),
    syncNow: vi.fn(async (): Promise<OperationOutcome> => ok),
    requestQuota: vi.fn(async (_reason: string): Promise<OperationOutcome> => ok),
    withdrawQuotaRequest: vi.fn(async (): Promise<OperationOutcome> => ok),
  }
  // Global standard hooks are unused by these components; the renderer supplies them in production.
  const props = {
    t: makeTranslate(en), useAccount: bindSnapshotSelector(account), useReminders: bindSnapshotSelector(reminders),
    usePersonal: bindSnapshotSelector(personal), renderFactorySlot: baseFactories,
    close: () => {}, wide: true, openSettings: () => {}, appVersion: '0.3.0', ...operations,
  } as AccountSectionProps & Omit<QuotaNoticeProps, 'matched'> & QuotaDockProps & AccountMenuProps
  const set = (next: MindeckAccountView) => { act(() => { account.set({ view: next, failed: false }) }) }
  const setPersonal = (next: AccountView) => { act(() => { personal.set({ available: true, view: next, failed: false }) }) }
  return { props, operations, set, setPersonal }
}

it('shows the member, the company, and this month\'s usage with the base account page parts', () => {
  const f = fixture({ ...signedIn, quota: { user: { used: 1234.5, limit: 2000 }, department: { used: 300, limit: 10_000 }, companyBudgetPercent: null, resetDate: '2026-12-01', granted: 0, request: null } })
  const view = render(<AccountSection {...f.props} />)
  const page = view.getByRole('region', { name: en.nav })
  expect(page.className).toContain('section')
  expect(within(page).getByText('林晓')).toBeTruthy()
  expect(within(page).getByText('lin@example.com').getAttribute('role')).toBe('status')
  expect(within(page).getByRole('link', { name: en.openConsole }).getAttribute('href')).toBe('https://cloud.example.com')
  expect(within(page).getByText('星河科技')).toBeTruthy()
  expect(within(page).getByText(en.noDepartment)).toBeTruthy()
  expect(within(page).getByText(en.admin)).toBeTruthy()
  expect(within(page).getByText('¥1,234.50')).toBeTruthy()
  expect(within(page).getByText('of ¥2,000.00')).toBeTruthy()
  expect(within(page).getAllByText('Resets on 12/1')).toHaveLength(2)
  expect(within(page).getByText('of ¥10,000.00')).toBeTruthy()
  expect(within(page).getByText('https://cloud.example.com')).toBeTruthy()
  expect(within(page).getByRole('link', { name: en.help }).getAttribute('href')).toBe('https://cloud.example.com/help')
  cleanup()
  // A member opens Mindeck Cloud rather than the admin console; without a quota read there is no usage row.
  const plain = fixture({ ...signedIn, user: { ...signedIn.user!, role: 'user', department: { id: 'd1', name: '市场部' } } })
  const memberView = render(<AccountSection {...plain.props} />)
  expect(memberView.getByRole('link', { name: en.openCloud })).toBeTruthy()
  expect(memberView.getByText('市场部')).toBeTruthy()
  expect(memberView.queryByText(en.usage)).toBeNull()
})

it('keeps the sign-out dialog open when sign-out fails, and leaves Settings once signed out', async () => {
  const f = fixture(signedIn)
  const close = vi.fn()
  const view = render(<AccountSection {...f.props} close={close} />)
  f.operations.signOut.mockResolvedValueOnce({ ok: false, reason: 'storage' })
  fireEvent.click(view.getByRole('button', { name: en.signOut }))
  const dialog = view.getByRole('dialog', { name: en.signOutTitle })
  fireEvent.click(within(dialog).getByRole('button', { name: en.signOut }))
  expect(await view.findByText(en.storage)).toBeTruthy()
  fireEvent.click(within(dialog).getByRole('button', { name: en.signOut }))
  await vi.waitFor(() => { expect(view.queryByRole('dialog')).toBeNull() })
  expect(f.operations.signOut).toHaveBeenCalledTimes(2)
  expect(close).not.toHaveBeenCalled()
  f.set(signedOut)
  expect(close).toHaveBeenCalledOnce()
  expect(view.getByText(en.signedOutSection)).toBeTruthy()
  expect(view.queryByLabelText(en.cloudUrlLabel)).toBeNull()
})

it('offers a personal DeepSeek account on the account page only while the company allows one', async () => {
  const f = fixture(signedIn)
  const view = render(<AccountSection {...f.props} />)
  expect(view.queryByText(en.personalTitle)).toBeNull()
  f.set({ ...signedIn, personalDeepSeek: true })
  expect(view.getByText(en.personalTitle)).toBeTruthy()
  const status = () => view.getAllByRole('status').map(node => node.textContent)
  expect(status()).toContain(en.personalDescription)
  fireEvent.click(view.getByRole('button', { name: en.personalSignIn }))
  await waitFor(() => { expect(f.operations.startPersonalSignIn).toHaveBeenCalledOnce() })

  const open = vi.spyOn(window, 'open').mockReturnValue(null)
  f.setPersonal({
    ...deepseekSignedOut,
    attempt: { id: brandString<SignInAttemptId>('ds-1'), phase: 'waiting-browser', authorizeUrl: 'https://platform.deepseek.com/authorize?x=1' },
  })
  expect(status()).toContain(en.personalWaiting)
  // The window that asked opens the authorization page once and keeps a link to it.
  expect(open).toHaveBeenCalledOnce()
  expect(view.getByRole('link', { name: en.openBrowser }).getAttribute('href')).toBe('https://platform.deepseek.com/authorize?x=1')
  open.mockRestore()
  fireEvent.click(view.getByRole('button', { name: en.cancel }))
  expect(f.operations.cancelPersonalSignIn).toHaveBeenCalledOnce()

  f.setPersonal({ ...deepseekSignedOut, status: 'credential-stored' })
  expect(status()).toContain(en.personalSignedIn)
  fireEvent.click(view.getByRole('button', { name: en.personalSignOut }))
  await waitFor(() => { expect(f.operations.signOutPersonal).toHaveBeenCalledOnce() })
})

it('keeps the member and sign-out in plain form in a composition without the base page parts', () => {
  const f = fixture(signedIn)
  const view = render(<AccountSection {...f.props} renderFactorySlot={noFactories} />)
  expect(view.getByRole('region', { name: en.nav }).textContent).toContain('林晓 · lin@example.com')
  fireEvent.click(view.getByRole('button', { name: en.signOut }))
  expect(view.getByRole('dialog', { name: en.signOutTitle })).toBeTruthy()
})

it('names the used-up limit and its reset date with a link to the member usage page, and keeps the generic warning while signed out', () => {
  const notice = (dismiss: () => void) => ({ code: 'QUOTA' as const, message: 'Quota used up', dismiss, keepOpen: () => () => {} })
  const member = fixture({ ...signedIn, quota: {
    user: { used: 50, limit: 50 }, department: null, companyBudgetPercent: null, resetDate: '2026-12-01', granted: 0, request: null,
  } })
  const dismiss = vi.fn()
  const view = render(<QuotaNotice {...member.props} matched={notice(dismiss)} />)
  const dialog = view.getByRole('dialog', { name: en.quotaTitle })
  expect(within(dialog).getByText('Your model quota for this month is used up (¥50.00 of ¥50.00). It resets on 12/1; ask your administrator if you need more.')).toBeTruthy()
  expect(within(dialog).queryByText('Quota used up')).toBeNull()
  expect(member.operations.refreshQuota).toHaveBeenCalledOnce()
  const usage = within(dialog).getByRole('link', { name: en.quotaUsage })
  expect(usage.getAttribute('href')).toBe('https://cloud.example.com/usage')
  expect(usage.getAttribute('target')).toBe('_blank')
  // A used-up company budget is named even when the member's own limit is also used up.
  member.set({ ...signedIn, quota: {
    user: { used: 50, limit: 50 }, department: null, companyBudgetPercent: 100, resetDate: '2026-12-01', granted: 0, request: null,
  } })
  expect(within(dialog).getByText(/^Your company's model budget for this month is used up/)).toBeTruthy()
  fireEvent.click(within(dialog).getByRole('button', { name: en.quotaDismiss }))
  expect(dismiss).toHaveBeenCalledOnce()
  cleanup()
  const visitor = fixture(signedOut)
  const generic = render(<QuotaNotice {...visitor.props} matched={notice(vi.fn())} />)
  expect(generic.queryByRole('dialog')).toBeNull()
  expect(generic.getByText('Quota used up')).toBeTruthy()
  expect(visitor.operations.refreshQuota).not.toHaveBeenCalled()
  cleanup()
  // Until a quota read shows a used-up limit, the dialog gives the general explanation.
  const unread = fixture(signedIn)
  const fallback = render(<QuotaNotice {...unread.props} matched={notice(vi.fn())} />)
  expect(fallback.getByText(en.quotaDescription)).toBeTruthy()
})

const withQuota = (quota: MindeckQuota): MindeckAccountView => ({ ...signedIn, quota })

const quotaNotice = { code: 'QUOTA' as const, message: 'Quota used up', dismiss: () => {}, keepOpen: () => () => {} }
const personalOut = (request: MindeckQuota['request']): MindeckQuota => ({
  user: { used: 80, limit: 80 }, granted: 30, department: { used: 300, limit: 1000 }, companyBudgetPercent: null,
  resetDate: '2026-12-01', request,
})
const request = (patch: Partial<NonNullable<NonNullable<MindeckQuota['request']>['request']>> = {}) => ({
  id: 'qr-1', status: 'pending', month: '2026-11-01', reason: null, createdAt: new Date(2026, 10, 14, 10, 32).toISOString(),
  decidedAt: null, decidedByName: null, decision: null, amount: null, decisionNote: null, ...patch,
})

it('asks for more quota once the personal limit is used up, then shows the pending request with its time and withdraws it after confirmation', async () => {
  const f = fixture(withQuota(personalOut({ request: null, canRequest: true, blocker: null })))
  const view = render(<QuotaNotice {...f.props} matched={quotaNotice} />)
  const dialog = view.getByRole('dialog', { name: en.quotaTitle })
  expect(within(dialog).getByText(/^Your personal model quota for this month is used up \(¥80\.00\/¥80\.00\)/)).toBeTruthy()
  expect(within(dialog).queryByText(/Contact/)).toBeNull()
  fireEvent.change(within(dialog).getByLabelText(en.quotaRequestReasonLabel), { target: { value: '月底赶项目' } })
  expect(within(dialog).getByText('5/200')).toBeTruthy()
  let finish: (outcome: OperationOutcome) => void = () => {}
  f.operations.requestQuota.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  fireEvent.click(within(dialog).getByRole('button', { name: en.quotaRequestSubmit }))
  expect(f.operations.requestQuota).toHaveBeenCalledWith('月底赶项目')
  const sending = within(dialog).getByRole('button', { name: en.quotaRequestSubmitting })
  expect(sending.hasAttribute('disabled')).toBe(true)
  fireEvent.click(sending)
  expect(f.operations.requestQuota).toHaveBeenCalledOnce()
  await act(async () => { finish({ ok: true }) })
  f.set(withQuota(personalOut({ request: request({ reason: '月底赶项目' }), canRequest: false, blocker: 'pending' })))
  expect(within(dialog).getByText(en.quotaRequestPendingTitle)).toBeTruthy()
  expect(within(dialog).getByText('Sent 11/14 10:32. The decision arrives in Company messages.')).toBeTruthy()
  expect(within(dialog).getByText('Reason: 月底赶项目')).toBeTruthy()
  expect(within(dialog).queryByRole('button', { name: en.quotaRequestSubmit })).toBeNull()

  fireEvent.click(within(dialog).getByRole('button', { name: en.quotaRequestWithdraw }))
  expect(within(dialog).getByText(en.quotaRequestWithdrawConfirm)).toBeTruthy()
  fireEvent.click(within(dialog).getByRole('button', { name: en.quotaRequestKeep }))
  expect(f.operations.withdrawQuotaRequest).not.toHaveBeenCalled()
  fireEvent.click(within(dialog).getByRole('button', { name: en.quotaRequestWithdraw }))
  f.operations.withdrawQuotaRequest.mockResolvedValueOnce({ ok: false, reason: 'quotaRequestRefused', message: '这条申请已经批准了，不能再撤回。' })
  await act(async () => { fireEvent.click(within(dialog).getAllByRole('button', { name: en.quotaRequestWithdraw }).at(-1) as HTMLElement) })
  expect(within(dialog).getByRole('alert').textContent).toBe('这条申请已经批准了，不能再撤回。')
  fireEvent.click(within(dialog).getByRole('button', { name: en.quotaRequestWithdraw }))
  await act(async () => { fireEvent.click(within(dialog).getAllByRole('button', { name: en.quotaRequestWithdraw }).at(-1) as HTMLElement) })
  f.set(withQuota(personalOut({ request: request({ status: 'cancelled' }), canRequest: true, blocker: null })))
  expect(within(dialog).getByRole('status').textContent).toBe(en.quotaRequestWithdrawn)
  expect(within(dialog).getByRole('button', { name: en.quotaRequestSubmit })).toBeTruthy()

  f.operations.requestQuota.mockResolvedValueOnce({ ok: false, reason: 'feedbackUnreachable' })
  await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: en.quotaRequestSubmit })) })
  expect(within(dialog).getByRole('alert').textContent).toBe(en.quotaRequestUnreachable)
})

it('names whom to contact instead of a request when the department or company limit is used up', () => {
  const f = fixture({ ...withQuota({
    user: { used: 20, limit: 80 }, granted: 0, department: { used: 1000, limit: 1000 }, companyBudgetPercent: null,
    resetDate: '2026-12-01', request: { request: null, canRequest: false, blocker: 'department' },
  }), adminContact: '企业微信找周敏' })
  const view = render(<QuotaNotice {...f.props} matched={quotaNotice} />)
  const dialog = view.getByRole('dialog', { name: en.quotaTitle })
  expect(within(dialog).getByText(/^Your department's model quota for this month is used up/)).toBeTruthy()
  expect(within(dialog).getByText('Contact your administrator: 企业微信找周敏')).toBeTruthy()
  expect(within(dialog).queryByRole('button', { name: en.quotaRequestSubmit })).toBeNull()
  expect(within(dialog).queryByRole('textbox')).toBeNull()
  f.set({ ...withQuota({
    user: { used: 20, limit: 80 }, granted: 0, department: null, companyBudgetPercent: 100,
    resetDate: '2026-12-01', request: { request: null, canRequest: false, blocker: 'company' },
  }), adminContact: '企业微信找周敏' })
  expect(within(dialog).getByText(/^Your company's model budget for this month is used up/)).toBeTruthy()
  expect(within(dialog).queryByRole('button', { name: en.quotaRequestSubmit })).toBeNull()
})

it('shows the outcome of this month\'s request: a rejection with its note above a new request, and an approval that gives room again', () => {
  const f = fixture(withQuota(personalOut({ request: request({ status: 'rejected', decisionNote: '本月预算紧张' }), canRequest: true, blocker: null })))
  const view = render(<QuotaNotice {...f.props} matched={quotaNotice} />)
  const dialog = view.getByRole('dialog', { name: en.quotaTitle })
  expect(within(dialog).getByText('Your last request for more quota was not approved. Note: 本月预算紧张')).toBeTruthy()
  expect(within(dialog).getByRole('button', { name: en.quotaRequestResubmit })).toBeTruthy()
  f.set(withQuota({
    ...personalOut({ request: request({ status: 'approved', decision: 'this_month', amount: 50 }), canRequest: false, blocker: 'quota-left' }),
    user: { used: 80, limit: 130 },
  }))
  const approved = view.getByRole('dialog', { name: en.quotaApprovedTitle })
  expect(within(approved).getByText('Your request for more quota was approved: ¥50.00 more this month. You can go back to the conversation and continue.')).toBeTruthy()
  expect(within(approved).queryByRole('textbox')).toBeNull()
  f.set(withQuota({
    ...personalOut({ request: request({ status: 'approved', decision: 'permanent', amount: 200 }), canRequest: true, blocker: null }),
    user: { used: 200, limit: 200 },
  }))
  expect(within(view.getByRole('dialog', { name: en.quotaTitle })).getByText('Your request for more quota was approved: your monthly quota is now ¥200.00.')).toBeTruthy()
})

it('reminds from 75% of the limit that runs out first, again from 95% and when used up, until dismissed', () => {
  const f = fixture(withQuota({ user: { used: 30, limit: 50 }, department: null, companyBudgetPercent: null, resetDate: '2026-12-01', granted: 0, request: null }))
  const view = render(<QuotaDock {...f.props} />)
  expect(view.container.textContent).toBe('')

  f.set(withQuota({ user: { used: 40, limit: 50 }, department: { used: 100, limit: 1000 }, companyBudgetPercent: null, resetDate: '2026-12-01', granted: 0, request: null }))
  const reminder = view.getByRole('status')
  expect(reminder.textContent).toContain('You have used 80% of your model quota this month (¥40.00 of ¥50.00). It resets on 12/1.')
  expect(reminder.getAttribute('data-level')).toBe('warning')
  expect(within(reminder).getByRole('link', { name: en.quotaUsage }).getAttribute('href')).toBe('https://cloud.example.com/usage')
  fireEvent.click(within(reminder).getByRole('button', { name: en.quotaDockDismiss }))
  expect(f.operations.dismissReminder).toHaveBeenCalledWith('2026-12-01:user:warning')
  expect(view.queryByRole('status')).toBeNull()

  f.set(withQuota({ user: { used: 48, limit: 50 }, department: null, companyBudgetPercent: null, resetDate: '2026-12-01', granted: 0, request: null }))
  expect(view.getByRole('status').getAttribute('data-level')).toBe('urgent')
  f.set(withQuota({ user: { used: 1, limit: null }, department: { used: 1000, limit: 1000 }, companyBudgetPercent: null, resetDate: '2026-12-01', granted: 0, request: null }))
  expect(view.getByRole('status').textContent).toContain('Your department\'s model quota for this month is used up (¥1,000.00 of ¥1,000.00).')
  f.set(withQuota({ user: { used: 0, limit: 0 }, department: null, companyBudgetPercent: null, resetDate: '2026-12-01', granted: 0, request: null }))
  expect(view.getByRole('status').getAttribute('data-level')).toBe('out')
  f.set(withQuota({ user: { used: 99, limit: null }, department: null, companyBudgetPercent: null, resetDate: '2026-12-01', granted: 0, request: null }))
  expect(view.queryByRole('status')).toBeNull()
  f.set(withQuota({ user: { used: 10, limit: 50 }, department: null, companyBudgetPercent: 96, resetDate: '2026-12-01', granted: 0, request: null }))
  expect(view.getByRole('status').textContent).toContain('Your company has used 96% of this month\'s model budget.')
  expect(view.getByRole('status').getAttribute('data-level')).toBe('urgent')
  f.set(withQuota({ user: { used: 10, limit: 50 }, department: null, companyBudgetPercent: 40, resetDate: '2026-12-01', granted: 0, request: null }))
  expect(view.queryByRole('status')).toBeNull()
  f.set({ ...signedOut, quota: null })
  expect(view.queryByRole('status')).toBeNull()
})

it('offers the quota request from the used-up reminder, or the pending request, in the same dialog', async () => {
  const f = fixture(withQuota(personalOut({ request: null, canRequest: true, blocker: null })))
  const view = render(<QuotaDock {...f.props} />)
  // The dialog is portaled out of the container, which holds only the reminder.
  const dock = (): HTMLElement => view.container.querySelector<HTMLElement>('[data-level]') ?? view.container
  const reminder = dock()
  expect(reminder.textContent).toContain('Your model quota for this month is used up (¥80.00 of ¥80.00). It resets on 12/1; you can ask for more this month.')
  expect(within(reminder).queryByRole('link')).toBeNull()
  fireEvent.click(within(reminder).getByRole('button', { name: en.quotaRequestSubmit }))
  expect(f.operations.refreshQuota).toHaveBeenCalledOnce()
  const dialog = view.getByRole('dialog', { name: en.quotaTitle })
  fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '月底赶项目' } })
  fireEvent.click(within(dialog).getByRole('button', { name: en.quotaRequestSubmit }))
  await waitFor(() => { expect(f.operations.requestQuota).toHaveBeenCalledWith('月底赶项目') })

  f.set(withQuota(personalOut({ request: request(), canRequest: false, blocker: 'pending' })))
  expect(dock().textContent).toContain('your request for more is waiting for approval.')
  fireEvent.click(within(view.getByRole('dialog', { name: en.quotaTitle })).getByRole('button', { name: en.close }))
  expect(view.queryByRole('dialog')).toBeNull()
  fireEvent.click(within(dock()).getByRole('button', { name: en.quotaDockViewRequest }))
  expect(within(view.getByRole('dialog', { name: en.quotaTitle })).getByRole('button', { name: en.quotaRequestWithdraw })).toBeTruthy()

  // A used-up department limit, which a personal request cannot raise, keeps the usage link.
  f.set(withQuota({ ...personalOut({ request: null, canRequest: false, blocker: 'department' }), department: { used: 1000, limit: 1000 } }))
  expect(within(dock()).getByRole('link', { name: en.quotaUsage })).toBeTruthy()
})

it('shows this month\'s quota in the account menu and refreshes it when the menu opens', async () => {
  const f = fixture(withQuota({ user: { used: 12.5, limit: 50 }, department: { used: 300, limit: 1000 }, companyBudgetPercent: null, resetDate: '2026-12-01', granted: 0, request: null }))
  const view = render(<AccountMenu {...f.props} />)
  fireEvent.click(view.getByRole('button', { name: en.menu }))
  expect(f.operations.refreshQuota).toHaveBeenCalledOnce()
  expect(await screen.findByText('This month: ¥12.50 of ¥50.00')).toBeTruthy()
  expect(screen.getByText('Department: ¥300.00 of ¥1,000.00')).toBeTruthy()
  cleanup()
  const unlimited = fixture(withQuota({ user: { used: 3, limit: null }, department: null, companyBudgetPercent: null, resetDate: '2026-12-01', granted: 0, request: null }))
  render(<AccountMenu {...unlimited.props} />)
  fireEvent.click(screen.getByRole('button', { name: en.menu }))
  expect(await screen.findByText('This month: ¥3.00, no limit')).toBeTruthy()
  expect(screen.queryByText(/Department:/)).toBeNull()
})

it('opens help in the browser, sends feedback with retry after a failure, and shows the version and Cloud in About', async () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null)
  const f = fixture(signedIn)
  render(<AccountMenu {...f.props} />)
  const choose = async (label: string) => {
    fireEvent.click(screen.getByRole('button', { name: en.menu }))
    fireEvent.click(await screen.findByRole('menuitem', { name: label }))
  }
  await choose(en.help)
  expect(open).toHaveBeenCalledWith('https://cloud.example.com/help', '_blank', 'noopener,noreferrer')

  await choose(en.feedback)
  const dialog = await screen.findByRole('dialog', { name: en.feedbackTitle })
  const send = within(dialog).getByRole('button', { name: en.feedbackSend })
  expect((send as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(within(dialog).getByRole('textbox', { name: en.feedbackLabel }), { target: { value: '图表颜色看不清' } })
  f.operations.sendFeedback.mockResolvedValueOnce({ ok: false, reason: 'feedbackUnreachable' })
  fireEvent.click(send)
  expect((await within(dialog).findByRole('alert')).textContent).toBe(en.feedbackUnreachable)
  expect(within(dialog).getByRole('textbox', { name: en.feedbackLabel })).toHaveProperty('value', '图表颜色看不清')
  fireEvent.click(within(dialog).getByRole('button', { name: en.feedbackSend }))
  expect((await within(dialog).findByRole('status')).textContent).toBe(en.feedbackSent)
  expect(f.operations.sendFeedback).toHaveBeenLastCalledWith('图表颜色看不清')
  fireEvent.click(within(dialog).getByRole('button', { name: en.feedbackDone }))
  await vi.waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })

  await choose(en.about)
  const about = await screen.findByRole('dialog', { name: en.aboutTitle })
  expect(about.textContent).toContain('Version 0.3.0')
  expect(about.textContent).toContain('星河科技')
  fireEvent.click(within(about).getByRole('button', { name: en.aboutPrivacy }))
  expect(open).toHaveBeenLastCalledWith('https://cloud.example.com/privacy', '_blank', 'noopener,noreferrer')
  // Without a company installer, the download action opens the Mindeck Cloud home page that lists them.
  fireEvent.click(within(about).getByRole('button', { name: en.aboutDownloads }))
  expect(open).toHaveBeenLastCalledWith('https://cloud.example.com/', '_blank', 'noopener,noreferrer')
  expect(about.textContent).not.toContain(en.aboutRecommended)
  open.mockRestore()
})

it('names the recommended version in About and opens the company installer for this computer', async () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null)
  const f = fixture({ ...signedIn, release: { recommendedVersion: '1.8.0', notes: null, downloadUrl: 'https://dl.example.com/mindeck.exe' } })
  render(<AccountMenu {...f.props} />)
  fireEvent.click(screen.getByRole('button', { name: en.menu }))
  fireEvent.click(await screen.findByRole('menuitem', { name: en.about }))
  const about = await screen.findByRole('dialog', { name: en.aboutTitle })
  expect(about.textContent).toContain(`${en.aboutRecommended}1.8.0`)
  fireEvent.click(within(about).getByRole('button', { name: en.aboutDownloads }))
  expect(open).toHaveBeenLastCalledWith('https://dl.example.com/mindeck.exe', '_blank', 'noopener,noreferrer')
  open.mockRestore()
})

it('names the administrator to ask in About when the company offers no installer for this computer, as the update card does', async () => {
  const f = fixture({ ...signedIn, adminContact: '企业微信找周敏', release: { recommendedVersion: '1.8.0', notes: null, downloadUrl: null } })
  render(<AccountMenu {...f.props} />)
  fireEvent.click(screen.getByRole('button', { name: en.menu }))
  fireEvent.click(await screen.findByRole('menuitem', { name: en.about }))
  const about = await screen.findByRole('dialog', { name: en.aboutTitle })
  expect(within(about).getByText('Ask an administrator for the installer for this computer: 企业微信找周敏.')).toBeTruthy()
  expect(within(about).queryByRole('button', { name: en.aboutDownloads })).toBeNull()
  f.set({ ...signedIn, adminContact: null, release: { recommendedVersion: '1.8.0', notes: null, downloadUrl: null } })
  expect(within(about).getByText(en.aboutNoInstallerFallback)).toBeTruthy()
})

it('shows when company data was last synced and syncs on request without a dialog, offline included', async () => {
  const sync = { supported: true, running: false, syncedAt: new Date(2026, 10, 13, 14, 3).getTime(), problem: null } as const
  const f = fixture({ ...signedIn, sync })
  const view = render(<AccountSection {...f.props} />)
  const page = view.getByRole('region', { name: en.nav })
  expect(within(page).getByText(en.sync)).toBeTruthy()
  const time = new Intl.DateTimeFormat('en-US', {
    ...new Date().toDateString() === new Date(sync.syncedAt).toDateString() ? {} : { month: 'numeric', day: 'numeric' },
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(sync.syncedAt)
  expect(within(page).getByText(`Up to date as of ${time}`)).toBeTruthy()
  const gate = Promise.withResolvers<OperationOutcome>()
  f.operations.syncNow.mockReturnValueOnce(gate.promise)
  const button = within(page).getByRole('button', { name: en.syncNow }) as HTMLButtonElement
  fireEvent.click(button)
  expect(f.operations.syncNow).toHaveBeenCalledOnce()
  expect(within(page).getByText(en.syncRunning)).toBeTruthy()
  expect(button.disabled).toBe(true)
  await act(async () => { gate.resolve({ ok: true }); await gate.promise })
  expect(button.disabled).toBe(false)

  f.set({ ...signedIn, sync: { ...sync, running: true } })
  expect(within(page).getByText(en.syncRunning)).toBeTruthy()
  f.set({ ...signedIn, sync: { ...sync, problem: 'unreachable' } })
  expect(within(page).getByText(en.syncUnreachable)).toBeTruthy()
  f.set({ ...signedIn, sync: { ...sync, problem: 'failed' } })
  expect(within(page).getByText(en.syncFailed)).toBeTruthy()
  f.set({ ...signedIn, sync: { ...sync, syncedAt: null } })
  expect(within(page).getByText(en.syncPending)).toBeTruthy()
  expect(screen.queryByRole('dialog')).toBeNull()
  f.set({ ...signedIn, sync: null })
  expect(within(page).queryByText(en.sync)).toBeNull()
})

it('offers only About while signed out without a Cloud address', async () => {
  const f = fixture(signedOut)
  render(<AccountMenu {...f.props} />)
  fireEvent.click(screen.getByRole('button', { name: en.menu }))
  expect(await screen.findByRole('menuitem', { name: en.about })).toBeTruthy()
  expect(screen.queryByRole('menuitem', { name: en.help })).toBeNull()
  expect(screen.queryByRole('menuitem', { name: en.feedback })).toBeNull()
})

it('offers to attach a rated-down answer\'s round, unticked on every opening, and says where other feedback goes', () => {
  const choose = vi.fn<(attach: boolean) => void>()
  // Session runtime hooks are unused by the rows; the renderer supplies them in production.
  const face: Pick<FeedbackOptionsProps, 'choose' | 'submitting'> = { choose, submitting: false }
  const props = { t: makeTranslate(en), ...face } as Omit<FeedbackOptionsProps, 'target'>
  const negative = { kind: 'message' as const, messageId: 'm1' as never, rating: 'negative' as const }
  const view = render(<FeedbackOptions {...props} target={negative} />)
  const box = view.getByRole('checkbox', { name: en.feedbackAttachExcerpt }) as HTMLInputElement
  expect(box.checked).toBe(false)
  expect(view.getByText(en.feedbackAttachNote)).toBeTruthy()
  expect(choose).toHaveBeenLastCalledWith(false)
  fireEvent.click(box)
  expect(box.checked).toBe(true)
  expect(choose).toHaveBeenLastCalledWith(true)
  view.rerender(<FeedbackOptions {...props} target={negative} submitting />)
  expect((view.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true)
  view.unmount()
  const reopened = render(<FeedbackOptions {...props} target={negative} />)
  expect((reopened.getByRole('checkbox') as HTMLInputElement).checked).toBe(false)
  expect(choose).toHaveBeenLastCalledWith(false)
  reopened.rerender(<FeedbackOptions {...props} target={{ kind: 'session' }} />)
  expect(reopened.queryByRole('checkbox')).toBeNull()
  expect(reopened.getByText(en.feedbackReportNote)).toBeTruthy()
  reopened.rerender(<FeedbackOptions {...props} target={{ ...negative, rating: 'positive' }} />)
  expect(reopened.getByText(en.feedbackLikeNote)).toBeTruthy()
})
