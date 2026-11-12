/** Sidebar page that browses and searches the company file library and adds items to the message draft. */
import { useEffect, useRef, useState } from 'react'
import {
  FileTypeIcon, IconChevronLeftOutlineRegular, IconFolderCloseRegular, IconPlusOutlineRegular, IconRefreshOutlineRegular,
  IconRightUpOutlineRegular, IconSearchOutlineRegular, Input, Tooltip, fileSizeText,
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

/** Delay between the last keystroke and the search request. */
const SEARCH_DELAY_MS = 300
/** How long the "added" confirmation stays. */
const NOTICE_MS = 2000

function parentOf(path: string): string | null {
  const parts = path.split('/').filter(part => part.length > 0)
  return parts.length <= 1 ? null : `/${parts.slice(0, -1).join('/')}`
}

/**
 * @param props - availability, library reads, the draft action, and localized copy.
 * @returns the library page.
 */
export function LibraryPanel({ t, useLibrary, spaces, list, search, addToConversation }: LibraryPanelProps) {
  const availability = useLibrary(snapshot => snapshot.availability)
  const streamFailed = useLibrary(snapshot => snapshot.failed)
  const [path, setPath] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [reload, setReload] = useState(0)
  const [view, setView] = useState<View>({ status: 'loading' })
  const [known, setKnown] = useState<readonly LibrarySpaceView[]>([])
  const [notice, setNotice] = useState<MindeckFilesKey | null>(null)
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

  const spaceLabel = (name: string): string => {
    const space = known.find(item => item.name === name)
    return space?.kind === 'personal' ? t('personal') : space?.kind === 'shares' ? t('shares') : name
  }
  const open = (next: string | null): void => { setQuery(''); setPath(next) }
  const add = (entry: LibraryEntryView): void => { setNotice(addToConversation(entry) ? 'added' : 'addFailed') }

  if (availability !== 'ready') {
    const key: MindeckFilesKey = streamFailed ? 'unavailable'
      : availability === 'signed-out' ? 'signedOut' : availability === 'not-configured' ? 'notConfigured' : 'loading'
    return <div className={css.page}><p className={css.state} role="status">{t(key)}</p></div>
  }

  const segments = path === null ? [] : path.split('/').filter(part => part.length > 0)
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
    <div className={css.page}>
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
      <div className={css.body}>
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
            {view.spaces.map(space => (
              <li key={space.path} className={css.row}>
                <button type="button" className={css.action} onClick={() => { open(space.path) }}>
                  <IconFolderCloseRegular size={18} />
                  <span className={css.name}>{spaceLabel(space.name)}</span>
                  {space.used !== undefined && space.used > 0 && <span className={css.meta}>{fileSizeText(space.used)}</span>}
                </button>
              </li>
            ))}
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
                  : entry.webUrl === undefined
                    ? <span className={css.action}>{body}</span>
                    : <a className={css.action} href={entry.webUrl} target="_blank" rel="noreferrer">{body}</a>}
                <span className={css.accessory}>
                  <Tooltip label={t('addToConversation')} side="left">
                    <button type="button" className={css.iconButton} aria-label={`${t('addToConversation')}: ${entry.name}`}
                      onClick={() => { add(entry) }}>
                      <IconPlusOutlineRegular size={16} />
                    </button>
                  </Tooltip>
                </span>
              </li>
            })}
          </ul>)}
      </div>
      <p className={css.notice} role="status" aria-live="polite">{notice === null ? '' : t(notice)}</p>
    </div>
  )
}
