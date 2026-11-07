/** Platform artwork generated from the supplied Mindeck SVG. */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import {
  MINDECK_ICON_SOURCE, MINDECK_WEB_ICON_VARIANTS, MINDECK_MASKABLE_SAFE_RADIUS,
  mindeckIconDocument, renderMindeckIcons,
} from '../scripts/render-mindeck-icons.ts'
import { TRAY_ICON_SIZES, unpackIco } from '../scripts/render-tray-icon.ts'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

describe('Mindeck platform artwork', () => {
  it('ships the generated SVG artwork and platform bitmap sizes', async () => {
    const source = await readFile(MINDECK_ICON_SOURCE, 'utf8')
    const generated = await renderMindeckIcons(source)
    expect(generated.size).toBe(15)
    for (const [file, bytes] of generated) {
      const shipped = await readFile(resolve(ROOT, file))
      if (file.endsWith('.svg')) {
        expect(shipped.toString()).toBe(mindeckIconDocument(source))
      } else if (file.endsWith('.png')) {
        const original = file.includes('/installer/')
          ? await sharp(resolve(ROOT, file.replace('/assets/mindeck/', '/assets/'))).metadata()
          : undefined
        const expected = file.includes('/desktop/') ? 1024
          : MINDECK_WEB_ICON_VARIANTS.find(variant => file.endsWith(variant.file))!.size
        for (const png of [bytes, shipped]) {
          const { width, height } = await sharp(png).metadata()
          expect([width, height]).toEqual(original === undefined ? [expected, expected] : [original.width, original.height])
        }
      }
    }
  })

  it('preserves the supplied colors and keeps transparent and opaque variants distinct', async () => {
    for (const variant of MINDECK_WEB_ICON_VARIANTS) {
      const { data, info } = await sharp(resolve(ROOT, 'apps/web/public', variant.file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      const pixel = (x: number, y: number): number[] => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)]
      expect(pixel(Math.floor(info.width * 0.3), Math.floor(info.height * 0.35))).toEqual([28, 135, 252, 255])
      expect(pixel(Math.floor(info.width * 0.7), Math.floor(info.height * 0.35))).toEqual([117, 237, 241, 255])
      expect(pixel(0, 0)).toEqual(variant.kind === 'any' ? [0, 0, 0, 0] : [255, 255, 255, 255])
      if (variant.kind !== 'maskable') continue
      let radius = 0
      for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
        const at = (y * info.width + x) * 4
        if (Math.min(data[at]!, data[at + 1]!, data[at + 2]!) >= 245) continue
        radius = Math.max(radius, Math.hypot(x - (info.width - 1) / 2, y - (info.height - 1) / 2))
      }
      expect(radius).toBeGreaterThan(0)
      expect(radius).toBeLessThanOrEqual(info.width * MINDECK_MASKABLE_SAFE_RADIUS)
    }
  })

  it('provides tray scale frames and a 256 pixel executable frame', async () => {
    const tray = unpackIco(await readFile(resolve(ROOT, 'apps/desktop/resources/mindeck/tray.ico')))
    const app = unpackIco(await readFile(resolve(ROOT, 'apps/desktop/resources/mindeck/app.ico')))
    expect(tray.map(entry => entry.size)).toEqual([...TRAY_ICON_SIZES])
    expect(app.map(entry => entry.size)).toEqual([...TRAY_ICON_SIZES, 128, 256])
  })

  it('rejects missing or nonsquare SVG view boxes', () => {
    expect(() => mindeckIconDocument('')).toThrow(/no SVG root/)
    expect(() => mindeckIconDocument('<svg></svg>')).toThrow(/square viewBox/)
    expect(() => mindeckIconDocument('<svg viewBox="0 0 16 20"></svg>')).toThrow(/square viewBox/)
  })
})
