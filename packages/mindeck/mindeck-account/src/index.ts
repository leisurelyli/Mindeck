/**
 * Mindeck Cloud account for Mindeck Desktop: the configured Cloud address, device sign-in, the stored
 * desktop session, and that session's token for other Mindeck Host plugins. The Client reaches it
 * through the `mindeckAccount` Remote namespace, which never carries the token.
 * @module @deepseek-ai/dsh-mindeck-account
 */
import { randomUUID } from 'node:crypto'
import { hostname } from 'node:os'
import { setTimeout as sleep } from 'node:timers/promises'
import { Context, type Volatile } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import z from '@deepseek-ai/schemastery'
import { z as zod } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-command-feedback/types'
import type {} from '@deepseek-ai/dsh-message-feedback'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-settings'
import { deadline } from '@deepseek-ai/dsh-timeout'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { followChanges } from './changes.ts'
import {
  cloudUrlCandidates, type DeviceInfo, type MindeckBootstrap, MindeckCloudError, normalizeCloudUrl, pollDeviceToken, probeCloud,
  readBootstrap, readQuota, reportDevice, reportDeviceRequest, requestDeviceCode, sendFeedback, signOutDevice,
} from './cloud.ts'
import type {
  MindeckAccountErrorCode, MindeckAccountView, MindeckFeedback, MindeckQuota, MindeckSignInAttempt, MindeckSignInAttemptId,
} from './types.ts'

export type * from './types.ts'
export type { MindeckBootstrap } from './cloud.ts'
export { cloudUrlCandidates, normalizeCloudUrl } from './cloud.ts'
export { followChanges } from './changes.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    mindeckAccount: MindeckAccount
  }
  interface Events {
    /**
     * The stored session started, ended, or its cached account details changed. Consumers re-read
     * {@link MindeckAccount.session}.
     * @mode emit
     */
    'mindeck-account/changed'(): void
  }
}

/** Deployment options. */
export interface Config {
  /**
   * Mindeck Cloud console address, such as `https://cloud.example.com`. Empty until a deployment or the
   * member sets it; the account settings write it through the settings service.
   */
  cloudUrl: Volatile<string>
  /**
   * Whether this device showed the Mindeck welcome page. The member's first step sets it, and so does the first
   * sign-in or a stored session, so the page appears once per device.
   */
  welcomed: Volatile<boolean>
  /** Timeout of each request to Mindeck Cloud in milliseconds. */
  requestTimeoutMs: number
  /** Interval in milliseconds between quota reads while signed in. */
  quotaRefreshMs: number
}

/** Credential record holding the desktop session. */
export const MINDECK_ACCOUNT_KEY = credentialKey('mindeck-account', 'default')

/** Signed-in desktop session for other Mindeck Host plugins. Never send it to a Client. */
export interface MindeckSession {
  readonly cloudUrl: string
  /** Bearer token of the desktop session; valid for the Cloud's desktop API and model gateway. */
  readonly token: string
  readonly bootstrap: MindeckBootstrap
}

/** Durable form of {@link MindeckSession} inside the grant record. */
const storedSessionSchema = zod.object({
  version: zod.literal(1),
  cloudUrl: zod.string().min(1),
  token: zod.string().min(16),
  bootstrap: zod.object({
    user: zod.object({
      id: zod.string(), name: zod.string(), email: zod.string(), role: zod.enum(['admin', 'user']),
      department: zod.object({ id: zod.string(), name: zod.string() }).nullable(),
    }),
    company: zod.object({ name: zod.string(), adminContact: zod.string().nullable().optional() }),
    device: zod.object({ id: zod.string() }),
    endpoints: zod.object({
      console: zod.string(), models: zod.string(), skills: zod.string(),
      anthropicBaseUrl: zod.string(), openaiBaseUrl: zod.string(),
      files: zod.object({ url: zod.string(), token: zod.string() }).nullable().optional(),
      webSearch: zod.string().optional(), employees: zod.string().optional(),
    }),
    // Fields added after version 1 are optional, so records written before them still load.
    policies: zod.object({ personalDeepSeek: zod.boolean() }).optional(),
  }),
})

