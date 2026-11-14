// @vitest-environment jsdom
/** The library page explains an unavailable library, browses spaces beside the open folder, searches, uploads, and starts conversations. */
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { LibraryAvailability, LibraryEntryView, LibrarySearchView, LibrarySpaceView } from '../src/types.ts'
import { zh } from '../src/client/locales.ts'
import type { LibraryResult, LibrarySnapshot } from '../src/client/operations.ts'
import { LibraryPage, type LibraryPageProps } from '../src/client/LibraryPage.tsx'

afterEach(() => { cleanup() })

const spaces: LibrarySpaceView[] = [
  { path: '/Personal', name: 'Personal', kind: 'personal', webUrl: 'https://files.example.com/f/p' },
  { path: '/研发部', name: '研发部', kind: 'project', webUrl: 'https://files.example.com/f/d' },
  { path: '/Shared with me', name: 'Shared with me', kind: 'shares', webUrl: 'https://files.example.com/f/s' },
]
const folders: Record<string, LibraryEntryView[]> = {
  '/Personal': [],
  '/研发部': [
    { path: '/研发部/周报', name: '周报', kind: 'folder', writable: false, webUrl: 'https://files.example.com/f/w' },
    { path: '/研发部/规范.md', name: '规范.md', kind: 'file', size: 2048, modified: '2026-11-02T08:00:00Z', writable: true, webUrl: 'https://files.example.com/f/g' },
  ],
  '/研发部/周报': [],
  '/Shared with me': [{ path: '/Shared with me/预算.xlsx', name: '预算.xlsx', kind: 'file', size: 512, writable: false }],
}

function fixture(availability: LibraryAvailability | undefined) {
  const library = createSnapshotStore<LibrarySnapshot>({ availability, failed: false })
  const ok = <T,>(value: T): LibraryResult<T> => ({ ok: true, value })
  const operations = {
    spaces: vi.fn(async () => ok(spaces)),
    list: vi.fn(async (path: string): Promise<LibraryResult<LibraryEntryView[]>> => ok(folders[path] ?? [])),
    search: vi.fn(async (_query: string): Promise<LibraryResult<LibrarySearchView>> => ok({ entries: [folders['/研发部']![1]!], text: false })),
    upload: vi.fn(async (_folder: string, file: File, _overwrite: boolean): Promise<LibraryResult<LibraryEntryView>> =>
      ok({ path: `/研发部/${file.name}`, name: file.name, kind: 'file', writable: true })),
    startWith: vi.fn(async (_entry: Pick<LibraryEntryView, 'path' | 'name' | 'kind'>) => {}),
  }
  // Main-panel runtime hooks are unused by the page; the renderer supplies them in production.
  const props = { t: makeTranslate(zh), useLibrary: bindSnapshotSelector(library), ...operations } as LibraryPageProps
  const set = (next: LibrarySnapshot) => { act(() => { library.set(next) }) }
  return { props, operations, set }
}

it('explains an unavailable library and opens the member\'s own space once it is ready', async () => {
  const f = fixture('not-configured')
  const view = render(<LibraryPage {...f.props} />)
  expect(view.getByRole('status').textContent).toBe(`${zh.notConfigured}${zh.notConfiguredHint}`)
  f.set({ availability: undefined, failed: true })
  expect(view.getByRole('status').textContent).toBe(zh.unavailable)
  f.set({ availability: 'ready', failed: false })
  const nav = within(view.getByRole('navigation', { name: zh.spaces }))
  expect((await nav.findAllByRole('button')).map(button => button.textContent)).toEqual([zh.personal, '研发部', zh.shares])
  await vi.waitFor(() => { expect(f.operations.list).toHaveBeenCalledWith('/Personal') })
  expect(nav.getByRole('button', { name: zh.personal }).getAttribute('aria-current')).toBe('page')
  expect(await view.findByText(zh.empty)).toBeTruthy()
  expect(view.getByText(zh.emptyHint)).toBeTruthy()
})

it('opens folders from the list and the breadcrumb, links files to the browser, and starts conversations with an item', async () => {
  const f = fixture('ready')
  const view = render(<LibraryPage {...f.props} />)
  fireEvent.click(await within(view.getByRole('navigation', { name: zh.spaces })).findByRole('button', { name: '研发部' }))
  const file = await view.findByRole('link', { name: '规范.md' })
  expect(file.getAttribute('href')).toBe('https://files.example.com/f/g')
  expect(view.getByRole('link', { name: zh.openInBrowser }).getAttribute('href')).toBe('https://files.example.com/f/d')
  fireEvent.click(view.getByRole('button', { name: '在新对话中使用“规范.md”' }))
  expect(f.operations.startWith).toHaveBeenCalledWith(folders['/研发部']![1])

  await act(async () => { fireEvent.click(view.getByRole('button', { name: '周报' })) })
  await vi.waitFor(() => { expect(f.operations.list).toHaveBeenLastCalledWith('/研发部/周报') })
  // The folder the list marked read-only takes no uploads.
  expect(view.getByText(zh.readOnly)).toBeTruthy()
  expect(view.getByRole('button', { name: zh.upload })).toHaveProperty('disabled', true)
  expect(await view.findByText(zh.empty)).toBeTruthy()
  expect(view.queryByText(zh.emptyHint)).toBeNull()
  const crumbs = within(view.getByRole('navigation', { name: zh.title }))
  expect(crumbs.getByRole('button', { name: '周报' }).getAttribute('aria-current')).toBe('page')
  fireEvent.click(crumbs.getByRole('button', { name: '研发部' }))
  await vi.waitFor(() => { expect(f.operations.list).toHaveBeenLastCalledWith('/研发部') })

  fireEvent.click(within(view.getByRole('navigation', { name: zh.spaces })).getByRole('button', { name: zh.shares }))
  expect(await view.findByText('预算.xlsx')).toBeTruthy()
  expect(view.getByRole('button', { name: zh.upload })).toHaveProperty('disabled', true)
})

