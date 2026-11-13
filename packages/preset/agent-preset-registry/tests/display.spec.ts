/**
 * Display resolution: shipped presets resolve through dictionary keys, published
 * translations resolve through the active locale, and literal metadata is never translated.
 */

import { describe, expect, it } from 'vitest'
import { presetDisplayText, type BuiltInPresetCopyKey, type PresetTextResolver } from '../src/display.ts'

const t = (key: BuiltInPresetCopyKey): string => `t:${key}`
const zh: PresetTextResolver = text => typeof text === 'string' ? text : text['zh'] ?? text.en

describe('presetDisplayText', () => {
  it('resolves a shipped preset through its dictionary keys', () => {
    expect(presetDisplayText({ id: 'standard' }, t, zh)).toEqual({
      name: 't:presetStandardName',
      description: 't:presetStandardDescription',
    })
  })

  it('keeps user-authored metadata untranslated', () => {
    expect(presetDisplayText({ id: 'mine', name: '我的模式', description: '自述' }, t, zh))
      .toEqual({ name: '我的模式', description: '自述' })
  })

  it('resolves published translations in the active locale', () => {
    const preset = {
      id: 'helper',
      name: { en: 'General assistant', zh: '通用助手' },
      description: { en: 'Ask anything.' },
    }
    expect(presetDisplayText(preset, t, zh)).toEqual({ name: '通用助手', description: 'Ask anything.' })
  })

  it('lets a declaration that names a shipped id own its copy', () => {
    expect(presetDisplayText({ id: 'standard', name: { en: 'Team default', zh: '团队默认' } }, t, zh))
      .toEqual({ name: '团队默认' })
  })

  it('falls back to the id for a preset publishing no metadata', () => {
    // A system id outside the shipped set behaves like authored metadata:
    // there is no dictionary copy to resolve.
    expect(presetDisplayText({ id: 'future' }, t, zh)).toEqual({ name: 'future' })
    expect(presetDisplayText({ id: 'bare' }, t, zh)).toEqual({ name: 'bare' })
  })
})
