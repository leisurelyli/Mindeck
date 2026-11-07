import { Context } from '@deepseek-ai/cordis'
import type { IndexInjection, WebServer } from '@deepseek-ai/dsh-host-webserver'
import { expect, it, onTestFinished, vi } from 'vitest'
import { apply, Config } from '../src/index.ts'
import { LOCALE_PARAMETERS_GLOBAL } from '../src/parameters.ts'

const PAGE_PEER = { principal: { kind: 'owner' } } as Parameters<WebServer['renderIndex']>[1]

it('uses public launch parameters and lets explicit configuration take precedence', async () => {
  vi.stubEnv('DSH_LOCALE_PARAMETERS', JSON.stringify({ productName: 'Launch Desk' }))
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose(); vi.unstubAllEnvs() })
  const inherited = ctx.plugin({ Config, apply })
  await inherited.await()
  const first: IndexInjection[] = []
  ctx.emit('webserver/index-inject', first, PAGE_PEER)
  expect(first).toContainEqual({ kind: 'global', name: LOCALE_PARAMETERS_GLOBAL, value: {
    productName: 'Launch Desk', productShortName: 'Launch Desk', productAlias: 'Launch Desk', productTitle: 'Launch Desk',
  } })
  await inherited.dispose()
  vi.stubEnv('DSH_LOCALE_PARAMETERS', 'invalid JSON')
  await ctx.plugin({ Config, apply }, { parameters: { productName: 'Configured Desk' } }).await()
  const second: IndexInjection[] = []
  ctx.emit('webserver/index-inject', second, PAGE_PEER)
  expect(second).toContainEqual({ kind: 'global', name: LOCALE_PARAMETERS_GLOBAL, value: {
    productName: 'Configured Desk', productShortName: 'Configured Desk', productAlias: 'Configured Desk', productTitle: 'Configured Desk',
  } })
})

it('projects configured presentation before client boot and removes it on unload', async () => {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin({ Config, apply }, { parameters: { productName: 'Acme Desk', productTitle: 'Acme Desk Dev' } })
  const rows: IndexInjection[] = []
  ctx.emit('webserver/index-inject', rows, PAGE_PEER)
  expect(rows).toEqual([{ kind: 'global', name: LOCALE_PARAMETERS_GLOBAL, value: {
    productName: 'Acme Desk', productShortName: 'Acme Desk', productAlias: 'Acme Desk', productTitle: 'Acme Desk Dev',
  } }])
  await ctx.fiber.dispose()
  const after: IndexInjection[] = []
  ctx.emit('webserver/index-inject', after, PAGE_PEER)
  expect(after).toEqual([])
})
