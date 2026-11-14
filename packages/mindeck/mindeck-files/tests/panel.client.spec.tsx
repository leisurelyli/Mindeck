// @vitest-environment jsdom
/** The library page follows availability, browses spaces and folders, searches, adds items to the draft, and uploads files. */
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { LibraryAvailability, LibraryEntryView, LibrarySearchView, LibrarySpaceView } from '../src/types.ts'
import { en } from '../src/client/locales.ts'
import type { LibraryResult, LibrarySnapshot } from '../src/client/operations.ts'
import { LibraryPanel, type LibraryPanelProps } from '../src/client/LibraryPanel.tsx'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const spaces: LibrarySpaceView[] = [
  { path: '/Personal', name: 'Personal', kind: 'personal', webUrl: 'https://files.example.com/f/p' },
  { path: '/研发部', name: '研发部', kind: 'project', webUrl: 'https://files.example.com/f/d' },
]
const folder: LibraryEntryView[] = [
  { path: '/研发部/周报', name: '周报', kind: 'folder', writable: true, webUrl: 'https://files.example.com/f/w' },
  { path: '/研发部/规范.md', name: '规范.md', kind: 'file', size: 2048, writable: false, webUrl: 'https://files.example.com/f/s' },
]

function fixture(availability: LibraryAvailability | undefined) {
  const library = createSnapshotStore<LibrarySnapshot>({ availability, failed: false })
  const ok = <T,>(value: T): LibraryResult<T> => ({ ok: true, value })
  const operations = {
    spaces: vi.fn(async () => ok(spaces)),
    list: vi.fn(async (_path: string): Promise<LibraryResult<LibraryEntryView[]>> => ok(folder)),
    search: vi.fn(async (_query: string): Promise<LibraryResult<LibrarySearchView>> => ok({ entries: [folder[1]!], text: false })),
    upload: vi.fn(async (_folder: string, file: File, _overwrite: boolean): Promise<LibraryResult<LibraryEntryView>> =>
      ok({ path: `/研发部/${file.name}`, name: file.name, kind: 'file', writable: true })),
    addToConversation: vi.fn((_entry: LibraryEntryView) => true),
  }
  // Pane runtime hooks are unused by the page; the renderer supplies them in production.
  const props = { t: makeTranslate(en), useLibrary: bindSnapshotSelector(library), ...operations } as LibraryPanelProps
  const set = (next: LibraryAvailability) => { act(() => { library.set({ availability: next, failed: false }) }) }
  return { props, operations, set }
}

it('explains why the library is unavailable and loads the spaces once it is ready', async () => {
  const f = fixture('signed-out')
  const view = render(<LibraryPanel {...f.props} />)
  expect(view.getByRole('status').textContent).toBe(en.signedOut)
  f.set('not-configured')
  expect(view.getByRole('status').textContent).toBe(en.notConfigured)
  expect(f.operations.spaces).not.toHaveBeenCalled()
  f.set('ready')
  expect(await view.findByRole('button', { name: en.personal })).toBeTruthy()
  expect(view.getByRole('button', { name: '研发部' })).toBeTruthy()
})

it('opens a space, adds a file to the draft with a click, keeps the browser one step away, and goes back', async () => {
  const f = fixture('ready')
  const view = render(<LibraryPanel {...f.props} />)
  expect(view.getByText(en.hint)).toBeTruthy()
  fireEvent.click(await view.findByRole('button', { name: '研发部' }))
  await vi.waitFor(() => { expect(f.operations.list).toHaveBeenCalledWith('/研发部') })
  const file = await view.findByRole('button', { name: `${en.addToConversation}: 规范.md` })
  expect(file.textContent).toContain(en.readOnly)
  expect(view.getByRole('link', { name: `${en.openInBrowser}: 规范.md` }).getAttribute('href')).toBe('https://files.example.com/f/s')
  expect(view.getByRole('link', { name: en.openInBrowser }).getAttribute('href')).toBe('https://files.example.com/f/d')
  fireEvent.click(file)
  expect(f.operations.addToConversation).toHaveBeenCalledWith(folder[1])
  expect(view.getAllByRole('status').some(node => node.textContent === en.added)).toBe(true)
  fireEvent.click(view.getByRole('button', { name: `${en.addToConversation}: 周报` }))
  expect(f.operations.addToConversation).toHaveBeenLastCalledWith(folder[0])
  fireEvent.click(view.getByRole('button', { name: '周报' }))
  await vi.waitFor(() => { expect(f.operations.list).toHaveBeenLastCalledWith('/研发部/周报') })
  const crumbs = within(view.getByRole('navigation', { name: en.title }))
  expect(crumbs.getByRole('button', { name: '周报' }).getAttribute('aria-current')).toBe('page')
  fireEvent.click(view.getByRole('button', { name: en.back }))
  await vi.waitFor(() => { expect(f.operations.list).toHaveBeenLastCalledWith('/研发部') })
  fireEvent.click(crumbs.getByRole('button', { name: en.root }))
  expect(await view.findByRole('button', { name: en.personal })).toBeTruthy()
})

