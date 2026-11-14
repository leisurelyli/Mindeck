/** Inbox state shared by the Host plugin and the company messages page; it never carries a token. */
import type { MindeckClientRelease } from '@deepseek-ai/dsh-mindeck-account/types'
import type {} from '@deepseek-ai/dsh-typert-protocol'

/** Source of an inbox item: a personal notification, or an announcement to the company or a department. */
export type MindeckInboxItemType = 'notification' | 'announcement'

/** Identity of one inbox item; the type and the id together are unique. */
export interface MindeckInboxItemRef {
  readonly type: MindeckInboxItemType
  readonly id: string
}

/** One message of the member's inbox, as Mindeck Cloud reports it. */
export interface MindeckInboxItem extends MindeckInboxItemRef {
  /**
   * What happened, for a notification: `quota-request.approved`, `quota-request.rejected`, `quota-request.expired`,
   * `feedback.replied`, `offboarding.handover`, or a kind a newer Mindeck Cloud adds; `announcement` for an
   * announcement.
   */
  readonly kind: string
  /** `important` for an announcement published as important; `info` otherwise. */
  readonly level: 'info' | 'important'
  readonly title: string
  /** Plain text, possibly with line breaks; null without one. */
  readonly body: string | null
  /** Absolute `http(s)` address to open in the system browser; null without one. */
  readonly link: string | null
  /** ISO 8601 time the item reached the inbox. */
  readonly createdAt: string
  /** ISO 8601 time the member read it on any device; null while unread. */
  readonly readAt: string | null
}

/** What the left-sidebar row and the page header show. */
export interface MindeckInboxSummary {
  /**
   * Whether the member's Mindeck Cloud has an inbox; false while signed out and for a Mindeck Cloud that predates it,
   * which has no company messages page.
   */
  readonly available: boolean
  /** Unread items, as the web console counts them, less the ones this computer marked read and has not reported yet. */
  readonly unread: number
  /** The company's recommended desktop version; null without one. */
  readonly release: MindeckClientRelease | null
  /** How members reach an administrator, for an installer the company offers no address for; null when unset. */
  readonly adminContact: string | null
}

/** Why the inbox could not be read: `unreachable` without a response, such as offline; `failed` for an error response. */
export interface MindeckInboxFailure {
  readonly reason: 'unreachable' | 'failed'
  /** `x-request-id` of the failed response, for the Mindeck Cloud log; null without a response. */
  readonly requestId: string | null
}

/** The inbox items loaded for the company messages page. */
export interface MindeckInboxPage {
  /** Items newest first; null before the first page arrived for this member. */
  readonly items: readonly MindeckInboxItem[] | null
  /** Whether older items remain to load. */
  readonly more: boolean
  /** Which read is running: the newest items, or the next older page. */
  readonly loading: 'first' | 'more' | null
  /** Why the last read failed, until one succeeds; loaded items stay. */
  readonly failure: MindeckInboxFailure | null
}

/** Items to mark read: every unread item, or the listed ones. */
export type MindeckInboxReadTarget = { readonly all: true } | { readonly items: readonly MindeckInboxItemRef[] }
