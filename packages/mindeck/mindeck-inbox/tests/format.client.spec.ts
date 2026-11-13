/** Version order, web links in item bodies, and notification families of the company messages page. */
import { expect, it } from 'vitest'
import { bodyParts, isOlderVersion, itemFamily } from '../src/client/format.ts'

it('orders versions as Semantic Versioning does, prereleases before their release', () => {
  expect(isOlderVersion('0.2.2-rc.1', '0.2.2')).toBe(true)
  expect(isOlderVersion('0.2.2', '0.2.2')).toBe(false)
  expect(isOlderVersion('0.2.3', '0.2.2')).toBe(false)
  expect(isOlderVersion('1.7.9', '1.8.0')).toBe(true)
  expect(isOlderVersion('2.0.0', '1.10.0')).toBe(false)
  expect(isOlderVersion('1.8.0-beta.2', '1.8.0-beta.10')).toBe(true)
  expect(isOlderVersion('1.8.0-beta', '1.8.0-beta.1')).toBe(true)
  expect(isOlderVersion('1.8.0-beta.1', '1.8.0-beta')).toBe(false)
  expect(isOlderVersion('1.8.0-1', '1.8.0-alpha')).toBe(true)
  expect(isOlderVersion('1.8.0-alpha', '1.8.0-1')).toBe(false)
  expect(isOlderVersion('1.8.0-alpha', '1.8.0-beta')).toBe(true)
  expect(isOlderVersion('1.8.0-beta', '1.8.0-alpha')).toBe(false)
  expect(isOlderVersion('1.8.0+build.5', '1.8.0')).toBe(false)
  expect(isOlderVersion('1.8.0-rc.1', '1.8.0-rc.1')).toBe(false)
  expect(isOlderVersion('', '1.8.0')).toBe(false)
  expect(isOlderVersion('1.8', '1.8.0')).toBe(false)
  expect(isOlderVersion('v1.7.9', '1.8.0')).toBe(true)
  expect(isOlderVersion('1.7.9+', '1.8.0')).toBe(true)
  expect(isOlderVersion('1.7.9-rc..1', '1.8.0')).toBe(false)
  expect(isOlderVersion('1.7.9', '')).toBe(false)
})

it('turns web addresses in a body into links and keeps sentence punctuation as text', () => {
  expect(bodyParts('制度见 https://wiki.example.com/expense。逾期不再受理')).toEqual([
    { text: '制度见 ' }, { text: 'https://wiki.example.com/expense', href: 'https://wiki.example.com/expense' }, { text: '。逾期不再受理' },
  ])
  expect(bodyParts('See https://example.com/a?b=1, then http://x.example.com.')).toEqual([
    { text: 'See ' }, { text: 'https://example.com/a?b=1', href: 'https://example.com/a?b=1' }, { text: ', then ' },
    { text: 'http://x.example.com', href: 'http://x.example.com' }, { text: '.' },
  ])
  expect(bodyParts('没有链接')).toEqual([{ text: '没有链接' }])
  expect(bodyParts('ftp://files.example.com stays text')).toEqual([{ text: 'ftp://files.example.com stays text' }])
})

it('groups notification kinds into the families that pick their icons', () => {
  expect(itemFamily({ type: 'announcement', kind: 'announcement' })).toBe('announcement')
  expect(itemFamily({ type: 'notification', kind: 'quota-request.expired' })).toBe('quota')
  expect(itemFamily({ type: 'notification', kind: 'feedback.replied' })).toBe('feedback')
  expect(itemFamily({ type: 'notification', kind: 'offboarding.handover' })).toBe('handover')
  expect(itemFamily({ type: 'notification', kind: 'survey.sent' })).toBe('other')
})
