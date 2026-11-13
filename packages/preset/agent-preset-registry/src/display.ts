/**
 * Display resolution for roster presets, shared by every surface that renders
 * preset names: shipped presets resolve through locale dictionary keys, a
 * declaration's localized metadata resolves through the client locale, and
 * literal metadata is never translated. A pure fold with no runtime imports, so
 * browser bundles inline it and the Host uses the same single home for which
 * shipped id carries which copy key.
 * @module @deepseek-ai/dsh-agent-preset-registry/display
 */
import type { LocalizedText } from '@deepseek-ai/dsh-package-manifest'

/** Dictionary keys carrying one shipped preset's display copy. */
export type BuiltInPresetCopyKey =
  | 'presetStandardName' | 'presetStandardDescription'
  | 'presetPtcName' | 'presetPtcDescription'
  | 'presetMinimalName' | 'presetMinimalDescription'
  | 'presetCordisName' | 'presetCordisDescription'

/** Preset roster fields needed to resolve display copy. */
export interface PresetDisplaySource {
  /** Stable preset id. */
  readonly id: string
  /** Name published by the preset. */
  readonly name?: LocalizedText
  /** Description published by the preset. */
  readonly description?: LocalizedText
}

/**
 * Pick the active locale's entry of published preset text; a literal stays verbatim.
 * Clients pass `ctx.locale.resolveText`.
 */
export type PresetTextResolver = (text: LocalizedText) => string

/** Display copy resolved for the active locale. */
export interface PresetDisplayText {
  /** Localized built-in name or the preset's own fallback name. */
  readonly name: string
  /** Localized built-in description or the preset's own description. */
  readonly description?: string
}

interface PresetLocaleKeys {
  readonly name: BuiltInPresetCopyKey
  readonly description: BuiltInPresetCopyKey
}

const BUILT_IN_PRESET_KEYS: Readonly<Partial<Record<string, PresetLocaleKeys>>> = {
  standard: { name: 'presetStandardName', description: 'presetStandardDescription' },
  ptc: { name: 'presetPtcName', description: 'presetPtcDescription' },
  minimal: { name: 'presetMinimalName', description: 'presetMinimalDescription' },
  cordis: { name: 'presetCordisName', description: 'presetCordisDescription' },
}

/**
 * Whether a roster row is one of the shipped presets whose copy the dictionaries carry.
 * A shipped preset publishes no `name`; a declaration that names itself owns its copy.
 * @param preset - roster row.
 * @returns true for a shipped preset id without a published name.
 */
export function isBuiltInPreset(preset: PresetDisplaySource): boolean {
  return preset.name === undefined && BUILT_IN_PRESET_KEYS[preset.id] !== undefined
}

/**
 * Resolve preset display copy without making user-authored metadata translatable.
 * @param preset - roster row whose copy is being rendered.
 * @param t - active locale lookup covering {@link BuiltInPresetCopyKey}.
 * @param resolveText - active locale pick for the declaration's own metadata.
 * @returns localized copy for a known shipped preset, otherwise the declaration's metadata in the active locale.
 */
export function presetDisplayText(
  preset: PresetDisplaySource,
  t: (key: BuiltInPresetCopyKey) => string,
  resolveText: PresetTextResolver,
): PresetDisplayText {
  const keys = isBuiltInPreset(preset) ? BUILT_IN_PRESET_KEYS[preset.id] : undefined
  if (keys !== undefined) return { name: t(keys.name), description: t(keys.description) }
  return {
    name: preset.name === undefined ? preset.id : resolveText(preset.name),
    ...preset.description === undefined ? {} : { description: resolveText(preset.description) },
  }
}
