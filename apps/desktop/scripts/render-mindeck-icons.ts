/** Generate Mindeck platform icons from the client brand plugin's master SVG. */
import product from '../src/product.json' with { type: 'json' }
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { packIco, TRAY_ICON_SIZES } from './render-tray-icon.ts'

const REPOSITORY = fileURLToPath(new URL('../../../', import.meta.url))
const RASTER_EDGE = 1024

/** The supplied artwork, preserved independently of platform outputs. */
export const MINDECK_ICON_SOURCE = resolve(REPOSITORY, product.branding.masterSvg)

/** Maskable artwork stays inside the platform's central safe circle. */
export const MINDECK_MASKABLE_SCALE = 0.82

/** Radius of the PWA maskable icon's guaranteed visible circle. */
export const MINDECK_MASKABLE_SAFE_RADIUS = 0.4

/** Web icon filenames are relative to the Web application's public root. */
export const MINDECK_WEB_ICON_VARIANTS = [
  { file: `${product.branding.webDirectory}/icon-192.png`, size: 192, kind: 'any' },
  { file: `${product.branding.webDirectory}/icon-512.png`, size: 512, kind: 'any' },
  { file: `${product.branding.webDirectory}/icon-maskable-512.png`, size: 512, kind: 'maskable' },
  { file: `${product.branding.webDirectory}/apple-touch-icon.png`, size: 180, kind: 'apple' },
] as const

/**
 * Serialize installable Web metadata from the product descriptor and generated icons.
 * @param name - Display name selected by the installation descriptor.
 * @returns A complete manifest document with unchanged application scope.
 */
export function renderMindeckWebManifest(name: string = product.name): string {
  return JSON.stringify({
    name,
    short_name: name,
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: MINDECK_WEB_ICON_VARIANTS.filter(variant => variant.kind !== 'apple').map(variant => ({
      src: variant.file, sizes: `${variant.size}x${variant.size}`, type: 'image/png', purpose: variant.kind,
    })),
  }, null, 2) + '\n'
}

/**
 * Prepare the supplied square SVG for a platform icon without changing its paths or colors.
 * @param source - Master SVG document with a square viewBox.
 * @param kind - Transparent artwork, an opaque maskable icon, or an opaque Apple touch icon.
 * @returns a standalone SVG with fixed intrinsic dimensions and the original coordinate system.
 */
export function mindeckIconDocument(source: string, kind: 'any' | 'maskable' | 'apple' = 'any'): string {
  const root = /<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/u.exec(source)
  if (root === null) throw new Error('Mindeck artwork has no SVG root element')
  const attributes = root[1]!.replace(/\s(?:width|height)="[^"]*"/gu, '')
  const viewBox = /\bviewBox="([^"]+)"/u.exec(attributes)?.[1]?.trim().split(/[\s,]+/u).map(Number)
  if (viewBox === undefined || viewBox.length !== 4 || !viewBox.every(Number.isFinite)
    || viewBox[2]! <= 0 || viewBox[2] !== viewBox[3]) {
    throw new Error('Mindeck artwork requires a finite square viewBox')
  }
  const [x, y, edge] = viewBox
  const centerX = x! + edge! / 2
  const centerY = y! + edge! / 2
  const background = kind === 'any' ? '' : `<rect x="${x}" y="${y}" width="${edge}" height="${edge}" fill="#ffffff"/>`
  const artwork = kind === 'maskable'
    ? `<g transform="translate(${centerX} ${centerY}) scale(${MINDECK_MASKABLE_SCALE}) translate(${-centerX} ${-centerY})">${root[2]}</g>`
    : root[2]!
  return `<svg${attributes} width="${RASTER_EDGE}" height="${RASTER_EDGE}">${background}${artwork}</svg>\n`
}

async function rasterize(svg: string, size: number): Promise<Buffer> {
  return sharp(Buffer.from(svg), { density: 72 * size * 4 / RASTER_EDGE })
    .resize(size, size, { kernel: 'lanczos3' }).png().toBuffer()
}

/**
 * Render all Desktop, tray, favicon, PWA, and Welcome assets.
 * @param source - The unchanged master SVG.
 * @returns file bytes keyed by their repository-relative destination.
 */
export async function renderMindeckIcons(source: string): Promise<ReadonlyMap<string, Buffer>> {
  const artwork = mindeckIconDocument(source)
  const files = new Map<string, Buffer>([
    [`apps/web/public/${product.branding.webManifest}`, Buffer.from(renderMindeckWebManifest())],
    [`apps/web/public/${product.branding.webDirectory}/mark.svg`, Buffer.from(artwork)],
    ['apps/desktop/renderer/assets/mindeck.svg', Buffer.from(artwork)],
    [`apps/desktop/${product.branding.desktopDirectory}/icon.png`, await rasterize(artwork, RASTER_EDGE)],
  ])
  for (const variant of MINDECK_WEB_ICON_VARIANTS) {
    files.set(`apps/web/public/${variant.file}`, await rasterize(mindeckIconDocument(source, variant.kind), variant.size))
  }
  const entries = await Promise.all([...TRAY_ICON_SIZES, 128, 256].map(async size => ({
    size, png: await rasterize(artwork, size),
  })))
  files.set(`apps/desktop/${product.branding.desktopDirectory}/app.ico`, packIco(entries))
  files.set(`apps/desktop/${product.branding.desktopDirectory}/tray.ico`, packIco(entries.slice(0, TRAY_ICON_SIZES.length)))
  for (const name of ['brand', 'brand-2x', 'brand-dark', 'brand-dark-2x', 'uninstaller-sidebar']) {
    const upstream = resolve(REPOSITORY, `apps/desktop/installer/assets/${name}.png`)
    const { width, height } = await sharp(upstream).metadata()
    if (width === undefined || height === undefined) throw new Error(`Missing installer image dimensions: ${name}`)
    const edge = Math.min(width, height) * 0.85
    const mark = artwork.replace(`width="${RASTER_EDGE}" height="${RASTER_EDGE}"`,
      `x="${(width - edge) / 2}" y="${(height - edge) / 2}" width="${edge}" height="${edge}"`)
    const canvas = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${mark}</svg>`
    files.set(`apps/desktop/${product.branding.installerDirectory}/${name}.png`, await sharp(Buffer.from(canvas), { density: 288 })
      .resize(width, height, { kernel: 'lanczos3' }).png().toBuffer())
  }
  return files
}

async function main(): Promise<void> {
  const files = await renderMindeckIcons(await readFile(MINDECK_ICON_SOURCE, 'utf8'))
  for (const [relative, bytes] of files) {
    const output = resolve(REPOSITORY, relative)
    await mkdir(dirname(output), { recursive: true })
    await writeFile(output, bytes)
  }
  console.info(`Mindeck: generated ${files.size} platform assets`)
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) await main()