type StoredSession = zod.infer<typeof storedSessionSchema>

interface Attempt {
  view: MindeckSignInAttempt
  readonly controller: AbortController
  task?: Promise<void>
}

const TERMINAL_PHASES = new Set<MindeckSignInAttempt['phase']>(['succeeded', 'cancelled', 'failed'])

/**
 * Feedback the company receives for one Session log event: an answer rated down (or taken back), or a
 * `/feedback` remark. Positive ratings stay on this computer.
 * @param event - appended Session log event.
 * @returns the feedback to send, or undefined for any other event.
 */
export function feedbackOf(event: SessionEvent): MindeckFeedback | undefined {
  switch (event.type) {
    case 'feedback/message-put': {
      const { sessionId, item } = event.data
      const ref = `${sessionId}/${item.messageId}`
      if (item.rating !== 'negative') return { kind: 'answer', ref, withdrawn: true }
      return {
        kind: 'answer', ref,
        ...item.category === undefined ? {} : { category: item.category }, ...item.note === undefined ? {} : { text: item.note },
      }
    }
    case 'feedback/message-delete':
      return { kind: 'answer', ref: `${event.data.sessionId}/${event.data.messageId}`, withdrawn: true }
    case 'feedback/record': {
      const { text, category } = event.data
      if (text === undefined && category === undefined) return undefined
      return { kind: 'report', ...text === undefined ? {} : { text }, ...category === undefined ? {} : { category } }
    }
    default:
      return undefined
  }
}

/** Mindeck Cloud account service and its Remote namespace. */
export default class MindeckAccount extends TypertRemoteService {
  static inject = ['credentials', 'typert']
  static Config = z.object({
    cloudUrl: z.string().default('').volatile()
      .description('Mindeck Cloud console address, such as https://cloud.example.com.'),
    welcomed: z.boolean().default(false).volatile()
      .description('Whether this device showed the Mindeck welcome page.'),
    requestTimeoutMs: z.natural().min(1000).default(15_000)
      .description('Timeout of each request to Mindeck Cloud in milliseconds.'),
    quotaRefreshMs: z.natural().min(10_000).default(120_000)
      .description('Interval in milliseconds between quota reads while signed in.'),
  })

  private readonly settingsNs: string
  private readonly listeners = new Set<() => void>()
  private readonly lifetime = new AbortController()
  private readonly background = new Set<Promise<void>>()
  private loaded: Promise<StoredSession | undefined> | undefined
  private stored: StoredSession | undefined
  private attempt: Attempt | undefined
  private notice: MindeckAccountView['notice'] = null
  /** Latest quota with the token it was read for, so a quota never outlives its session. */
  private quota: { readonly token: string; readonly value: MindeckQuota } | undefined

