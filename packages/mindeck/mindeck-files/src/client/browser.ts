/** Browsing, searching, and uploading state shared by the library side panel and the library page. */
import { type DragEvent, useEffect, useRef, useState } from 'react'
import { IconShareOutlineRegular, IconUserOutlineRegular, IconUsersOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { LibraryAvailability, LibraryEntryView, LibrarySpaceView } from '../types.ts'
import type { MindeckFilesKey } from './locales.ts'
import type { LibraryResult, MindeckFilesReads } from './operations.ts'

/** What the current path or search shows. */
export type LibraryView =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly reason: MindeckFilesKey }
  | { readonly status: 'spaces'; readonly spaces: readonly LibrarySpaceView[] }
  | { readonly status: 'entries'; readonly entries: readonly LibraryEntryView[]; readonly search: boolean }

/** Progress and outcome of the latest upload. */
export type LibraryUpload =
  | { readonly status: 'uploading'; readonly count: number }
  | { readonly status: 'done'; readonly count: number }
  | { readonly status: 'failed'; readonly name: string; readonly reason: MindeckFilesKey }
  | { readonly status: 'conflicts'; readonly folder: string; readonly files: readonly File[] }

/** State and actions of one library view. */
export interface LibraryBrowser {
  /** Open space or folder; null is the list of spaces. */
  readonly path: string | null
  readonly query: string
  /** Whether a search replaces the open folder. */
  readonly searching: boolean
  readonly view: LibraryView
  /** Spaces from the latest successful read, personal first. */
  readonly spaces: readonly LibrarySpaceView[]
  readonly upload: LibraryUpload | null
  /** @param text - search text; empty returns to the open folder. */
  setQuery: (text: string) => void
  /** @param path - space or folder to open, or null for the spaces; clears the search. */
  open: (path: string | null) => void
  /** Read the open folder, the spaces, or the search again. */
  reload: () => void
  /**
   * @param path - library path of a space, folder, or file seen so far.
   * @returns its page in the library's web app, if known.
   */
  link: (path: string) => string | undefined
  /**
   * @param path - library path seen so far.
   * @returns whether the member may change it, if known.
   */
  writable: (path: string) => boolean | undefined
  /**
   * @param name - space name, the first path segment.
   * @returns the name the member reads for it.
   */
  spaceLabel: (name: string) => string
  /**
   * Upload files into a folder one at a time; files whose name is taken wait for the member to replace them, and
   * the first other failure stops the upload. The open folder is read again afterwards.
   * @param folder - library path of a space or folder.
   * @param files - files from the computer.
   * @param overwrite - replace files of the same name.
   */
  send: (folder: string, files: readonly File[], overwrite: boolean) => Promise<void>
  /** Hide a failed upload or the files whose name was taken. */
  dismissUpload: () => void
}

/** Glyph of each kind of space: the member's own, a department or company space, and the items shared with the member. */
export const SPACE_ICONS = { personal: IconUserOutlineRegular, project: IconUsersOutlineRegular, shares: IconShareOutlineRegular } as const

/** Delay between the last keystroke and the search request. */
const SEARCH_DELAY_MS = 300
/** How long the "uploaded" confirmation stays. */
export const NOTICE_MS = 2000

/**
 * Name the folder or space that holds a library path.
 * @param path - library path.
 * @returns the path of the folder or space that holds it, or null for a space.
 */
export function parentOf(path: string): string | null {
  const parts = path.split('/').filter(part => part.length > 0)
  return parts.length <= 1 ? null : `/${parts.slice(0, -1).join('/')}`
}

/**
 * Follow the library while it is available: the spaces, a folder, or a search, plus the latest upload.
 * @param reads - library reads and the upload.
 * @param availability - streamed availability; nothing is read until it is `ready`.
 * @param t - library copy, for the personal and shared space names.
 * @returns the state and its actions.
 */
