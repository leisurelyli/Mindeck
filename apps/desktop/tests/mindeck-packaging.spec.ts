import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { AppInfo, Packager } from 'app-builder-lib'
import { join } from 'node:path'
import { desktopApplicationPaths } from '../scripts/mindeck-application-paths.mjs'
import { createElectronBuilderConfig } from '../scripts/electron-builder-config.mjs'
import { resolveDesktopAppId } from '../scripts/desktop-release-environment.mjs'

describe('Mindeck installation identity', () => {
  it.each(['win-x64', 'mac-arm64', 'mac-x64'] as const)('locates the Mindeck executable for %s inside build outputs', (target) => {
    const paths = desktopApplicationPaths('artifacts', target)
    expect(paths.executable).toBe(target === 'win-x64'
      ? join('artifacts', 'win-unpacked', 'Mindeck.exe')
      : join('artifacts', target === 'mac-arm64' ? 'mac-arm64' : 'mac', 'Mindeck.app', 'Contents', 'MacOS', 'Mindeck'))
  })
  it('separates installer data and updater cache names from the official package', () => {
    const config = createElectronBuilderConfig({ DSH_DESKTOP_UNSIGNED: '1' }, 'darwin', 'arm64')
    const metadata: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    if (metadata === null || typeof metadata !== 'object') throw new Error('Invalid Desktop package fixture')
    const packager = new Packager({ projectDir: tmpdir() })
    Object.defineProperties(packager, {
      config: { value: config },
      metadata: { value: { ...metadata, ...config.extraMetadata } },
    })
    const appInfo = new AppInfo(packager, undefined)
    expect(appInfo.name).toBe('mindeck-workspace')
    expect(appInfo.updaterCacheDirName).toBe('mindeck-workspace-updater')
  })
  it('uses a Mindeck application ID when no release override is supplied', () => {
    expect(resolveDesktopAppId({})).toBe('io.github.leisurelyli.mindeck.workspace')
  })

  it('refuses official Harness application identifiers', () => {
    expect(() => resolveDesktopAppId({ DSH_DESKTOP_APP_ID: 'com.deepseek.harness' })).toThrow('Mindeck')
  })
  it('packages a separate product without registering the Harness link protocol', () => {
    const config = createElectronBuilderConfig({
      DSH_DESKTOP_APP_ID: 'io.github.leisurelyli.mindeck.workspace',
      DSH_DESKTOP_UNSIGNED: '1',
    }, 'darwin', 'arm64')

    expect({ name: config.productName, id: config.appId, protocols: config.protocols }).toEqual({
      name: 'Mindeck',
      id: 'io.github.leisurelyli.mindeck.workspace',
      protocols: [{ name: 'Mindeck', schemes: ['mindeck-workspace'] }],
    })
    expect(config.publish).toBeNull()
    expect(config.extraMetadata).not.toHaveProperty('dshMandatoryUpdatePolicy')
  })
})
