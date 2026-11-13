/** The composer service borrows open composers and opens conversations in the current Workspace with a prepared draft. */
import { Context } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { createMindeckComposer, type MindeckDraft } from '../src/client/composer.ts'

const work = 'w-work' as WorkspaceId
const home = 'w-home' as WorkspaceId
const shown = 's-shown' as SessionId
const recent = 's-recent' as SessionId
const opened = 's-opened' as SessionId

function fixture(options: { shown?: boolean; workspaces?: boolean; roster?: boolean } = {}) {
  const ctx = new Context()
  const summary = (id: SessionId, updatedAt: number, mainView: number) => ({ id, updatedAt, retainedBy: mainView > 0 ? { mainView } : {} })
  const byId = {
    [shown]: summary(shown, 100, options.shown === false ? 0 : 1),
    [recent]: summary(recent, 500, 0),
  }
  const items = options.workspaces === false ? [] : [
    { workspaceId: work, sessionIds: [shown], createdAt: '2026-11-01T00:00:00Z' },
    { workspaceId: home, sessionIds: [recent], createdAt: '2026-10-01T00:00:00Z' },
  ]
  const input = { state: { getSnapshot: () => ({ draft: '', draftRev: 1 }) } }
  const scope = { get: (name: string) => name === 'conversation' ? { input: { for: () => input } } : undefined }
  const scopes = new Map<SessionId, typeof scope>([[opened, scope]])
  const openWorkspace = vi.fn(async (_id: WorkspaceId, before?: (sessionId: SessionId) => void, _options?: { agentPreset?: string }) => {
    before?.(opened)
  })
  const startSession = vi.fn()
  const list = vi.fn(async () => {
    if (options.roster === false) throw new Error('roster unavailable')
    return { ok: true, value: { presets: [{ id: 'mindeck-employee-e1', isDefault: false }, { id: 'mindeck-general', isDefault: true }] } }
  })
  ctx.provide('sessions', { list: { getSnapshot: () => ({ byId }) }, scope: (id: SessionId) => scopes.get(id) } as never)
  ctx.provide('workspaces', { list: { getSnapshot: () => ({ items }) } } as never)
  ctx.provide('uiWorkspace', { openWorkspace, startSession } as never)
  ctx.provide('remote', { agentPresets: { list } } as never)
  return { composer: createMindeckComposer(ctx), openWorkspace, startSession, list, input, scope, scopes }
}

it('borrows the composer of an open conversation only', () => {
  const f = fixture()
  expect(f.composer.draft(opened)).toEqual({ scope: f.scope, input: f.input })
  expect(f.composer.draft(recent)).toBeUndefined()
  f.scopes.set(recent, { get: () => undefined })
  expect(f.composer.draft(recent)).toBeUndefined()
})

it('opens in the Workspace of the shown conversation under the requested preset and prepares the draft before it shows', async () => {
  const f = fixture()
  const prepared: MindeckDraft[] = []
  await f.composer.startConversation({ agentPreset: 'mindeck-employee-e1', prepare: (draft) => { prepared.push(draft) } })
  expect(f.openWorkspace).toHaveBeenCalledWith(work, expect.any(Function), { agentPreset: 'mindeck-employee-e1' })
  expect(prepared).toEqual([{ scope: f.scope, input: f.input }])
  // Without a requested preset, the Host default is requested, so a blank of another preset is not reused.
  await f.composer.startConversation()
  expect(f.openWorkspace).toHaveBeenLastCalledWith(work, undefined, { agentPreset: 'mindeck-general' })
})

it('falls back to the Workspace changed last and to any blank without the roster, reports nothing more for a refused creation, and behaves as New Session without a Workspace', async () => {
  const f = fixture({ shown: false, roster: false })
  await f.composer.startConversation()
  expect(f.openWorkspace).toHaveBeenCalledWith(home, undefined, {})
  f.list.mockResolvedValueOnce({ ok: false, error: new Error('refused') } as never)
  await f.composer.startConversation()
  expect(f.openWorkspace).toHaveBeenLastCalledWith(home, undefined, {})
  f.openWorkspace.mockRejectedValueOnce(new Error('refused'))
  await expect(f.composer.startConversation({ prepare: () => {} })).resolves.toBeUndefined()

  const empty = fixture({ workspaces: false })
  const prepare = vi.fn()
  await empty.composer.startConversation({ agentPreset: 'mindeck-general', prepare })
  expect(empty.startSession).toHaveBeenCalledWith(undefined, { agentPreset: 'mindeck-general' })
  expect(empty.openWorkspace).not.toHaveBeenCalled()
  expect(prepare).not.toHaveBeenCalled()
})
