// @vitest-environment jsdom
/// <reference types="client-assets" />
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import * as Renderer from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { PropsRenderSlots, StandardSourceBinding } from '@deepseek-ai/dsh-client-ui-slots'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import * as brand from '../src/client/index.ts'
import * as host from '../src/index.ts'
import { MindeckBrandMark, MindeckBrandName } from '../src/client/Brand.tsx'
import { en, zh } from '../src/client/locales.ts'
import mindeckMark from '../src/client/assets/mindeck.svg'

const contexts: Context[] = []
const children = {
  'sidebar.brand.mark': { kind: 'single', scope: 'root' },
  'sidebar.brand.name': { kind: 'single', scope: 'root' },
  'conversation.hero.brand.mark': { kind: 'single', scope: 'root' },
} as const
type BrandSlot = keyof typeof children
const holes = Object.keys(children) as BrandSlot[]

afterEach(async () => {
  cleanup()
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
})

function provideLocale(ctx: Context): void {
  const locale = new LocaleRuntime(ctx, undefined, undefined, { productName: 'Mindeck', productTitle: 'Mindeck' })
  ctx.provide('locale', locale)
  ctx.slots.installLocale(locale)
}

function Surface({ renderSlot }: PropsRenderSlots<BrandSlot>) {
  return <>
    <header>
      {renderSlot('sidebar.brand.mark', { size: 34 })}
      {renderSlot('sidebar.brand.name', {})}
    </header>
    <main>{renderSlot('conversation.hero.brand.mark', { size: 64, className: 'hero-mark' })}</main>
  </>
}

async function bench() {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Renderer).await()
  await ctx.plugin({ inject: ['slots'], apply: provideLocale }).await()
  const declare = () => ctx.slots.register({ name: 'root', children }, Surface)
  return { ctx, declare }
}

