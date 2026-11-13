/** Mindeck Enterprise rows in the shipped Desktop composition. */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { composeEntries, loadProfileDirectory } from '@deepseek-ai/dsh-app-boot'
import { createPluginProfile } from '../src/project-manager.ts'

it('adds the Mindeck Cloud plugins, company search, and digital employees beside the DeepSeek account, leaves out personal API-key routes and the harness persona, and uses its own Documents folder', () => {
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
      ['mindeck-employees', '@deepseek-ai/dsh-mindeck-employees'],
      ['mindeck-inbox', '@deepseek-ai/dsh-mindeck-inbox'],
    ] as const) {
      expect(row(id)).toEqual({ id, name })
    }
    // Digital employees register after the company file library, and new conversations start with the general assistant.
    const ids = rows.map(entry => entry.id)
    expect(ids.indexOf('mindeck-employees')).toBe(ids.indexOf('mindeck-files') + 1)
    expect(row('agent-preset-registry')?.config).toEqual({ default: 'mindeck-general' })
    expect(row('preset-standard')?.config).toMatchObject({ id: 'standard' })
    // A personal DeepSeek sign-in skips DeepSeek's first-run introduction.
    expect(row('ui-settings-account')?.config).toEqual({ step: 'done', completion: 'skipped' })
    for (const id of ['llm-deepseek', 'llm-pi-ai', 'ui-settings-models', 'harness-dev-context', 'ui-settings-session-log']) {
      expect(row(id)?.disabled, id).toBe(true)
    }
    // The DeepSeek account remains a second sign-in with its own models and web search.
    for (const id of [
      'deepseek-account', 'llm-deepseek-account', 'account-controller', 'ui-settings-account', 'web-deepseek-api', 'web-search-deepseek',
    ]) {
      expect(row(id)?.disabled, id).not.toBe(true)
    }
    expect(row('web')?.config).toEqual({ searchProvider: 'mindeck-search', fetchProvider: 'http' })
    expect(row('llm')?.disabled).not.toBe(true)
    expect(row('skill')?.disabled).not.toBe(true)
    expect(row('workspace-controller')?.config).toEqual({ documentsFolder: 'Mindeck' })
    expect(row('system-prompt')?.config).toEqual({
      identity: 'You are Mindeck, the AI work assistant that the user\'s company provides. '
        + 'You help with the user\'s work, such as writing, analysis, research, documents, data, and code. '
        + 'When no web search tool is available, say that the company has not turned on web search instead of guessing current facts.',
      personaPrefix: 'You are a coding agent powered by the {{model}} model.',
    })
    expect(warnings).toEqual([])
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