export function useLibraryBrowser(
  reads: MindeckFilesReads, availability: LibraryAvailability | undefined, t: (key: MindeckFilesKey) => string,
): LibraryBrowser {
  const { spaces, list, search, upload: uploadFile } = reads
  const [path, setPath] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [reload, setReload] = useState(0)
  const [view, setView] = useState<LibraryView>({ status: 'loading' })
  const [known, setKnown] = useState<readonly LibrarySpaceView[]>([])
  const [upload, setUpload] = useState<LibraryUpload | null>(null)
  // Pages and write access already seen for each library path, so ancestors in the breadcrumb keep them.
  const seen = useRef(new Map<string, { readonly webUrl?: string; readonly writable?: boolean }>())

  useEffect(() => {
    if (availability !== 'ready') return
    let current = true
    const settle = <T>(result: LibraryResult<T>, next: (value: T) => LibraryView): void => {
      if (current) setView(result.ok ? next(result.value) : { status: 'error', reason: result.reason })
    }
    const remember = (items: readonly { path: string; webUrl?: string; writable?: boolean }[]): void => {
      for (const item of items) {
        const previous = seen.current.get(item.path)
        const webUrl = item.webUrl !== undefined && item.webUrl !== '' ? item.webUrl : previous?.webUrl
        const writable = item.writable ?? previous?.writable
        seen.current.set(item.path, { ...webUrl === undefined ? {} : { webUrl }, ...writable === undefined ? {} : { writable } })
      }
    }
    setView({ status: 'loading' })
    const text = query.trim()
    const timer = setTimeout(() => {
      if (text !== '') {
        void search(text).then((result) => { settle(result, (entries) => { remember(entries); return { status: 'entries', entries, search: true } }) })
      } else if (path === null) {
        void spaces().then((result) => {
          if (result.ok && current) { setKnown(result.value); remember(result.value) }
          settle(result, value => ({ status: 'spaces', spaces: value }))
        })
      } else {
        void list(path).then((result) => { settle(result, (entries) => { remember(entries); return { status: 'entries', entries, search: false } }) })
      }
    }, text === '' ? 0 : SEARCH_DELAY_MS)
    return () => { current = false; clearTimeout(timer) }
  }, [availability, path, query, reload, list, search, spaces])

  useEffect(() => {
    if (upload?.status !== 'done') return
    const timer = setTimeout(() => { setUpload(null) }, NOTICE_MS)
    return () => { clearTimeout(timer) }
  }, [upload])

  const send = async (folder: string, files: readonly File[], overwrite: boolean): Promise<void> => {
    if (files.length === 0) return
    setUpload({ status: 'uploading', count: files.length })
    let saved = 0
    const conflicts: File[] = []
    for (const file of files) {
      const outcome = await uploadFile(folder, file, overwrite)
      if (outcome.ok) saved += 1
      else if (outcome.reason === 'exists') conflicts.push(file)
      else {
        setUpload({ status: 'failed', name: file.name, reason: outcome.reason })
        setReload(value => value + 1)
        return
      }
    }
    setReload(value => value + 1)
    setUpload(conflicts.length > 0 ? { status: 'conflicts', folder, files: conflicts } : { status: 'done', count: saved })
  }

  return {
    path, query, searching: query.trim() !== '', view, spaces: known, upload,
    setQuery,
    open(next) { setQuery(''); setPath(next) },
    reload() { setReload(value => value + 1) },
    link: target => seen.current.get(target)?.webUrl,
    writable: target => seen.current.get(target)?.writable,
    spaceLabel(name) {
      const space = known.find(item => item.name === name)
      return space?.kind === 'personal' ? t('personal') : space?.kind === 'shares' ? t('shares') : name
    },
    send,
    dismissUpload() { setUpload(null) },
  }
}

/** Whether a drag carries files from the computer. */
function carriesFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes('Files')
}

/** Drag-and-drop handlers of an upload target, and whether files are over it. */
export interface FileDrop {
  readonly dragging: boolean
  /** Handlers for the target element; empty while there is no folder to upload into. */
  readonly handlers: {
    readonly onDragEnter?: (event: DragEvent) => void
    readonly onDragOver?: (event: DragEvent) => void
    readonly onDragLeave?: (event: DragEvent) => void
    readonly onDrop?: (event: DragEvent) => void
  }
}

/**
 * Accept files dropped from the computer.
 * @param folder - folder that receives them, or null while none can.
 * @param onFiles - receives the dropped files and their folder.
 * @returns the drag state and the target's handlers.
 */
export function useFileDrop(folder: string | null, onFiles: (folder: string, files: readonly File[]) => void): FileDrop {
  const [dragging, setDragging] = useState(false)
  if (folder === null) return { dragging: false, handlers: {} }
  return {
    dragging,
    handlers: {
      onDragEnter: (event) => { if (carriesFiles(event)) { event.preventDefault(); setDragging(true) } },
      onDragOver: (event) => { if (carriesFiles(event)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' } },
      onDragLeave: (event) => {
        if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) setDragging(false)
      },
      onDrop: (event) => {
        event.preventDefault()
        setDragging(false)
        onFiles(folder, Array.from(event.dataTransfer.files))
      },
    },
  }
}
