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

/** Signed-in member as reported by Mindeck Cloud. */
export interface MindeckAccountUser {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly role: 'admin' | 'user'
  readonly department: { readonly id: string; readonly name: string } | null
}

/** Account state the Client renders. */
export interface MindeckAccountView {
  /** Configured Mindeck Cloud address, or null until one is set. */
  readonly cloudUrl: string | null
  readonly status: 'signed-out' | 'signed-in'
  /** Cached identity of the signed-in member; null while signed out. */
  readonly user: MindeckAccountUser | null
  readonly companyName: string | null
  /** Why the last session ended without the member signing out, until the next sign-in. */
  readonly notice: 'session-expired' | null
  readonly attempt: MindeckSignInAttempt | null
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
  }
}
