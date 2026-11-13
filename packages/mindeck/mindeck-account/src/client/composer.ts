/** The `mindeckComposer` service: the composer of an open conversation, and new conversations with a prepared draft. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent-preset-registry/types'
import type { AgentContext } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionInput } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Composer access for the Mindeck pages and panels. */
    mindeckComposer: MindeckComposer
  }
}

/** Services the composer service reads. */
export const composerInject = ['sessions', 'workspaces', 'uiWorkspace', 'remote.agentPresets']

/** The composer of one open conversation, valid for synchronous edits. */
export interface MindeckDraft {
  /** Session scope whose `slash/input-*` events edit this composer. */
  readonly scope: AgentContext
  /** The composer's input. */
  readonly input: SessionInput
}

/** Choices for a new conversation. */
export interface MindeckConversationRequest {
  /** Agent preset the conversation runs; omitted means the Host's current default preset. */
  readonly agentPreset?: string
  /** Edits the draft after the conversation is chosen and before it shows. */
  readonly prepare?: (draft: MindeckDraft) => void
}

/** Composer access shared by the Mindeck Client plugins. */
export interface MindeckComposer {
  /**
   * Borrow the composer of a conversation the Client has open.
   * @param sessionId - the conversation.
   * @returns its scope and input, or undefined while the Client does not hold it open.
   */
  draft(sessionId: SessionId): MindeckDraft | undefined
  /**
   * Open a blank conversation in the current Workspace, as New Session does: the Workspace of the conversation in
   * the main column, otherwise the Workspace whose conversations changed last. The Host reuses a blank conversation
   * of the requested preset there, with its draft, or creates one; `prepare` edits the draft before it shows, and
   * the composer takes focus when it appears. Without a requested preset it asks for the Host's default, so a blank
   * conversation of another preset is not reused; when the preset roster cannot be read, any blank conversation can
   * be. A refused creation is shown through the Workspace notice and keeps the current page. Without any Workspace,
   * it behaves as New Session and does not call `prepare`.
   * @param request - the preset and the draft edit.
   * @returns once the conversation shows, or the request was refused or superseded; it never rejects.
   */
  startConversation(request?: MindeckConversationRequest): Promise<void>
}

/**
 * @param ctx - context holding `sessions` and `workspaces`.
 * @returns the Workspace a new conversation opens in.
 */
function currentWorkspace(ctx: Context): WorkspaceId | undefined {
  const { items } = ctx.workspaces.list.getSnapshot()
  const { byId } = ctx.sessions.list.getSnapshot()
  const shown = Object.values(byId).find(session => (session.retainedBy.mainView ?? 0) > 0)
  const owner = shown === undefined ? undefined : items.find(item => item.sessionIds.includes(shown.id))
  if (owner !== undefined) return owner.workspaceId
  // A Workspace without conversations counts from its creation.
  let latest: { readonly id: WorkspaceId; readonly at: number } | undefined
  for (const item of items) {
    const changed = Math.max(...item.sessionIds.map(id => byId[id]?.updatedAt ?? Number.NEGATIVE_INFINITY))
    const at = changed === Number.NEGATIVE_INFINITY ? Date.parse(item.createdAt) : changed
    if (latest === undefined || at > latest.at) latest = { id: item.workspaceId, at }
  }
  return latest?.id
}

/**
 * Build the composer service.
 * @param ctx - context holding `sessions`, `workspaces`, `uiWorkspace`, and `remote.agentPresets`.
 * @returns the service value.
 */
export function createMindeckComposer(ctx: Context): MindeckComposer {
  const draft = (sessionId: SessionId): MindeckDraft | undefined => {
    const scope = ctx.sessions.scope(sessionId)
    const conversation = scope?.get('conversation')
    if (scope === undefined || conversation === undefined) return undefined
    return { scope, input: conversation.input.for(scope) }
  }
  // A roster that fails to load, by refusal or transport failure, leaves the preset to New Session's rules.
  const defaultPreset = async (): Promise<string | undefined> => {
    const roster = await ctx.remote.agentPresets.list().catch(() => undefined)
    return roster?.ok === true ? roster.value.presets.find(preset => preset.isDefault)?.id : undefined
  }
  return {
    draft,
    async startConversation(request = {}) {
      const { prepare } = request
      const agentPreset = request.agentPreset ?? await defaultPreset()
      const workspaceId = currentWorkspace(ctx)
      if (workspaceId === undefined) {
        ctx.uiWorkspace.startSession(undefined, agentPreset === undefined ? undefined : { agentPreset })
        return
      }
      const before = prepare === undefined ? undefined : (sessionId: SessionId): void => {
        const target = draft(sessionId)
        if (target !== undefined) prepare(target)
      }
      try { await ctx.uiWorkspace.openWorkspace(workspaceId, before, agentPreset === undefined ? {} : { agentPreset }) }
      catch (_error) { return } // The Workspace notice reports the refused creation, and the page stays.
    },
  }
}
