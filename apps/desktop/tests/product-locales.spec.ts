/** Product identity reaches native and installer translations from one JSON description. */
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from 'vitest'
import product from '../src/product.json' with { type: 'json' }
import { resolveDesktopLocale as resolveDefaultLocale } from '../src/locale.ts'
import { readInstallerLocales as readDefaultInstallerLocales } from '../scripts/installer-locales.mjs'

const renamedProduct = 'Northstar $& Desk'
const languages = [
  ['en', 'en_US', 'About Northstar $& Desk'],
  ['zh-CN', 'zh_CN', '关于 Northstar $& Desk'],
  ['ja', 'ja_JP', 'Northstar $& Desk について'],
  ['es', 'es_ES', 'Acerca de Northstar $& Desk'],
  ['fr', 'fr_FR', 'À propos de Northstar $& Desk'],
  ['de', 'de_DE', 'Über Northstar $& Desk'],
  ['ru', 'ru_RU', 'О Northstar $& Desk'],
  ['pt', 'pt_BR', 'Sobre Northstar $& Desk'],
] as const

beforeEach(() => {
  vi.resetModules()
  vi.doMock('../src/product.json', () => ({ default: { ...product, name: renamedProduct } }))
})

afterEach(() => {
  vi.doUnmock('../src/product.json')
  vi.resetModules()
})

it.each(languages)('uses the product description in every %s native product message', async (id, _installerId, aboutMenu) => {
  const { resolveDesktopLocale, formatDesktopMessage } = await import('../src/locale.ts')
  const messages = resolveDesktopLocale(id).messages
  expect(messages.aboutMenu).toBe(aboutMenu)
  for (const key of [
    'aboutMenu', 'aboutProduct', 'hideApplication', 'quitApplication', 'openApplication', 'quitTitle',
    'startupFailed', 'startupAddressInUse', 'welcomeTitle', 'welcomeBrand', 'welcomeTaglineBrand', 'updateTitle',
  ] as const) {
    expect(messages[key], `${id}.${key}`).toContain(renamedProduct)
  }
  if (id !== 'zh-CN') expect(messages.welcomeKeyDescription).toContain(renamedProduct)
  expect(messages.welcomeKeyDescription).toContain('DeepSeek')
  for (const [key, text] of Object.entries(resolveDefaultLocale(id).messages)) {
    expect(messages[key as keyof typeof messages], `${id}.${key}`)
      .toBe(text.replaceAll(product.name, () => renamedProduct))
  }
  expect(formatDesktopMessage(messages.aboutVersion + ' {missing}', { version: '2.0' }))
    .toContain('2.0 {missing}')
})

it.each(languages)('compiles the product description into the %s installer output', async (_id, installerId) => {
  const { readInstallerLocales, renderInstallerStrings } = await import('../scripts/installer-locales.mjs')
  const locale = readInstallerLocales().find(value => value.id === installerId)!
  for (const key of ['INSTALLER_LAUNCH_FAILED', 'INSTALLER_RUNNING', 'INSTALLER_PATH_OWNERSHIP']) {
    expect(locale.strings[key], `${installerId}.${key}`).toContain(renamedProduct)
  }
  const baseline = readDefaultInstallerLocales().find(value => value.id === installerId)!
  for (const field of ['strings', 'uninstaller'] as const) {
    for (const [key, text] of Object.entries(baseline[field])) {
      expect(locale[field][key], `${installerId}.${key}`).toBe(text.replaceAll(product.name, () => renamedProduct))
    }
  }
  const output = renderInstallerStrings([locale])
  expect(output).toContain('Northstar $$& Desk')
  expect(output).not.toContain('{productName}')
})

it('resolves only productName and preserves other installer placeholders before compiler escaping', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-product-locales-'))
  onTestFinished(() => { rmSync(directory, { recursive: true, force: true }) })
  for (const [, id] of languages) {
    const resource = JSON.parse(readFileSync(new URL(`../installer/locales/${id}.json`, import.meta.url), 'utf8')) as {
      strings: Record<string, string>
      uninstaller: Record<string, string>
    }
    resource.strings.INSTALLER_RUNNING = '{productName} / {productName} {missing} {version} %s %d%%'
    resource.uninstaller.welcome = '{productName} {missing}'
    writeFileSync(join(directory, `${id}.json`), JSON.stringify(resource))
  }
  const { readInstallerLocales, renderInstallerStrings } = await import('../scripts/installer-locales.mjs')
  const locales = readInstallerLocales(directory)
  for (const locale of locales) {
    expect(locale.strings.INSTALLER_RUNNING).toBe('Northstar $& Desk / Northstar $& Desk {missing} {version} %s %d%%')
    expect(locale.uninstaller.welcome).toBe('Northstar $& Desk {missing}')
  }
  expect(renderInstallerStrings(locales)).toContain('Northstar $$& Desk / Northstar $$& Desk {missing} {version} %s %d%%')
})

it('keeps the default native and installer product display', () => {
  expect(resolveDefaultLocale('en').messages.aboutMenu).toBe('About Mindeck')
  expect(readDefaultInstallerLocales()[0]!.strings.INSTALLER_RUNNING)
    .toBe('Mindeck is running. Quit it from the system tray and try again.')
})
