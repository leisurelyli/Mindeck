/** Wire-safe account state shared by the Host service and the Client UI; never carries a token. */
import type { Branded } from '@deepseek-ai/dsh-brand'
import type {} from '@deepseek-ai/dsh-typert-protocol'

/** Identity of one local sign-in attempt. */
export type MindeckSignInAttemptId = Branded<'MindeckSignInAttemptId'>

/**
 * Failure codes rendered through the Client's locale dictionary.
 * `unreachable`: no response from Mindeck Cloud; `not-mindeck-cloud`: the address answers but is not a
 * Mindeck Cloud; `expired`: the code expired before approval; `denied`: the request was rejected in the
 * browser; `account-unavailable`: the account is disabled or must change its password first;
 * `protocol`: an unexpected response; `storage`: the local credential store failed.
 */
export type MindeckAccountErrorCode =
  | 'unreachable' | 'not-mindeck-cloud' | 'expired' | 'denied' | 'account-unavailable' | 'protocol' | 'storage'

/** Latest sign-in attempt, including its terminal outcome until the next attempt. */
export interface MindeckSignInAttempt {
  readonly id: MindeckSignInAttemptId
  readonly phase: 'requesting' | 'waiting' | 'registering' | 'succeeded' | 'cancelled' | 'failed'
  /** Code shown on the desktop and in the browser, e.g. `ABCD-EFGH`; present while waiting. */
  readonly userCode?: string
  /** Approval page with the code filled in; present while waiting. */
  readonly verificationUrl?: string
  /** Epoch milliseconds after which the code is no longer accepted. */
  readonly expiresAt?: number
  /** True while waiting when the last poll did not reach Mindeck Cloud; polling continues until the code expires. */
  readonly retrying?: boolean
  readonly errorCode?: MindeckAccountErrorCode
}

/**
 * Who ended the desktop session before it expired, as Mindeck Cloud reports it: an administrator signed this computer
 * out or disabled the account (`admin`), or the member signed it out on the web (`member`).
 */
export type MindeckSignOutReason = 'admin' | 'member'

/** Signed-in member as reported by Mindeck Cloud. */
export interface MindeckAccountUser {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly role: 'admin' | 'user'
  readonly department: { readonly id: string; readonly name: string } | null
}

/** Month-to-date estimated cost against one company limit, in CNY. */
export interface MindeckQuotaUsage {
  readonly used: number
  /** Monthly limit; null when there is none. */
  readonly limit: number | null
}

/** The member's model quota for the current month, as Mindeck Cloud reports it. */
export interface MindeckQuota {
  /** The member's own limit, including extra quota approved for this month. */
  readonly user: MindeckQuotaUsage
  /** Extra quota approved for this month and included in `user.limit`, in CNY; 0 without any. */
  readonly granted: number
  /** The department's shared limit; null when the member has no department. */
  readonly department: MindeckQuotaUsage | null
  /**
   * Share of the company's monthly budget used, in percent, when the budget stops every member's requests once
   * used up; null otherwise. Mindeck Cloud does not tell members the company's amounts.
   */
  readonly companyBudgetPercent: number | null
  /** `YYYY-MM-DD` of the first day of the next month in the company time zone, when usage starts over. */
  readonly resetDate: string
  /** Whether the member may ask for more quota now; null from a Mindeck Cloud without quota requests. */
  readonly request: MindeckQuotaRequestState | null
}

/** One request of the member for more quota this month. */
export interface MindeckQuotaRequest {
  readonly id: string
  /** `pending`, `approved`, `rejected`, `cancelled`, `expired`, or a status a newer Mindeck Cloud adds. */
  readonly status: string
  /** `YYYY-MM-DD` of the first day of the month the request is for. */
  readonly month: string
  /** What the member wrote; null for nothing. */
  readonly reason: string | null
  /** ISO 8601 time the member asked. */
  readonly createdAt: string
  /** ISO 8601 time it was decided, withdrawn, or closed; null while pending. */
  readonly decidedAt: string | null
  /** Who approved or rejected it; null otherwise. */
  readonly decidedByName: string | null
  /**
   * How it was approved: `this_month` adds `amount` to this month's limit, `permanent` sets the monthly limit to
   * `amount`; null unless approved, or a decision a newer Mindeck Cloud adds.
   */
  readonly decision: string | null
  /** Approved amount in CNY; null unless approved. */
  readonly amount: number | null
  /** The approver's note; null without one. */
  readonly decisionNote: string | null
}

