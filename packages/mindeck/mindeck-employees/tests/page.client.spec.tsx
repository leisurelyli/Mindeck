// @vitest-environment jsdom
/** The digital-employee page lists the general assistant first, marks drafts, and starts conversations from a card or a starter. */
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { MindeckEmployeeCard, MindeckEmployeeCatalog } from '../src/types.ts'
import { EmployeesPage, type EmployeesPageProps } from '../src/client/EmployeesPage.tsx'
import { zh } from '../src/client/locales.ts'
import { avatarInitial, starterInsertion } from '../src/client/cards.ts'
import { portrait } from '../src/client/avatars.ts'
import type { MindeckEmployeesSnapshot } from '../src/client/operations.ts'

afterEach(() => { cleanup() })

const GENERAL: MindeckEmployeeCard = { kind: 'general', presetId: 'mindeck-general' }
const LEGAL: MindeckEmployeeCard = {
  kind: 'employee', presetId: 'mindeck-employee-legal', employeeId: 'legal', name: '法务专员', avatar: 'legal',
  tagline: '审合同，解释条款', starters: ['帮我审一份采购合同', '解释竞业限制条款'], draft: false, folders: [], model: null,
}
const HR: MindeckEmployeeCard = {
  kind: 'employee', presetId: 'mindeck-employee-hr', employeeId: 'hr', name: '人事专员', avatar: 'future-key',
  tagline: '', starters: [], draft: true, folders: [], model: null,
}
const RULES: MindeckEmployeeCard = {
  kind: 'employee', presetId: 'mindeck-employee-rules', employeeId: 'rules', name: '制度问答', avatar: 'hr',
  tagline: '答报销、请假和考勤的问题', starters: [], draft: false, model: 'GLM 4.6', folders: [
    { label: '企业制度', path: '企业空间 / 制度文件', accessible: true },
    { label: '研发规范', path: '研发部 / 规范', accessible: false },
  ],
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
  expect(cards[2]!.querySelector('[data-tint]')?.textContent).toBe('人事')
  expect(cards[1]!.querySelector('img')?.getAttribute('data-backdrop')).toBe('lavender')
})

it('bundles a banner on a backdrop for every avatar key Mindeck Cloud offers', () => {
  const keys = [
    'general', 'admin', 'hr', 'legal', 'finance', 'it', 'sales', 'marketing', 'analyst', 'product', 'engineer', 'support',
    ...Array.from({ length: 12 }, (_, index) => `neutral-${index + 1}`),
  ]
  expect(keys.filter(key => portrait(key) === undefined)).toEqual([])
  expect(portrait('neutral-13')).toBeUndefined()
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
  expect(card.querySelector('[data-tint]')?.textContent).toBe('法务')
})

it('shows the leading Latin word or the first two characters when there is no portrait, as Mindeck Cloud does', () => {
  expect(avatarInitial(' IT 帮助台')).toBe('IT')
  expect(avatarInitial('hrbp 助理')).toBe('HR')
  expect(avatarInitial('合同审查专员')).toBe('合同')
  expect(avatarInitial('法')).toBe('法')
  expect(avatarInitial('  ')).toBe('')
})

it('names the folders an employee consults, those the member cannot open, and its model at the foot of its card', () => {
  const view = render(<EmployeesPage {...fixture({ cards: [GENERAL, RULES, LEGAL] }).props} />)
  const [general, rules, legal] = view.getAllByRole('article')
  const details = within(rules!).getByRole('region', { name: '“制度问答”的资料和模型' })
  expect([...details.querySelectorAll('p')].map(line => line.textContent)).toEqual([
    '资料企业制度、研发规范（你暂无权限）', '模型GLM 4.6',
  ])
  expect(details.querySelector('p')?.getAttribute('title')).toBe('企业制度：企业空间 / 制度文件\n研发规范：研发部 / 规范')
  expect(within(rules!).getByRole('button', { name: '与“制度问答”开始新对话' }).getAttribute('aria-describedby')).toContain(details.id)
  // Without starters the section is left out entirely, and cards without folders or a model have no details.
  expect(within(rules!).queryByText(zh.starters)).toBeNull()
  expect(within(general!).queryByRole('region')).toBeNull()
  expect(within(legal!).queryByRole('region')).toBeNull()
})
