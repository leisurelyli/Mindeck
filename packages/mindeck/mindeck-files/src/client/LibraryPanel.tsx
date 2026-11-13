/** Side-panel page that browses and searches the company file library, adds items to the message draft, and uploads files. */
import { useEffect, useRef, useState } from 'react'
import {
  FileTypeIcon, IconChevronLeftOutlineRegular, IconCloseOutlineRegular, IconDownloadOutlineRegular, IconFolderCloseRegular,
  IconPlusOutlineRegular, IconRefreshOutlineRegular, IconRightUpOutlineRegular, IconSearchOutlineRegular, Input, Tooltip, fileSizeText,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { LibraryEntryView } from '../types.ts'
import { NOTICE_MS, parentOf, SPACE_ICONS, useFileDrop, useLibraryBrowser } from './browser.ts'
import type { MindeckFilesKey } from './locales.ts'
import type { MindeckFilesInjected } from './operations.ts'
import css from './Library.module.css'

/** Composed panel props. */
export type LibraryPanelProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'mindeckFiles'> & InjectFace<MindeckFilesInjected>

/**
 * @param props - availability, library reads, the draft action, and localized copy.
 * @returns the library page.
 */
export function LibraryPanel({ t, useLibrary, spaces, list, search, upload: uploadFile, addToConversation }: LibraryPanelProps) {
  const availability = useLibrary(snapshot => snapshot.availability)
  const streamFailed = useLibrary(snapshot => snapshot.failed)
  const browser = useLibraryBrowser({ spaces, list, search, upload: uploadFile }, availability, t)
  const { path, searching, view, upload } = browser
  const [notice, setNotice] = useState<MindeckFilesKey | null>(null)
  const picker = useRef<HTMLInputElement>(null)
  const folder = path !== null && !searching ? path : null
  const drop = useFileDrop(folder, (target, files) => { void browser.send(target, files, false) })

  useEffect(() => {
    if (notice === null) return
    const timer = setTimeout(() => { setNotice(null) }, NOTICE_MS)
    return () => { clearTimeout(timer) }
  }, [notice])

  const { open, spaceLabel } = browser
  const add = (entry: LibraryEntryView): void => { setNotice(addToConversation(entry) ? 'added' : 'addFailed') }

  if (availability !== 'ready') {
    const key: MindeckFilesKey = streamFailed ? 'unavailable'
      : availability === 'signed-out' ? 'signedOut' : availability === 'not-configured' ? 'notConfigured' : 'loading'
    return <div className={css.page}><p className={css.state} role="status">{t(key)}</p></div>
  }

  const segments = path === null ? [] : path.split('/').filter(part => part.length > 0)
  const folderLabel = segments.length === 0 ? '' : segments.length === 1 ? spaceLabel(segments[0] ?? '') : segments.at(-1) ?? ''
  const currentLink = path === null ? undefined : browser.link(path)
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
    <div className={css.page} {...drop.handlers}>
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
          if (folder !== null) void browser.send(folder, files, false)
        }} />
        <Tooltip label={t('refresh')} side="bottom">
          <button type="button" className={css.iconButton} aria-label={t('refresh')} onClick={browser.reload}>
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
        <Input className={css.searchInput as string} icon={<IconSearchOutlineRegular size={16} />} type="search" value={browser.query} placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')} onChange={(event) => { browser.setQuery(event.currentTarget.value) }} />
      </div>
      {!searching && <p className={css.hint}>{t('hint')}</p>}
      <div className={css.body}>
        {drop.dragging && <div className={css.dropZone} aria-hidden="true">{t('dropHere', { folder: folderLabel })}</div>}
        {view.status === 'loading' && <p className={css.state} role="status">{t(searching ? 'searching' : 'loading')}</p>}
        {view.status === 'error' && (
          <div className={css.state} role="alert">
            <p>{t(view.reason)}</p>
            <button type="button" className={css.textButton} onClick={browser.reload}>{t('retry')}</button>
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
            <button type="button" className={css.textButton} onClick={() => { void browser.send(upload.folder, upload.files, true) }}>
              {t('replaceAll')}
            </button>
          )}
          <button type="button" className={css.iconButton} aria-label={t('dismiss')} onClick={browser.dismissUpload}>
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
