import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import { createPluginProfile } from '../src/project-manager.ts'

it('adds required Mindeck layers to an existing profile and preserves its extensions and original manifest', () => {
  const root = mkdtempSync(join(tmpdir(), 'mindeck-profile-upgrade-'))
  onTestFinished(() => { rmSync(root, { recursive: true, force: true }) })
  const original = {
    name: 'existing-desktop', private: true, dependencies: { 'example-extension': '1.0.0' },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'example-extension'] } },
  }
  const bytes = JSON.stringify(original, null, 2) + '\n'
  writeFileSync(join(root, 'package.json'), bytes)
  writeFileSync(join(root, 'cordis.patch.yml'), '# user patch\n[]\n')
  createPluginProfile(root)
  const updated = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as typeof original
  expect(updated.dsh.profile.bundles).toEqual([
    '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-mindeck-app', 'example-extension',
  ])
  expect(updated.dependencies).toEqual(original.dependencies)
  expect(readFileSync(join(root, 'cordis.patch.yml'), 'utf8')).toBe('# user patch\n[]\n')
  const backups = readdirSync(root).filter(file => file.startsWith('package.before-mindeck-'))
  expect(backups).toHaveLength(1)
  expect(readFileSync(join(root, backups[0]!), 'utf8')).toBe(bytes)
  const first = readFileSync(join(root, 'package.json'), 'utf8')
  createPluginProfile(root)
  expect(readFileSync(join(root, 'package.json'), 'utf8')).toBe(first)
  expect(readdirSync(root).filter(file => file.startsWith('package.before-mindeck-'))).toEqual(backups)
})