it('searches after typing pauses and offers a retry after a failure', async () => {
  const f = fixture('ready')
  f.operations.list.mockResolvedValueOnce({ ok: false, reason: 'unavailable' })
  const view = render(<LibraryPanel {...f.props} />)
  fireEvent.click(await view.findByRole('button', { name: '研发部' }))
  expect((await view.findByRole('alert')).textContent).toContain(en.unavailable)
  fireEvent.click(view.getByRole('button', { name: en.retry }))
  expect(await view.findByRole('button', { name: `${en.addToConversation}: 规范.md` })).toBeTruthy()
  fireEvent.change(view.getByRole('searchbox', { name: en.searchPlaceholder }), { target: { value: '规范' } })
  expect(f.operations.search).not.toHaveBeenCalled()
  await vi.waitFor(() => { expect(f.operations.search).toHaveBeenCalledWith('规范') })
  const result = await view.findByRole('button', { name: `${en.addToConversation}: 规范.md` })
  expect(result.textContent).toContain('研发部')
  expect(view.queryByRole('button', { name: en.upload })).toBeNull()

  // A text match shows its passage; an empty search says what the library searched.
  f.operations.search.mockResolvedValueOnce({ ok: true, value: { text: true, entries: [{
    ...folder[1]!, passage: [{ text: '接口', match: true }, { text: '命名用小驼峰', match: false }],
  }] } })
  fireEvent.change(view.getByRole('searchbox', { name: en.searchPlaceholder }), { target: { value: '接口' } })
  const passage = await view.findByText('命名用小驼峰')
  expect(passage.querySelector('mark')?.textContent).toBe('接口')
  f.operations.search.mockResolvedValueOnce({ ok: true, value: { text: false, entries: [] } })
  fireEvent.change(view.getByRole('searchbox', { name: en.searchPlaceholder }), { target: { value: '年假' } })
  expect(await view.findByText(en.noResults)).toBeTruthy()
  expect(view.getByText(en.namesOnlyHint)).toBeTruthy()
  f.operations.search.mockResolvedValueOnce({ ok: true, value: { text: true, entries: [] } })
  fireEvent.change(view.getByRole('searchbox', { name: en.searchPlaceholder }), { target: { value: '年假制度' } })
  expect(await view.findByText(en.noTextResultsHint)).toBeTruthy()
})

it('uploads picked and dropped files into the open folder, offers to replace same-named files, and explains a failure', async () => {
  const f = fixture('ready')
  const view = render(<LibraryPanel {...f.props} />)
  expect(view.queryByRole('button', { name: en.upload })).toBeNull()
  fireEvent.click(await view.findByRole('button', { name: '研发部' }))
  await view.findByRole('button', { name: `${en.addToConversation}: 规范.md` })
  const picker = view.container.querySelector('input[type=file]')
  if (!(picker instanceof HTMLInputElement)) throw new Error('Expected the file picker')
  const click = vi.spyOn(picker, 'click')
  fireEvent.click(view.getByRole('button', { name: en.upload }))
  expect(click).toHaveBeenCalledOnce()
  const notes = new File(['n'], 'notes.md')
  fireEvent.change(picker, { target: { files: [notes] } })
  await vi.waitFor(() => { expect(view.getAllByRole('status').some(node => node.textContent === 'Files uploaded: 1')).toBe(true) })
  expect(f.operations.upload).toHaveBeenCalledWith('/研发部', notes, false)
  await vi.waitFor(() => { expect(f.operations.list).toHaveBeenCalledTimes(2) })

  // A dropped file whose name is taken waits until the member replaces it.
  f.operations.upload.mockResolvedValueOnce({ ok: false, reason: 'exists' })
  const page = view.container.firstElementChild
  if (page === null) throw new Error('Expected the page')
  const report = new File(['r'], 'report.md')
  const transfer = { types: ['Files'], files: [report], dropEffect: 'none' }
  fireEvent.dragEnter(page, { dataTransfer: transfer })
  expect(view.getByText('Drop to upload to 研发部')).toBeTruthy()
  fireEvent.drop(page, { dataTransfer: transfer })
  expect(view.queryByText('Drop to upload to 研发部')).toBeNull()
  const conflict = await view.findByRole('alert')
  expect(conflict.textContent).toContain('Files not uploaded because the name is taken: 1')
  fireEvent.click(within(conflict).getByRole('button', { name: en.replaceAll }))
  await vi.waitFor(() => { expect(f.operations.upload).toHaveBeenLastCalledWith('/研发部', report, true) })
  await vi.waitFor(() => { expect(view.queryByRole('alert')).toBeNull() })

  f.operations.upload.mockResolvedValueOnce({ ok: false, reason: 'tooLarge' })
  fireEvent.change(picker, { target: { files: [new File(['b'], 'big.bin'), new File(['c'], 'after.md')] } })
  const failure = await view.findByRole('alert')
  expect(failure.textContent).toContain(`big.bin was not uploaded. ${en.tooLarge}`)
  expect(f.operations.upload).not.toHaveBeenCalledWith('/研发部', expect.objectContaining({ name: 'after.md' }), false)
  fireEvent.click(within(failure).getByRole('button', { name: en.dismiss }))
  expect(view.queryByRole('alert')).toBeNull()
})
