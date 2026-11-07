import { describe, expect, it } from 'vitest'
import { formatLocaleTemplate, parseLocaleParameters, resolveLocaleParameters } from '../src/parameters.ts'

describe('locale presentation parameters', () => {
  it('retains upstream identity by default and resolves another product without rewriting templates', () => {
    expect(resolveLocaleParameters().productName).toBe('DeepSeek Harness')
    const parameters = resolveLocaleParameters({ productName: 'Acme Desk', productTitle: 'Acme Desk Dev' })
    expect(formatLocaleTemplate('About {productName}', parameters)).toBe('About Acme Desk')
    expect(formatLocaleTemplate('{productTitle}', parameters)).toBe('Acme Desk Dev')
    expect(formatLocaleTemplate('{productName}: {count} {missing}', parameters, { count: 0 }))
      .toBe('Acme Desk: 0 {missing}')
  })

  it('retains each upstream name and lets an alternate product replace all forms', () => {
    const template = '{productName} / {productShortName} / {productAlias}'
    expect(formatLocaleTemplate(template, resolveLocaleParameters())).toBe('DeepSeek Harness / DSH / Harness')
    expect(formatLocaleTemplate(template, resolveLocaleParameters({ productName: 'Mindeck' })))
      .toBe('Mindeck / Mindeck / Mindeck')
    expect(formatLocaleTemplate(template, resolveLocaleParameters({
      productName: 'Acme Desktop', productShortName: 'Acme', productAlias: 'Desk',
    }))).toBe('Acme Desktop / Acme / Desk')
  })

  it('detaches the configured map and derives the title when only the name changes', () => {
    const input = { productName: 'Acme Desk' }
    const parameters = resolveLocaleParameters(input)
    input.productName = 'Changed'
    expect(parameters.productName).toBe('Acme Desk')
    expect(parameters.productTitle).toBe('Acme Desk')
    expect(Object.isFrozen(parameters)).toBe(true)
  })

  it.each([null, [], { productName: 1 }, { productName: ' ' }, { productShortName: '' }, { productAlias: ' ' }, { productTitle: '' }])
  ('rejects malformed parameters from the document carrier: %j', (wire) => {
    expect(() => parseLocaleParameters(wire)).toThrow()
  })

  it('accepts an absent carrier and retains ordinary named parameters', () => {
    expect(parseLocaleParameters(undefined)).toEqual(resolveLocaleParameters())
    expect(parseLocaleParameters({ productName: 'Acme Desk', teamName: 'Example' }).teamName).toBe('Example')
  })
})
