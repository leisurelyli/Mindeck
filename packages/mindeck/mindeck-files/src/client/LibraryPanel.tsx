/** Sidebar page that browses and searches the company file library, adds items to the message draft, and uploads files. */
import { type DragEvent, useEffect, useRef, useState } from 'react'
import {
  FileTypeIcon, IconChevronLeftOutlineRegular, IconCloseOutlineRegular, IconDownloadOutlineRegular, IconFolderCloseRegular,
  IconPlusOutlineRegular, IconRefreshOutlineRegular, IconRightUpOutlineRegular, IconSearchOutlineRegular, IconShareOutlineRegular,
  IconUserOutlineRegular, IconUsersOutlineRegular, Input, Tooltip, fileSizeText,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { LibraryEntryView, LibrarySpaceView } from '../types.ts'
import type { MindeckFilesKey } from './locales.ts'
import type { LibraryResult, MindeckFilesInjected } from './operations.ts'
import css from './Library.module.css'

/** Composed panel props. */
export type LibraryPanelProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'mindeckFiles'> & InjectFace<MindeckFilesInjected>

type View =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly reason: MindeckFilesKey }
  | { readonly status: 'spaces'; readonly spaces: readonly LibrarySpaceView[] }
  | { readonly status: 'entries'; readonly entries: readonly LibraryEntryView[]; readonly search: boolean }

/** Progress and outcome of the latest upload. */
type Upload =
  | { readonly status: 'uploading'; readonly count: number }
  | { readonly status: 'done'; readonly count: number }
  | { readonly status: 'failed'; readonly name: string; readonly reason: MindeckFilesKey }
  | { readonly status: 'conflicts'; readonly folder: string; readonly files: readonly File[] }

/** Delay between the last keystroke and the search request. */
const SEARCH_DELAY_MS = 300
/** How long the "added" and "uploaded" confirmations stay. */
const NOTICE_MS = 2000

const SPACE_ICONS = { personal: IconUserOutlineRegular, project: IconUsersOutlineRegular, shares: IconShareOutlineRegular } as const

/** Whether a drag carries files from the computer. */
function carriesFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes('Files')
}

function parentOf(path: string): string | null {
  const parts = path.split('/').filter(part => part.length > 0)
  return parts.length <= 1 ? null : `/${parts.slice(0, -1).join('/')}`
}

/**
 * @param props - availability, library reads, the draft action, and localized copy.
 * @returns the library page.
 */
