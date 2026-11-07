// @vitest-environment jsdom
import { expect, it, onTestFinished, vi } from 'vitest'
import { AppWebEntry } from '../src/boot.ts'

it.each([
  ['Mindeck', 'Mindeck Dev'],
  ['Acme Desk', 'Acme Desk Dev'],
] as const)('waits for native presentation before fixing the loading identity: %s', async (name, title) => {
  const ready = Promise.withResolvers<undefined>()
  vi.stubGlobal('__DSH_BOOT_READY__', { promise: ready.promise })
  vi.stubGlobal('__DSH_LOCALE_PARAMETERS__', undefined)
  vi.stubGlobal('__ModuleLoader__', undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  document.title = title
  const root = document.createElement('div')
  document.body.append(root)
  const entry = new AppWebEntry(root)
  const running = entry.run()
  onTestFinished(async () => {
    ready.resolve(undefined)
    await running
    await entry.dispose()
    root.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
  expect(document.title).toBe(title)
  expect(root.textContent).not.toContain('DeepSeek Harness')
  Reflect.set(globalThis, '__DSH_LOCALE_PARAMETERS__', { productName: name, productTitle: title })
  ready.resolve(undefined)
  await running
  expect(root.textContent).toContain(name)
  expect(document.title).toBe(title)
})
