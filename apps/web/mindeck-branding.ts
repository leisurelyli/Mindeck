/** Mindeck document branding applied after the upstream Web build hooks. */
import type { Plugin } from 'vite'
import product from '@deepseek-ai/dsh-mindeck-app/src/product.json' with { type: 'json' }

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Apply the product descriptor after the upstream document-title hook.
 * @returns Vite plugin that selects Mindeck titles and mount-relative installable Web artwork.
 */
export function mindeckBranding(): Plugin {
  return {
    name: 'mindeck-branding',
    transformIndexHtml(html) {
      const profile = process.env.DSH_CLIENT_BUILD_PROFILE
      const title = profile === 'official'
        ? product.name
        : profile === 'local'
          ? product.developmentName
          : process.env.DSH_CLIENT_TITLE ?? product.developmentName
      const assetBase = escapeHtml(`./${product.branding.webDirectory}`)
      let faviconWritten = false
      return html
        .replace(/<title>[^]*?<\/title>/i, () => `<title>${escapeHtml(title)}</title>`)
        .replace(/<link\b[^>]*\brel="manifest"[^>]*>/gi, () => `<link rel="manifest" href="${escapeHtml(`./${product.branding.webManifest}`)}" />`)
        .replace(/<link\b[^>]*\brel="apple-touch-icon"[^>]*>/gi, () => `<link rel="apple-touch-icon" href="${assetBase}/apple-touch-icon.png" />`)
        .replace(/<meta\b[^>]*\bname="apple-mobile-web-app-title"[^>]*>/gi, () => `<meta name="apple-mobile-web-app-title" content="${escapeHtml(product.name)}" />`)
        .replace(/<link\b[^>]*\brel="icon"[^>]*>/gi, () => {
          if (faviconWritten) return ''
          faviconWritten = true
          return `<link rel="icon" type="image/svg+xml" href="${assetBase}/mark.svg" />`
        })
    },
  }
}
