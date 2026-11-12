/** Account operations and the shared state observable injected into every account component. */
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { MindeckAccountErrorCode, MindeckAccountView, MindeckSignInAttemptId } from '../types.ts'
import type { MindeckAccountKey } from './locales.ts'

/** Latest Host account state as the Client observes it. */
export interface MindeckAccountSnapshot {
  /** Latest streamed state; absent until the first frame. */
  readonly view: MindeckAccountView | undefined
  /** Whether the state stream failed; the last view stays visible. */
  readonly failed: boolean
}

/** Result of one Client-initiated operation; a failure names the copy that explains it. */
export type OperationOutcome = { readonly ok: true } | { readonly ok: false; readonly reason: MindeckAccountKey }

/** Operations and hooks shared by the sign-in gate, the settings section, and the launcher. */
export interface MindeckAccountInjected {
  /** Account state owned by the Host, observed through framework hooks. */
  hooks: { account: HostObservable<MindeckAccountSnapshot> }
  /**
   * Set the Cloud address, then start signing in.
   * @param input - address typed by the member.
   * @returns whether both steps were accepted; the attempt itself continues in the account state.
   */
  connect: (input: string) => Promise<OperationOutcome>
  /** @returns whether a sign-in attempt started or is already running. */
  startSignIn: () => Promise<OperationOutcome>
  /** @param id - attempt to cancel. @returns after the attempt stopped. */
  cancelSignIn: (id: MindeckSignInAttemptId) => Promise<void>
  /** @returns whether the local session was removed. */
  signOut: () => Promise<OperationOutcome>
}

const ATTEMPT_ERROR_KEYS: Record<MindeckAccountErrorCode, MindeckAccountKey> = {
  'unreachable': 'unreachable',
  'not-mindeck-cloud': 'notMindeckCloud',
  'expired': 'expired',
  'denied': 'denied',
  'account-unavailable': 'accountUnavailable',
  'protocol': 'protocol',
  'storage': 'storage',
}

/**
 * @param code - failure code of a sign-in attempt.
 * @returns the copy that explains it.
 */
export function attemptErrorKey(code: MindeckAccountErrorCode | undefined): MindeckAccountKey {
  return code === undefined ? 'failed' : ATTEMPT_ERROR_KEYS[code]
}

/**
 * @param name - member display name.
 * @returns the first character shown in the avatar.
 */
export function initial(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? '?'
}
