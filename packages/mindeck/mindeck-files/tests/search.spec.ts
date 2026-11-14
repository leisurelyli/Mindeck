/** KQL patterns of a library search and the passages read from OpenCloud highlights. */
import { expect, it } from 'vitest'
import { passageOf } from '../src/library-service.ts'
import { phraseParts, searchPattern, searchPhrase } from '../src/opencloud.ts'
import { passageText } from '../src/tools.ts'

it('splits Chinese runs into consecutive pairs and keeps other words whole', () => {
  expect(phraseParts('住宿标准')).toEqual(['住宿', '标准'])
  expect(phraseParts('差旅报销单')).toEqual(['差旅', '报销', '销单'])
  expect(phraseParts('年假')).toEqual(['年假'])
  expect(phraseParts('Wi-Fi 密码')).toEqual(['Wi-Fi', '密码'])
  expect(phraseParts('VPN账号申请')).toEqual(['VPN', '账号', '申请'])
})

it('writes names-only, full-text, and folder patterns with the search text inside its quotes', () => {
  expect(searchPhrase(' 报销"标准\\\n 2026 ')).toBe('报销 标准 2026')
  expect(searchPattern('住宿', { fullText: false })).toBe('name:"*住宿*"')
  expect(searchPattern('年假', { fullText: true })).toBe('(name:"*年假*" OR content:"年假")')
  expect(searchPattern('住宿标准', { fullText: false, folder: 'storage-users-1$space!item' }))
    .toBe('scope:storage-users-1$space!item AND name:"*住宿标准*"')
  expect(() => searchPattern('"\\', { fullText: true })).toThrow('the search text is empty')
  expect(() => searchPattern('年假', { fullText: true, folder: 'x) OR (name:*' })).toThrow('is not a file library folder id')
})

it('reads a highlight into a short passage around the first match', () => {
  expect(passageOf('出差<mark>住</mark><mark>宿</mark>费\n\n实行<mark>标准</mark>')).toEqual([
    { text: '出差', match: false }, { text: '住宿', match: true }, { text: '费 实行', match: false }, { text: '标准', match: true },
  ])
  expect(passageOf('没有命中')).toBeUndefined()
  expect(passageOf('')).toBeUndefined()
  const long = passageOf(`${'前'.repeat(60)}<mark>命中</mark>${'后'.repeat(200)}`)
  expect(long?.[0]).toEqual({ text: `…${'前'.repeat(40)}`, match: false })
  expect(long?.map(part => part.text).join('').length).toBe(1 + 40 + 2 + (160 - 41 - 2) + 1)
  expect(long?.at(-1)?.text.endsWith('…')).toBe(true)
  const crowded = passageOf(`<mark>${'中'.repeat(170)}</mark>后`)
  expect(crowded).toEqual([{ text: `${'中'.repeat(160)}…`, match: true }])
  const exact = passageOf(`<mark>${'中'.repeat(160)}</mark>后面`)
  expect(exact).toEqual([{ text: '中'.repeat(160), match: true }, { text: '…', match: false }])
  expect(passageText(passageOf('出差<mark>住宿</mark>费') ?? [])).toBe('出差**住宿**费')
})
