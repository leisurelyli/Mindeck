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
  const f = fixture({ ...signedIn, quota: { user: { used: 1234.5, limit: 2000 }, department: { used: 300, limit: 10_000 }, companyBudgetPercent: null, resetDate: '2026-12-01' } })
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
    user: { used: 50, limit: 50 }, department: null, companyBudgetPercent: null, resetDate: '2026-12-01',
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
    user: { used: 50, limit: 50 }, department: null, companyBudgetPercent: 100, resetDate: '2026-12-01',
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

it('reminds from 75% of the limit that runs out first, again from 95% and when used up, until dismissed', () => {
  const f = fixture(withQuota({ user: { used: 30, limit: 50 }, department: null, companyBudgetPercent: null, resetDate: '2026-12-01' }))
  const view = render(<QuotaDock {...f.props} />)
  expect(view.container.textContent).toBe('')

  f.set(withQuota({ user: { used: 40, limit: 50 }, department: { used: 100, limit: 1000 }, companyBudgetPercent: null, resetDate: '2026-12-01' }))
  const reminder = view.getByRole('status')
  expect(reminder.textContent).toContain('You have used 80% of your model quota this month (¥40.00 of ¥50.00). It resets on 12/1.')
  expect(reminder.getAttribute('data-level')).toBe('warning')
  expect(within(reminder).getByRole('link', { name: en.quotaUsage }).getAttribute('href')).toBe('https://cloud.example.com/usage')
  fireEvent.click(within(reminder).getByRole('button', { name: en.quotaDockDismiss }))
  expect(f.operations.dismissReminder).toHaveBeenCalledWith('2026-12-01:user:warning')
  expect(view.queryByRole('status')).toBeNull()

  f.set(withQuota({ user: { used: 48, limit: 50 }, department: null, companyBudgetPercent: null, resetDate: '2026-12-01' }))
  expect(view.getByRole('status').getAttribute('data-level')).toBe('urgent')
  f.set(withQuota({ user: { used: 1, limit: null }, department: { used: 1000, limit: 1000 }, companyBudgetPercent: null, resetDate: '2026-12-01' }))
  expect(view.getByRole('status').textContent).toContain('Your department\'s model quota for this month is used up (¥1,000.00 of ¥1,000.00).')
  f.set(withQuota({ user: { used: 0, limit: 0 }, department: null, companyBudgetPercent: null, resetDate: '2026-12-01' }))
  expect(view.getByRole('status').getAttribute('data-level')).toBe('out')
  f.set(withQuota({ user: { used: 99, limit: null }, department: null, companyBudgetPercent: null, resetDate: '2026-12-01' }))
  expect(view.queryByRole('status')).toBeNull()
  f.set(withQuota({ user: { used: 10, limit: 50 }, department: null, companyBudgetPercent: 96, resetDate: '2026-12-01' }))
  expect(view.getByRole('status').textContent).toContain('Your company has used 96% of this month\'s model budget.')
  expect(view.getByRole('status').getAttribute('data-level')).toBe('urgent')
  f.set(withQuota({ user: { used: 10, limit: 50 }, department: null, companyBudgetPercent: 40, resetDate: '2026-12-01' }))
  expect(view.queryByRole('status')).toBeNull()
  f.set({ ...signedOut, quota: null })
  expect(view.queryByRole('status')).toBeNull()
})

it('shows this month\'s quota in the account menu and refreshes it when the menu opens', async () => {
  const f = fixture(withQuota({ user: { used: 12.5, limit: 50 }, department: { used: 300, limit: 1000 }, companyBudgetPercent: null, resetDate: '2026-12-01' }))
  const view = render(<AccountMenu {...f.props} />)
  fireEvent.click(view.getByRole('button', { name: en.menu }))
  expect(f.operations.refreshQuota).toHaveBeenCalledOnce()
  expect(await screen.findByText('This month: ¥12.50 of ¥50.00')).toBeTruthy()
  expect(screen.getByText('Department: ¥300.00 of ¥1,000.00')).toBeTruthy()
  cleanup()
  const unlimited = fixture(withQuota({ user: { used: 3, limit: null }, department: null, companyBudgetPercent: null, resetDate: '2026-12-01' }))
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
