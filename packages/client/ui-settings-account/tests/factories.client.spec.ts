// @vitest-environment jsdom
/** The account page parts and the first-run page Factories follow the plugin, in a plain browser and on Desktop alike. */
import { expect } from 'vitest'
import { createClientTest, webApp } from '@deepseek-ai/dsh-client-test-runtime/src/assembly/index.ts'

const SELF = '@deepseek-ai/dsh-client-ui-settings-account'
const it = createClientTest({ roster: webApp.closure([SELF]) })
const FACTORIES = [
  'settings.account.page', 'settings.account.identity', 'settings.account.rows', 'settings.account.links', 'settings.account.amount',
  'desktop.onboarding.page',
]

it('publishes the account page parts and the first-run page, and withdraws them with the plugin', async ({ start }) => {
  const c = await start()
  for (const name of FACTORIES) expect(c.ctx.slots.snapshot(`factory:${name}`)).toMatchObject([{ type: 'factory', name }])
  expect(c.ctx.slots.snapshot('factory:desktop.onboarding.page')).toMatchObject([{
    children: [{ type: 'slot', name: 'desktop.onboarding.page.illustration' }],
  }])
  await c.unload(SELF)
  for (const name of FACTORIES) expect(c.ctx.slots.snapshot(`factory:${name}`)).toEqual([])
})
