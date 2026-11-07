/** Product metadata reaches pre-plugin boot and the real assembled application. */
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import { launchWebScaffold } from './scaffold.ts'

it.each([
  { product: 'upstream', name: 'DeepSeek Harness', title: 'DeepSeek Harness', selected: false },
  { product: 'mindeck', name: 'Mindeck', title: 'Mindeck Dev', selected: true },
  { product: 'mindeck', name: 'Acme Desk', title: 'Acme Desk Dev', selected: true },
] as const)('assembles $product with $name without rewriting dictionaries', async ({ product, name, title, selected }) => {
  const scaffold = await launchWebScaffold({
    product,
    ...product === 'upstream' ? {} : { localeParameters: { productName: name, productTitle: title } },
    developerTools: false,
  })
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ locale: 'en-US', viewport: { width: 1280, height: 900 } })
    await page.addInitScript(() => {
      const seen: string[] = []
      Reflect.set(globalThis, '__PRODUCT_BOOT_SEEN__', seen)
      new MutationObserver(() => {
        const boot = document.querySelector('[data-dsh-boot]')
        if (boot?.textContent) seen.push(boot.textContent)
      }).observe(document, { subtree: true, childList: true })
    })
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.getByRole('button', { name: 'New session', exact: true }).first().waitFor({ timeout: 30_000 })
    await page.waitForFunction(expected => document.title === expected, title)
    expect(await page.evaluate((): unknown => Reflect.get(globalThis, '__DSH_LOCALE_PARAMETERS__')))
      .toMatchObject({ productName: name, productTitle: title })
    expect(await page.evaluate((): unknown => Reflect.get(globalThis, '__PRODUCT_BOOT_SEEN__')))
      .toEqual(expect.arrayContaining([expect.stringContaining(name)]))
    const entries = Array.from(scaffold.ctx.loader.entries())
    expect(entries.some(entry => entry.options.name === '@deepseek-ai/dsh-client-ui-brand-mindeck')).toBe(selected)
    if (selected) {
      await page.getByRole('img', { name, exact: true }).first().waitFor()
      await page.getByText(name, { exact: true }).first().waitFor()
    } else {
      expect(await page.getByRole('img', { name: 'Mindeck', exact: true }).count()).toBe(0)
    }
    expect(await page.locator('body').innerText()).not.toContain('{productName}')
    const directory = resolve('.scratch/mindeck-product-branding')
    await mkdir(directory, { recursive: true })
    await page.screenshot({ path: resolve(directory, `assembled-${name.replaceAll(' ', '-')}.png`) })
  } finally {
    await browser.close()
    await scaffold.close()
  }
}, 120_000)
