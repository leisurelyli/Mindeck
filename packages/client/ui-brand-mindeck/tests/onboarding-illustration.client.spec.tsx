// @vitest-environment jsdom
/// <reference types="client-assets" />
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import * as Renderer from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime, StandardSourceBinding } from '@deepseek-ai/dsh-client-ui-slots'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { DesktopOnboardingEntry } from '../../ui-settings-account/src/client/DesktopOnboardingEntry.tsx'
import { en, zh } from '../../ui-settings-account/src/client/locales.ts'
import type { DesktopOnboardingState } from '../../ui-settings-account/src/client/onboarding-contract.ts'
import { MindeckOnboardingIllustration } from '../src/client/OnboardingIllustration.tsx'
import * as brand from '../src/client/index.ts'

const contexts: Context[] = []
const illustrationChildren = { 'desktop.onboarding.illustration': { kind: 'single', scope: 'root' } } as const
const brandChildren = {
  'sidebar.brand.mark': { kind: 'single', scope: 'root' },
  'sidebar.brand.name': { kind: 'single', scope: 'root' },
  'conversation.hero.brand.mark': { kind: 'single', scope: 'root' },
} as const
interface Scene { step: 'welcome' | 'credit'; locale: string }

afterEach(async () => {
  cleanup()
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
})

function Surface({ step, t, ...bindings }: PropsRuntime<'root'> & PropsLocale<'settings.account'>
  & PropsRenderSlots<'desktop.onboarding.illustration'> & InjectFace<Scene>) {
  const state: DesktopOnboardingState = {
    visible: true, status: 'ready', error: null, creditFunded: false,
    progress: { version: 1, step, purpose: null, process: null, completion: null, usage: 'compact', developerTools: false },
  }
  return <DesktopOnboardingEntry {...bindings} t={t}
    useOnboarding={select => select(state)}
    useAccount={select => select({ view: undefined, details: undefined, avatar: undefined, failed: false })}
    setVisible={() => {}} update={async () => true} complete={async () => true} retry={async () => true} />
}

function provideLocale(ctx: Context): void {
  const absent: StandardSourceBinding = { key: undefined, hooks: {}, keyedHooks: {}, props: {} }
  const current = { getSnapshot: () => absent, subscribe: () => () => {} }
  ctx.slots.installScope('session', { current, bindingSource: () => current })
  const locale = new LocaleRuntime(ctx, undefined, undefined, { productName: 'Mindeck', productTitle: 'Mindeck' })
  ctx.provide('locale', locale)
  ctx.slots.installLocale(locale)
  ctx.effect(() => locale.register('settings.account', { en, zh }), 'fixture: account dictionary')
}

async function bench(scene: Scene) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Renderer).await()
  await ctx.plugin({ inject: ['slots'], apply: provideLocale }).await()
  ctx.locale.setLocale(scene.locale)
  const declare = () => ctx.slots.register({ name: 'root', locale: 'settings.account', children: illustrationChildren,
    inject: () => scene }, Surface)
  return { ctx, declare }
}

function artwork(): string[] {
  return [...document.querySelectorAll<HTMLImageElement>('[data-desktop-onboarding] img')].map(img => img.getAttribute('src')!)
}

function expected(scene: Scene, mindeck: boolean): unknown[] {
  const file = mindeck ? 'mindeck-onboarding-welcome' : `onboarding-${scene.step === 'credit' ? 'recharge' : 'welcome'}`
  const language = scene.locale === 'zh' ? '-zh' : ''
  const owner = mindeck ? 'ui-brand-mindeck' : 'ui-settings-account'
  return ['', '-dark'].map((theme): unknown => expect.stringContaining(`${owner}/src/client/assets/${file}${language}${theme}.webp`))
}

