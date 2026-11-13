/** The file-library page in the main column: the member's spaces beside the open folder, with search, upload, and a start action. */
import { useEffect, useId, useRef, useState } from 'react'
import {
  Button, FileTypeIcon, IconCloseOutlineRegular, IconDownloadOutlineRegular, IconFolderCloseRegular, IconNewChatOutlineRegular,
  IconRefreshOutlineRegular, IconRightUpOutlineRegular, IconSearchOutlineRegular, Input, Tag, Tooltip, fileSizeText,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { LibraryEntryView } from '../types.ts'
import { parentOf, SPACE_ICONS, useFileDrop, useLibraryBrowser } from './browser.ts'
import type { MindeckFilesKey } from './locales.ts'
import type { MindeckFilesPageInjected } from './operations.ts'
import css from './LibraryPage.module.css'

/** Composed page props. */
export type LibraryPageProps = PropsRuntime<'main'> & PropsLocale<'mindeckFiles'> & InjectFace<MindeckFilesPageInjected>

/** Placeholder rows while a folder loads. */
const SKELETON_ROWS = 6

/**
 * Registered while the member is signed in to Mindeck. The spaces column lists the member's own space, the
 * department and company spaces, and the items shared with the member; the folder column shows the open space or
 * folder with a breadcrumb, a search over all spaces, upload by button or by dropping files, and the browser link.
 * Each file or folder can start a conversation with its `library:` reference in the message box.
 * @param props - availability, library reads, the start action, and localized copy.
 * @returns the page.
 */
export function LibraryPage({ t, useLibrary, spaces, list, search, upload, startWith }: LibraryPageProps) {
  const availability = useLibrary(snapshot => snapshot.availability)
  const streamFailed = useLibrary(snapshot => snapshot.failed)
  const browser = useLibraryBrowser({ spaces, list, search, upload }, availability, t)
  const { path, searching, view, spaceLabel } = browser
  const [busy, setBusy] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const first = browser.spaces[0]?.path

  // The page always shows a space: the first one, the member's own, once the spaces are known.
  useEffect(() => {
    if (path === null && !searching && first !== undefined) browser.open(first)
  }, [path, searching, first])

  const folder = path !== null && !searching ? path : null
  const space = folder === null ? undefined : browser.spaces.find(item => item.path === folder)
  // Inside a folder marked read-only, its rows carry no mark of their own; the root of the shares takes no uploads
  // although items shared with the member can be writable.
  const locked = folder !== null && browser.writable(folder) === false
  const readOnly = locked || space?.kind === 'shares'
  const target = readOnly ? null : folder
  const drop = useFileDrop(target, (into, files) => { void browser.send(into, files, false) })
  const start = (entry: LibraryEntryView): void => {
    if (busy) return
    setBusy(true)
    void startWith(entry).finally(() => { setBusy(false) })
  }

  const head = (
    <header className={css.head}>
      <h1 id={titleId} className={css.title}>{t('title')}</h1>
      <p className={css.intro}>{t('pageIntro')}</p>
    </header>
  )
  if (availability !== 'ready') {
    const reason: MindeckFilesKey = streamFailed ? 'unavailable'
      : availability === 'signed-out' ? 'signedOut' : availability === 'not-configured' ? 'notConfigured' : 'loading'
    return (
      <section className={css.page} aria-labelledby={titleId}>
        {head}
        <div className={css.unavailable} role="status">
          <span className={css.unavailableIcon} aria-hidden="true"><IconFolderCloseRegular size={24} /></span>
          <p className={css.stateTitle}>{t(reason)}</p>
          {reason === 'notConfigured' && <p className={css.stateHint}>{t('notConfiguredHint')}</p>}
        </div>
      </section>
    )
  }

  const segments = folder === null ? [] : folder.split('/').filter(part => part.length > 0)
  const folderLabel = segments.length <= 1 ? spaceLabel(segments[0] ?? '') : segments.at(-1) ?? ''
  const currentLink = folder === null ? undefined : browser.link(folder)
  const located = view.status === 'entries' && view.search
  const location = (entry: LibraryEntryView): string => {
    const parent = parentOf(entry.path)
    return parent === null ? '' : parent.split('/').filter(Boolean).map((part, index) => index === 0 ? spaceLabel(part) : part).join(' / ')
  }
  const entries = view.status === 'entries' ? view.entries : []
  const issue = browser.upload?.status === 'failed' || browser.upload?.status === 'conflicts' ? browser.upload : null

  return (
    <section className={css.page} aria-labelledby={titleId}>
      {head}
      <div className={css.columns}>
        <nav className={css.spaces} aria-label={t('spaces')}>
          <h2 className={css.spacesTitle}>{t('spaces')}</h2>
          <ul className={css.spaceList}>
            {browser.spaces.map((item) => {
              const SpaceIcon = SPACE_ICONS[item.kind]
              const current = !searching && path !== null && (path === item.path || path.startsWith(`${item.path}/`))
              return (
                <li key={item.path} className={css.spaceItem}>
                  <button type="button" className={css.space} aria-current={current ? 'page' : undefined} onClick={() => { browser.open(item.path) }}>
                    <SpaceIcon size={16} className={css.spaceIcon} />
                    <span className={css.spaceName}>{spaceLabel(item.name)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
        <div className={css.browser} {...drop.handlers}>
          <div className={css.bar}>
            <div className={css.location}>
              {searching
                ? <h2 className={css.resultsTitle}>{t('searchResults', { query: browser.query.trim() })}</h2>
                : (
                  <nav className={css.crumbs} aria-label={t('title')}>
                    {segments.map((segment, index) => {
                      const crumb = `/${segments.slice(0, index + 1).join('/')}`
                      return (
                        <span key={crumb} className={css.crumbItem}>
                          {index > 0 && <span className={css.separator} aria-hidden="true">/</span>}
                          <button type="button" className={css.crumb} aria-current={crumb === folder ? 'page' : undefined}
                            onClick={() => { browser.open(crumb) }}>{index === 0 ? spaceLabel(segment) : segment}</button>
                        </span>
                      )
                    })}
                  </nav>
                )}
              {readOnly && <Tooltip label={t('readOnlyHint')} side="bottom" maxWidth={240}><span className={css.readOnly}><Tag tone="neutral">{t('readOnly')}</Tag></span></Tooltip>}
            </div>
            <div className={css.tools}>
              <div className={css.search}>
                <Input type="search" className={css.searchInput as string} icon={<IconSearchOutlineRegular size={16} />} value={browser.query}
                  placeholder={t('searchAllPlaceholder')} aria-label={t('searchAllPlaceholder')}
                  onChange={(event) => { browser.setQuery(event.currentTarget.value) }} />
                {browser.query !== '' && (
                  <button type="button" className={css.clear} aria-label={t('clearSearch')} onClick={() => { browser.setQuery('') }}>
                    <IconCloseOutlineRegular size={14} />
                  </button>
                )}
              </div>
              {!searching && (
                <Button variant="outline" size="sm" className={css.uploadButton} icon={<IconDownloadOutlineRegular size={14} />}
                  disabled={target === null || browser.upload?.status === 'uploading'} onClick={() => { picker.current?.click() }}>
                  {t('upload')}
                </Button>
              )}
              <input ref={picker} type="file" multiple hidden aria-hidden="true" tabIndex={-1} onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? [])
                event.currentTarget.value = ''
                if (target !== null) void browser.send(target, files, false)
              }} />
              <Tooltip label={t('refresh')} side="bottom">
                <button type="button" className={css.iconButton} aria-label={t('refresh')} onClick={browser.reload}>
                  <IconRefreshOutlineRegular size={16} />
                </button>
              </Tooltip>
              {!searching && currentLink !== undefined && (
                <Tooltip label={t('openInBrowserHint')} side="bottom" maxWidth={220}>
                  <a className={css.iconButton} href={currentLink} target="_blank" rel="noreferrer" aria-label={t('openInBrowser')}>
                    <IconRightUpOutlineRegular size={16} />
                  </a>
                </Tooltip>
              )}
            </div>
          </div>
          <div className={css.columnsHead} aria-hidden="true">
            <span>{t('columnName')}</span>
            <span>{located ? t('columnLocation') : t('columnModified')}</span>
            <span className={css.sizeColumn}>{t('columnSize')}</span>
          </div>
          <div className={css.listArea}>
            {drop.dragging && <div className={css.dropZone} aria-hidden="true">{t('dropHere', { folder: folderLabel })}</div>}
            {(view.status === 'loading' || view.status === 'spaces') && (
              <ul className={css.list} role="status" aria-label={t(searching ? 'searching' : 'loading')} aria-busy="true">
                {Array.from({ length: SKELETON_ROWS }, (_, index) => <li key={index} className={css.skeleton} />)}
              </ul>
            )}
            {view.status === 'error' && (
              <div className={css.state} role="alert">
                <p className={css.stateTitle}>{t(view.reason)}</p>
                <Button variant="outline" size="sm" onClick={browser.reload}>{t('retry')}</Button>
              </div>
            )}
            {view.status === 'entries' && entries.length === 0 && (
              <div className={css.state} role="status">
                <span className={css.stateIcon} aria-hidden="true">{searching ? <IconSearchOutlineRegular size={20} /> : <IconFolderCloseRegular size={20} />}</span>
                <p className={css.stateTitle}>{t(searching ? 'noResults' : 'empty')}</p>
                {!searching && target !== null && <p className={css.stateHint}>{t('emptyHint')}</p>}
              </div>
            )}
            {entries.length > 0 && (
              <ul className={css.list} aria-label={searching ? t('searchResults', { query: browser.query.trim() }) : folderLabel} aria-busy={busy}>
                {entries.map(entry => (
                  <li key={entry.path} className={css.row}>
                    <span className={css.nameCell}>
                      {entry.kind === 'folder' ? <IconFolderCloseRegular size={20} className={css.entryIcon} /> : <FileTypeIcon path={entry.name} size={20} className={css.fileIcon} />}
                      {entry.kind === 'folder'
                        ? <button type="button" className={css.name} title={entry.name} onClick={() => { browser.open(entry.path) }}>{entry.name}</button>
                        : entry.webUrl !== undefined
                          ? <a className={css.name} href={entry.webUrl} target="_blank" rel="noreferrer" title={t('openEntry', { name: entry.name })}>{entry.name}</a>
                          : <span className={css.name} title={entry.name}>{entry.name}</span>}
                      {!entry.writable && !located && !locked && <span className={css.rowTag}>{t('readOnly')}</span>}
                    </span>
                    <span className={css.meta} title={located ? location(entry) : undefined}>
                      {located ? location(entry) : entry.modified === undefined ? '' : new Date(entry.modified).toLocaleDateString()}
                    </span>
                    <span className={`${css.meta} ${css.sizeColumn}`}>{entry.kind === 'file' && entry.size !== undefined ? fileSizeText(entry.size) : ''}</span>
                    <span className={css.actions}>
                      <button type="button" className={css.useButton} aria-label={t('useEntry', { name: entry.name })} disabled={busy}
                        onClick={() => { start(entry) }}>
                        <IconNewChatOutlineRegular size={14} />
                        <span>{t('useInConversation')}</span>
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {issue !== null
            ? (
              <div className={css.uploadIssue} role="alert">
                <span>{issue.status === 'failed'
                  ? t('uploadFailed', { name: issue.name, reason: t(issue.reason) })
                  : t('uploadConflicts', { count: String(issue.files.length) })}</span>
                {issue.status === 'conflicts' && (
                  <Button variant="outline" size="sm" onClick={() => { void browser.send(issue.folder, issue.files, true) }}>{t('replaceAll')}</Button>
                )}
                <button type="button" className={css.iconButton} aria-label={t('dismiss')} onClick={browser.dismissUpload}>
                  <IconCloseOutlineRegular size={14} />
                </button>
              </div>
            )
            : (
              <p className={css.notice} role="status" aria-live="polite">
                {browser.upload?.status === 'uploading' ? t('uploading', { count: String(browser.upload.count) })
                  : browser.upload?.status === 'done' ? t('uploaded', { count: String(browser.upload.count) }) : ''}
              </p>
            )}
        </div>
      </div>
    </section>
  )
}
