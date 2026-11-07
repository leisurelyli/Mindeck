/** Exercise the source launcher preload in an isolated real Node process. */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, onTestFinished } from 'vitest'

it('replaces inherited Harness state only inside the Mindeck child process', () => {
  const root = mkdtempSync(join(tmpdir(), 'mindeck-launch-'))
  onTestFinished(() => { rmSync(root, { recursive: true, force: true }) })
  const inherited = process.env.DSH_HOME
  const environment = { ...process.env, DSH_HOME: join(root, 'official'), DSH_AGENTS_HOME: join(root, 'official-agents'),
    MINDECK_HOME: join(root, 'mindeck'), MINDECK_AGENTS_HOME: join(root, 'mindeck-agents'),
    MINDECK_USER_DATA_DIR: join(root, 'browser'), DSH_CLIENT_TITLE: 'Mindeck Dev' }
  const output = execFileSync(process.execPath, [
    '--import', pathToFileURL(join(import.meta.dirname, 'mindeck-environment.ts')).href,
    '-e', 'console.log(JSON.stringify({home:process.env.DSH_HOME,agents:process.env.DSH_AGENTS_HOME,title:process.env.DSH_CLIENT_TITLE}))',
  ], { encoding: 'utf8', env: environment, timeout: 30_000, windowsHide: true })
  expect(JSON.parse(output)).toEqual({ home: environment.MINDECK_HOME, agents: environment.MINDECK_AGENTS_HOME, title: 'Mindeck Dev' })
  expect(process.env.DSH_HOME).toBe(inherited)
})
