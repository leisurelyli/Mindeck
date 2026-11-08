/** Product identity reaches native and installer translations through one explicit name. */
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import { mindeckProduct as product } from '@deepseek-ai/dsh-mindeck-app'
import { resolveDesktopLocale } from '../src/locale.ts'
import { readInstallerLocales, renderInstallerStrings } from '../scripts/installer-locales.mjs'

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

it.each(languages)('uses the explicit product name in every %s native product message', (id, _installerId, aboutMenu) => {
  const messages = resolveDesktopLocale(id, renamedProduct).messages
  expect(messages.aboutMenu).toBe(aboutMenu)
  for (const key of [
    'aboutMenu', 'aboutProduct', 'hideApplication', 'quitApplication', 'openApplication', 'quitTitle',
    'startupFailed', 'startupAddressInUse', 'welcomeTitle', 'welcomeBrand', 'welcomeTaglineBrand', 'updateTitle',
  ] as const) {
    expect(messages[key], `${id}.${key}`).toContain(renamedProduct)
  }
  if (id !== 'zh-CN') expect(messages.welcomeKeyDescription).toContain(renamedProduct)
  expect(messages.welcomeKeyDescription).toContain('DeepSeek')
  const baseline = resolveDesktopLocale(id, product.name).messages
  for (const [key, text] of Object.entries(baseline)) {
    expect(messages[key as keyof typeof messages], `${id}.${key}`)
      .toBe(text.replaceAll(product.name, () => renamedProduct))
  }
})

it.each(languages)('compiles the explicit product name into the %s installer output', async (_id, installerId) => {
  const locale = readInstallerLocales(undefined, renamedProduct).find(value => value.id === installerId)!
  for (const key of ['INSTALLER_LAUNCH_FAILED', 'INSTALLER_RUNNING', 'INSTALLER_PATH_OWNERSHIP']) {
    expect(locale.strings[key], `${installerId}.${key}`).toContain(renamedProduct)
  }
  const baseline = readInstallerLocales().find(value => value.id === installerId)!
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
  const locales = readInstallerLocales(directory, renamedProduct)
  for (const locale of locales) {
    expect(locale.strings.INSTALLER_RUNNING).toBe('Northstar $& Desk / Northstar $& Desk {missing} {version} %s %d%%')
    expect(locale.uninstaller.welcome).toBe('Northstar $& Desk {missing}')
  }
  expect(renderInstallerStrings(locales)).toContain('Northstar $$& Desk / Northstar $$& Desk {missing} {version} %s %d%%')
})

it('keeps the default native and installer product display', () => {
  expect(resolveDesktopLocale('en', product.name).messages.aboutMenu).toBe('About Mindeck')
  expect(readInstallerLocales()[0]!.strings.INSTALLER_RUNNING)
    .toBe('Mindeck is running. Quit it from the system tray and try again.')
})