/** The member's latest request and whether a new one would be accepted, as Mindeck Cloud decides. */
export interface MindeckQuotaRequestState {
  /** The pending request, else the latest of this month; null without one. */
  readonly request: MindeckQuotaRequest | null
  readonly canRequest: boolean
  /**
   * Why no request is accepted now; null when one is. `pending` while a request waits; `company` or `department`
   * when a shared limit is used up, which a personal request cannot raise, so the member contacts an administrator
   * instead; `unlimited` without a personal limit; `quota-left` below 90% of the personal limit. A newer Mindeck Cloud
   * may add others, for which the desktop offers no request.
   */
  readonly blocker: string | null
}

/**
 * What changed on Mindeck Cloud since the previous sync answer, for the plugin that shows it. The company catalogs
 * `models`, `skills`, `employees`, `webSearch`, `policies`, `announcements`, and `client` follow the Cloud revisions of
 * the same names; `access` is the member's department or role, which also changes `models`, `skills`, `employees`, and
 * `policies`; `inbox` is the unread count or the newest item; `quota-request` is the member's latest quota request.
 */
export type MindeckSyncTopic =
  | 'models' | 'skills' | 'employees' | 'webSearch' | 'policies' | 'announcements' | 'client'
  | 'access' | 'inbox' | 'quota-request'

/** The member's own part of a sync answer. */
export interface MindeckSyncMember {
  /** Revision of the member's department and role. */
  readonly accessRevision: number
  readonly inbox: {
    /** Unread personal notifications and visible announcements. */
    readonly unread: number
    /** ISO 8601 time of the newest inbox item; null for an empty inbox. */
    readonly latestAt: string | null
  }
  /** The member's latest quota request; null when they never made one. */
  readonly quotaRequest: {
    readonly id: string
    /** `pending`, `approved`, `rejected`, `cancelled`, `expired`, or a status a newer Mindeck Cloud adds. */
    readonly status: string
    /** `YYYY-MM-DD` of the first day of the month the request is for. */
    readonly month: string
    readonly decidedAt: string | null
  } | null
}

/** One answer of the Mindeck Cloud sync endpoint, with the revision topics this desktop knows. */
export interface MindeckSyncAnswer {
  /** Committed revision of each known company catalog; compare with `!==`. */
  readonly revisions: Readonly<Partial<Record<'models' | 'skills' | 'employees' | 'webSearch' | 'policies' | 'announcements' | 'client', number>>>
  readonly me: MindeckSyncMember
}

/** How the desktop follows changes on Mindeck Cloud while signed in. */
export interface MindeckSyncView {
  /**
   * Whether this Mindeck Cloud reports changes through its sync endpoint; false for one that predates it, which the
   * desktop reads again every ten minutes.
   */
  readonly supported: boolean
  /** Whether a sync the member asked for is running. */
  readonly running: boolean
  /** Epoch milliseconds when Mindeck Cloud last answered a sync; null before the first answer of this session. */
  readonly syncedAt: number | null
  /**
   * Why the last sync failed, until one succeeds: `unreachable` without a response, such as offline; `failed` for an
   * error response. Syncs continue on schedule either way.
   */
  readonly problem: 'unreachable' | 'failed' | null
}

/** The desktop version the company recommends, from Mindeck Cloud. */
export interface MindeckClientRelease {
  /** Recommended version such as `1.8.0`; null when the company recommends none. */
  readonly recommendedVersion: string | null
  /** Release notes shown with it; null when unset. */
  readonly notes: string | null
  /** Installer address for this computer's platform; null when the company offers none for it. */
  readonly downloadUrl: string | null
}

