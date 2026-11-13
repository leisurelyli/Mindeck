// @vitest-environment jsdom
/** The digital-employee page lists the general assistant first, marks drafts, and starts conversations from a card or a starter. */
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { MindeckEmployeeCard, MindeckEmployeeCatalog } from '../src/types.ts'
import { EmployeesPage, type EmployeesPageProps } from '../src/client/EmployeesPage.tsx'
import { zh } from '../src/client/locales.ts'
import { starterInsertion } from '../src/client/cards.ts'
import type { MindeckEmployeesSnapshot } from '../src/client/operations.ts'

afterEach(() => { cleanup() })

const GENERAL: MindeckEmployeeCard = { kind: 'general', presetId: 'mindeck-general' }
const LEGAL: MindeckEmployeeCard = {
  kind: 'employee', presetId: 'mindeck-employee-legal', employeeId: 'legal', name: '法务专员', avatar: 'legal',
  tagline: '审合同，解释条款', starters: ['帮我审一份采购合同', '解释竞业限制条款'], draft: false,
}
const HR: MindeckEmployeeCard = {
  kind: 'employee', presetId: 'mindeck-employee-hr', employeeId: 'hr', name: '人事专员', avatar: 'future-key',
  tagline: '', starters: [], draft: true,
}

function fixture(catalog: MindeckEmployeeCatalog) {
  const store = createSnapshotStore<MindeckEmployeesSnapshot>({ catalog })
  const opened = { resolve: () => {} }
  const start = vi.fn((_preset: string, _starter?: string) => new Promise<void>((resolve) => { opened.resolve = resolve }))
  // Main-panel runtime hooks are unused by the page; the renderer supplies them in production.
  const props = { useCatalog: bindSnapshotSelector(store), start, t: makeTranslate(zh) } as EmployeesPageProps
  return { props, start, opened }
}

it('lists the general assistant first with its own starters, then the company\'s employees, and marks drafts', () => {
  const f = fixture({ cards: [GENERAL, LEGAL, HR] })
  const view = render(<EmployeesPage {...f.props} />)
  expect(view.getByRole('heading', { level: 1, name: zh.panel })).toBeTruthy()
  const cards = view.getAllByRole('article')
  expect(cards.map(card => within(card).getAllByRole('button')[0]?.getAttribute('aria-label')))
    .toEqual(['与“通用助手”开始新对话', '与“法务专员”开始新对话', '与“人事专员”开始新对话'])
  expect(within(cards[0]!).getAllByRole('button').slice(1).map(button => button.textContent))
    .toEqual([zh.generalStarter1, zh.generalStarter2, zh.generalStarter3])
  expect(within(cards[1]!).getByRole('list', { name: zh.starters })).toBeTruthy()
  // A draft carries its mark; an employee without starters shows no starter list, and an unknown avatar shows its initial.
  expect(within(cards[2]!).getByText(zh.draft)).toBeTruthy()
  expect(within(cards[2]!).queryByRole('list')).toBeNull()
  expect(cards[2]!.querySelector('[data-tint]')?.textContent).toBe('人')
  expect(cards[1]!.querySelector('img')).not.toBeNull()
})

it('starts a conversation from a card or a starter and keeps every action off until it opens', async () => {
  const f = fixture({ cards: [GENERAL, LEGAL] })
  const view = render(<EmployeesPage {...f.props} />)
  fireEvent.click(view.getByRole('button', { name: '与“法务专员”开始新对话' }))
  expect(f.start).toHaveBeenCalledWith('mindeck-employee-legal', undefined)
  expect(view.getByRole('button', { name: '解释竞业限制条款' })).toHaveProperty('disabled', true)
  fireEvent.click(view.getByRole('button', { name: '解释竞业限制条款' }))
  expect(f.start).toHaveBeenCalledOnce()
  await act(async () => { f.opened.resolve() })

  fireEvent.click(view.getByRole('button', { name: '解释竞业限制条款' }))
  expect(f.start).toHaveBeenLastCalledWith('mindeck-employee-legal', '解释竞业限制条款')
  await act(async () => { f.opened.resolve() })
  fireEvent.click(view.getByRole('button', { name: zh.generalStarter2 }))
  expect(f.start).toHaveBeenLastCalledWith('mindeck-general', zh.generalStarter2)
})

it('fills an empty draft with a starter and starts a new line after existing text', () => {
  expect(starterInsertion('  ', '审合同')).toEqual({ text: '审合同', start: 0, end: 2 })
  expect(starterInsertion('附件见上', '审合同')).toEqual({ text: '\n审合同', start: 4, end: 4 })
  expect(starterInsertion('附件见上\n', '审合同')).toEqual({ text: '审合同', start: 5, end: 5 })
})

it('draws the name\'s first character when a portrait fails to load', () => {
  const view = render(<EmployeesPage {...fixture({ cards: [GENERAL, LEGAL] }).props} />)
  const card = view.getAllByRole('article')[1]!
  const image = card.querySelector('img')
  if (image === null) throw new Error('Expected the legal portrait')
  fireEvent.error(image)
  expect(card.querySelector('[data-tint]')?.textContent).toBe('法')
})
