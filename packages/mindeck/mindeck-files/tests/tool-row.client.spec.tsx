// @vitest-environment jsdom
/** File-library calls read as what the agent did and where, in the member's words, without the result's local paths. */
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { StartedToolCall, ToolResultNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ToolCallOwnerProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { PartialArguments } from '@deepseek-ai/dsh-util-values'
import { libraryLabel } from '../src/client/labels.ts'
import { zh } from '../src/client/locales.ts'
import { librarySummary, LibraryToolRow, type LibraryToolRowProps } from '../src/client/LibraryToolRow.tsx'

const t = makeTranslate(zh)
afterEach(cleanup)

function settled(name: string, argsRaw: string, over: Partial<ToolResultNode> = {}): ToolResultNode {
  return {
    kind: 'tool-result', seq: 3, time: 3_000, callId: 'call-1', name, args: PartialArguments.fromText(argsRaw),
    call: { name, argsRaw }, callTime: 2_000,
    content: [{ type: 'text', text: 'Downloaded /研发部/规范.md (2 KB) to C:\\Users\\lin\\.dsh\\mindeck\\library-downloads\\s1\\规范.md.' }],
    isError: false, subCalls: [], ...over,
  }
}

function props(toolName: string, block: LibraryToolRowProps['block']): LibraryToolRowProps {
  const owner: ToolCallOwnerProps = {
    callId: block.callId, toolName,
    ...('kind' in block ? { phase: 'result' as const, block }
      : block.phase === 'preparing' ? { phase: 'preparing' as const, block } : { phase: 'start' as const, block }),
    useDisclosure: () => ({ expanded: false, setExpanded: vi.fn(), toggle: vi.fn() }),
    loadImage: vi.fn<ToolCallOwnerProps['loadImage']>(),
    openFile: vi.fn(),
  }
  return { ...owner, t } as LibraryToolRowProps
}

it('names library places in the member\'s words', () => {
  expect(libraryLabel('/Personal/报告/周报.md', t)).toEqual({ name: '周报.md', location: '我的文件 / 报告' })
  expect(libraryLabel('/Shared with me/', t)).toEqual({ name: '共享给我', location: '' })
  expect(librarySummary('library_list', {}, t)).toBe('全部空间')
  expect(librarySummary('library_list', { path: 'library:"/研发部/周报/"' }, t)).toBe('研发部 / 周报')
  expect(librarySummary('library_search', { query: '报销' }, t)).toBe('“报销”')
  expect(librarySummary('library_search', {}, t)).toBe('')
  expect(librarySummary('library_download', { path: '/Personal/a.md' }, t)).toBe('我的文件 / a.md')
  expect(librarySummary('library_upload', { from: 'out\\summary.md', to: '/研发部/周报/' }, t)).toBe('研发部 / 周报 / summary.md')
  expect(librarySummary('library_upload', { from: 'a.md', to: '/研发部/b.md' }, t)).toBe('研发部 / b.md')
  expect(librarySummary('library_upload', { from: 'a.md' }, t)).toBe('')
})

it('shows the title while preparing, the place while running and after, and tags failures without the result text', () => {
  const preparing = render(<LibraryToolRow {...props('library_download', {
    phase: 'preparing', args: PartialArguments.EMPTY, callId: 'call-1', name: 'library_download', turn: 1, step: 1, time: 1, subCalls: [],
  })} />)
  expect(preparing.container.textContent).toBe(zh.toolDownload)
  preparing.unmount()

  const argsRaw = '{"path":"/研发部/规范.md"}'
  const start: StartedToolCall = {
    phase: 'start', args: PartialArguments.fromText(argsRaw), callId: 'call-1', name: 'library_download', argsRaw, turn: 1, step: 1, time: 2, subCalls: [],
  }
  const running = render(<LibraryToolRow {...props('library_download', start)} />)
  expect(running.container.firstElementChild?.getAttribute('data-state')).toBe('running')
  expect(running.container.textContent).toBe(`${zh.toolDownload}研发部 / 规范.md`)
  running.unmount()

  const done = render(<LibraryToolRow {...props('library_download', settled('library_download', argsRaw))} />)
  expect(done.container.textContent).toBe(`${zh.toolDownload}研发部 / 规范.md`)
  expect(done.container.textContent).not.toContain('library-downloads')
  done.unmount()

  const failed = render(<LibraryToolRow {...props('library_upload', settled('library_upload', '{"from":"a.md","to":"/星河科技/"}', { isError: true }))} />)
  expect(failed.container.textContent).toBe(`${zh.toolUpload}星河科技 / a.md${zh.toolFailed}`)
  failed.unmount()

  const stopped = render(<LibraryToolRow {...props('library_search', settled('library_search', '{"query":"周', {
    isError: true, error: { name: 'Interrupted', code: 'interrupted' },
  }))} />)
  expect(stopped.container.textContent).toBe(`${zh.toolSearch}${zh.toolStopped}`)
})
