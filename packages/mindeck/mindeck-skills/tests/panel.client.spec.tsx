// @vitest-environment jsdom
/** The skills page explains the company listing, groups and searches skills, puts one in the draft, and previews instructions. */
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { MindeckSkillCatalog } from '../src/types.ts'
import { zh } from '../src/client/locales.ts'
import type { MindeckSkillsSnapshot } from '../src/client/operations.ts'
import type { SessionSkill } from '../src/client/sections.ts'
import { SkillsPanel, type SkillsPanelProps } from '../src/client/SkillsPanel.tsx'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const listing: MindeckSkillCatalog = {
  company: '星河科技',
  skills: [
    { name: 'weekly-report', displayName: '周报助手', category: '写作', description: '按模板写周报。', recommended: true, searchKeys: ['zhoubaozhushou', 'zbzs'] },
    { name: 'code-review', displayName: '代码评审', category: '研发', description: '先列阻塞问题。', recommended: false, searchKeys: ['daimapingshen', 'dmps'] },
  ],
}

function fixture(catalog: MindeckSkillCatalog | undefined, session?: readonly SessionSkill[]) {
  const store = createSnapshotStore<MindeckSkillsSnapshot>({ catalog, failed: false })
  const operations = {
    sessionSkills: vi.fn(async () => session),
    useSkill: vi.fn((_name: string) => true),
    preview: vi.fn((_path: string) => {}),
  }
  // Pane runtime hooks are unused by the page; the renderer supplies them in production.
  const props = { t: makeTranslate(zh), useCatalog: bindSnapshotSelector(store), ...operations } as SkillsPanelProps
  const set = (next: MindeckSkillsSnapshot) => { act(() => { store.set(next) }) }
  return { props, operations, set }
}

it('explains a missing listing, then names the company and lists recommended skills first', async () => {
  const f = fixture(undefined)
  const view = render(<SkillsPanel {...f.props} />)
  expect(view.getByText(zh.loading)).toBeTruthy()
  f.set({ catalog: undefined, failed: true })
  expect(view.getByText(zh.unavailable)).toBeTruthy()
  f.set({ catalog: { company: null, skills: [] }, failed: false })
  expect(view.getByText(zh.signedOut)).toBeTruthy()
  f.set({ catalog: { company: '星河科技', skills: [] }, failed: false })
  expect(view.getByText(zh.noCompanySkills)).toBeTruthy()
  f.set({ catalog: listing, failed: false })
  expect(view.getByText('星河科技为你提供 2 个技能')).toBeTruthy()
  expect(view.getAllByRole('heading').map(heading => heading.textContent)).toEqual([zh.recommended, '研发'])
  expect(view.getByText('/weekly-report')).toBeTruthy()
  await vi.waitFor(() => { expect(f.operations.sessionSkills).toHaveBeenCalled() })
})

it('searches pinyin, adds Mindeck\'s own skills, puts a skill in the draft, and previews its instructions', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const f = fixture(listing, [
    { name: 'weekly-report', description: '', path: '/cache/skills/weekly-report/SKILL.md' },
    { name: 'docx', description: 'Word documents', path: '/app/skills/docx/SKILL.md' },
  ])
  const view = render(<SkillsPanel {...f.props} />)
  const builtIn = await view.findByRole('region', { name: zh.builtIn })
  expect(within(builtIn).getByRole('button', { name: `${zh.use}: docx` })).toBeTruthy()

  fireEvent.click(view.getByRole('button', { name: `${zh.use}: 周报助手` }))
  expect(f.operations.useSkill).toHaveBeenCalledWith('weekly-report')
  expect(view.getByRole('status').textContent).toBe(zh.used)
  f.operations.useSkill.mockReturnValueOnce(false)
  fireEvent.click(view.getByRole('button', { name: `${zh.use}: 代码评审` }))
  expect(view.getByRole('status').textContent).toBe(zh.useFailed)
  act(() => { vi.advanceTimersByTime(2000) })
  expect(view.getByRole('status').textContent).toBe('')

  fireEvent.click(view.getByRole('button', { name: `${zh.preview}: 周报助手` }))
  expect(f.operations.preview).toHaveBeenCalledWith('/cache/skills/weekly-report/SKILL.md')
  expect(view.queryByRole('button', { name: `${zh.preview}: 代码评审` })).toBeNull()

  const search = view.getByRole('searchbox', { name: zh.searchPlaceholder })
  fireEvent.change(search, { target: { value: 'dmps' } })
  expect(view.getAllByRole('heading').map(heading => heading.textContent)).toEqual(['研发'])
  expect(view.queryByText('星河科技为你提供 2 个技能')).toBeNull()
  fireEvent.change(search, { target: { value: '没有这个' } })
  expect(view.getByText(zh.noResults)).toBeTruthy()
})
