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
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import type {} from '@deepseek-ai/dsh-mindeck-files/remote'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { IconFolderCloseRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RemoteFailure, RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { libraryReference } from '../reference.ts'
import { libraryLabel } from './labels.ts'
import type { LibraryAvailability, LibraryEntryView } from '../types.ts'
import { LibraryPanel } from './LibraryPanel.tsx'
import { LIBRARY_TEXT_NODE, LibraryReference, libraryReferenceRule } from './LibraryReference.tsx'
import { LIBRARY_TOOLS, LibraryToolRow } from './LibraryToolRow.tsx'
import { en, NS, zh, type MindeckFilesKey } from './locales.ts'
import type { LibraryResult, LibrarySnapshot, MindeckFilesInjected } from './operations.ts'

/** Services required by the panel. */
export const inject = ['remote', 'slots', 'locale', 'remoteAccess', 'sidebarRightTabs', 'sessions', 'inputTriggers', 'uiConversation']

/** Input-trigger source that owns the panel's draft references. */
const REFERENCE_SOURCE = 'mindeck-files'
/** Pause in typing after `@` before the library is searched, in milliseconds. */
const SEARCH_DELAY_MS = 250

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
    case 'mindeck-files/exists': return 'exists'
    case 'mindeck-files/quota': return 'quota'
    case 'mindeck-files/too-large': return 'tooLarge'
    case 'mindeck-files/unavailable': return 'unavailable'
    default: return 'failed'
  }
}

/**
 * Read a file the member picked as base64 for the upload Remote.
 * @param file - picked or dropped file.
 * @returns its content in base64.
 */
async function fileBase64(file: File): Promise<string> {
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    // readAsDataURL always produces a string.
    reader.onload = () => { resolve(typeof reader.result === 'string' ? reader.result : '') }
    reader.onerror = () => { reject(reader.error ?? new Error(`could not read ${file.name}`)) }
    reader.readAsDataURL(file)
  })
  // A data URL is `data:<type>;base64,<content>`.
  return url.slice(url.indexOf(',') + 1)
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
  // `@` finds library files and folders by name; draft references serialize to their `library:` text.
  ctx.effect(() => ctx.inputTriggers.registerSource({
    trigger: '@', name: REFERENCE_SOURCE, order: 20, showGroupTitle: false,
    async candidates(_session, { query, signal }) {
      const text = query.trim()
      if (text === '' || state.getSnapshot().availability !== 'ready') return []
      // Each keystroke supersedes the previous request; only a pause in typing reaches the library.
      const paused = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => { resolve(true) }, SEARCH_DELAY_MS)
        signal.addEventListener('abort', () => { clearTimeout(timer); resolve(false) }, { once: true })
      })
      if (!paused) return []
      const found = await ctx.remote.mindeckFiles.search(text, signal)
      if (!found.ok || signal.aborted) return []
      return found.value.map((entry) => {
        const label = libraryLabel(entry.path, t)
        return {
          name: entry.path, label: entry.name, description: label.location, icon: entry.kind,
          section: t('title'), value: entry.kind,
        }
      })
    },
    onPick({ candidate }) {
      const folder = candidate.value === 'folder'
      const ref = libraryReference(candidate.name, folder)
      return { insert: {
        source: REFERENCE_SOURCE, ref, label: candidate.label ?? candidate.name, appearance: folder ? 'folder' : 'file', clipboardText: ref,
      } }
    },
    codec: { clipboardText: ref => ref, serialize: ref => Promise.resolve(ref) },
  }), 'mindeck-files: draft references')
  // Sent messages show the references as labels, also while the library is unavailable.
  ctx.effect(() => ctx.uiConversation.userText.register(libraryReferenceRule), 'mindeck-files: message references')
  ctx.slots.inject('conversation.user.text.node', () => ctx.slots.register({
    name: 'conversation.user.text.node', key: LIBRARY_TEXT_NODE, priority: 100,
  }, LibraryReference))
  // Library tool calls read as what the agent did and where, also while the library is unavailable.
  for (const tool of LIBRARY_TOOLS) {
    ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: tool, locale: NS }, LibraryToolRow))
  }
  const reads = {
    spaces: async () => result(await ctx.remote.mindeckFiles.spaces()),
    list: async (path: string) => result(await ctx.remote.mindeckFiles.list(path)),
    search: async (query: string) => result(await ctx.remote.mindeckFiles.search(query)),
    upload: async (folder: string, file: File, overwrite: boolean): Promise<LibraryResult<LibraryEntryView>> => {
      let content: string
      try { content = await fileBase64(file) }
      catch (_error) { return { ok: false, reason: 'unreadable' } } // Moved or deleted on the computer after it was picked.
      return result(await ctx.remote.mindeckFiles.upload(folder, file.name, content, overwrite))
    },
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
      const ref = libraryReference(entry.path, entry.kind === 'folder')
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
