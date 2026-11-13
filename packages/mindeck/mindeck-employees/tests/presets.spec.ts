/** The persona text, the persona row replacement, and the preset definitions of the general assistant and the employees. */
import { expect, it } from 'vitest'
import type { CachedEmployee } from '../src/cache.ts'
import {
  employeeDefinition, employeePersona, generalDefinition, PERSONA_PLUGIN, promptSafe, withPersona, type PresetRows,
} from '../src/presets.ts'

const legal: CachedEmployee = {
  id: 'e1', name: '法务专员', avatar: 'legal', tagline: '审合同，答劳动用工问题',
  instructions: '先确认合同类型。\n引用条款时注明出处。', starters: ['帮我审一份采购合同'], skills: ['contract-review', 'nda-check'],
  draft: false, retired: false,
}

it('writes the employee persona in the model\'s terms, with the company\'s instructions verbatim', () => {
  expect(employeePersona(legal)).toBe([
    'You are "法务专员", a digital employee of the user\'s company, powered by the {{model}} model. Your role: 审合同，答劳动用工问题',
    '',
    'The company\'s instructions for this role:',
    '',
    '先确认合同类型。',
    '引用条款时注明出处。',
    '',
    'The company suggests these skills for this role: /contract-review, /nda-check. Use them when they fit the task.',
  ].join('\n'))
  expect(employeePersona({ name: '助理', tagline: '', instructions: '', skills: [] }))
    .toBe('You are "助理", a digital employee of the user\'s company, powered by the {{model}} model.')
})

it('keeps Cloud text from forming a prompt variable', () => {
  expect(promptSafe('{{model}} {{{x}}} }}')).toBe('{ {model} } { { {x} } } } }')
  const persona = employeePersona({ name: '{{name}}', tagline: 'a}}b', instructions: 'use {{date}}', skills: [] })
  expect(persona.match(/\{\{/gu)).toEqual(['{{'])
  expect(persona.match(/\}\}/gu)).toEqual(['}}'])
  expect(persona).toContain('{{model}}')
})

it('replaces only the top-level persona row, or puts one first', () => {
  const rows: PresetRows = [
    { id: 'persona', name: PERSONA_PLUGIN, config: { prefix: 'You are a coding agent.', suffix: 'Bye.' } },
    { id: 'bash', name: '@deepseek-ai/dsh-tool-bash', disabled: { __jsExpr: 'process.platform === \'win32\'' } },
    { id: 'group', name: 'cordis:group', group: true, config: [{ id: 'nested', name: PERSONA_PLUGIN, config: { prefix: 'inner' } }] },
  ]
  expect(withPersona(rows, 'P')).toEqual([{ ...rows[0], config: { prefix: 'P' } }, rows[1], rows[2]])
  expect(withPersona(rows.slice(1), 'P')).toEqual([{ id: 'persona', name: PERSONA_PLUGIN, config: { prefix: 'P' } }, ...rows.slice(1)])
})

it('names the general assistant, drafts, and retired employees in the roster, in that order', () => {
  const rows: PresetRows = [{ id: 'persona', name: PERSONA_PLUGIN, config: { prefix: 'x' } }]
  expect(generalDefinition(rows, 'You are a work assistant powered by the {{model}} model.')).toEqual({
    id: 'mindeck-general', name: { en: 'General assistant', zh: '通用助手' }, description: { en: 'Writing, analysis, research, files: ask anything.', zh: '写作、分析、整理资料、处理文件，什么都可以问。' },
    order: 0,
    plugins: [{ id: 'persona', name: PERSONA_PLUGIN, config: { prefix: 'You are a work assistant powered by the {{model}} model.' } }],
  })
  expect(employeeDefinition(rows, legal, 0)).toMatchObject({ id: 'mindeck-employee-e1', name: '法务专员', description: legal.tagline, order: 10 })
  expect(employeeDefinition(rows, { ...legal, draft: true, tagline: '' }, 1)).toEqual({
    id: 'mindeck-employee-e1', name: { en: '法务专员 (draft)', zh: '法务专员（草稿）' }, order: 11, plugins: withPersona(rows, employeePersona({ ...legal, tagline: '' })),
  })
  const retired = employeeDefinition(rows, { ...legal, retired: true }, 2)
  expect(retired).toMatchObject({
    id: 'mindeck-employee-e1', name: { en: '法务专员 (deactivated)', zh: '法务专员（已停用）' }, listed: false,
    description: { en: 'An administrator deactivated this digital employee. Earlier conversations can continue.', zh: '管理员已停用这位数字员工，可以继续之前的对话。' },
  })
  expect(employeeDefinition(rows, legal, 0)).not.toHaveProperty('listed')
  expect(retired.order).toBeGreaterThan(employeeDefinition(rows, legal, 500).order ?? 0)
  expect(retired.plugins).toEqual(employeeDefinition(rows, legal, 0).plugins)
})
