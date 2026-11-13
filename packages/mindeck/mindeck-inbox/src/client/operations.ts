/** Observables and operations injected into the company messages page and its sidebar row. */
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { MindeckInboxPage, MindeckInboxReadTarget, MindeckInboxSummary } from '../types.ts'

/** Latest unread count and recommended version as the Client observes them. */
export interface MindeckInboxSummarySnapshot {
  /** Latest streamed summary; absent until the first frame or while the stream is unavailable. */
  readonly summary: MindeckInboxSummary | undefined
}

/** Latest inbox items as the open page observes them. */
export interface MindeckInboxPageSnapshot {
  /** Latest streamed items; absent until the first frame. */
  readonly page: MindeckInboxPage | undefined
  /** Whether the items stream failed; the last items stay visible. */
  readonly failed: boolean
}

/** Observables of the sidebar row's badge. */
export interface MindeckInboxBadgeInjected {
  hooks: { summary: HostObservable<MindeckInboxSummarySnapshot> }
}

/** Observables and operations of the company messages page. */
export interface MindeckInboxPageInjected {
  hooks: {
    summary: HostObservable<MindeckInboxSummarySnapshot>
    page: HostObservable<MindeckInboxPageSnapshot>
  }
  /**
   * Follow the inbox items while the page shows; following reads the newest items.
   * @returns the disposer that stops following.
   */
  follow: () => () => void
  /** Read the newest items again, as after a failure. */
  reload: () => void
  /** Read the next older page. */
  loadMore: () => void
  /** @param target - every unread item, or the items the member opened. */
  markRead: (target: MindeckInboxReadTarget) => void
  /** Version of this Mindeck build; empty in builds without release metadata. */
  appVersion: string
}
