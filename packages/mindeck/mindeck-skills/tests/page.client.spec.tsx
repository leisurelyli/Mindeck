// @vitest-environment jsdom
/** The skills page explains a missing listing, groups and searches skills, starts conversations, and shows instructions. */
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { MindeckSkillCatalog } from '../src/types.ts'
import { zh } from '../src/client/locales.ts'
import type { InstructionsRead, MindeckSkillsSnapshot } from '../src/client/operations.ts'
import { SkillsPage, type SkillsPageProps } from '../src/client/SkillsPage.tsx'

afterEach(() => { cleanup() })

const listing: MindeckSkillCatalog = {
  company: '星河科技',
  skills: [
    { name: 'weekly-report', displayName: '周报助手', category: '写作', description: '按模板写周报。', recommended: true, searchKeys: ['zhoubaozhushou', 'zbzs'] },
    { name: 'code-review', displayName: '代码评审', category: '研发', description: '先列阻塞问题。', recommended: false, searchKeys: ['daimapingshen', 'dmps'] },
    { name: 'misc-helper', displayName: null, category: null, description: '', recommended: false, searchKeys: [] },
  ],
}

function fixture(catalog: MindeckSkillCatalog | undefined) {
  const store = createSnapshotStore<MindeckSkillsSnapshot>({ catalog, failed: false })
  const started = { resolve: () => {} }
  const operations = {
    use: vi.fn((_name: string) => new Promise<void>((resolve) => { started.resolve = resolve })),
    instructions: vi.fn(async (_name: string): Promise<InstructionsRead> => ({ ok: true, markdown: '# 周报助手\n\n先列本周完成的事。' })),
  }
  // Main-panel runtime hooks are unused by the page; the renderer supplies them in production.
  const props = { t: makeTranslate(zh), useCatalog: bindSnapshotSelector(store), ...operations } as SkillsPageProps
  const set = (next: MindeckSkillsSnapshot) => { act(() => { store.set(next) }) }
  return { props, operations, set, started }
}

it('explains a missing listing, then names the company and lists recommended skills before each category', () => {
  const f = fixture(undefined)
  const view = render(<SkillsPage {...f.props} />)
  expect(view.getByRole('heading', { level: 1, name: zh.title })).toBeTruthy()
  expect(view.getByRole('status', { name: zh.loading })).toBeTruthy()
  f.set({ catalog: undefined, failed: true })
  expect(view.getByRole('status').textContent).toBe(zh.unavailable)
  f.set({ catalog: { company: null, skills: [] }, failed: false })
  expect(view.getByRole('status').textContent).toBe(zh.signedOut)
  f.set({ catalog: { company: '星河科技', skills: [] }, failed: false })
  expect(view.getByRole('status').textContent).toBe(`${zh.noCompanySkills}${zh.noCompanySkillsHint}`)
  f.set({ catalog: listing, failed: false })
  expect(view.getByText('星河科技为你配置了 3 个技能。点“使用”即可新开对话，在任意对话中输入“/”也能找到它们。')).toBeTruthy()
  expect(view.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)).toEqual([zh.recommended, '研发', zh.other])
  const recommended = within(view.getByRole('region', { name: zh.recommended }))
  // Outside its category's section, a card names the category.
  expect(recommended.getByRole('article', { name: '周报助手' }).textContent).toContain('写作')
  expect(within(view.getByRole('article', { name: 'misc-helper' })).getByText('/misc-helper')).toBeTruthy()
})

it('searches names and pinyin and clears a search without matches', () => {
  const f = fixture(listing)
  const view = render(<SkillsPage {...f.props} />)
  const search = view.getByRole('searchbox', { name: zh.searchPlaceholder })
  fireEvent.change(search, { target: { value: 'dmps' } })
  expect(view.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)).toEqual(['研发'])
  fireEvent.change(search, { target: { value: '没有这个' } })
  expect(view.getByRole('status').textContent).toContain('没有与“没有这个”匹配的技能')
  fireEvent.click(within(view.getByRole('status')).getByRole('button', { name: zh.clearSearch }))
  expect(view.getAllByRole('article')).toHaveLength(3)
})

it('starts a conversation with a skill and keeps every start action off until it settles', async () => {
  const f = fixture(listing)
  const view = render(<SkillsPage {...f.props} />)
  fireEvent.click(view.getByRole('button', { name: '使用“周报助手”' }))
  expect(f.operations.use).toHaveBeenCalledWith('weekly-report')
  expect(view.getByRole('button', { name: '使用“代码评审”' })).toHaveProperty('disabled', true)
  fireEvent.click(view.getByRole('button', { name: '使用“代码评审”' }))
  expect(f.operations.use).toHaveBeenCalledOnce()
  await act(async () => { f.started.resolve() })
  expect(view.getByRole('button', { name: '使用“代码评审”' })).toHaveProperty('disabled', false)
})

it('shows the instructions in a dialog, retries a failed read, and starts the conversation from it', async () => {
  const f = fixture(listing)
  const view = render(<SkillsPage {...f.props} />)
  f.operations.instructions.mockResolvedValueOnce({ ok: false, reason: 'failed' })
  fireEvent.click(view.getByRole('button', { name: '查看“周报助手”的说明' }))
  const dialog = within(await view.findByRole('dialog', { name: '周报助手' }))
  expect(dialog.getByText('/weekly-report').parentElement?.textContent).toBe('/weekly-report写作')
  expect((await dialog.findByRole('alert')).textContent).toContain(zh.instructionsFailed)
  fireEvent.click(dialog.getByRole('button', { name: zh.retry }))
  expect(await dialog.findByRole('region', { name: '“周报助手”的说明' })).toBeTruthy()
  expect(dialog.getByText('先列本周完成的事。')).toBeTruthy()
  expect(f.operations.instructions).toHaveBeenCalledTimes(2)

  f.operations.instructions.mockResolvedValueOnce({ ok: false, reason: 'missing' })
  // The footer's close button follows the header's.
  fireEvent.click(dialog.getAllByRole('button', { name: zh.close }).at(-1)!)
  expect(view.queryByRole('dialog')).toBeNull()
  fireEvent.click(view.getByRole('button', { name: '查看“代码评审”的说明' }))
  const missing = within(await view.findByRole('dialog', { name: '代码评审' }))
  expect((await missing.findByRole('alert')).textContent).toContain(zh.instructionsMissing)
  fireEvent.click(missing.getByRole('button', { name: zh.use }))
  expect(view.queryByRole('dialog')).toBeNull()
  expect(f.operations.use).toHaveBeenCalledWith('code-review')
})

it('says when a skill has no written instructions', async () => {
  const f = fixture(listing)
  f.operations.instructions.mockResolvedValueOnce({ ok: true, markdown: '  \n' })
  const view = render(<SkillsPage {...f.props} />)
  fireEvent.click(view.getByRole('button', { name: '查看“misc-helper”的说明' }))
  expect(await within(await view.findByRole('dialog')).findByText(zh.instructionsEmpty)).toBeTruthy()
})