it('searches every space, names where each result is, and returns to the folder when the search clears', async () => {
  const f = fixture('ready')
  const view = render(<LibraryPage {...f.props} />)
  await vi.waitFor(() => { expect(f.operations.list).toHaveBeenCalledWith('/Personal') })
  fireEvent.change(view.getByRole('searchbox', { name: zh.searchAllPlaceholder }), { target: { value: '规范' } })
  await vi.waitFor(() => { expect(f.operations.search).toHaveBeenCalledWith('规范') })
  expect(await view.findByRole('heading', { name: '“规范”的搜索结果' })).toBeTruthy()
  expect(view.getByRole('list', { name: '“规范”的搜索结果' }).textContent).toContain('研发部')
  expect(view.queryByRole('button', { name: zh.upload })).toBeNull()
  fireEvent.click(view.getByRole('button', { name: zh.clearSearch }))
  expect(await view.findByText(zh.empty)).toBeTruthy()
})

it('shows the passage of a text match and explains an empty search by what the library searches', async () => {
  const f = fixture('ready')
  f.operations.search.mockResolvedValueOnce({ ok: true, value: { text: true, entries: [{
    path: '/研发部/差旅费用管理办法.docx', name: '差旅费用管理办法.docx', kind: 'file', size: 4096, writable: false,
    passage: [{ text: '出差人员的', match: false }, { text: '住宿', match: true }, { text: '费实行限额', match: false }, { text: '标准', match: true }],
  }] } })
  const view = render(<LibraryPage {...f.props} />)
  await vi.waitFor(() => { expect(f.operations.list).toHaveBeenCalledWith('/Personal') })
  const search = view.getByRole('searchbox', { name: zh.searchAllPlaceholder })
  fireEvent.change(search, { target: { value: '住宿标准' } })
  const row = (await view.findByText('差旅费用管理办法.docx')).closest('li')
  if (row === null) throw new Error('Expected the result row')
  expect(row.hasAttribute('data-passage')).toBe(true)
  expect(row.textContent).toContain('出差人员的住宿费实行限额标准')
  expect([...row.querySelectorAll('mark')].map(mark => mark.textContent)).toEqual(['住宿', '标准'])

  f.operations.search.mockResolvedValueOnce({ ok: true, value: { text: true, entries: [] } })
  fireEvent.change(search, { target: { value: '年假' } })
  expect(await view.findByText(zh.noTextResults)).toBeTruthy()
  expect(view.getByText(zh.noTextResultsHint)).toBeTruthy()

  f.operations.search.mockResolvedValueOnce({ ok: true, value: { text: false, entries: [] } })
  fireEvent.change(search, { target: { value: '住宿' } })
  expect(await view.findByText(zh.noResults)).toBeTruthy()
  expect(view.getByText(zh.namesOnlyHint)).toBeTruthy()
})

it('offers a retry after a failed read, and uploads picked and dropped files into the open folder', async () => {
  const f = fixture('ready')
  f.operations.list.mockResolvedValueOnce({ ok: false, reason: 'unavailable' })
  const view = render(<LibraryPage {...f.props} />)
  expect((await view.findByRole('alert')).textContent).toContain(zh.unavailable)
  fireEvent.click(view.getByRole('button', { name: zh.retry }))
  expect(await view.findByText(zh.empty)).toBeTruthy()

  fireEvent.click(within(view.getByRole('navigation', { name: zh.spaces })).getByRole('button', { name: '研发部' }))
  await view.findByRole('link', { name: '规范.md' })
  const picker = view.container.querySelector('input[type=file]')
  if (!(picker instanceof HTMLInputElement)) throw new Error('Expected the file picker')
  const click = vi.spyOn(picker, 'click')
  fireEvent.click(view.getByRole('button', { name: zh.upload }))
  expect(click).toHaveBeenCalledOnce()
  const notes = new File(['n'], 'notes.md')
  fireEvent.change(picker, { target: { files: [notes] } })
  await vi.waitFor(() => { expect(view.getAllByRole('status').some(node => node.textContent === '已上传 1 个文件')).toBe(true) })
  expect(f.operations.upload).toHaveBeenCalledWith('/研发部', notes, false)

  f.operations.upload.mockResolvedValueOnce({ ok: false, reason: 'exists' })
  const list = view.getByRole('list', { name: '研发部' })
  const browser = list.closest('[class*="browser"]')
  if (browser === null) throw new Error('Expected the folder card')
  const report = new File(['r'], 'report.md')
  const transfer = { types: ['Files'], files: [report], dropEffect: 'none' }
  fireEvent.dragEnter(browser, { dataTransfer: transfer })
  expect(view.getByText('松开即可上传到“研发部”')).toBeTruthy()
  fireEvent.drop(browser, { dataTransfer: transfer })
  const conflict = await view.findByRole('alert')
  expect(conflict.textContent).toContain('有 1 个同名文件未上传')
  fireEvent.click(within(conflict).getByRole('button', { name: zh.replaceAll }))
  await vi.waitFor(() => { expect(f.operations.upload).toHaveBeenLastCalledWith('/研发部', report, true) })
  await vi.waitFor(() => { expect(view.queryByRole('alert')).toBeNull() })
})
