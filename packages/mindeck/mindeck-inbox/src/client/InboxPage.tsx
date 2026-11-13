/** The company messages page in the main column: the recommended version, then the member's inbox newest first. */
import { Fragment, useEffect, useId, useState, type ReactNode } from 'react'
import {
  Button, IconArchiveOutlineRegular, IconDownloadOutlineRegular, IconEditOutlineRegular, IconGaugeOutlineRegular,
  IconInfoOutlineRegular, IconRightUpOutlineRegular, IconWarningOutlineRegular, Tag,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { MindeckClientRelease } from '@deepseek-ai/dsh-mindeck-account/types'
import type { MindeckInboxFailure, MindeckInboxItem } from '../types.ts'
import { bodyParts, FAMILY_LABELS, formatItemTime, isOlderVersion, itemFamily, type ItemFamily } from './format.ts'
import { BellIcon, MegaphoneIcon } from './icons.tsx'
import type { MindeckInboxPageInjected } from './operations.ts'
import css from './InboxPage.module.css'

/** Composed page props. */
export type InboxPageProps = PropsRuntime<'main'> & PropsLocale<'mindeckInbox'> & InjectFace<MindeckInboxPageInjected>

type Translate = InboxPageProps['t']

/** Placeholder rows while the first items load. */
const SKELETON_ROWS = 3

/** How often relative times such as Today and Yesterday are worded again. */
const CLOCK_TICK_MS = 60_000

/** @param family - what an item is about. @returns its icon. */
function familyIcon(family: ItemFamily): ReactNode {
  switch (family) {
    case 'announcement': return <MegaphoneIcon size={16} />
    case 'quota': return <IconGaugeOutlineRegular size={16} />
    case 'feedback': return <IconEditOutlineRegular size={16} />
    case 'handover': return <IconArchiveOutlineRegular size={16} />
    case 'other': return <IconInfoOutlineRegular size={14} />
  }
}

/** @param href - web address. Opens it in the system browser. */
function openExternal(href: string): void {
  window.open(href, '_blank', 'noopener,noreferrer')
}

/** @returns the current time, worded again every minute. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => { setNow(new Date()) }, CLOCK_TICK_MS)
    return () => { clearInterval(timer) }
  }, [])
  return now
}

/**
 * @param props.body - an item body.
 * @returns the body with its web addresses as links.
 */
function BodyText({ body }: { body: string }) {
  return <>{bodyParts(body).map((part, index) => part.href === undefined
    ? <Fragment key={index}>{part.text}</Fragment>
    : <a key={index} className={css.inlineLink} href={part.href} target="_blank" rel="noopener noreferrer">{part.text}</a>)}</>
}

/**
 * Opening an unread item marks it read on every device.
 * @param props.item - the inbox item.
 * @param props.expanded - whether its whole body shows.
 * @param props.onToggle - shows or hides the whole body.
 * @param props.now - the current time.
 * @param props.t - page copy.
 * @returns one inbox row.
 */
function InboxRow({ item, expanded, onToggle, now, t }: {
  item: MindeckInboxItem
  expanded: boolean
  onToggle: () => void
  now: Date
  t: Translate
}) {
  const detailId = useId()
  const family = itemFamily(item)
  const unread = item.readAt === null
  const expandable = item.body !== null || item.link !== null
  return (
    <li className={css.item} data-unread={unread || undefined}>
      <button type="button" className={css.itemButton} aria-expanded={expandable ? expanded : undefined}
        aria-controls={expanded ? detailId : undefined} onClick={onToggle}>
        <span className={css.tile} data-family={family} aria-hidden="true">
          {familyIcon(family)}
          {unread && <span className={css.dot} />}
        </span>
        <span className={css.itemText}>
          <span className={css.itemHead}>
            <span className={css.itemTitle}>{item.title}</span>
            {item.level === 'important' && <Tag tone="warning" className={css.importantTag}>{t('important')}</Tag>}
            {unread && <span className={css.srOnly}>{t('unread')}</span>}
            <span className={css.itemMeta}>{t(FAMILY_LABELS[family])} · {formatItemTime(item.createdAt, now, t)}</span>
          </span>
          {!expanded && item.body !== null && <span className={css.preview}>{item.body}</span>}
        </span>
      </button>
      {expanded && expandable && (
        <div id={detailId} className={css.detail}>
          {item.body !== null && <p className={css.fullBody}><BodyText body={item.body} /></p>}
          {item.link !== null && (
            <a className={css.detailLink} href={item.link} target="_blank" rel="noopener noreferrer">
              {t('openLink')}<IconRightUpOutlineRegular size={12} />
            </a>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * @param props.release - the company's recommendation, with the installer for this computer.
 * @param props.version - the recommended version.
 * @param props.appVersion - version of this build.
 * @param props.t - page copy.
 * @returns the card that offers the recommended version.
 */
function ReleaseCard({ release, version, appVersion, t }: {
  release: MindeckClientRelease
  version: string
  appVersion: string
  t: Translate
}) {
  const titleId = useId()
  const { downloadUrl, notes } = release
  return (
    <section className={css.release} aria-labelledby={titleId}>
      <span className={css.releaseTile} aria-hidden="true"><IconDownloadOutlineRegular size={16} /></span>
      <div className={css.releaseText}>
        <h2 id={titleId} className={css.releaseTitle}>{t('versionTitle', { version })}</h2>
        <p className={css.releaseMeta}>{t('versionCurrent', { current: appVersion })}</p>
        {notes !== null && notes.trim() !== '' && <p className={css.releaseNotes}>{notes}</p>}
        {downloadUrl === null && <p className={css.releaseMeta}>{t('versionNoDownload')}</p>}
      </div>
      {downloadUrl !== null && (
        <Button variant="primary" size="sm" className={css.releaseAction} onClick={() => { openExternal(downloadUrl) }}>
          {t('versionDownload', { version })}
        </Button>
      )}
    </section>
  )
}

/**
 * @param props.failure - why the items could not be read.
 * @param props.onRetry - reads the items again.
 * @param props.t - page copy.
 * @returns the centered state of a page without items.
 */
function FailureState({ failure, onRetry, t }: { failure: MindeckInboxFailure; onRetry: () => void; t: Translate }) {
  const offline = failure.reason === 'unreachable'
  return (
    <div className={css.state} role="status">
      <span className={css.stateIcon} aria-hidden="true"><IconWarningOutlineRegular size={20} /></span>
      <p className={css.stateTitle}>{t(offline ? 'unreachableTitle' : 'failedTitle')}</p>
      <p className={css.stateHint}>{t(offline ? 'unreachableHint' : 'failedHint')}</p>
      {failure.requestId !== null && <p className={css.requestId}>{t('requestId', { id: failure.requestId })}</p>}
      <Button variant="outline" size="sm" onClick={onRetry}>{t('retry')}</Button>
    </div>
  )
}

/**
 * Registered while the member's Mindeck Cloud has an inbox. Opening the page reads the newest items; a sync that
 * reports news reads them again. Opening an item shows its whole text and marks it read everywhere.
 * @param props - the inbox, its operations, and localized copy.
 * @returns the page.
 */
export function InboxPage({ t, useSummary, usePage, follow, reload, loadMore, markRead, appVersion }: InboxPageProps) {
  const summary = useSummary(snapshot => snapshot.summary)
  const page = usePage(snapshot => snapshot.page)
  const streamFailed = usePage(snapshot => snapshot.failed)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const now = useNow()
  const titleId = useId()
  useEffect(() => follow(), [follow])

  const items = page?.items ?? null
  const unread = summary?.unread ?? 0
  const release = summary?.release ?? null
  const version = release?.recommendedVersion ?? null
  const showRelease = release !== null && version !== null && isOlderVersion(appVersion, version)
  const toggle = (item: MindeckInboxItem): void => {
    const key = `${item.type}:${item.id}`
    const opening = !expanded.has(key)
    setExpanded((current) => {
      const next = new Set(current)
      if (opening) next.add(key)
      else next.delete(key)
      return next
    })
    if (opening && item.readAt === null) markRead({ items: [{ type: item.type, id: item.id }] })
  }

  let body: ReactNode
  if (items === null) {
    const failure = page?.failure ?? (streamFailed ? { reason: 'failed' as const, requestId: null } : null)
    body = failure !== null && page?.loading !== 'first'
      ? <FailureState failure={failure} onRetry={reload} t={t} />
      : (
        <ul className={css.list} role="status" aria-label={t('loading')} aria-busy="true">
          {Array.from({ length: SKELETON_ROWS }, (_, index) => <li key={index} className={css.skeletonRow} />)}
        </ul>
      )
  } else if (items.length === 0 && page?.failure == null) {
    body = (
      <div className={css.state} role="status">
        <span className={css.stateIcon} aria-hidden="true"><BellIcon size={24} /></span>
        <p className={css.stateTitle}>{t('emptyTitle')}</p>
        <p className={css.stateHint}>{t('emptyHint')}</p>
      </div>
    )
  } else {
    const failure = page?.failure ?? null
    body = (
      <>
        {failure !== null && (
          <div className={css.notice} role="status">
            <IconWarningOutlineRegular size={14} />
            <span className={css.noticeText}>
              {t(failure.reason === 'unreachable' ? 'staleUnreachable' : 'staleFailed')}
              {failure.requestId !== null && <span className={css.requestIdInline}>{t('requestId', { id: failure.requestId })}</span>}
            </span>
            <button type="button" className={css.noticeAction} onClick={reload}>{t('retry')}</button>
          </div>
        )}
        {items.length > 0 && (
          <ul className={css.list} aria-labelledby={titleId}>
            {items.map((item) => {
              const key = `${item.type}:${item.id}`
              return <InboxRow key={key} item={item} expanded={expanded.has(key)} now={now} t={t} onToggle={() => { toggle(item) }} />
            })}
          </ul>
        )}
        {page?.more === true && (
          <div className={css.more}>
            <Button variant="ghost" size="sm" disabled={page.loading !== null} onClick={loadMore}>
              {page.loading === 'more' ? t('loadingMore') : t('loadMore')}
            </Button>
          </div>
        )}
      </>
    )
  }

  // The heading stays in place while the messages scroll beneath it.
  return (
    <section className={css.page} aria-labelledby={titleId}>
      <header className={css.head}>
        <div className={css.column}>
          <div className={css.titleRow}>
            <h1 id={titleId} className={css.title}>{t('title')}</h1>
            {unread > 0 && items !== null && items.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => { markRead({ all: true }) }}>{t('markAllRead')}</Button>
            )}
          </div>
          <p className={css.intro}>{t('intro')}</p>
        </div>
      </header>
      <div className={css.scroll}>
        <div className={`${css.column} ${css.body}`}>
          {showRelease && <ReleaseCard release={release} version={version} appVersion={appVersion} t={t} />}
          {body}
        </div>
      </div>
    </section>
  )
}