for (const step of ['welcome', 'credit'] as const) {
  for (const locale of ['en', 'zh']) {
    it(`restores upstream ${step} artwork in ${locale} when the brand plugin unloads`, async () => {
      const scene = { step, locale }
      const { ctx, declare } = await bench(scene)
      declare()
      render(<>{ctx.slots.renderSlot('root', {})}</>)
      expect(artwork()).toEqual(expected(scene, false))
      const geometry = document.querySelector('[data-desktop-onboarding] img')!.parentElement!.className

      const fiber = ctx.plugin(brand)
      await act(async () => { await fiber.await() })
      expect(artwork()).toEqual(expected(scene, true))
      expect(document.querySelector('[data-desktop-onboarding] img')!.parentElement!.className).toContain(geometry.split(' ').at(-1))
      expect(document.querySelector('[data-desktop-onboarding] img')!.closest('[aria-hidden="true"]')).not.toBeNull()

      await act(async () => { await fiber.dispose() })
      expect(ctx.slots.entries('desktop.onboarding.illustration')).toHaveLength(0)
      expect(artwork()).toEqual(expected(scene, false))
    })
  }
}

it('waits for the illustration declaration independently of sidebar and hero slots, and follows redeclaration', async () => {
  const { ctx, declare } = await bench({ step: 'welcome', locale: 'en' })
  const fiber = ctx.plugin(brand)
  await fiber.await()
  expect(ctx.slots.entries('desktop.onboarding.illustration')).toHaveLength(0)
  const dispose = declare()
  await Promise.resolve()
  expect(ctx.slots.entries('desktop.onboarding.illustration')).toHaveLength(1)
  expect(ctx.slots.entries('sidebar.brand.mark')).toHaveLength(0)
  dispose()
  expect(ctx.slots.entries('desktop.onboarding.illustration')).toHaveLength(0)
  declare()
  await Promise.resolve()
  expect(ctx.slots.entries('desktop.onboarding.illustration')).toHaveLength(1)
  await fiber.dispose()
  expect(ctx.slots.entries('desktop.onboarding.illustration')).toHaveLength(0)
})

it('fills the first-run page illustration once its Factory declares it, and leaves with the plugin', async () => {
  const { ctx } = await bench({ step: 'welcome', locale: 'zh' })
  const fiber = ctx.plugin(brand)
  await fiber.await()
  expect(ctx.slots.entries('desktop.onboarding.page.illustration')).toHaveLength(0)
  const declared = ctx.slots.register({ name: 'root', children: { 'desktop.onboarding.page.illustration': { kind: 'single', scope: 'root' } } } as never, () => null)
  await Promise.resolve()
  expect(ctx.slots.entries('desktop.onboarding.page.illustration').map(entry => entry.component)).toEqual([MindeckOnboardingIllustration])
  await fiber.dispose()
  expect(ctx.slots.entries('desktop.onboarding.page.illustration')).toHaveLength(0)
  declared()
})

it('loads the onboarding illustration from the real brand YAML composition and removes it on shutdown', async () => {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Loader).await()
  Object.assign(ctx.loader.builtins, {
    include: Include, renderer: Renderer, locale: { inject: ['slots'], apply: provideLocale }, mindeck: brand,
    surface: { inject: ['slots'], apply: (ctx: Context) => {
      ctx.slots.register({ name: 'root', locale: 'settings.account', children: { ...brandChildren, ...illustrationChildren },
        inject: () => ({ step: 'credit' as const, locale: 'en' }) }, Surface)
    } },
  })
  await ctx.loader.create({ name: 'cordis:include', config: {
    path: pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/cordis.yml')).href,
  } })
  await ctx.loader.await()
  expect([...ctx.loader.entries()].filter(entry => !entry.disabled && entry.fiber === undefined)).toEqual([])
  const view = render(<>{ctx.slots.renderSlot('root', {})}</>)
  expect(artwork()).toEqual(expected({ step: 'credit', locale: 'en' }, true))
  const slots = ctx.slots
  view.unmount()
  await act(async () => { await ctx.fiber.dispose() })
  expect(slots.entries('desktop.onboarding.illustration')).toHaveLength(0)
})