describe('Mindeck browser brand', () => {
  it('keeps the host entry inert and declares its consumed services', () => {
    expect(host.apply).not.toThrow()
    expect('default' in host).toBe(false)
    expect('default' in brand).toBe(false)
    expect(brand.inject).toEqual(['slots', 'locale'])
  })

  it.each([true, false])('handles declarations before apply: %s, redeclaration and disposal', async (declareFirst) => {
    const { ctx, declare } = await bench()
    let dispose = declareFirst ? declare() : undefined
    const fiber = ctx.plugin(brand)
    await fiber.await()
    for (const hole of holes) expect(ctx.slots.entries(hole)).toHaveLength(declareFirst ? 1 : 0)
    dispose ??= declare()
    await Promise.resolve()
    for (const hole of holes) expect(ctx.slots.entries(hole)).toHaveLength(1)
    expect(ctx.slots.entries('conversation.hero.frame')).toHaveLength(0)
    expect(ctx.locale.bind('mindeck')('brand.name')).toBe('Mindeck')

    dispose()
    for (const hole of holes) expect(ctx.slots.entries(hole)).toHaveLength(0)
    declare()
    await Promise.resolve()
    for (const hole of holes) expect(ctx.slots.entries(hole)).toHaveLength(1)

    await fiber.dispose()
    for (const hole of holes) expect(ctx.slots.entries(hole)).toHaveLength(0)
    expect(ctx.locale.bind('mindeck')('brand.name')).toBe('brand.name')
  })

  it('words the shared conversation copy for Mindeck in both baseline languages and restores it on disposal', async () => {
    const { ctx } = await bench()
    ctx.locale.register('conversation', 'zh', { 'hero.headline': '探索未至之境', 'hero.chooseWorkspace': '选择工作区' })
    const t = ctx.locale.bind('conversation')
    const fiber = ctx.plugin(brand)
    await fiber.await()
    ctx.locale.setLocale('zh')
    expect([t('hero.headline'), t('hero.preview'), t('hero.chooseWorkspace')]).toEqual(['开始今天的工作', '企业版', '选择工作区'])
    expect(t('placeholder.hero')).toBe('描述要完成的工作，输入 / 调用技能与指令，@ 引用文件或对话')
    ctx.locale.setLocale('en')
    expect(t('hero.headline')).toBe("Start today's work")
    await fiber.dispose()
    ctx.locale.setLocale('zh')
    expect(t('hero.headline')).toBe('探索未至之境')
  })

  it('waits for the complete brand set when the hero declaration arrives later', async () => {
    const { ctx } = await bench()
    ctx.slots.register({ name: 'root', children: {
      'sidebar.brand.mark': children['sidebar.brand.mark'],
      'sidebar.brand.name': children['sidebar.brand.name'],
    } }, ({ renderSlot }: PropsRenderSlots<'sidebar.brand.mark' | 'sidebar.brand.name'>) => <>
      {renderSlot('sidebar.brand.mark', { size: 34 })}
      {renderSlot('sidebar.brand.name', {})}
    </>)
    await ctx.plugin(brand).await()
    for (const hole of holes) expect(ctx.slots.entries(hole)).toHaveLength(0)
    const disposeHero = ctx.slots.register({ name: 'root', priority: 1, children: {
      'conversation.hero.brand.mark': children['conversation.hero.brand.mark'],
    } }, ({ renderSlot }: PropsRenderSlots<'conversation.hero.brand.mark'>) => <>
      {renderSlot('conversation.hero.brand.mark', { size: 64 })}
    </>)
    await Promise.resolve()
    for (const hole of holes) expect(ctx.slots.entries(hole)).toHaveLength(1)
    disposeHero()
    for (const hole of holes) expect(ctx.slots.entries(hole)).toHaveLength(0)
  })

  it.each(['en', 'zh'])('renders the original asset, host geometry and locale-owned name in %s', async (locale) => {
    const { ctx } = await bench()
    ctx.locale.register('mindeck', { en, zh })
    ctx.locale.setLocale(locale)
    const t = ctx.locale.bind('mindeck')
    const view = render(<>
      <MindeckBrandName t={t} />
      <MindeckBrandMark size={24} t={t} />
      <MindeckBrandMark size={64} className="hero-mark" t={t} />
    </>)
    expect(view.getByText('Mindeck').tagName).toBe('SPAN')
    const marks = view.getAllByRole('img', { name: 'Mindeck' })
    for (const mark of marks) expect(mark.getAttribute('src')).toBe(mindeckMark)
    expect(marks.map(mark => [mark.getAttribute('width'), mark.getAttribute('height')]))
      .toEqual([['24', '24'], ['64', '64']])
    expect(marks[1]?.className).toBe('hero-mark')
    expect(view.container.querySelector('canvas')).toBeNull()
  })

  it('renders all three slots through a real Loader YAML composition and cleans up on shutdown', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(Loader).await()
    Object.assign(ctx.loader.builtins, {
      include: Include,
      renderer: Renderer,
      locale: { inject: ['slots'], apply: provideLocale },
      mindeck: brand,
      surface: { inject: ['slots'], apply: (ctx: Context) => {
        const absent: StandardSourceBinding = { key: undefined, hooks: {}, keyedHooks: {}, props: {} }
        const current = { getSnapshot: () => absent, subscribe: () => () => {} }
        ctx.slots.installScope('session', { current, bindingSource: () => current })
        ctx.slots.register({ name: 'root', children }, Surface)
      } },
    })
    await ctx.loader.create({
      name: 'cordis:include',
      config: { path: pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/cordis.yml')).href },
    })
    await ctx.loader.await()
    expect([...ctx.loader.entries()].map(entry => entry.options.name)).toEqual([
      'cordis:include', 'cordis:renderer', 'cordis:locale', 'cordis:mindeck', 'cordis:surface',
    ])
    expect([...ctx.loader.entries()].filter(entry => !entry.disabled && entry.fiber === undefined)).toEqual([])
    const view = render(<>{ctx.slots.renderSlot('root', {})}</>)
    expect(view.getByText('Mindeck')).toBeDefined()
    const marks = view.getAllByRole('img', { name: 'Mindeck' })
    expect(marks.map(mark => mark.getAttribute('width'))).toEqual(['34', '64'])
    expect(marks.every(mark => mark.getAttribute('src') === mindeckMark)).toBe(true)
    expect(view.container.querySelector('canvas')).toBeNull()

    const slots = ctx.slots
    const locale = ctx.locale
    view.unmount()
    await act(async () => { await ctx.fiber.dispose() })
    for (const hole of holes) expect(slots.entries(hole)).toHaveLength(0)
    expect(locale.bind('mindeck')('brand.name')).toBe('brand.name')
  })
})
