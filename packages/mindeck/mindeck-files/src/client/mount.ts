/** Remote contribution, the availability stream, and the file-library sidebar page. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remote-access/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-mindeck-files/remote'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { IconFolderCloseRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RemoteFailure, RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { LIBRARY_REFERENCE_PREFIX } from '../reference.ts'
import type { LibraryAvailability } from '../types.ts'
import { LibraryPanel } from './LibraryPanel.tsx'
import { en, NS, zh, type MindeckFilesKey } from './locales.ts'
import type { LibraryResult, LibrarySnapshot, MindeckFilesInjected } from './operations.ts'

/** Services required by the panel. */
export const inject = ['remote', 'slots', 'locale', 'remoteAccess', 'sidebarRightTabs', 'sessions', 'inputTriggers']

/** Input-trigger source that owns the panel's draft references. */
const REFERENCE_SOURCE = 'mindeck-files'

/** Identity of the sidebar page type. */
export const LIBRARY_TAB_ID = '@deepseek-ai/dsh-mindeck-files'

/**
 * @param error - Remote failure of a library read.
 * @returns the copy that explains it.
 */
function failureReason(error: RemoteFailure): MindeckFilesKey {
  switch (error.code) {
    case 'mindeck-files/signed-out': return 'signedOut'
    case 'mindeck-files/not-configured': return 'notConfigured'
    case 'mindeck-files/not-found': return 'notFound'
    case 'mindeck-files/denied': return 'denied'
    case 'mindeck-files/unavailable': return 'unavailable'
    default: return 'failed'
  }
}

function result<T>(outcome: RemoteResult<T>): LibraryResult<T> {
  return outcome.ok ? { ok: true, value: outcome.value } : { ok: false, reason: failureReason(outcome.error) }
}

function registerUi(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'mindeck-files: dictionaries')
  const t = ctx.locale.bind(NS)
  const state = createSnapshotStore<LibrarySnapshot>({ availability: undefined, failed: false })
  ctx.remoteAccess.whenAccess('mindeckFiles/watch', function* () {
    const stream = ctx.remote.$stream<LibraryAvailability>({
      name: 'Mindeck file library', open: signal => ctx.remote.mindeckFiles.watch(signal),
      ended: () => new Error('Mindeck file library stream ended'),
    })
    // Read across closures: the disposer ends this grant while the frame loop awaits.
    const grant = { ended: false }
    yield () => {
      grant.ended = true
      state.set({ availability: undefined, failed: false })
      return stream.dispose()
    }
    void (async () => {
      for await (const frame of stream) {
        if (grant.ended) return
        state.set({ availability: frame.value, failed: false })
        frame.accept()
      }
    })().catch(() => { if (!grant.ended) state.set({ ...state.getSnapshot(), failed: true }) })
  })
  // Draft references serialize to their `library:` text; the source offers no `@` candidates of its own.
  ctx.effect(() => ctx.inputTriggers.registerSource({
    trigger: '@', name: REFERENCE_SOURCE, showGroupTitle: false,
    candidates: () => Promise.resolve([]),
    onPick: () => undefined,
    codec: { clipboardText: ref => ref, serialize: ref => Promise.resolve(ref) },
  }), 'mindeck-files: draft references')
  const reads = {
    spaces: async () => result(await ctx.remote.mindeckFiles.spaces()),
    list: async (path: string) => result(await ctx.remote.mindeckFiles.list(path)),
    search: async (query: string) => result(await ctx.remote.mindeckFiles.search(query)),
  }
  const createFace = (sessionId: SessionId): MindeckFilesInjected => ({
    hooks: { library: state },
    ...reads,
    addToConversation(entry) {
      const scope = ctx.sessions.scope(sessionId)
      const conversation = scope?.get('conversation')
      if (scope === undefined || conversation === undefined) return false
      const input = conversation.input.for(scope)
      const { draft, draftRev } = input.state.getSnapshot()
      const ref = `${LIBRARY_REFERENCE_PREFIX}${entry.path}`
      const inserted = input.insertReference({
        source: REFERENCE_SOURCE, ref, label: entry.name, appearance: entry.kind === 'folder' ? 'folder' : 'file', clipboardText: ref,
      }, { start: draft.length, end: draft.length, draftRev })
      if (inserted) input.focus()
      return inserted
    },
  })
  // One face per Session keeps the page's operations stable across renders.
  const faces = new Map<SessionId, MindeckFilesInjected>()
  const face = (sessionId: SessionId): MindeckFilesInjected => {
    let existing = faces.get(sessionId)
    if (existing === undefined) { existing = createFace(sessionId); faces.set(sessionId, existing) }
    return existing
  }
  ctx.remoteAccess.whenAccess('mindeckFiles/watch', () => ctx.sidebarRightTabs.register({
    id: LIBRARY_TAB_ID, kind: 'mindeck-files', title: () => t('title'),
    guide: [{ id: 'open', order: 40, title: () => t('title'), description: () => t('guideDescription'), icon: IconFolderCloseRegular }],
  }))
  ctx.remoteAccess.whenAccess('mindeckFiles/watch', () => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: LIBRARY_TAB_ID, locale: NS, inject: face,
  }, LibraryPanel)))
}

/**
 * Mount the file-library Remote, then the panel; withdraw them in reverse order.
 * @param ctx - Client plugin lifetime.
 * @param contribution - generated file-library Remote definitions.
 * @returns disposer that removes both contributions.
 */
export async function mountFiles(ctx: Context, contribution: TypertRemoteContribution): Promise<() => Promise<void>> {
  const unmountRemote = await ctx.remote.$mount(contribution)
  const ui = ctx.inject(['remote.mindeckFiles', ...inject.slice(1)], (child) => { registerUi(child) })
  try { await ui } catch (error) { await ui.dispose(); await unmountRemote(); throw error }
  return async () => { await ui.dispose(); await unmountRemote() }
}
