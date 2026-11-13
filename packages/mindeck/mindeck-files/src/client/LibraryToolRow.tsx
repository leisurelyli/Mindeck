/** Transcript row of the file-library tools: what the agent did and where, in the member's words, without local paths. */
import type { ComponentType } from 'react'
import {
  IconDownloadOutlineRegular, IconFolderCloseRegular, IconSearchOutlineRegular, TextShimmer, type IconProps,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { StartedToolCallViewProps, ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { libraryPathOf } from '../reference.ts'
import { libraryLabel } from './labels.ts'
import type { MindeckFilesKey } from './locales.ts'
import css from './LibraryToolRow.module.css'

/** Tool names this row presents. */
export const LIBRARY_TOOLS = ['library_list', 'library_search', 'library_download', 'library_upload'] as const

/** One of the file-library tools. */
export type LibraryTool = (typeof LIBRARY_TOOLS)[number]

/** Composed row props. */
export type LibraryToolRowProps = ToolCallViewProps & PropsLocale<'mindeckFiles'>

type RowState = 'running' | 'ok' | 'error' | 'stopped'

const ROWS: Readonly<Record<LibraryTool, { titleKey: MindeckFilesKey; icon: ComponentType<IconProps>; upload?: true }>> = {
  library_list: { titleKey: 'toolList', icon: IconFolderCloseRegular },
  library_search: { titleKey: 'toolSearch', icon: IconSearchOutlineRegular },
  library_download: { titleKey: 'toolDownload', icon: IconDownloadOutlineRegular },
  library_upload: { titleKey: 'toolUpload', icon: IconDownloadOutlineRegular, upload: true },
}

function isLibraryTool(name: string): name is LibraryTool {
  return (LIBRARY_TOOLS as readonly string[]).includes(name)
}

/** Call arguments, or none while streaming has produced only a JSON prefix. */
function callArgs(raw: string): Readonly<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {}
  } catch (_error) { return {} } // A truncated prefix while the call streams: show the title alone.
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * The place a call names, as the member reads it.
 * @param tool - the called tool.
 * @param args - call arguments.
 * @param t - panel translator.
 * @returns the summary after the title; empty when the arguments name nothing yet.
 */
export function librarySummary(tool: LibraryTool, args: Readonly<Record<string, unknown>>, t: (key: MindeckFilesKey) => string): string {
  const place = (path: string): string => {
    const label = libraryLabel(path, t)
    return label.location === '' ? label.name : `${label.location} / ${label.name}`
  }
  switch (tool) {
    case 'library_search': return text(args.query) === '' ? '' : `“${text(args.query)}”`
    case 'library_list': {
      const path = libraryPathOf(text(args.path))
      return path.replace(/\/+$/u, '') === '' ? t('allSpaces') : place(path)
    }
    case 'library_download': return text(args.path) === '' ? '' : place(libraryPathOf(text(args.path)))
    case 'library_upload': {
      const to = libraryPathOf(text(args.to))
      if (to === '') return ''
      const name = text(args.from).split(/[\\/]/u).at(-1) ?? ''
      return place(to.endsWith('/') ? `${to}${name}` : to)
    }
  }
}

function rowState(block: StartedToolCallViewProps['block']): RowState {
  if (!('kind' in block)) return 'running'
  return block.error?.code === 'interrupted' ? 'stopped' : block.isError ? 'error' : 'ok'
}

/**
 * Render one file-library call as a title and the place it names; the result text, which carries local paths, stays out.
 * @param props - keyed toolview payload plus the panel locale seat.
 * @returns the row.
 */
export function LibraryToolRow(props: LibraryToolRowProps) {
  const { t } = props
  const tool = isLibraryTool(props.toolName) ? props.toolName : 'library_list'
  const row = ROWS[tool]
  const Icon = row.icon
  const icon = <span className={`${css.leading}${row.upload === true ? ` ${css.upload}` : ''}`}><Icon size={14} /></span>
  if (props.phase === 'preparing') {
    return <div className={css.row} data-tool={tool} data-state="preparing">
      {icon}
      <TextShimmer active className={css.title}>{t(row.titleKey)}</TextShimmer>
    </div>
  }
  const state = rowState(props.block)
  const settled = 'kind' in props.block
  const argsRaw = (settled ? props.block.call?.argsRaw : props.block.argsRaw) ?? ''
  const summary = librarySummary(tool, callArgs(argsRaw), t)
  return (
    <div className={css.row} data-tool={tool} data-state={state}>
      {icon}
      <TextShimmer active={state === 'running'}>
        <span className={css.title}><TextShimmer>{t(row.titleKey)}</TextShimmer></span>
        {summary !== '' && <>
          <span className={css.separator} data-shimmer-decoration aria-hidden />
          <span className={css.summary}><TextShimmer>{summary}</TextShimmer></span>
        </>}
      </TextShimmer>
      {state === 'error' && <span className={css.failed}>{t('toolFailed')}</span>}
      {state === 'stopped' && <span className={css.stopped}>{t('toolStopped')}</span>}
    </div>
  )
}
