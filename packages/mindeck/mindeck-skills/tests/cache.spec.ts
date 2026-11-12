/** Skill files from Mindeck Cloud stay inside their directory and within the configured limits. */
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import { cacheLayout, isSafeSkillPath, skillFiles } from '../src/index.ts'
import { clearCache, installSkill, pruneSkills, readManifest, writeManifest } from '../src/cache.ts'

const limits = { maxBytes: 64, maxFiles: 3 }
const skill = (files: Array<{ path: string; content: string; encoding?: 'utf8' | 'base64' }>) => ({
  name: 'weekly-report', hash: 'h1', files: files.map(file => ({ encoding: 'utf8' as const, ...file })),
})

it('accepts relative paths only and rejects names Windows cannot store', () => {
  for (const path of ['SKILL.md', 'scripts/run.py', 'assets/logo.png', '.hidden/notes.md']) expect(isSafeSkillPath(path)).toBe(true)
  for (const path of ['', '/etc/passwd', '../escape.md', 'a/../../b', 'a//b', 'a\\b', 'C:x', 'dir./x', 'trailing ', 'CON', 'nul.txt', 'a/./b'])
    expect(isSafeSkillPath(path), path).toBe(false)
})

it('decodes files and enforces SKILL.md, uniqueness, and limits', () => {
  const files = skillFiles(skill([
    { path: 'SKILL.md', content: '# Weekly' },
    { path: 'data.bin', content: Buffer.from([0, 1, 2]).toString('base64'), encoding: 'base64' },
  ]), limits)
  expect(files.map(file => [file.path, [...file.bytes]])).toEqual([['SKILL.md', [...Buffer.from('# Weekly')]], ['data.bin', [0, 1, 2]]])
  expect(() => skillFiles(skill([{ path: 'README.md', content: 'x' }]), limits)).toThrow('no SKILL.md')
  expect(() => skillFiles(skill([{ path: 'SKILL.md', content: 'x' }, { path: 'skill.md', content: 'y' }]), limits)).toThrow('repeats')
  expect(() => skillFiles(skill([{ path: 'SKILL.md', content: 'x'.repeat(65) }]), limits)).toThrow('larger than 64 bytes')
  expect(() => skillFiles(skill(['SKILL.md', 'a', 'b', 'c'].map(path => ({ path, content: '' }))), limits)).toThrow('more than 3 files')
  expect(() => skillFiles(skill([{ path: '../SKILL.md', content: '' }]), limits)).toThrow('unsafe file path')
  expect(() => skillFiles({ ...skill([{ path: 'SKILL.md', content: '' }]), name: 'Bad Name' }, limits)).toThrow('not valid')
})

it('replaces a skill directory as a whole and prunes unlisted skills', async () => {
  const base = await mkdtemp(join(tmpdir(), 'mindeck-skills-cache-'))
  onTestFinished(() => rm(base, { recursive: true, force: true }))
  const layout = cacheLayout(base)
  expect(await readManifest(layout)).toBeUndefined()
  await installSkill(layout, 'weekly-report', [{ path: 'SKILL.md', bytes: Buffer.from('v1') }, { path: 'old/a.md', bytes: Buffer.from('a') }])
  await installSkill(layout, 'weekly-report', [{ path: 'SKILL.md', bytes: Buffer.from('v2') }])
  await installSkill(layout, 'other', [{ path: 'SKILL.md', bytes: Buffer.from('o') }])
  expect(await readFile(join(layout.skills, 'weekly-report', 'SKILL.md'), 'utf8')).toBe('v2')
  expect(await readdir(join(layout.skills, 'weekly-report'))).toEqual(['SKILL.md'])
  expect(await readdir(layout.staging)).toEqual([])
  expect(await pruneSkills(layout, new Set(['weekly-report']))).toEqual(['other'])
  await writeManifest(layout, { cloudUrl: 'https://cloud.example.com', userId: 'u1', skills: { 'weekly-report': 'h2' } })
  expect(await readManifest(layout)).toEqual({ cloudUrl: 'https://cloud.example.com', userId: 'u1', skills: { 'weekly-report': 'h2' } })
  await clearCache(layout)
  expect(await readManifest(layout)).toBeUndefined()
  expect(await readdir(base)).toEqual([])
})
