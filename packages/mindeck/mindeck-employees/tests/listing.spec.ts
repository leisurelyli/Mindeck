/** Cloud listings are validated, merged with the cache so missing employees retire, and cached per member. */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { EMPTY_CACHE, employeesOf, mergeListing, readCache, withOwner, writeCache, type CachedEmployee } from '../src/cache.ts'
import { parseEmployees } from '../src/cloud.ts'

const directories: string[] = []
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }) })

it('keeps usable employees in Cloud order, normalizes optional fields, and skips the rest', () => {
  const listing = parseEmployees({
    employees: [
      { id: 'e1', name: ' 法务专员 ', avatar: 'legal', tagline: ' 审合同 ', instructions: ' 先确认合同类型。 ',
        starters: [' a ', '', 'a', 'b', 'c', 'd', 'e'], skills: ['contract-review', 'Bad Name', 'contract-review'], draft: true, updatedAt: '2026-11-01T00:00:00Z' },
      { id: 'e2', name: '助理', avatar: 'Not A Key', tagline: null, instructions: null, starters: null, skills: null },
      { id: 'e1', name: '重复' },
      { id: 'bad id', name: '无效' },
      { id: 'e3', name: '' },
      'not an employee',
    ],
  })
  expect(listing.skipped).toBe(4)
  expect(listing.employees).toEqual([
    { id: 'e1', name: '法务专员', avatar: 'legal', tagline: '审合同', instructions: '先确认合同类型。', starters: ['a', 'b', 'c', 'd'], skills: ['contract-review'], draft: true },
    { id: 'e2', name: '助理', avatar: 'general', tagline: '', instructions: '', starters: [], skills: [], draft: false },
  ])
  expect(() => parseEmployees({ items: [] })).toThrow('unknown format')
})

const employee = (id: string, retired = false): CachedEmployee => ({
  id, name: id, avatar: 'general', tagline: '', instructions: '', starters: [], skills: [], draft: false, retired,
})

it('retires cached employees missing from the listing and brings listed ones back', () => {
  const cached = [employee('a'), employee('b'), employee('old', true)]
  const listed = [{ ...employee('c'), name: 'C' }, employee('a')].map(({ retired: _retired, ...rest }) => rest)
  expect(mergeListing(cached, listed).map(entry => [entry.id, entry.retired])).toEqual([
    ['c', false], ['a', false], ['b', true], ['old', true],
  ])
  expect(mergeListing([employee('old', true)], [employee('old')]).map(entry => entry.retired)).toEqual([false])
})

it('keeps each member\'s employees and the last member, and reads a damaged file as empty', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mindeck-employees-cache-'))
  directories.push(directory)
  const file = join(directory, 'nested', 'employees.json')
  expect(await readCache(file)).toEqual(EMPTY_CACHE)
  const u1 = { cloudUrl: 'https://cloud.example.com', userId: 'u1' }
  const u2 = { cloudUrl: 'https://cloud.example.com', userId: 'u2' }
  let cache = withOwner(EMPTY_CACHE, u1, [employee('a')])
  cache = withOwner(cache, u2, [employee('b')])
  cache = withOwner(cache, u1)
  await writeCache(file, cache)
  const read = await readCache(file)
  expect(read.last).toEqual(u1)
  expect(employeesOf(read, u1).map(entry => entry.id)).toEqual(['a'])
  expect(employeesOf(read, u2).map(entry => entry.id)).toEqual(['b'])
  expect(employeesOf(read, { ...u2, cloudUrl: 'https://other.example.com' })).toEqual([])
  expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ version: 1 })

  await writeFile(file, '{"version":1,')
  expect(await readCache(file)).toEqual(EMPTY_CACHE)
  await writeFile(file, '{"version":2,"last":null,"owners":[]}')
  expect(await readCache(file)).toEqual(EMPTY_CACHE)
  // A path that cannot be read as a file is reported rather than read as an empty cache.
  await expect(readCache(directory)).rejects.toMatchObject({ code: 'EISDIR' })
})
