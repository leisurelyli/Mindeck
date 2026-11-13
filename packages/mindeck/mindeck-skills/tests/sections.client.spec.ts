/** The skills page groups company skills, searches names and pinyin, and puts a skill at the start of the draft. */
import { expect, it } from 'vitest'
import { matchesSkill, skillInsertion, skillSections } from '../src/client/sections.ts'
import type { MindeckSkillView } from '../src/types.ts'

const view = (name: string, overrides: Partial<MindeckSkillView> = {}): MindeckSkillView => ({
  name, displayName: null, category: null, description: '', recommended: false, searchKeys: [], ...overrides,
})

it('matches names, categories, descriptions, and pinyin, with single letters only at the start of a key', () => {
  const keys = ['zhoubaozhushou', 'zbzs', 'xiezuo', 'xz']
  expect(matchesSkill(['weekly-report', '周报助手'], keys, '')).toBe(true)
  expect(matchesSkill(['weekly-report', '周报助手'], keys, 'WEEKLY')).toBe(true)
  expect(matchesSkill(['weekly-report', '周报助手'], keys, '周报')).toBe(true)
  expect(matchesSkill(['weekly-report', '周报助手'], keys, 'zb')).toBe(true)
  expect(matchesSkill(['weekly-report', '周报助手'], keys, 'zhu shou')).toBe(true)
  expect(matchesSkill(['weekly-report', '周报助手'], keys, 'z')).toBe(true)
  expect(matchesSkill(['weekly-report', '周报助手'], keys, 'u')).toBe(false)
  expect(matchesSkill(['weekly-report', null], [], 'contract')).toBe(false)
})

it('lists recommended skills, then categories in reading order, then ungrouped skills', () => {
  const company = [
    view('weekly-report', { displayName: '周报助手', category: '写作', recommended: true, searchKeys: ['zbzs'] }),
    view('meeting-notes', { displayName: '会议纪要', category: '写作' }),
    view('code-review', { category: '研发' }),
    view('data-check', { category: '数据', description: '核对表格' }),
    view('misc'),
  ]
  const sections = skillSections(company, '')
  expect(sections.map(section => section.heading)).toEqual([
    { kind: 'recommended' }, { kind: 'category', name: '数据' }, { kind: 'category', name: '写作' },
    { kind: 'category', name: '研发' }, { kind: 'other' },
  ])
  expect(sections[0]?.skills).toEqual([company[0]])
  expect(sections[2]?.skills).toEqual([company[1]])
  expect(sections.at(-1)?.skills).toEqual([company[4]])

  expect(skillSections(company, 'zb').map(section => section.key)).toEqual(['recommended'])
  expect(skillSections(company, '表格').map(section => section.key)).toEqual(['category:数据'])
  expect(skillSections(company, 'word')).toEqual([])
  expect(skillSections([], '')).toEqual([])
})

it('puts the skill at the start of the draft, replacing a skill already there', () => {
  expect(skillInsertion('', 'weekly-report')).toEqual({ end: 0, text: '/weekly-report ' })
  expect(skillInsertion('写本周周报', 'weekly-report')).toEqual({ end: 0, text: '/weekly-report ' })
  expect(skillInsertion('/meeting-notes 整理纪要', 'weekly-report')).toEqual({ end: 15, text: '/weekly-report ' })
  expect(skillInsertion('/meeting-notes', 'weekly-report')).toEqual({ end: 14, text: '/weekly-report ' })
  expect(skillInsertion('/ 不是技能', 'weekly-report')).toEqual({ end: 0, text: '/weekly-report ' })
})
