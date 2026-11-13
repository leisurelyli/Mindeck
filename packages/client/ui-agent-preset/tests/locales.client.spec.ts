/** Web-localized copy for the four shipped presets and declared copy for every other row. */

import { describe, expect, it } from 'vitest'
import { en, ja, presetDisplayText, zh, type PresetTextResolver } from '../src/client/locales.ts'

const translate = (bundle: typeof en) => (key: keyof typeof en): string => bundle[key]
const english: PresetTextResolver = text => typeof text === 'string' ? text : text.en

describe('preset display copy', () => {
  it.each([
    ['standard', 'presetStandardName', 'presetStandardDescription'],
    ['ptc', 'presetPtcName', 'presetPtcDescription'],
    ['minimal', 'presetMinimalName', 'presetMinimalDescription'],
    ['cordis', 'presetCordisName', 'presetCordisDescription'],
  ] as const)('localizes the shipped %s preset in English, Chinese, and Japanese', (id, nameKey, descriptionKey) => {
    const preset = { id }

    expect(presetDisplayText(preset, translate(en), english))
      .toEqual({ name: en[nameKey], description: en[descriptionKey] })
    expect(presetDisplayText(preset, translate(zh), english))
      .toEqual({ name: zh[nameKey], description: zh[descriptionKey] })
    expect(presetDisplayText(preset, translate(ja), english))
      .toEqual({ name: ja[nameKey], description: ja[descriptionKey] })
  })

  it('keeps declared metadata untranslated for named and unknown presets', () => {
    const fileCopy = { name: '我的标准', description: '团队自己的 preset。' }

    expect(presetDisplayText({ id: 'standard', ...fileCopy }, translate(en), english))
      .toEqual(fileCopy)
    expect(presetDisplayText({ id: 'deployment-extra', ...fileCopy }, translate(en), english))
      .toEqual(fileCopy)
    expect(presetDisplayText({ id: 'bare' }, translate(en), english))
      .toEqual({ name: 'bare' })
  })
})
