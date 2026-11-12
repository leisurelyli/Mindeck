/** Mindeck Enterprise rows in the shipped Desktop composition. */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { composeEntries, loadProfileDirectory } from '@deepseek-ai/dsh-app-boot'
import { createPluginProfile } from '../src/project-manager.ts'

it('replaces the DeepSeek account, providers, and personal model settings with the Mindeck Cloud plugins', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-desktop-mindeck-composition-'))
  try {
    const profileDir = join(home, 'profiles', 'desktop')
    createPluginProfile(profileDir)
    const installAnchor = fileURLToPath(new URL('../../cli/package.json', import.meta.url))
    const profile = loadProfileDirectory('dsh desktop', profileDir, installAnchor)
    const warnings: string[] = []
    const rows = composeEntries([
      ...profile.layers.map(layer => layer.patches),
      profile.patches,
    ], message => warnings.push(message))
    const row = (id: string) => rows.find(entry => entry.id === id)

    for (const [id, name] of [
      ['mindeck-account', '@deepseek-ai/dsh-mindeck-account'],
      ['mindeck-models', '@deepseek-ai/dsh-mindeck-models'],
      ['mindeck-skills', '@deepseek-ai/dsh-mindeck-skills'],
      ['mindeck-files', '@deepseek-ai/dsh-mindeck-files'],
    ] as const) {
      expect(row(id)).toEqual({ id, name })
    }
    for (const id of [
      'deepseek-account', 'llm-deepseek', 'llm-deepseek-account', 'llm-pi-ai', 'web-search-deepseek', 'web-deepseek-api',
      'ui-settings-account', 'account-controller', 'ui-settings-models',
    ]) {
      expect(row(id)?.disabled, id).toBe(true)
    }
    expect(row('llm')?.disabled).not.toBe(true)
    expect(row('skill')?.disabled).not.toBe(true)
    expect(warnings).toEqual([])
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