/** Account state the Client renders. */
export interface MindeckAccountView {
  /** Configured Mindeck Cloud address, or null until one is set. */
  readonly cloudUrl: string | null
  /** Whether this device already showed the welcome page; false only before the member's first step. */
  readonly welcomed: boolean
  readonly status: 'signed-out' | 'signed-in'
  /** Cached identity of the signed-in member; null while signed out. */
  readonly user: MindeckAccountUser | null
  readonly companyName: string | null
  /**
   * Why the last session ended without the member signing out here, until the next sign-in: `session-expired` when
   * Mindeck Cloud gave no reason or one this desktop does not know; `signed-out-by-admin` or `signed-out-by-member`
   * when it named who signed this computer out.
   */
  readonly notice: 'session-expired' | 'signed-out-by-admin' | 'signed-out-by-member' | null
  readonly attempt: MindeckSignInAttempt | null
  /** Latest quota read while signed in; null while signed out or before the first successful read. */
  readonly quota: MindeckQuota | null
  /**
   * How members reach an administrator, as the company wrote it; null when unset, and while signed out unless
   * `notice` explains the end of a session that had one.
   */
  readonly adminContact: string | null
  /**
   * Whether the company allows a personal DeepSeek account beside the company account; false while signed out
   * and for a Mindeck Cloud that predates the policy.
   */
  readonly personalDeepSeek: boolean
  /** How the desktop follows company changes; null while signed out. */
  readonly sync: MindeckSyncView | null
  /** The recommended desktop version; null while signed out and for a Mindeck Cloud that predates it. */
  readonly release: MindeckClientRelease | null
}

/** One piece of feedback for the company's Mindeck Cloud. */
export type MindeckFeedback =
  | {
    /** Written by the member in the feedback dialog or with `/feedback`. */
    readonly kind: 'report'
    readonly text?: string
    readonly category?: string
  }
  | {
    /** An answer the member rated down. */
    readonly kind: 'answer'
    /** Stable identity of the rated answer; a later rating of the same answer replaces this one. */
    readonly ref: string
    readonly category?: string
    readonly text?: string
    /** The member took the rating back or rated the answer up. */
    readonly withdrawn?: true
    /** Model id that produced the answer, at most 200 characters. */
    readonly modelName?: string
    /** Mindeck Cloud id of the conversation's digital employee. */
    readonly employeeId?: string
    /** Names of the skills the round used, at most 50 of at most 200 characters each. */
    readonly skills?: readonly string[]
    /**
     * The round's question and answer, each at most 4,000 characters; present only when the member ticked the dialog's
     * choice to attach them, so a later rating without it removes them.
     */
    readonly excerpt?: { readonly question: string; readonly answer: string }
  }

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The address is not usable as a Mindeck Cloud. */
    'mindeck-account/invalid-cloud-url': { readonly reason: 'format' | 'unreachable' | 'not-mindeck-cloud' }
    /** The operation needs a configured Cloud address. */
    'mindeck-account/no-cloud-url': Record<string, never>
    /** The Cloud address cannot change while a member is signed in. */
    'mindeck-account/signed-in': Record<string, never>
    /** The local credential store could not be read or written. */
    'mindeck-account/storage': Record<string, never>
    /** The Cloud address could not be written to the profile settings. */
    'mindeck-account/settings': Record<string, never>
    /** The operation needs a signed-in member. */
    'mindeck-account/signed-out': Record<string, never>
    /** Mindeck Cloud did not take the request. */
    'mindeck-account/unreachable': Record<string, never>
    /** The feedback is empty or longer than 2000 characters. */
    'mindeck-account/invalid-feedback': Record<string, never>
    /**
     * Mindeck Cloud refused a quota request or its withdrawal. `code` is Mindeck Cloud's, such as
     * `QUOTA_REQUEST_PENDING`, `QUOTA_REQUEST_UNAVAILABLE`, `QUOTA_REQUEST_DECIDED`, `NOT_FOUND`, or `INVALID_REQUEST`;
     * `message` is its explanation for the member.
     */
    'mindeck-account/quota-request-refused': { readonly code: string; readonly message: string }
  }
}