export function LibraryPanel({ t, useLibrary, spaces, list, search, upload: uploadFile, addToConversation }: LibraryPanelProps) {
  const availability = useLibrary(snapshot => snapshot.availability)
  const streamFailed = useLibrary(snapshot => snapshot.failed)
  const [path, setPath] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [reload, setReload] = useState(0)
  const [view, setView] = useState<View>({ status: 'loading' })
  const [known, setKnown] = useState<readonly LibrarySpaceView[]>([])
  const [notice, setNotice] = useState<MindeckFilesKey | null>(null)
  const [upload, setUpload] = useState<Upload | null>(null)
  const [dragging, setDragging] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  // Pages already seen for each library path, so ancestors in the breadcrumb keep their browser link.
  const links = useRef(new Map<string, string>())
  const searching = query.trim() !== ''

  useEffect(() => {
    if (availability !== 'ready') return
    let current = true
    const settle = <T,>(result: LibraryResult<T>, next: (value: T) => View): void => {
      if (current) setView(result.ok ? next(result.value) : { status: 'error', reason: result.reason })
    }
    const remember = (items: readonly { path: string; webUrl?: string }[]): void => {
      for (const item of items) if (item.webUrl !== undefined && item.webUrl !== '') links.current.set(item.path, item.webUrl)
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
    if (notice === null) return
    const timer = setTimeout(() => { setNotice(null) }, NOTICE_MS)
    return () => { clearTimeout(timer) }
  }, [notice])

  useEffect(() => {
    if (upload?.status !== 'done') return
    const timer = setTimeout(() => { setUpload(null) }, NOTICE_MS)
    return () => { clearTimeout(timer) }
  }, [upload])

  const spaceLabel = (name: string): string => {
    const space = known.find(item => item.name === name)
    return space?.kind === 'personal' ? t('personal') : space?.kind === 'shares' ? t('shares') : name
  }
  const open = (next: string | null): void => { setQuery(''); setPath(next) }
  const add = (entry: LibraryEntryView): void => { setNotice(addToConversation(entry) ? 'added' : 'addFailed') }
  /** Upload one file at a time; files whose name is taken wait for the member to replace them. */
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

  if (availability !== 'ready') {
    const key: MindeckFilesKey = streamFailed ? 'unavailable'
      : availability === 'signed-out' ? 'signedOut' : availability === 'not-configured' ? 'notConfigured' : 'loading'
    return <div className={css.page}><p className={css.state} role="status">{t(key)}</p></div>
  }

  const segments = path === null ? [] : path.split('/').filter(part => part.length > 0)
  const folder = path !== null && !searching ? path : null
  const folderLabel = segments.length === 0 ? '' : segments.length === 1 ? spaceLabel(segments[0] ?? '') : segments.at(-1) ?? ''
  const dropProps = folder === null ? {} : {
    onDragEnter: (event: DragEvent) => { if (carriesFiles(event)) { event.preventDefault(); setDragging(true) } },
    onDragOver: (event: DragEvent) => { if (carriesFiles(event)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' } },
    onDragLeave: (event: DragEvent) => {
      if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) setDragging(false)
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault()
      setDragging(false)
      void send(folder, Array.from(event.dataTransfer.files), false)
    },
  }
  const currentLink = path === null ? undefined : links.current.get(path)
  const describe = (entry: LibraryEntryView): string => {
    if (view.status === 'entries' && view.search) {
      const parent = parentOf(entry.path)
      return parent === null ? '' : parent.split('/').filter(Boolean).map((part, index) => index === 0 ? spaceLabel(part) : part).join(' / ')
    }
    const facts: string[] = []
    if (entry.kind === 'file' && entry.size !== undefined) facts.push(fileSizeText(entry.size))
    if (entry.modified !== undefined) facts.push(new Date(entry.modified).toLocaleDateString())
    if (!entry.writable) facts.push(t('readOnly'))
    return facts.join(' · ')
  }

  return (
    <div className={css.page} {...dropProps}>
      <div className={css.toolbar}>
        {path !== null && !searching && (
          <Tooltip label={t('back')} side="bottom">
            <button type="button" className={css.iconButton} aria-label={t('back')} onClick={() => { open(parentOf(path)) }}>
              <IconChevronLeftOutlineRegular size={16} />
            </button>
          </Tooltip>
        )}
        <nav className={css.crumbs} aria-label={t('title')}>
          <button type="button" className={css.crumb} aria-current={path === null ? 'page' : undefined} onClick={() => { open(null) }}>
            {t('root')}
          </button>
          {segments.map((segment, index) => {
            const target = `/${segments.slice(0, index + 1).join('/')}`
            return <span key={target} className={css.crumbItem}>
              <span className={css.separator} aria-hidden="true">/</span>
              <button type="button" className={css.crumb} aria-current={target === path ? 'page' : undefined}
                onClick={() => { open(target) }}>{index === 0 ? spaceLabel(segment) : segment}</button>
            </span>
          })}
        </nav>
        {folder !== null && (
          <Tooltip label={t('upload')} side="bottom">
            <button type="button" className={`${css.iconButton} ${css.uploadButton}`} aria-label={t('upload')}
              disabled={upload?.status === 'uploading'} onClick={() => { picker.current?.click() }}>
              <IconDownloadOutlineRegular size={16} />
            </button>
          </Tooltip>
        )}
        <input ref={picker} type="file" multiple hidden aria-hidden="true" tabIndex={-1} onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? [])
          event.currentTarget.value = ''
          if (folder !== null) void send(folder, files, false)
        }} />
        <Tooltip label={t('refresh')} side="bottom">
          <button type="button" className={css.iconButton} aria-label={t('refresh')} onClick={() => { setReload(value => value + 1) }}>
            <IconRefreshOutlineRegular size={16} />
          </button>
        </Tooltip>
        {currentLink !== undefined && (
          <Tooltip label={t('openInBrowserHint')} side="bottom" maxWidth={220}>
            <a className={css.iconButton} href={currentLink} target="_blank" rel="noreferrer" aria-label={t('openInBrowser')}>
              <IconRightUpOutlineRegular size={16} />
            </a>
          </Tooltip>
        )}
      </div>
      <div className={css.search}>
        <Input className={css.searchInput as string} icon={<IconSearchOutlineRegular size={16} />} type="search" value={query} placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')} onChange={(event) => { setQuery(event.currentTarget.value) }} />
      </div>
      {!searching && <p className={css.hint}>{t('hint')}</p>}
      <div className={css.body}>
        {dragging && folder !== null && <div className={css.dropZone} aria-hidden="true">{t('dropHere', { folder: folderLabel })}</div>}
        {view.status === 'loading' && <p className={css.state} role="status">{t(searching ? 'searching' : 'loading')}</p>}
        {view.status === 'error' && (
          <div className={css.state} role="alert">
            <p>{t(view.reason)}</p>
            <button type="button" className={css.textButton} onClick={() => { setReload(value => value + 1) }}>{t('retry')}</button>
          </div>
        )}
        {view.status === 'spaces' && (view.spaces.length === 0
          ? <p className={css.state}>{t('noSpaces')}</p>
          : <ul className={css.list}>
            {view.spaces.map((space) => {
              const SpaceIcon = SPACE_ICONS[space.kind]
              return <li key={space.path} className={css.row}>
                <button type="button" className={css.action} onClick={() => { open(space.path) }}>
                  <SpaceIcon size={18} />
                  <span className={css.name}>{spaceLabel(space.name)}</span>
                  {space.used !== undefined && space.used > 0 && <span className={css.meta}>{fileSizeText(space.used)}</span>}
                </button>
              </li>
            })}
          </ul>)}
        {view.status === 'entries' && (view.entries.length === 0
          ? <p className={css.state}>{t(view.search ? 'noResults' : 'empty')}</p>
          : <ul className={css.list}>
            {view.entries.map((entry) => {
              const meta = describe(entry)
              const body = <>
                {entry.kind === 'folder' ? <IconFolderCloseRegular size={18} /> : <FileTypeIcon path={entry.name} size={18} />}
                <span className={css.text}>
                  <span className={css.name}>{entry.name}</span>
                  {meta !== '' && <span className={css.meta}>{meta}</span>}
                </span>
              </>
              return <li key={entry.path} className={css.row}>
                {entry.kind === 'folder'
                  ? <button type="button" className={css.action} onClick={() => { open(entry.path) }}>{body}</button>
                  : <button type="button" className={css.action} aria-label={`${t('addToConversation')}: ${entry.name}`}
                    onClick={() => { add(entry) }}>{body}</button>}
                <span className={css.accessory}>
                  {entry.kind === 'folder'
                    ? <Tooltip label={t('addToConversation')} side="left">
                      <button type="button" className={css.iconButton} aria-label={`${t('addToConversation')}: ${entry.name}`}
                        onClick={() => { add(entry) }}>
                        <IconPlusOutlineRegular size={16} />
                      </button>
                    </Tooltip>
                    : entry.webUrl !== undefined && <Tooltip label={t('openInBrowserHint')} side="left" maxWidth={220}>
                      <a className={css.iconButton} href={entry.webUrl} target="_blank" rel="noreferrer"
                        aria-label={`${t('openInBrowser')}: ${entry.name}`}>
                        <IconRightUpOutlineRegular size={16} />
                      </a>
                    </Tooltip>}
                </span>
              </li>
            })}
          </ul>)}
      </div>
      {upload?.status === 'failed' || upload?.status === 'conflicts'
        ? <div className={css.uploadIssue} role="alert">
          <span>{upload.status === 'failed'
            ? t('uploadFailed', { name: upload.name, reason: t(upload.reason) })
            : t('uploadConflicts', { count: String(upload.files.length) })}</span>
          {upload.status === 'conflicts' && (
            <button type="button" className={css.textButton} onClick={() => { void send(upload.folder, upload.files, true) }}>
              {t('replaceAll')}
            </button>
          )}
          <button type="button" className={css.iconButton} aria-label={t('dismiss')} onClick={() => { setUpload(null) }}>
            <IconCloseOutlineRegular size={14} />
          </button>
        </div>
        : <p className={css.notice} role="status" aria-live="polite">
          {upload?.status === 'uploading' ? t('uploading', { count: String(upload.count) })
            : upload?.status === 'done' ? t('uploaded', { count: String(upload.count) })
              : notice === null ? '' : t(notice)}
        </p>}
    </div>
  )
}
