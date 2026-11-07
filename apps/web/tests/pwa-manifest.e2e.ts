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

it('ships Mindeck install metadata with relative mount identity', async () => {
  const index = await readFile(join(DIST_ROOT, 'index.html'), 'utf8')
  expect(index).toContain('<meta name="viewport" content="width=device-width, initial-scale=1" />')
  expect(index).toContain('<link rel="manifest" href="./mindeck.webmanifest" />')
  expect(index).toContain('<link rel="apple-touch-icon" href="./mindeck/apple-touch-icon.png" />')
  expect(index).toContain('<meta name="mobile-web-app-capable" content="yes" />')
  expect(index).toContain('<meta name="apple-mobile-web-app-title" content="Mindeck" />')
  const manifest: unknown = JSON.parse(await readFile(join(DIST_ROOT, 'mindeck.webmanifest'), 'utf8'))
  // An absent id defaults to the mount-relative start_url.
  expect(manifest).toEqual({
    name: 'Mindeck', short_name: 'Mindeck', start_url: './', scope: './', display: 'standalone',
    background_color: '#ffffff', theme_color: '#ffffff',
    icons: [
      { src: 'mindeck/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'mindeck/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'mindeck/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  })
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
  const index = await readFile(join(DIST_ROOT, 'index.html'), 'utf8')
  expect(index).toContain('<link rel="icon" type="image/svg+xml" href="./mindeck/mark.svg" />')
  const favicon = await readFile(join(DIST_ROOT, 'mindeck/mark.svg'))
  const source = await readFile(MINDECK_ICON_SOURCE, 'utf8')
  const shapes = source.match(/<(?:path|rect)\b[^>]*>/gu) ?? []
  expect(shapes.length).toBeGreaterThan(0)
  for (const shape of shapes) expect(favicon.toString()).toContain(shape)
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
