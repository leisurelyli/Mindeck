/** Browser decoding of the shipped Mindeck install metadata and artwork. */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { chromium, type Page } from 'playwright'


const DIST_ROOT = fileURLToPath(new URL('../dist/', import.meta.url))
const PUBLIC_ROOT = fileURLToPath(new URL('../public/', import.meta.url))
const MINDECK_ICON_SOURCE = fileURLToPath(new URL('../../../packages/client/ui-brand-mindeck/src/client/assets/mindeck.svg', import.meta.url))
const MINDECK_MASKABLE_SAFE_RADIUS = 0.4
const MINDECK_WEB_ICON_VARIANTS = [
  { file: 'mindeck/icon-192.png', size: 192, kind: 'any' },
  { file: 'mindeck/icon-512.png', size: 512, kind: 'any' },
  { file: 'mindeck/icon-maskable-512.png', size: 512, kind: 'maskable' },
  { file: 'mindeck/apple-touch-icon.png', size: 180, kind: 'apple' },
] as const

async function pixels(page: Page, url: string, size: number) {
  return page.evaluate(async ({ url, size }) => {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0, size, size)
    const { data } = context.getImageData(0, 0, size, size)
    let radius = 0
    let blue = 0
    let cyan = 0
    let partial = 0
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const at = (y * size + x) * 4
      const r = data[at]!, g = data[at + 1]!, b = data[at + 2]!, alpha = data[at + 3]!
      if (alpha > 0 && alpha < 255) partial++
      if (alpha < 16 || Math.min(r, g, b) >= 245) continue
      radius = Math.max(radius, Math.hypot(x - (size - 1) / 2, y - (size - 1) / 2))
      if (r < 70 && g > 100 && g < 180 && b > 220) blue++
      if (r > 80 && r < 160 && g > 210 && b > 210) cyan++
    }
    return {
      width: image.naturalWidth, height: image.naturalHeight, radius, blue, cyan, partial,
      corners: [0, size - 1, (size - 1) * size, size * size - 1].map(index => data[index * 4 + 3]),
    }
  }, { url, size })
}

function imageUrl(bytes: Buffer, type: 'png' | 'svg+xml'): string {
  return `data:image/${type};base64,${bytes.toString('base64')}`
}

it('keeps install navigation and artwork within a nested application mount', async () => {
  const browser = await chromium.launch({ headless: true })
  const origin = 'https://mindeck.test'
  const mount = '/tools/mindeck/'
  try {
    const page = await browser.newPage()
    await page.route(`${origin}/**`, async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      if (!path.startsWith(mount)) return route.fulfill({ status: 404 })
      if (request.resourceType() === 'script' || request.resourceType() === 'stylesheet') return route.abort()
      const asset = path.slice(mount.length) || 'index.html'
      await route.fulfill({
        body: await readFile(join(DIST_ROOT, asset)),
        contentType: asset.endsWith('.html') ? 'text/html'
          : asset.endsWith('.webmanifest') ? 'application/manifest+json'
            : asset.endsWith('.svg') ? 'image/svg+xml' : 'image/png',
      })
    })
    await page.goto(`${origin}${mount}`)
    const installed = await page.evaluate(async () => {
      const manifestUrl = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!.href
      const response = await fetch(manifestUrl)
      if (!response.ok) throw new Error(`Manifest ${manifestUrl}: HTTP ${response.status}`)
      const manifest: unknown = await response.json()
      if (manifest === null || typeof manifest !== 'object'
        || !('start_url' in manifest) || typeof manifest.start_url !== 'string'
        || !('scope' in manifest) || typeof manifest.scope !== 'string'
        || !('icons' in manifest) || !Array.isArray(manifest.icons)) {
        throw new Error('Manifest must declare start_url, scope and icons')
      }
      const artwork = [
        ...manifest.icons.map((icon: unknown) => {
          if (icon === null || typeof icon !== 'object' || !('src' in icon) || typeof icon.src !== 'string') {
            throw new Error('Manifest icons must declare src')
          }
          return new URL(icon.src, manifestUrl).href
        }),
        document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')!.href,
        document.querySelector<HTMLLinkElement>('link[rel="icon"]')!.href,
      ]
      return {
        start: new URL(manifest.start_url, manifestUrl).href,
        scope: new URL(manifest.scope, manifestUrl).href,
        artwork: await Promise.all(artwork.map(async url => ({ url, status: (await fetch(url)).status }))),
      }
    })
    expect(installed.start).toBe(`${origin}${mount}`)
    expect(installed.scope).toBe(`${origin}${mount}`)
    for (const asset of installed.artwork) {
      expect(new URL(asset.url).pathname.startsWith(mount)).toBe(true)
      expect(asset.status).toBe(200)
    }
  } finally { await browser.close() }
})

it('decodes every public and shipped icon with both original colors', async () => {
  const source = await readFile(MINDECK_ICON_SOURCE, 'utf8')
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    for (const variant of MINDECK_WEB_ICON_VARIANTS) {
      const shipped = await readFile(join(DIST_ROOT, variant.file))
      const reference = await pixels(page, imageUrl(Buffer.from(source), 'svg+xml'), variant.size)
      for (const png of [await readFile(join(PUBLIC_ROOT, variant.file)), shipped]) {
        const decoded = await pixels(page, imageUrl(png, 'png'), variant.size)
        expect([decoded.width, decoded.height]).toEqual([variant.size, variant.size])
        expect(decoded.blue).toBeGreaterThan(0)
        expect(decoded.cyan).toBeGreaterThan(0)
        if (variant.kind !== 'maskable') expect(Math.abs(decoded.radius - reference.radius)).toBeLessThanOrEqual(2)
        expect(decoded.corners).toEqual(Array<number>(4).fill(variant.kind === 'any' ? 0 : 255))
      }
    }
  } finally { await browser.close() }
})

it('uses the same full-color transparent favicon in light and dark modes', async () => {
  const favicon = await readFile(join(DIST_ROOT, 'mindeck/mark.svg'))
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme })
      const decoded = await pixels(page, imageUrl(favicon, 'svg+xml'), 32)
      expect(decoded.blue).toBeGreaterThan(0)
      expect(decoded.cyan).toBeGreaterThan(0)
      expect(decoded.corners).toEqual([0, 0, 0, 0])
    }
  } finally { await browser.close() }
})

it('keeps smooth transparent edges and maskable artwork inside its opaque safe zone', async () => {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    const transparent = await pixels(page, imageUrl(await readFile(join(DIST_ROOT, 'mindeck/icon-512.png')), 'png'), 512)
    const maskable = await pixels(page, imageUrl(await readFile(join(DIST_ROOT, 'mindeck/icon-maskable-512.png')), 'png'), 512)
    expect(transparent.partial).toBeGreaterThan(0)
    expect(transparent.radius).toBeGreaterThan(512 * MINDECK_MASKABLE_SAFE_RADIUS)
    expect(maskable.radius).toBeGreaterThan(0)
    expect(maskable.radius).toBeLessThanOrEqual(512 * MINDECK_MASKABLE_SAFE_RADIUS)
    expect(maskable.corners).toEqual([255, 255, 255, 255])
  } finally { await browser.close() }
})
