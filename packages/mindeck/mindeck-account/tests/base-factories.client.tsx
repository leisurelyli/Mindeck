/** The base Component Factories the account UI renders, as the renderer supplies them once ui-settings-account registers them. */
import { createElement, type ReactNode } from 'react'
import type { PropsRenderFactories } from '@deepseek-ai/dsh-client-ui-slots'
import { AccountAmount, AccountIdentity, AccountLinks, AccountPage, AccountRows } from '../../../client/ui-settings-account/src/client/AccountParts.tsx'
import { OnboardingPage } from '../../../client/ui-settings-account/src/client/OnboardingPage.tsx'

const definitions: Record<string, (props: never) => ReactNode> = {
  'settings.account.page': AccountPage,
  'settings.account.identity': AccountIdentity,
  'settings.account.rows': AccountRows,
  'settings.account.links': AccountLinks,
  'settings.account.amount': AccountAmount,
  'desktop.onboarding.page': (props: Parameters<typeof OnboardingPage>[0]) =>
    <OnboardingPage {...props} renderSlot={(_key, _owner, options) => options?.fallback ?? null} />,
}

/** Renders every definition above; any other name renders the caller's fallback. */
export const baseFactories = ((name: string, props: object, options?: { fallback?: ReactNode }) => {
  const Definition = definitions[name]
  return Definition === undefined ? options?.fallback ?? null : createElement(Definition, props as never)
}) as PropsRenderFactories['renderFactorySlot']

/** Renders only the callers' fallbacks, as in a composition without ui-settings-account. */
export const noFactories = ((_name: string, _props: object, options?: { fallback?: ReactNode }) => options?.fallback ?? null) as PropsRenderFactories['renderFactorySlot']
