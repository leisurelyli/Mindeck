/** Prepare Mindeck's required profile layers while retaining user extensions and metadata. */
import { randomUUID } from 'node:crypto'
import { constants, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { initProfile, readProfileManifest, writeProfileManifest } from '@deepseek-ai/dsh-app-boot'
import { PROFILE_TEMPLATES, type ProfileTemplate } from '@deepseek-ai/dsh-official-bundles'

const WEB_PROFILE = PROFILE_TEMPLATES.web as ProfileTemplate

/** Required base, Web, and Mindeck layers, in profile composition order. */
export const MINDECK_WEB_BUNDLES = [...WEB_PROFILE.bundles, '@deepseek-ai/dsh-mindeck-app']

/**
 * Initialize required layers before user extensions, preserving dependencies and profile patches.
 * Existing metadata is backed up byte-for-byte before a bundle change; unchanged profiles are not rewritten.
 * @param projectDir - Profile directory; callers must serialize concurrent profile operations.
 * @throws When profile initialization, manifest reading, backup creation, or manifest writing fails.
 */
export function prepareMindeckProfile(projectDir: string): void {
  initProfile(projectDir, MINDECK_WEB_BUNDLES)
  const manifest = readProfileManifest('dsh', projectDir)
  const previous = manifest.dsh?.profile?.bundles ?? []
  const required = new Set(MINDECK_WEB_BUNDLES)
  const bundles = [...MINDECK_WEB_BUNDLES, ...previous.filter(name => !required.has(name))]
  if (bundles.length === previous.length && bundles.every((name, index) => name === previous[index])) return
  copyFileSync(join(projectDir, 'package.json'), join(projectDir, `package.before-mindeck-${randomUUID()}.json`),
    constants.COPYFILE_EXCL)
  manifest.dsh = { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles } }
  writeProfileManifest(projectDir, manifest)
}
