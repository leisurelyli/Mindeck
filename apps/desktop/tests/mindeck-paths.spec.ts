import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveMindeckPaths } from '@deepseek-ai/dsh-mindeck-app/paths'

const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

async function fixture() {
  const home = await mkdtemp(join(tmpdir(), 'mindeck-paths-'))
  directories.push(home)
  return { home, appData: join(home, 'app-data'), development: false, environment: {} }
}

describe('Mindeck state ownership', () => {
  it('separates installed and development state despite inherited Harness overrides', async () => {
    const request = await fixture()
    const environment = { DSH_HOME: join(request.home, '.dsh'), DSH_AGENTS_HOME: join(request.home, '.agents') }
    const installed = resolveMindeckPaths({ ...request, environment })
    const development = resolveMindeckPaths({ ...request, environment, development: true })
    expect(installed).toEqual({ home: join(request.home, '.mindeck-workspace'),
      agentsHome: join(request.home, '.mindeck-workspace', 'agents'), userData: join(request.appData, 'MindeckWorkspace') })
    expect(development.home).toBe(join(request.home, '.mindeck-workspace-dev'))
    expect(development.userData).toBe(join(request.appData, 'MindeckWorkspaceDev'))
    expect(environment.DSH_HOME).toBe(join(request.home, '.dsh'))
  })

  it('accepts explicit Mindeck directories without mutating its input', async () => {
    const request = await fixture()
    const environment = { MINDECK_HOME: join(request.home, 'custom'), MINDECK_AGENTS_HOME: join(request.home, 'custom-agents'),
      MINDECK_USER_DATA_DIR: join(request.appData, 'custom-browser') }
    expect(resolveMindeckPaths({ ...request, environment })).toEqual({ home: environment.MINDECK_HOME,
      agentsHome: environment.MINDECK_AGENTS_HOME, userData: environment.MINDECK_USER_DATA_DIR })
  })

  it.each(['MINDECK_HOME', 'MINDECK_AGENTS_HOME', 'MINDECK_USER_DATA_DIR'])(
    'rejects relative or reserved locations supplied through %s', async (name) => {
      const request = await fixture()
      for (const value of ['', 'relative/path', request.home, join(request.home, '.dsh'),
        join(request.home, '.dsh', 'nested'), join(request.home, '.agents'),
        join(request.appData, 'DeepSeek Harness'), join(request.appData, 'Mindeck'),
        join(request.appData, '@deepseek-ai', 'dsh-desktop')]) {
        expect(() => resolveMindeckPaths({ ...request, environment: { [name]: value } })).toThrow(name)
      }
    },
  )

  it('rejects an existing directory alias into official state before creating new state', async () => {
    const request = await fixture()
    const official = join(request.home, '.dsh')
    const alias = join(request.home, 'alias')
    await mkdir(official)
    await symlink(official, alias, process.platform === 'win32' ? 'junction' : 'dir')
    expect(() => resolveMindeckPaths({ ...request, environment: { MINDECK_HOME: join(alias, 'new') } })).toThrow('MINDECK_HOME')
  })
})
