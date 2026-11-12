/** File-library tokens that Mindeck Cloud issues to the signed-in desktop session. */
import type { MindeckSession } from '@deepseek-ai/dsh-mindeck-account'
import { z } from 'zod'
import { LibraryError, type OpenCloudAccess } from './opencloud.ts'

/** Account operations the token source needs. */
export interface AccountLink {
  session(): Promise<MindeckSession | undefined>
  rejectToken(token: string): Promise<void>
}

const tokenSchema = z.object({ token: z.string().min(1), expiresAt: z.string(), url: z.url() })

/** A token is renewed this long before Mindeck Cloud's expiry. */
const RENEW_BEFORE_MS = 60_000

interface Cached extends OpenCloudAccess {
  readonly sessionToken: string
  readonly expiresAt: number
}

/** Caches one file-library token per desktop session and requests a new one before it expires. */
export class FilesAccess {
  private cached: Cached | undefined
  private pending: Promise<Cached> | undefined

  /**
   * @param account - the Mindeck account service.
   * @param timeoutMs - limit of one token request.
   * @param now - clock in epoch milliseconds.
   */
  constructor(private readonly account: AccountLink, private readonly timeoutMs: number, private readonly now: () => number = Date.now) {}

  /** Forget the cached token, for example after the member signs out or switches accounts. */
  clear(): void {
    this.cached = undefined
    this.pending = undefined
  }

  /**
   * @param signal - cancellation of this request.
   * @param renew - ignore the cached token because OpenCloud refused it.
   * @returns OpenCloud address and token.
   * @throws LibraryError `signed-out`, `not-configured`, `unavailable`, or `protocol`.
   */
  async get(signal: AbortSignal, renew: boolean): Promise<OpenCloudAccess> {
    const session = await this.account.session()
    if (session === undefined) throw new LibraryError('signed-out', 'the member is not signed in to Mindeck')
    const endpoint = session.bootstrap.endpoints.files
    if (endpoint == null) throw new LibraryError('not-configured', 'the company has not enabled the file library')
    const cached = this.cached
    if (!renew && cached?.sessionToken === session.token && cached.expiresAt - RENEW_BEFORE_MS > this.now()) return cached
    // Concurrent requests share one token request; it is not tied to any single caller's signal.
    this.pending ??= this.request(session, endpoint.token).finally(() => { this.pending = undefined })
    const pending = this.pending
    const result = await new Promise<Cached>((resolve, reject) => {
      const abort = (): void => {
        reject(signal.reason instanceof Error ? signal.reason : new DOMException('The request was aborted', 'AbortError'))
      }
      if (signal.aborted) { abort(); return }
      signal.addEventListener('abort', abort, { once: true })
      pending.then(resolve, reject).finally(() => { signal.removeEventListener('abort', abort) })
    })
    return result
  }

  private async request(session: MindeckSession, url: string): Promise<Cached> {
    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(this.timeoutMs),
        headers: { authorization: `Bearer ${session.token}` },
      })
    } catch (error) {
      throw new LibraryError('unavailable', 'Mindeck Cloud did not respond to the file-library token request', { cause: error })
    }
    if (response.status === 401) {
      void response.body?.cancel()
      await this.account.rejectToken(session.token)
      throw new LibraryError('signed-out', 'Mindeck Cloud ended the desktop session')
    }
    if (response.status === 404) {
      void response.body?.cancel()
      throw new LibraryError('not-configured', 'the company has not enabled the file library')
    }
    if (!response.ok) {
      void response.body?.cancel()
      throw new LibraryError('unavailable', `Mindeck Cloud failed the file-library token request with HTTP ${response.status}`)
    }
    const parsed = tokenSchema.safeParse(await response.json().catch(() => undefined))
    const expiresAt = parsed.success ? Date.parse(parsed.data.expiresAt) : Number.NaN
    if (!parsed.success || Number.isNaN(expiresAt)) throw new LibraryError('protocol', 'Mindeck Cloud returned a file-library token in an unknown format')
    const cached: Cached = { sessionToken: session.token, url: parsed.data.url.replace(/\/+$/, ''), token: parsed.data.token, expiresAt }
    this.cached = cached
    return cached
  }
}