  /** @param ctx - Host with the credentials service. @param config - deployment options. */
  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'mindeckAccount', { namespace: 'mindeckAccount' })
    this.settingsNs = ctx.fiber.entry?.options.id ?? 'mindeck-account'
    ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
    ctx.on('loader/volatile-update', () => { this.changed() })
    ctx.effect(() => () => {
      this.lifetime.abort()
      this.attempt?.controller.abort()
    }, 'mindeck-account: sign-in and background requests')
    // Validate the stored session; an unreachable Cloud keeps it for offline use.
    this.track(this.revalidate())
    this.track(this.pollQuota())
    // Answers rated down and `/feedback` remarks also reach the company, in live and closed conversations alike.
    ctx.on('session/event', (_session, event) => { this.forwardFeedback(event) })
    ctx.on('feedback/committed', (inspection) => {
      const last = inspection.events.at(-1)
      if (last !== undefined) this.forwardFeedback(last)
    })
  }

  /**
   * Read the account state.
   * @returns configured address, signed-in member, and the latest sign-in attempt; never the token.
   */
  @Remote
  async getState(): Promise<MindeckAccountView> {
    const stored = await this.load()
    const user = stored?.bootstrap.user
    return {
      cloudUrl: this.cloudUrl() ?? null,
      welcomed: this.config.welcomed.get(),
      status: stored === undefined ? 'signed-out' : 'signed-in',
      user: user === undefined ? null : { ...user },
      companyName: stored?.bootstrap.company.name ?? null,
      notice: this.notice,
      attempt: this.attempt?.view ?? null,
      quota: stored !== undefined && this.quota?.token === stored.token ? this.quota.value : null,
      adminContact: stored?.bootstrap.company.adminContact ?? null,
      personalDeepSeek: stored?.bootstrap.policies?.personalDeepSeek === true,
    }
  }

  /**
   * Read the month-to-date quota from Mindeck Cloud now, as after a refused request or when the account
   * menu opens. A failed read keeps the previous quota; a rejected token ends the session.
   * @param signal - caller cancellation.
   * @returns state with the latest quota.
   */
  @Remote
  async refreshQuota(signal: AbortSignal): Promise<MindeckAccountView> {
    await this.readQuota(signal)
    return await this.getState()
  }

  /**
   * Send a written report to the company's Mindeck Cloud.
   * @param text - what the member wrote; blank or longer than 2000 characters is refused.
   * @param signal - caller cancellation.
   * @throws RemoteError `mindeck-account/invalid-feedback` for blank or overlong text, `mindeck-account/signed-out`
   * without a usable session, or `mindeck-account/unreachable` when Mindeck Cloud does not take it.
   */
  @Remote
  async sendFeedback(text: string, signal: AbortSignal): Promise<void> {
    const trimmed = text.trim()
    if (trimmed === '' || trimmed.length > 2000) throw new RemoteError('mindeck-account/invalid-feedback', 'feedback must have 1 to 2000 characters', {})
    await this.deliverFeedback({ kind: 'report', text: trimmed }, signal)
  }

  /**
   * Stream account state.
   * @param signal - stream lifetime; ending it never cancels a sign-in.
   * @returns the current state, then every change.
   */
  @Remote({ mode: 'stream' })
  async *watch(signal: AbortSignal): AsyncIterable<MindeckAccountView> {
    yield* followChanges(this.listeners, signal, this.lifetime.signal, () => this.getState())
  }

  /**
   * Set the Mindeck Cloud address after checking that it answers as one. Only while signed out. An address with a
   * page path, such as an invitation link, resolves to the shortest path prefix that answers as a Mindeck Cloud.
   * @param input - address typed or pasted by the member; a missing scheme means HTTPS.
   * @param signal - caller cancellation.
   * @returns state with the resolved address.
   */
  @Remote
  async setCloudUrl(input: string, signal: AbortSignal): Promise<MindeckAccountView> {
    if (await this.load() !== undefined) throw new RemoteError('mindeck-account/signed-in', 'sign out before changing the Cloud address', {})
    const address = normalizeCloudUrl(input)
    if (address === undefined) {
      throw new RemoteError('mindeck-account/invalid-cloud-url', 'not an HTTP(S) address', { reason: 'format' })
    }
    let cloudUrl: string | undefined
    let refusal: MindeckCloudError | undefined
    for (const candidate of cloudUrlCandidates(address)) {
      try {
        await this.request(signal, request => probeCloud(candidate, request))
        cloudUrl = candidate
        break
      } catch (error) {
        if (!(error instanceof MindeckCloudError)) throw error
        // Every candidate shares one origin, so an unreachable one means the rest are too.
        if (error.code === 'unreachable') {
          throw new RemoteError('mindeck-account/invalid-cloud-url', error.message, { reason: 'unreachable' }, { cause: error })
        }
        refusal = error
      }
    }
    if (cloudUrl === undefined) {
      throw new RemoteError('mindeck-account/invalid-cloud-url', refusal?.message ?? 'not a Mindeck Cloud',
        { reason: 'not-mindeck-cloud' }, { cause: refusal })
    }
    const settings = this.ctx.get('settings')
    try {
      if (settings === undefined) throw new Error('the settings service is not mounted')
      await settings.update(this.settingsNs, { cloudUrl })
    } catch (error) {
      this.ctx.logger.warn('mindeck-account: could not save the Cloud address', error)
      throw new RemoteError('mindeck-account/settings', 'the Cloud address could not be saved', {}, { cause: error })
    }
    this.changed()
    return await this.getState()
  }

  /**
   * Record that this device showed the welcome page, so it does not appear again.
   * @returns the state with `welcomed` set.
   * @throws RemoteError `mindeck-account/settings` when the profile settings could not be written.
   */
  @Remote
  async finishWelcome(): Promise<MindeckAccountView> {
    await this.markWelcomed()
    return await this.getState()
  }

  /**
   * Join the running sign-in or start device authorization. The Client opens the returned
   * `verificationUrl` in a browser; the attempt finishes after the member approves it there.
   * @param appVersion - version of the requesting app, reported with the device.
   * @returns state with the attempt, without waiting for approval.
   */
  @Remote
  async startSignIn(appVersion: string): Promise<MindeckAccountView> {
    const cloudUrl = this.cloudUrl()
    if (cloudUrl === undefined) throw new RemoteError('mindeck-account/no-cloud-url', 'set the Mindeck Cloud address first', {})
    if (await this.load() !== undefined) return await this.getState()
    if (this.attempt !== undefined && !TERMINAL_PHASES.has(this.attempt.view.phase)) return await this.getState()
    const attempt: Attempt = {
      view: { id: brandString<MindeckSignInAttemptId>(randomUUID()), phase: 'requesting' },
      controller: new AbortController(),
    }
    this.attempt = attempt
    this.notice = null
    this.changed()
    attempt.task = this.runAttempt(attempt, cloudUrl, appVersion)
    this.track(attempt.task)
    return await this.getState()
  }

  /**
   * Cancel the named attempt and wait for it to stop.
   * @param id - attempt identity from {@link getState}.
   * @returns state after the attempt ended.
   */
  @Remote
  async cancelSignIn(id: MindeckSignInAttemptId): Promise<MindeckAccountView> {
    const attempt = this.attempt
    if (attempt !== undefined && attempt.view.id === id && !TERMINAL_PHASES.has(attempt.view.phase)) {
      attempt.controller.abort()
      await attempt.task
    }
    return await this.getState()
  }

  /**
   * Sign this desktop out: remove the stored session, then end it on Mindeck Cloud in the background.
   * @returns the signed-out state.
   */
  @Remote
  async signOut(): Promise<MindeckAccountView> {
    const attempt = this.attempt
    if (attempt !== undefined && !TERMINAL_PHASES.has(attempt.view.phase)) {
      attempt.controller.abort()
      await attempt.task
    }
    const stored = await this.load()
    if (stored !== undefined) {
      await this.removeStored()
      this.notice = null
      this.changed(true)
      this.track(this.request(this.lifetime.signal, signal => signOutDevice(stored.cloudUrl, stored.token, signal))
        .catch((error: unknown) => { this.ctx.logger.warn('mindeck-account: Cloud sign-out failed; the session ends when it expires', error) }))
    }
    return await this.getState()
  }

  /**
   * Read the signed-in session for a Host consumer such as the model routes.
   * @returns the session with its token, or undefined while signed out.
   */
  async session(): Promise<MindeckSession | undefined> {
    const stored = await this.load()
    return stored === undefined ? undefined : { cloudUrl: stored.cloudUrl, token: stored.token, bootstrap: stored.bootstrap }
  }

  /**
   * Report that Mindeck Cloud rejected a session token (HTTP 401). The stored session is removed only
   * when it still holds that token, so a newer sign-in survives a late rejection.
   * @param token - the token the rejected request carried.
   */
  async rejectToken(token: string): Promise<void> {
    const stored = await this.load()
    if (stored?.token !== token) return
    await this.removeStored()
    this.notice = 'session-expired'
    this.changed(true)
  }

  private cloudUrl(): string | undefined {
    return normalizeCloudUrl(this.config.cloudUrl.get())
  }

  /** Persist `welcomed`; a device that already has it writes nothing. */
  private async markWelcomed(): Promise<void> {
    if (this.config.welcomed.get()) return
    const settings = this.ctx.get('settings')
    try {
      if (settings === undefined) throw new Error('the settings service is not mounted')
      await settings.update(this.settingsNs, { welcomed: true })
    } catch (error) {
      this.ctx.logger.warn('mindeck-account: could not save that the welcome page was shown', error)
      throw new RemoteError('mindeck-account/settings', 'the welcome state could not be saved', {}, { cause: error })
    }
  }

  private async load(): Promise<StoredSession | undefined> {
    this.loaded ??= (async () => {
      let record
      try { record = await this.ctx.credentials.readRecord(MINDECK_ACCOUNT_KEY) }
      catch (error) {
        this.loaded = undefined
        throw new RemoteError('mindeck-account/storage', 'the credential store could not be read', {}, { cause: error })
      }
      if (record?.kind !== 'grant') return undefined
      const parsed = storedSessionSchema.safeParse(record.payload)
      if (!parsed.success) {
        this.ctx.logger.warn('mindeck-account: ignoring an unreadable stored session')
        return undefined
      }
      this.stored = parsed.data
      return parsed.data
    })()
    await this.loaded
    return this.stored
  }

  private async store(session: StoredSession): Promise<void> {
    await this.ctx.credentials.modifyRecord(MINDECK_ACCOUNT_KEY, () => Promise.resolve({ kind: 'grant', payload: session }))
    this.stored = session
    this.loaded = Promise.resolve(session)
  }

  private async removeStored(): Promise<void> {
    try { await this.ctx.credentials.deleteRecord(MINDECK_ACCOUNT_KEY) }
    catch (error) { throw new RemoteError('mindeck-account/storage', 'the credential store could not be written', {}, { cause: error }) }
    this.stored = undefined
    this.loaded = Promise.resolve(undefined)
  }

  /** Read the quota while signed in, then again every `quotaRefreshMs` until the plugin stops. */
  private async pollQuota(): Promise<void> {
    const { signal } = this.lifetime
    while (!signal.aborted) {
      await this.readQuota(signal)
      try { await sleep(this.config.quotaRefreshMs, undefined, { signal }) }
      catch { return } // AbortError: the plugin is stopping.
    }
  }

  /** Store the current session's quota; failures keep the previous one, and a rejected token ends the session. */
  private async readQuota(signal: AbortSignal): Promise<void> {
    let stored: StoredSession | undefined
    try { stored = await this.load() }
    catch (error) { this.ctx.logger.warn('mindeck-account: could not read the stored session', error); return }
    if (stored === undefined) return
    let quota: MindeckQuota | 'sign-in-required'
    try { quota = await this.request(signal, request => readQuota(stored.cloudUrl, stored.token, request)) }
    catch (error) {
      if (!signal.aborted) this.ctx.logger.info('mindeck-account: could not read the quota; keeping the last one', error)
      return
    }
    if (quota === 'sign-in-required') { await this.rejectToken(stored.token); return }
    if (this.stored?.token !== stored.token) return
    if (this.quota?.token === stored.token && JSON.stringify(this.quota.value) === JSON.stringify(quota)) return
    this.quota = { token: stored.token, value: quota }
    this.changed()
  }

  /** Refresh cached account details; a rejected token ends the session. */
  private async revalidate(): Promise<void> {
    let stored: StoredSession | undefined
    try { stored = await this.load() }
    catch (error) { this.ctx.logger.warn('mindeck-account: could not read the stored session', error); return }
    if (stored === undefined) return
    // A device that signed in before the welcome page existed has no use for it.
    this.track(this.markWelcomed().catch((_error: unknown) => {
      // markWelcomed logged the failure; the next start tries again.
    }))
    let bootstrap: MindeckBootstrap | 'sign-in-required'
    try { bootstrap = await this.request(this.lifetime.signal, signal => readBootstrap(stored.cloudUrl, stored.token, signal)) }
    catch (error) {
      if (!this.lifetime.signal.aborted) this.ctx.logger.info('mindeck-account: keeping the stored session; Cloud check failed', error)
      return
    }
    if (bootstrap === 'sign-in-required') { await this.rejectToken(stored.token); return }
    if (JSON.stringify(bootstrap) === JSON.stringify(stored.bootstrap)) return
    await this.store({ ...stored, bootstrap })
    this.changed(true)
  }

  private async runAttempt(attempt: Attempt, cloudUrl: string, appVersion: string): Promise<void> {
    const { signal } = attempt.controller
    let issued: string | undefined
    try {
      const code = await this.request(signal, request => requestDeviceCode(cloudUrl, request))
      const expiresAt = Date.now() + code.expiresInMs
      const device: DeviceInfo = { name: hostname(), platform: process.platform, appVersion }
      // Before the code is shown, so the approval page that opens next can name this computer.
      try {
        if (!await this.request(signal, request => reportDeviceRequest(cloudUrl, code.deviceCode, device, request))) {
          this.ctx.logger.debug('mindeck-account: Mindeck Cloud did not store the sign-in device details')
        }
      } catch (error) {
        signal.throwIfAborted()
        // The details only help the member recognize the request; sign-in continues without them.
        this.ctx.logger.warn('mindeck-account: could not report the sign-in device details', error)
      }
      this.update(attempt, { phase: 'waiting', userCode: code.userCode, verificationUrl: code.verificationUrl, expiresAt })
      let interval = code.intervalMs
      while (issued === undefined) {
        await sleep(interval, undefined, { signal })
        if (Date.now() >= expiresAt) throw new MindeckCloudError('expired', 'the sign-in code expired')
        let poll: Awaited<ReturnType<typeof pollDeviceToken>>
        try { poll = await this.request(signal, request => pollDeviceToken(cloudUrl, code.deviceCode, request)) }
        catch (error) {
          // A lost connection while waiting is retried until the code expires; the panel says it is reconnecting.
          if (!(error instanceof MindeckCloudError && error.code === 'unreachable')) throw error
          if (attempt.view.retrying !== true) this.update(attempt, { phase: 'waiting', retrying: true })
          continue
        }
        if (attempt.view.retrying === true) this.update(attempt, { phase: 'waiting', retrying: false })
        switch (poll.status) {
          case 'pending': break
          case 'slow-down': interval += 5000; break
          case 'expired': throw new MindeckCloudError('expired', 'the sign-in code expired')
          case 'denied': throw new MindeckCloudError('denied', 'the sign-in request was denied')
          case 'issued': issued = poll.token; break
        }
      }
      const token = issued
      this.update(attempt, { phase: 'registering' })
      if (await this.request(signal, request => reportDevice(cloudUrl, token, device, request)) === 'sign-in-required') {
        throw new MindeckCloudError('protocol', 'the new session was rejected')
      }
      const bootstrap = await this.request(signal, request => readBootstrap(cloudUrl, token, request))
      if (bootstrap === 'sign-in-required') throw new MindeckCloudError('protocol', 'the new session was rejected')
      signal.throwIfAborted()
      try { await this.store({ version: 1, cloudUrl, token, bootstrap }) }
      catch (error) { throw new MindeckCloudError('storage', 'the session could not be stored', { cause: error }) }
      issued = undefined
      this.update(attempt, { phase: 'succeeded' }, true)
      this.track(this.readQuota(this.lifetime.signal))
      this.track(this.markWelcomed().catch((_error: unknown) => {
        // markWelcomed logged the failure; a later sign-out may show the welcome page again.
      }))
    } catch (error) {
      if (issued !== undefined) {
        // The session exists on Cloud but was not stored here; end it instead of leaving it orphaned.
        const token = issued
        this.track(this.request(this.lifetime.signal, request => signOutDevice(cloudUrl, token, request)).catch(() => undefined))
      }
      if (signal.aborted) { this.update(attempt, { phase: 'cancelled' }); return }
      const errorCode: MindeckAccountErrorCode = error instanceof MindeckCloudError ? error.code : 'protocol'
      this.ctx.logger.warn(`mindeck-account: sign-in failed (${errorCode})`, error)
      this.update(attempt, { phase: 'failed', errorCode })
    }
  }

  /** Send feedback with the stored session; the RemoteError says why it was not taken. */
  private async deliverFeedback(feedback: MindeckFeedback, signal: AbortSignal): Promise<void> {
    let stored: StoredSession | undefined
    try { stored = await this.load() }
    catch (error) { throw new RemoteError('mindeck-account/storage', 'the stored session could not be read', {}, { cause: error }) }
    if (stored === undefined) throw new RemoteError('mindeck-account/signed-out', 'sign in to send feedback', {})
    let outcome: 'ok' | 'sign-in-required'
    try { outcome = await this.request(signal, request => sendFeedback(stored.cloudUrl, stored.token, feedback, request)) }
    catch (error) { throw new RemoteError('mindeck-account/unreachable', 'Mindeck Cloud did not take the feedback', {}, { cause: error }) }
    if (outcome === 'sign-in-required') {
      await this.rejectToken(stored.token)
      throw new RemoteError('mindeck-account/signed-out', 'the session ended; sign in to send feedback', {})
    }
  }

  /** Send an answer rating or a `/feedback` remark from a Session log event; other events and failures are ignored. */
  private forwardFeedback(event: SessionEvent): void {
    const feedback = feedbackOf(event)
    if (feedback === undefined) return
    this.track(this.deliverFeedback(feedback, this.lifetime.signal).catch((error: unknown) => {
      if (!this.lifetime.signal.aborted) this.ctx.logger.info('mindeck-account: feedback did not reach Mindeck Cloud', error)
    }))
  }

  /** Run one Cloud request with the configured timeout, fused with `signal`. */
  private async request<T>(signal: AbortSignal, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    using limit = deadline(signal, this.config.requestTimeoutMs, 'MINDECK_CLOUD_TIMEOUT')
    try { return await run(limit.signal) }
    catch (error) {
      if (!signal.aborted && limit.signal.aborted) throw new MindeckCloudError('unreachable', 'Mindeck Cloud did not answer in time', { cause: error })
      throw error
    }
  }

  private update(attempt: Attempt, view: Partial<MindeckSignInAttempt>, accountChanged = false): void {
    const { userCode: _code, verificationUrl: _url, expiresAt: _expires, retrying: _retrying, ...kept } = attempt.view
    attempt.view = view.phase === 'waiting' ? { ...attempt.view, ...view } : { ...kept, ...view }
    this.changed(accountChanged)
  }

  private changed(accountChanged = false): void {
    for (const listener of this.listeners) listener()
    if (accountChanged) this.ctx.emit('mindeck-account/changed')
  }

  private track(task: Promise<void>): void {
    const tracked = task.catch((error: unknown) => { this.ctx.logger.warn('mindeck-account: background task failed', error) })
      .finally(() => { this.background.delete(tracked) })
    this.background.add(tracked)
  }
}
