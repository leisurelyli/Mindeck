import { readFile } from 'node:fs/promises'
import { afterEach, expect, it, vi } from 'vitest'
import product from '../src/product.json' with { type: 'json' }
import { renderMindeckWebManifest } from '../scripts/render-mindeck-icons.ts'
import { mindeckBranding } from '../../web/mindeck-branding.ts'

afterEach(() => vi.unstubAllEnvs())

async function brandedDocument(): Promise<string> {
  const html = await readFile(new URL('../../web/index.html', import.meta.url), 'utf8')
  const hook = mindeckBranding().transformIndexHtml
  if (typeof hook !== 'function') throw new Error('Expected a document transform')
  const result = await hook(html, { path: '/', filename: new URL('../../web/index.html', import.meta.url).pathname })
  if (typeof result !== 'string') throw new Error('Expected a transformed document')
  return result
}

it.each([
  [undefined, undefined, product.developmentName],
  [undefined, 'Acme & <Team> "$&"', 'Acme &amp; &lt;Team&gt; &quot;$&amp;&quot;'],
  ['official', 'DeepSeek Harness', product.name],
  ['local', 'Custom title', product.developmentName],
])('brands the initial document for profile %s and title %s', async (profile, title, expectedTitle) => {
  vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', profile)
  vi.stubEnv('DSH_CLIENT_TITLE', title)
  const html = await brandedDocument()
  expect(html).toContain(`<title>${expectedTitle}</title>`)
  expect(html).toContain(`<link rel="manifest" href="/${product.branding.webManifest}" />`)
  expect(html).toContain(`<link rel="apple-touch-icon" href="/${product.branding.webDirectory}/apple-touch-icon.png" />`)
  expect(html).toContain(`<meta name="apple-mobile-web-app-title" content="${product.name}" />`)
  expect(html.match(/<link\b[^>]*\brel="icon"[^>]*>/g)).toEqual([
    `<link rel="icon" type="image/svg+xml" href="/${product.branding.webDirectory}/mark.svg" />`,
  ])
})

it.each(['Acme Desk', 'Acme & <Team>'])('uses the configured product name in PWA metadata: %s', (name) => {
  const manifest = JSON.parse(renderMindeckWebManifest(name)) as { name: string; short_name: string; icons: unknown[] }
  expect(manifest.name).toBe(name)
  expect(manifest.short_name).toBe(name)
  expect(manifest.icons).toHaveLength(3)
})

it('uses the installation descriptor when generating the default PWA metadata', () => {
  expect(JSON.parse(renderMindeckWebManifest())).toMatchObject({ name: product.name, short_name: product.name })
})
