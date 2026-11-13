/** Mindeck artwork for brand slots and desktop onboarding illustrations, and Mindeck wording for shared conversation copy. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { MindeckBrandMark, MindeckBrandName } from './Brand.tsx'
import { MindeckOnboardingIllustration } from './OnboardingIllustration.tsx'
import { conversation, en, zh } from './locales.ts'

/** Services used for reversible brand and dictionary registrations. */
export const inject = ['slots', 'locale']

/**
 * Register the brand set and optional onboarding artwork as their hosts declare slots, and word the shared
 * conversation copy for Mindeck.
 * @param ctx - Client plugin context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('mindeck', { en, zh }), 'ui-brand-mindeck: dictionaries')
  ctx.effect(() => ctx.locale.override('conversation', conversation), 'ui-brand-mindeck: conversation copy')
  ctx.slots.inject('desktop.onboarding.illustration', () =>
    ctx.slots.register({ name: 'desktop.onboarding.illustration' }, MindeckOnboardingIllustration))
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', () =>
      ctx.slots.inject('conversation.hero.brand.mark', function* () {
        yield ctx.slots.register({ name: 'sidebar.brand.mark', locale: 'mindeck' }, MindeckBrandMark)
        yield ctx.slots.register({ name: 'sidebar.brand.name', locale: 'mindeck' }, MindeckBrandName)
        yield ctx.slots.register({ name: 'conversation.hero.brand.mark', locale: 'mindeck' }, MindeckBrandMark)
      })))
}
