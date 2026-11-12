// @vitest-environment jsdom
/** The library page follows availability, browses spaces and folders, searches, and adds items to the draft. */
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { LibraryAvailability, LibraryEntryView, LibrarySpaceView } from '../src/types.ts'
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
    search: vi.fn(async (_query: string) => ok([folder[1]!])),
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

it('opens a space, shows read-only files, adds an item to the draft, and goes back', async () => {
  const f = fixture('ready')
  const view = render(<LibraryPanel {...f.props} />)
  fireEvent.click(await view.findByRole('button', { name: '研发部' }))
  await vi.waitFor(() => { expect(f.operations.list).toHaveBeenCalledWith('/研发部') })
  const file = await view.findByRole('link', { name: /规范\.md/ })
  expect(file.getAttribute('href')).toBe('https://files.example.com/f/s')
  expect(file.textContent).toContain(en.readOnly)
  expect(view.getByRole('link', { name: en.openInBrowser }).getAttribute('href')).toBe('https://files.example.com/f/d')
  fireEvent.click(view.getByRole('button', { name: `${en.addToConversation}: 规范.md` }))
  expect(f.operations.addToConversation).toHaveBeenCalledWith(folder[1])
  expect(view.getAllByRole('status').some(node => node.textContent === en.added)).toBe(true)
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
  expect(await view.findByRole('link', { name: /规范\.md/ })).toBeTruthy()
  fireEvent.change(view.getByRole('searchbox', { name: en.searchPlaceholder }), { target: { value: '规范' } })
  expect(f.operations.search).not.toHaveBeenCalled()
  await vi.waitFor(() => { expect(f.operations.search).toHaveBeenCalledWith('规范') })
  const result = await view.findByRole('link', { name: /规范\.md/ })
  expect(result.textContent).toContain('研发部')
})
