/** KQL patterns of a library search and the passages read from OpenCloud highlights. */
import { expect, it } from 'vitest'
import { passageOf } from '../src/library-service.ts'
import { parseMultistatus, phraseParts, searchPattern, searchPhrase } from '../src/opencloud.ts'
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
  expect(passageOf(`${'前'.repeat(40)}行程单。第四章 住宿费用 第七条 <mark>住宿</mark>费`)?.[0])
    .toEqual({ text: '…第四章 住宿费用 第七条 ', match: false })
  expect(passageOf(`${'前'.repeat(60)}；<mark>住宿</mark>`)?.[0]).toEqual({ text: `…${'前'.repeat(39)}；`, match: false })
  expect(passageOf('…00 元；乘坐出租车的须附行程单。\n第四章 <mark>住宿</mark>费用')?.[0])
    .toEqual({ text: '…乘坐出租车的须附行程单。 第四章 ', match: false })
  expect(passageOf('…<mark>住宿</mark>')).toEqual([{ text: '…', match: false }, { text: '住宿', match: true }])
  const crowded = passageOf(`<mark>${'中'.repeat(170)}</mark>后`)
  expect(crowded).toEqual([{ text: `${'中'.repeat(160)}…`, match: true }])
  const exact = passageOf(`<mark>${'中'.repeat(160)}</mark>后面`)
  expect(exact).toEqual([{ text: '中'.repeat(160), match: true }, { text: '…', match: false }])
  expect(passageText(passageOf('出差<mark>住宿</mark>费') ?? [])).toBe('出差**住宿**费')
})

it('decodes the character references OpenCloud writes in highlights', () => {
  const [item] = parseMultistatus('<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:response>'
    + '<d:href>/dav/spaces/drive-1/%E5%88%B6%E5%BA%A6/a.docx</d:href><d:propstat><d:prop>'
    + '<oc:highlights>第四章 住宿费用&#xA;第七条 &lt;mark&gt;住宿&lt;/mark&gt;费 R&amp;D</oc:highlights>'
    + '</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>')
  expect(item).toMatchObject({ driveId: 'drive-1', path: '制度/a.docx', highlights: '第四章 住宿费用\n第七条 <mark>住宿</mark>费 R&D' })
  expect(passageOf(item?.highlights ?? '')).toEqual([
    { text: '第四章 住宿费用 第七条 ', match: false }, { text: '住宿', match: true }, { text: '费 R&D', match: false },
  ])
})
