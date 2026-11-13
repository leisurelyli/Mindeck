// @vitest-environment jsdom
/**
 * The cards appear only on a blank conversation, mark its preset, switch it, offer the chosen employee's starters,
 * and fall back to initials.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { MindeckEmployeeCard, MindeckEmployeeCatalog } from '../src/types.ts'
import { starterInsertion, visibleCards } from '../src/client/cards.ts'
import { EmployeeDock, type EmployeeDockProps } from '../src/client/EmployeeDock.tsx'
import { zh } from '../src/client/locales.ts'
import type { MindeckEmployeesSnapshot } from '../src/client/operations.ts'

afterEach(() => { cleanup() })

type EmployeeCard = Extract<MindeckEmployeeCard, { kind: 'employee' }>
const employee = (id: string, overrides: Partial<EmployeeCard> = {}): MindeckEmployeeCard => ({
  kind: 'employee', presetId: `mindeck-employee-${id}`, employeeId: id, name: `员工${id}`, avatar: 'neutral-1',
  tagline: `负责${id}`, starters: [], draft: false, ...overrides,
})
const GENERAL: MindeckEmployeeCard = { kind: 'general', presetId: 'mindeck-general' }
const LEGAL = employee('legal', { name: '法务专员', avatar: 'legal', tagline: '审合同', starters: ['帮我审一份采购合同', '解释竞业限制条款'] })

interface DockOptions { preset?: string; blank?: boolean; promptAttempted?: boolean }

function fixture(catalog: MindeckEmployeeCatalog | undefined, options: DockOptions = {}) {
  const store = createSnapshotStore<MindeckEmployeesSnapshot>({ catalog })
  const projection = createSnapshotStore<{ preset: string | undefined }>({ preset: options.preset ?? 'mindeck-general' })
  const useProjectionValue = bindSnapshotSelector(projection)
  const select = vi.fn(async (_preset: string): Promise<string | undefined> => undefined)
  const insertStarter = vi.fn((_text: string) => true)
  const openAll = vi.fn()
  const props = {
    session: { blank: options.blank ?? true, promptAttempted: options.promptAttempted ?? false },
    useProjection: (_key: string) => useProjectionValue(value => value.preset),
    useCatalog: bindSnapshotSelector(store),
    select, insertStarter, openAll, t: makeTranslate(zh),
  } as EmployeeDockProps
  const setPreset = (preset: string) => { act(() => { projection.set({ preset }) }) }
  return { props, select, insertStarter, openAll, setPreset }
}

it('appears only while the conversation is blank and the company has digital employees', () => {
  const cards = { cards: [GENERAL, LEGAL] }
  expect(render(<EmployeeDock {...fixture(cards, { blank: false }).props} />).container.innerHTML).toBe('')
  expect(render(<EmployeeDock {...fixture(cards, { promptAttempted: true }).props} />).container.innerHTML).toBe('')
  expect(render(<EmployeeDock {...fixture({ cards: [GENERAL] }).props} />).container.innerHTML).toBe('')
  expect(render(<EmployeeDock {...fixture(undefined).props} />).container.innerHTML).toBe('')
  const view = render(<EmployeeDock {...fixture(cards).props} />)
  expect(view.getByRole('heading', { name: zh.title })).toBeTruthy()
  const buttons = within(view.getByRole('region', { name: zh.title })).getAllByRole('button')
  expect(buttons.map(button => button.textContent)).toEqual([`${zh.generalName}${zh.generalTagline}`, '法务专员审合同'])
  expect(buttons.map(button => button.getAttribute('aria-pressed'))).toEqual(['true', 'false'])
})

it('switches the conversation to a card, keeps it selected until the preset arrives, and reports a refusal', async () => {
  const f = fixture({ cards: [GENERAL, LEGAL, employee('hr', { name: '人事专员', draft: true })] })
  const view = render(<EmployeeDock {...f.props} />)
  expect(view.getByText(zh.draft)).toBeTruthy()
  expect(view.queryByRole('list', { name: zh.starters })).toBeNull()

  await act(async () => { fireEvent.click(view.getByRole('button', { name: /法务专员/u })) })
  expect(f.select).toHaveBeenCalledWith('mindeck-employee-legal')
  expect(view.getByRole('button', { name: /法务专员/u }).getAttribute('aria-pressed')).toBe('true')
  f.setPreset('mindeck-employee-legal')
  expect(view.getByRole('button', { name: /法务专员/u }).getAttribute('aria-pressed')).toBe('true')
  // Choosing the selected card again asks nothing.
  fireEvent.click(view.getByRole('button', { name: /法务专员/u }))
  expect(f.select).toHaveBeenCalledOnce()

  f.select.mockResolvedValueOnce('This session has already started')
  await act(async () => { fireEvent.click(view.getByRole('button', { name: /人事专员/u })) })
  expect(view.getByRole('button', { name: /人事专员/u }).getAttribute('aria-pressed')).toBe('false')
  expect(document.body.textContent).toContain('无法切换到“人事专员”：This session has already started')
})

it('offers the chosen employee\'s starters and puts one in the draft without sending', () => {
  const f = fixture({ cards: [GENERAL, LEGAL] }, { preset: 'mindeck-employee-legal' })
  const view = render(<EmployeeDock {...f.props} />)
  const starters = view.getByRole('list', { name: zh.starters })
  expect(within(starters).getAllByRole('button').map(button => button.textContent)).toEqual(['帮我审一份采购合同', '解释竞业限制条款'])
  fireEvent.click(within(starters).getByRole('button', { name: '解释竞业限制条款' }))
  expect(f.insertStarter).toHaveBeenCalledWith('解释竞业限制条款')
  expect(f.select).not.toHaveBeenCalled()
  f.setPreset('mindeck-general')
  expect(view.queryByRole('list', { name: zh.starters })).toBeNull()
})

it('shows six cards, keeps a selected card beyond them in view, and links to the page for the rest', () => {
  const cards = [GENERAL, ...['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(id => employee(id))]
  const f = fixture({ cards }, { preset: 'mindeck-employee-g' })
  const view = render(<EmployeeDock {...f.props} />)
  const names = () => view.getAllByRole('button').filter(button => button.hasAttribute('aria-pressed'))
    .map(button => button.querySelector('[class*="name"]')?.textContent)
  expect(names()).toEqual([zh.generalName, '员工a', '员工b', '员工c', '员工d', '员工g'])
  fireEvent.click(view.getByRole('button', { name: zh.showAll }))
  expect(f.openAll).toHaveBeenCalledOnce()
  expect(names()).toHaveLength(6)
  expect(visibleCards(cards, undefined).map(card => card.presetId)).toEqual(cards.slice(0, 6).map(card => card.presetId))
  // Six cards or fewer need no link.
  cleanup()
  expect(render(<EmployeeDock {...fixture({ cards: cards.slice(0, 6) }).props} />).queryByRole('button', { name: zh.showAll })).toBeNull()
})

it('draws the name\'s first character when the avatar has no image or the image fails', () => {
  const f = fixture({ cards: [GENERAL, employee('x', { name: '财务专员', avatar: 'future-key' })] })
  const view = render(<EmployeeDock {...f.props} />)
  const unknown = view.getByRole('button', { name: /财务专员/u }).querySelector('[data-fallback]')
  expect(unknown?.textContent).toBe('财')
  const image = view.getByRole('button', { name: /通用助手/u }).querySelector('img')
  if (image === null) throw new Error('Expected the general assistant\'s image')
  fireEvent.error(image)
  expect(view.getByRole('button', { name: /通用助手/u }).querySelector('[data-fallback]')?.textContent).toBe('通')
})

it('fills an empty draft and starts a new line after existing text', () => {
  expect(starterInsertion('  ', '审合同')).toEqual({ text: '审合同', start: 0, end: 2 })
  expect(starterInsertion('附件见上', '审合同')).toEqual({ text: '\n审合同', start: 4, end: 4 })
  expect(starterInsertion('附件见上\n', '审合同')).toEqual({ text: '审合同', start: 5, end: 5 })
})
