// @vitest-environment jsdom
/**
 * The company messages page: loading, empty, and failed states, the list newest first with a distinct announcement
 * icon, opening an item to read it, marking everything read, older pages, and the recommended version.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { MindeckInboxItem, MindeckInboxPage, MindeckInboxSummary } from '../src/types.ts'
import { en, zh } from '../src/client/locales.ts'
import type { MindeckInboxPageSnapshot, MindeckInboxSummarySnapshot } from '../src/client/operations.ts'
import { InboxPage, type InboxPageProps } from '../src/client/InboxPage.tsx'
import { UnreadBadge, type UnreadBadgeProps } from '../src/client/PanelIcon.tsx'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const ANNOUNCEMENT: MindeckInboxItem = {
  type: 'announcement', id: 'a1', kind: 'announcement', level: 'important', title: '十一月报销截止提醒',
  body: '本月报销请于 11 月 20 日前提交，制度见 https://wiki.example.com/expense。', link: 'https://cloud.example.com/announcements/a1',
  createdAt: '2026-11-13T00:20:00.000Z', readAt: null,
}
const APPROVED: MindeckInboxItem = {
  type: 'notification', id: 'n1', kind: 'quota-request.approved', level: 'info', title: '提额申请已批准',
  body: '本月可用额度增加 ¥50，审批人张伟。', link: null, createdAt: '2026-11-12T06:00:00.000Z', readAt: '2026-11-12T07:00:00.000Z',
}

function fixture(options: { summary?: MindeckInboxSummary; page?: MindeckInboxPage; appVersion?: string } = {}) {
  const summary = createSnapshotStore<MindeckInboxSummarySnapshot>({
    summary: options.summary ?? { available: true, unread: 1, release: null },
  })
  const page = createSnapshotStore<MindeckInboxPageSnapshot>({ page: options.page, failed: false })
  const stop = vi.fn()
  const operations = {
    follow: vi.fn(() => stop), reload: vi.fn(), loadMore: vi.fn(), markRead: vi.fn(),
    appVersion: options.appVersion ?? '0.2.2-rc.1',
  }
  // Main-panel runtime hooks are unused by the page; the renderer supplies them in production.
  const props = {
    t: makeTranslate(zh), useSummary: bindSnapshotSelector(summary), usePage: bindSnapshotSelector(page), ...operations,
  } as InboxPageProps
  const setPage = (next: MindeckInboxPageSnapshot) => { act(() => { page.set(next) }) }
  const setSummary = (next: MindeckInboxSummary) => { act(() => { summary.set({ summary: next }) }) }
  return { props, operations, stop, setPage, setSummary }
}

const loaded = (items: MindeckInboxItem[], extra: Partial<MindeckInboxPage> = {}): MindeckInboxPageSnapshot =>
  ({ page: { items, more: false, loading: null, failure: null, ...extra }, failed: false })

it('follows the items while it shows and moves from loading to empty, offline, and failed states', () => {
  const f = fixture()
  const view = render(<InboxPage {...f.props} />)
  expect(f.operations.follow).toHaveBeenCalledOnce()
  expect(view.getByRole('heading', { level: 1, name: zh.title })).toBeTruthy()
  expect(view.getByRole('status', { name: zh.loading }).getAttribute('aria-busy')).toBe('true')

  f.setPage(loaded([]))
  expect(view.getByRole('status').textContent).toBe(`${zh.emptyTitle}${zh.emptyHint}`)
  expect(view.queryByRole('button', { name: zh.markAllRead })).toBeNull()

  f.setPage({ page: { items: null, more: false, loading: null, failure: { reason: 'unreachable', requestId: null } }, failed: false })
  expect(view.getByRole('status').textContent).toBe(`${zh.unreachableTitle}${zh.unreachableHint}${zh.retry}`)
  fireEvent.click(view.getByRole('button', { name: zh.retry }))
  expect(f.operations.reload).toHaveBeenCalledOnce()

  // A retry in progress shows the loading rows again.
  f.setPage({ page: { items: null, more: false, loading: 'first', failure: { reason: 'failed', requestId: 'req-9' } }, failed: false })
  expect(view.getByRole('status', { name: zh.loading })).toBeTruthy()
  f.setPage({ page: { items: null, more: false, loading: null, failure: { reason: 'failed', requestId: 'req-9' } }, failed: false })
  expect(view.getByText('请求编号：req-9')).toBeTruthy()
  f.setPage({ page: undefined, failed: true })
  expect(view.getByText(zh.failedTitle)).toBeTruthy()

  view.unmount()
  expect(f.stop).toHaveBeenCalledOnce()
})

it('lists announcements and notices newest first with their own icons, kinds, and times', () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  // Times are worded in this computer's time zone.
  vi.setSystemTime(new Date(2026, 10, 13, 12, 0))
  const today = { ...ANNOUNCEMENT, createdAt: new Date(2026, 10, 13, 8, 20).toISOString() }
  const yesterday = { ...APPROVED, createdAt: new Date(2026, 10, 12, 14, 5).toISOString() }
  const older = { ...APPROVED, id: 'n2', kind: 'feedback.replied', createdAt: new Date(2026, 9, 2, 9, 0).toISOString() }
  const lastYear = { ...APPROVED, id: 'n3', kind: 'offboarding.handover', createdAt: new Date(2025, 11, 30, 9, 0).toISOString() }
  const unknown = { ...APPROVED, id: 'n4', kind: 'survey.sent', createdAt: 'soon' }
  const f = fixture()
  const view = render(<InboxPage {...f.props} />)
  f.setPage(loaded([today, yesterday, older, lastYear, unknown], { more: true }))
  const rows = view.getAllByRole('listitem')
  expect(rows).toHaveLength(5)
  const [announcement, approved] = rows as [HTMLElement, HTMLElement]
  expect(announcement.querySelector('[data-family]')?.getAttribute('data-family')).toBe('announcement')
  expect(approved.querySelector('[data-family]')?.getAttribute('data-family')).toBe('quota')
  expect(within(announcement).getByText(zh.important)).toBeTruthy()
  expect(within(announcement).getByText(zh.unread)).toBeTruthy()
  expect(within(approved).queryByText(zh.unread)).toBeNull()
  expect(within(announcement).getByText('公告 · 今天 08:20')).toBeTruthy()
  expect(within(approved).getByText('提额申请 · 昨天 14:05')).toBeTruthy()
  expect(within(rows[2] as HTMLElement).getByText('反馈 · 10 月 2 日')).toBeTruthy()
  expect(within(rows[3] as HTMLElement).getByText('交接 · 2025 年 12 月 30 日')).toBeTruthy()
  expect(within(rows[4] as HTMLElement).getByText('通知 · soon')).toBeTruthy()
  expect(rows[4]?.querySelector('[data-family]')?.getAttribute('data-family')).toBe('other')

  fireEvent.click(view.getByRole('button', { name: zh.loadMore }))
  expect(f.operations.loadMore).toHaveBeenCalledOnce()
  f.setPage(loaded([today], { more: true, loading: 'more' }))
  expect((view.getByRole('button', { name: zh.loadingMore }) as HTMLButtonElement).disabled).toBe(true)
})

it('opens an item to show its whole text and links, marks an unread one read, and marks everything read', () => {
  const f = fixture()
  const view = render(<InboxPage {...f.props} />)
  f.setPage(loaded([ANNOUNCEMENT, APPROVED]))
  const [announcement, approved] = view.getAllByRole('listitem') as [HTMLElement, HTMLElement]
  const toggle = within(announcement).getAllByRole('button')[0] as HTMLButtonElement
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(toggle)
  expect(toggle.getAttribute('aria-expanded')).toBe('true')
  expect(f.operations.markRead).toHaveBeenCalledExactlyOnceWith({ items: [{ type: 'announcement', id: 'a1' }] })
  const detail = document.getElementById(toggle.getAttribute('aria-controls') ?? '')
  expect(detail?.querySelector('a[href="https://wiki.example.com/expense"]')?.textContent).toBe('https://wiki.example.com/expense')
  expect(within(detail as HTMLElement).getByRole('link', { name: zh.openLink }).getAttribute('href')).toBe(ANNOUNCEMENT.link)
  fireEvent.click(toggle)
  expect(toggle.getAttribute('aria-expanded')).toBe('false')

  // A read item opens without another read report.
  fireEvent.click(within(approved).getAllByRole('button')[0] as HTMLButtonElement)
  expect(f.operations.markRead).toHaveBeenCalledOnce()

  fireEvent.click(view.getByRole('button', { name: zh.markAllRead }))
  expect(f.operations.markRead).toHaveBeenLastCalledWith({ all: true })
})

it('keeps the loaded items under a compact notice when a refresh fails', () => {
  const f = fixture()
  const view = render(<InboxPage {...f.props} />)
  f.setPage(loaded([APPROVED], { failure: { reason: 'unreachable', requestId: null } }))
  expect(view.getByRole('status').textContent).toBe(`${zh.staleUnreachable}${zh.retry}`)
  expect(view.getAllByRole('listitem')).toHaveLength(1)
  f.setPage(loaded([APPROVED], { failure: { reason: 'failed', requestId: 'req-3' } }))
  expect(view.getByRole('status').textContent).toBe(`${zh.staleFailed}请求编号：req-3${zh.retry}`)
  fireEvent.click(view.getByRole('button', { name: zh.retry }))
  expect(f.operations.reload).toHaveBeenCalledOnce()
})

it('offers the recommended version only to an older build, with the installer for this computer when there is one', () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null)
  const release = { recommendedVersion: '1.8.0', notes: '修复了资源库搜索。', downloadUrl: 'https://dl.example.com/mindeck.dmg' }
  const f = fixture({ summary: { available: true, unread: 0, release }, page: { items: [], more: false, loading: null, failure: null } })
  const view = render(<InboxPage {...f.props} />)
  const card = view.getByRole('region', { name: 'Mindeck 1.8.0 已发布' })
  expect(within(card).getByText('企业推荐使用这个版本，你现在用的是 0.2.2-rc.1。')).toBeTruthy()
  expect(within(card).getByText(release.notes)).toBeTruthy()
  fireEvent.click(within(card).getByRole('button', { name: '下载 1.8.0' }))
  expect(open).toHaveBeenCalledWith(release.downloadUrl, '_blank', 'noopener,noreferrer')

  f.setSummary({ available: true, unread: 0, release: { ...release, notes: null, downloadUrl: null } })
  expect(within(view.getByRole('region', { name: 'Mindeck 1.8.0 已发布' })).getByText(zh.versionNoDownload)).toBeTruthy()
  f.setSummary({ available: true, unread: 0, release: { ...release, recommendedVersion: '0.2.2-rc.1' } })
  expect(view.queryByRole('region', { name: /已发布/ })).toBeNull()
  f.setSummary({ available: true, unread: 0, release: { ...release, recommendedVersion: null } })
  expect(view.queryByRole('region', { name: /已发布/ })).toBeNull()
  cleanup()

  // A build without release metadata never shows it.
  render(<InboxPage {...fixture({ summary: { available: true, unread: 0, release }, appVersion: '' }).props} />)
  expect(document.querySelector('section section')).toBeNull()
  open.mockRestore()
})

it('counts unread items in the sidebar badge and speaks the count with its unit', () => {
  const summary = createSnapshotStore<MindeckInboxSummarySnapshot>({ summary: { available: true, unread: 0, release: null } })
  const props = { t: makeTranslate(en), useSummary: bindSnapshotSelector(summary), wide: true, active: false } as UnreadBadgeProps
  const view = render(<span data-testid="badge"><UnreadBadge {...props} /></span>)
  expect(view.getByTestId('badge').textContent).toBe('')
  act(() => { summary.set({ summary: { available: true, unread: 3, release: null } }) })
  expect(view.getByTestId('badge').textContent).toBe('33 unread')
  act(() => { summary.set({ summary: { available: true, unread: 120, release: null } }) })
  expect(view.getByTestId('badge').textContent).toBe('99+120 unread')
})
