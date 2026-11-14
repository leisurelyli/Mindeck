/** Mindeck Cloud HTTP endpoints used by desktop sign-in; every response is validated before use. */
import { z } from 'zod'
import type {
  MindeckAccountErrorCode, MindeckFeedback, MindeckQuota, MindeckQuotaRequest, MindeckSignOutReason, MindeckSyncAnswer,
} from './types.ts'

/** OAuth client id Mindeck Cloud accepts on its device authorization endpoints. */
export const DESKTOP_CLIENT_ID = 'mindeck-desktop'

/** A failed Mindeck Cloud call, classified for the Client's dictionary. */
export class MindeckCloudError extends Error {
  /** `x-request-id` of the Mindeck Cloud response that failed, for its server log; null without one. */
  requestId: string | null = null

  /**
   * @param code - user-facing failure class.
   * @param message - diagnostic text; never contains a token.
   * @param options - original failure.
   */
  constructor(readonly code: MindeckAccountErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'MindeckCloudError'
  }
}

const deviceCodeSchema = z.object({
  device_code: z.string().min(1),
  user_code: z.string().min(1),
  verification_uri_complete: z.url(),
  expires_in: z.number().positive(),
  interval: z.number().positive().optional(),
})

const tokenSchema = z.object({ access_token: z.string().min(16) })
const tokenErrorSchema = z.object({ error: z.string() })

const departmentSchema = z.object({ id: z.string(), name: z.string() }).nullable()

const bootstrapSchema = z.object({
  user: z.object({
    id: z.string().min(1),
    name: z.string(),
    email: z.string(),
    role: z.enum(['admin', 'user']),
    department: departmentSchema,
  }),
  company: z.object({
    name: z.string(),
    /** How members reach an administrator, such as a chat contact; null or absent when unset. */
    adminContact: z.string().nullable().optional(),
  }),
  device: z.object({ id: z.string().min(1) }),
  endpoints: z.object({
    console: z.url(),
    models: z.url(),
    skills: z.url(),
    anthropicBaseUrl: z.url(),
    openaiBaseUrl: z.url(),
    /** File library; `fullText` tells whether its search covers document contents, absent from an older Mindeck Cloud. */
    files: z.object({ url: z.url(), token: z.url(), fullText: z.boolean().optional() }).nullable().optional(),
    /** Company web search status; absent from a Mindeck Cloud without web search. */
    webSearch: z.url().optional(),
    /** The member's digital employees; absent from a Mindeck Cloud without them. */
    employees: z.url().optional(),
    /** Revisions and the inbox summary, polled every minute; absent from a Mindeck Cloud that predates it. */
    sync: z.url().optional(),
    /** The member's inbox; absent from a Mindeck Cloud that predates it. */
    inbox: z.url().optional(),
  }),
  /** Company decisions the desktop applies; absent from an older Mindeck Cloud, which allows nothing extra. */
  policies: z.object({
    /** Whether members may sign in to a personal DeepSeek account beside the company account. */
    personalDeepSeek: z.boolean(),
  }).optional(),
  /** The desktop version the company recommends and its installers; absent from a Mindeck Cloud that predates it. */
  client: z.object({
    recommendedVersion: z.string().nullable(),
    notes: z.string().nullable(),
    downloads: z.object({ windows: z.url().nullable(), macos: z.url().nullable() }),
  }).optional(),
})

/** Account, company, and service addresses returned to a signed-in desktop. */
export type MindeckBootstrap = z.infer<typeof bootstrapSchema>

const desktopErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string(), reason: z.string().optional() }) })

/** `error.reason` values of a 401 that name who ended the desktop session. */
const SIGN_OUT_REASONS: Readonly<Record<string, MindeckSignOutReason>> = {
  SIGNED_OUT_BY_ADMIN: 'admin',
  SIGNED_OUT_BY_MEMBER: 'member',
}

/**
 * Read who ended a desktop session from the `error.reason` of Mindeck Cloud's 401, in a desktop route's or the
 * gateway's error body.
 * @param reason - `error.reason` of the 401 body.
 * @returns who ended the session; null without a reason, and for a reason this desktop does not know, which reads as
 *   an expired session.
 */
export function signOutReasonOf(reason: string | undefined): MindeckSignOutReason | null {
  return reason === undefined || !Object.hasOwn(SIGN_OUT_REASONS, reason) ? null : SIGN_OUT_REASONS[reason] ?? null
}

/** Mindeck Cloud refused the desktop session token (HTTP 401). */
export class SignInRequired {
  /** @param reason - who ended the session, when Mindeck Cloud says; null for an expired or unknown session. */
  constructor(readonly reason: MindeckSignOutReason | null) {}
}

/** Device authorization started on Mindeck Cloud. */
export interface DeviceCode {
  readonly deviceCode: string
  readonly userCode: string
  readonly verificationUrl: string
  readonly expiresInMs: number
  readonly intervalMs: number
}

/** One poll of the device token endpoint. */
export type DeviceTokenPoll =
  | { readonly status: 'pending' }
  | { readonly status: 'slow-down' }
  | { readonly status: 'expired' }
  | { readonly status: 'denied' }
  | { readonly status: 'issued'; readonly token: string }

/** What a desktop reports about itself; shown to the member and administrators as the device. */
export interface DeviceInfo {
  readonly name: string
  readonly platform: string
  readonly appVersion: string
}

/**
 * Normalize an address typed by a person to the Mindeck Cloud origin.
 * @param input - address such as `cloud.example.com` or `https://cloud.example.com/`.
 * @returns origin without a trailing slash, or undefined when it is not an HTTP(S) address.
 */
export function normalizeCloudUrl(input: string): string | undefined {
  const text = input.trim()
  if (text.length === 0) return undefined
  let url: URL
  try { url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`) }
  catch { return undefined }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') return undefined
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

/** Most path segments of an address that {@link cloudUrlCandidates} tries below its origin. */
const MAX_CANDIDATE_SEGMENTS = 5

/**
 * List the addresses where a Mindeck Cloud may live for an address that may point at one of its pages, such as an
 * invitation link: the origin first, then each longer path prefix, so a Cloud served at the origin answers first.
 * @param cloudUrl - a normalized address.
 * @returns the origin and up to five path prefixes, shortest first.
 */
export function cloudUrlCandidates(cloudUrl: string): string[] {
  const url = new URL(cloudUrl)
  const segments = url.pathname.split('/').filter(segment => segment !== '').slice(0, MAX_CANDIDATE_SEGMENTS)
  return [url.origin, ...segments.map((_, index) => `${url.origin}/${segments.slice(0, index + 1).join('/')}`)]
}

async function send(url: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
  try {
    return await fetch(url, { ...init, redirect: 'error', signal })
  } catch (error) {
    if (signal.aborted) throw signal.reason
    throw new MindeckCloudError('unreachable', `no response from ${new URL(url).origin}`, { cause: error })
  }
}

async function json(response: Response): Promise<unknown> {
  try { return await response.json() }
  catch (error) { throw new MindeckCloudError('protocol', `HTTP ${response.status} without a JSON body`, { cause: error }) }
}

function parse<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new MindeckCloudError('protocol', `unexpected ${what} response`)
  return result.data
}

const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

const bearer = (token: string, init: RequestInit = {}): RequestInit => ({
  ...init,
  headers: { ...init.headers as Record<string, string>, authorization: `Bearer ${token}` },
})

/**
 * Check that an address serves Mindeck Cloud: its desktop API rejects an unauthenticated request with
 * the `SIGN_IN_REQUIRED` error body.
 * @param cloudUrl - normalized Mindeck Cloud origin.
 * @param signal - cancellation and timeout.
 * @throws MindeckCloudError `unreachable` or `not-mindeck-cloud`.
 */
export async function probeCloud(cloudUrl: string, signal: AbortSignal): Promise<void> {
  const response = await send(`${cloudUrl}/api/desktop/bootstrap`, {}, signal)
  const body: unknown = await response.json().catch(() => undefined)
  const parsed = desktopErrorSchema.safeParse(body)
  if (response.status !== 401 || !parsed.success || parsed.data.error.code !== 'SIGN_IN_REQUIRED') {
    throw new MindeckCloudError('not-mindeck-cloud', `${cloudUrl} is not a Mindeck Cloud (HTTP ${response.status})`)
  }
}

/**
 * Start device authorization.
 * @param cloudUrl - normalized Mindeck Cloud origin.
 * @param signal - cancellation and timeout.
 * @returns the codes to show and the polling schedule.
 */
export async function requestDeviceCode(cloudUrl: string, signal: AbortSignal): Promise<DeviceCode> {
  const response = await send(`${cloudUrl}/api/auth/device/code`, post({ client_id: DESKTOP_CLIENT_ID }), signal)
  if (response.status === 404) throw new MindeckCloudError('not-mindeck-cloud', 'device authorization is not available')
  if (!response.ok) throw new MindeckCloudError('protocol', `device code request failed with HTTP ${response.status}`)
  const body = parse(deviceCodeSchema, await json(response), 'device code')
  return {
    deviceCode: body.device_code,
    userCode: body.user_code,
    verificationUrl: body.verification_uri_complete,
    expiresInMs: body.expires_in * 1000,
    intervalMs: (body.interval ?? 5) * 1000,
  }
}

/**
 * Poll once for the session token of an approved device request.
 * @param cloudUrl - normalized Mindeck Cloud origin.
 * @param deviceCode - device code from {@link requestDeviceCode}.
 * @param signal - cancellation and timeout.
 * @returns pending, a request to poll more slowly, a terminal refusal, or the issued token.
 */
export async function pollDeviceToken(cloudUrl: string, deviceCode: string, signal: AbortSignal): Promise<DeviceTokenPoll> {
  const response = await send(`${cloudUrl}/api/auth/device/token`, post({
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    device_code: deviceCode,
    client_id: DESKTOP_CLIENT_ID,
  }), signal)
  const body = await json(response)
  if (response.ok) return { status: 'issued', token: parse(tokenSchema, body, 'device token').access_token }
  const error = parse(tokenErrorSchema, body, 'device token error').error
  switch (error) {
    case 'authorization_pending': return { status: 'pending' }
    case 'slow_down': return { status: 'slow-down' }
    case 'expired_token': return { status: 'expired' }
    case 'access_denied': return { status: 'denied' }
    default: throw new MindeckCloudError('protocol', `device token request failed: ${error}`)
  }
}

/**
 * Classify a desktop API refusal.
 * @param response - non-2xx desktop API response.
 * @returns the refusal of a token that is no longer valid, otherwise throws.
 * @throws MindeckCloudError `account-unavailable` or `protocol`.
 */
async function desktopFailure(response: Response): Promise<SignInRequired> {
  const parsed = desktopErrorSchema.safeParse(await response.json().catch(() => undefined))
  const code = parsed.success ? parsed.data.error.code : undefined
  if (response.status === 401) return new SignInRequired(signOutReasonOf(parsed.success ? parsed.data.error.reason : undefined))
  if (response.status === 403 && (code === 'ACCOUNT_DISABLED' || code === 'PASSWORD_CHANGE_REQUIRED')) {
    throw new MindeckCloudError('account-unavailable', `desktop API refused the account: ${code}`)
  }
  throw new MindeckCloudError('protocol', `desktop API failed with HTTP ${response.status}`)
}

/**
 * Tell Mindeck Cloud which computer holds a pending code, so its confirmation page can show it. The
 * device code is the only credential.
 * @param cloudUrl - normalized Mindeck Cloud origin.
 * @param deviceCode - secret device code from {@link requestDeviceCode}.
 * @param device - what to report.
 * @param signal - cancellation and timeout.
 * @returns whether Mindeck Cloud stored the report; a Cloud without this endpoint answers 404.
 */
export async function reportDeviceRequest(
  cloudUrl: string, deviceCode: string, device: DeviceInfo, signal: AbortSignal,
): Promise<boolean> {
  const response = await send(`${cloudUrl}/api/desktop/device-request`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceCode, name: device.name, platform: device.platform, appVersion: device.appVersion }),
  }, signal)
  await response.body?.cancel()
  return response.ok
}

/**
 * Report the desktop's name, platform, and version for the device list.
 * @param cloudUrl - normalized Mindeck Cloud origin.
 * @param token - desktop session token.
 * @param device - what to report.
 * @param signal - cancellation and timeout.
 * @returns the refusal of a token that is no longer valid.
 */
export async function reportDevice(
  cloudUrl: string, token: string, device: DeviceInfo, signal: AbortSignal,
): Promise<'ok' | SignInRequired> {
  const response = await send(`${cloudUrl}/api/desktop/device`, bearer(token, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: device.name, platform: device.platform, appVersion: device.appVersion }),
  }), signal)
  return response.ok ? 'ok' : await desktopFailure(response)
}

/**
 * Send one piece of feedback to Mindeck Cloud: a written report, or the category and note of an answer the
 * member rated down. An answer with `withdrawn` removes what was sent for the same `ref`.
 * @param cloudUrl - normalized Mindeck Cloud origin.
 * @param token - desktop session token.
 * @param feedback - what to send.
 * @param signal - cancellation and timeout.
 * @returns the refusal of a token that is no longer valid.
 * @throws MindeckCloudError `account-unavailable` or `protocol` when Mindeck Cloud refuses it.
 */
export async function sendFeedback(
  cloudUrl: string, token: string, feedback: MindeckFeedback, signal: AbortSignal,
): Promise<'ok' | SignInRequired> {
  const response = await send(`${cloudUrl}/api/desktop/feedback`, bearer(token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(feedback),
  }), signal)
  if (!response.ok) return await desktopFailure(response)
  await response.body?.cancel()
  return 'ok'
}

const quotaUsageSchema = z.object({ used: z.number(), limit: z.number().nullable() })

const quotaRequestSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
  month: z.string(),
  reason: z.string().nullable(),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
  decidedByName: z.string().nullable(),
  decision: z.string().nullable(),
  amount: z.number().nullable(),
  decisionNote: z.string().nullable(),
})

const quotaRequestStateSchema = z.object({
  request: quotaRequestSchema.nullable(),
  canRequest: z.boolean(),
  blocker: z.string().nullable(),
})

const quotaSchema = z.object({
  user: quotaUsageSchema.extend({ granted: z.number().nonnegative().optional() }),
  department: quotaUsageSchema.nullable(),
  // Mindeck Cloud releases before company budgets leave the field out.
  companyBudget: z.object({ usedPercent: z.number() }).nullable().optional(),
  resetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Mindeck Cloud releases before quota requests leave the field out.
  request: quotaRequestStateSchema.optional(),
})

/**
 * Read the member's month-to-date quota.
 * @param cloudUrl - normalized Mindeck Cloud origin.
 * @param token - desktop session token.
 * @param signal - cancellation and timeout.
 * @returns the quota, or the refusal of a token that is no longer valid.
 */
export async function readQuota(
  cloudUrl: string, token: string, signal: AbortSignal,
): Promise<MindeckQuota | SignInRequired> {
  const response = await send(`${cloudUrl}/api/desktop/quota`, bearer(token), signal)
  if (!response.ok) return await desktopFailure(response)
  const quota = parse(quotaSchema, await json(response), 'quota')
  const usage = ({ used, limit }: z.infer<typeof quotaUsageSchema>) => ({ used, limit })
  return {
    user: usage(quota.user),
    granted: quota.user.granted ?? 0,
    department: quota.department === null ? null : usage(quota.department),
    companyBudgetPercent: quota.companyBudget?.usedPercent ?? null,
    resetDate: quota.resetDate,
    request: quota.request ?? null,
  }
}

/** Outcome of asking for more quota or withdrawing the request. */
export type QuotaRequestOutcome =
  | { readonly status: 'ok'; readonly request: MindeckQuotaRequest }
  /** Mindeck Cloud refused it; `code` and `message` are its own. */
  | { readonly status: 'refused'; readonly code: string; readonly message: string }
  | { readonly status: 'sign-in-required'; readonly reason: MindeckSignOutReason | null }

const requestAnswerSchema = z.object({ request: quotaRequestSchema })

/**
 * Read the answer of a quota request route: the request, a refusal with Mindeck Cloud's explanation, or a token that
 * is no longer valid.
 * @param response - the answer.
 * @returns the outcome.
 * @throws MindeckCloudError `account-unavailable` or `protocol` for other failures, with the request id.
 */
async function quotaRequestOutcome(response: Response): Promise<QuotaRequestOutcome> {
  if (response.ok) return { status: 'ok', request: parse(requestAnswerSchema, await json(response), 'quota request').request }
  if (response.status === 400 || response.status === 404 || response.status === 409) {
    const parsed = desktopErrorSchema.safeParse(await response.json().catch(() => undefined))
    if (!parsed.success) throw withRequestId(new MindeckCloudError('protocol', `quota request failed with HTTP ${response.status}`), response)
    return { status: 'refused', code: parsed.data.error.code, message: parsed.data.error.message }
  }
  let refusal: SignInRequired
  try { refusal = await desktopFailure(response) }
  catch (error) { throw withRequestId(error, response) }
  return { status: 'sign-in-required', reason: refusal.reason }
}

/**
 * Ask the member's approvers for more quota this month.
 * @param cloudUrl - normalized Mindeck Cloud origin.
 * @param token - desktop session token.
 * @param reason - what the member wrote, at most 200 characters; null for nothing.
 * @param signal - cancellation and timeout.
 * @returns the new request, Mindeck Cloud's refusal, or that the token is no longer valid.
 */
export async function createQuotaRequest(
  cloudUrl: string, token: string, reason: string | null, signal: AbortSignal,
): Promise<QuotaRequestOutcome> {
  const response = await send(`${cloudUrl}/api/desktop/quota-requests`, bearer(token, post({ reason })), signal)
  return await quotaRequestOutcome(response)
}

/**
 * Withdraw the member's pending quota request.
 * @param cloudUrl - normalized Mindeck Cloud origin.
 * @param token - desktop session token.
 * @param signal - cancellation and timeout.
 * @returns the withdrawn request, Mindeck Cloud's refusal, or that the token is no longer valid.
 */
export async function cancelQuotaRequest(cloudUrl: string, token: string, signal: AbortSignal): Promise<QuotaRequestOutcome> {
  const response = await send(`${cloudUrl}/api/desktop/quota-requests/current`, bearer(token, { method: 'DELETE' }), signal)
  return await quotaRequestOutcome(response)
}

/**
 * Read the signed-in account and service addresses.
 * @param cloudUrl - normalized Mindeck Cloud origin.
 * @param token - desktop session token.
 * @param signal - cancellation and timeout.
 * @returns the bootstrap document, or the refusal of a token that is no longer valid.
 */
export async function readBootstrap(
  cloudUrl: string, token: string, signal: AbortSignal,
): Promise<MindeckBootstrap | SignInRequired> {
  const response = await send(`${cloudUrl}/api/desktop/bootstrap`, bearer(token), signal)
  if (!response.ok) return await desktopFailure(response)
  return parse(bootstrapSchema, await json(response), 'bootstrap')
}

/** Revision topics of the sync answer that this desktop acts on. */
const REVISION_TOPICS = ['models', 'skills', 'employees', 'webSearch', 'policies', 'announcements', 'client'] as const

const syncSchema = z.object({
  // Topics added by a newer Mindeck Cloud are ignored.
  revisions: z.record(z.string(), z.unknown()).transform(revisions => Object.fromEntries(REVISION_TOPICS.flatMap((topic) => {
    const value = revisions[topic]
    return typeof value === 'number' ? [[topic, value]] : []
  })) as MindeckSyncAnswer['revisions']),
  me: z.object({
    accessRevision: z.number(),
    inbox: z.object({ unread: z.number().int().nonnegative(), latestAt: z.string().nullable() }),
    quotaRequest: z.object({ id: z.string(), status: z.string(), month: z.string(), decidedAt: z.string().nullable() }).nullable(),
  }),
})

/** One poll of the sync endpoint. */
export type SyncPoll =
  | { readonly status: 'unchanged' }
  | { readonly status: 'changed'; readonly answer: MindeckSyncAnswer; readonly etag: string | null }
  | { readonly status: 'sign-in-required'; readonly reason: MindeckSignOutReason | null }

/**
 * Poll the sync endpoint once.
 * @param url - the bootstrap's `endpoints.sync`.
 * @param token - desktop session token.
 * @param etag - `ETag` of the previous changed answer for this session, sent as `If-None-Match`.
 * @param signal - cancellation and timeout.
 * @returns whether the answer changed since `etag`, or that the token is no longer valid and who ended its session.
 * @throws MindeckCloudError `unreachable` without a response, `account-unavailable` for a refused account, or
 *   `protocol` for another failure; its `requestId` names the request in the Mindeck Cloud log when known.
 */
export async function readSync(url: string, token: string, etag: string | null, signal: AbortSignal): Promise<SyncPoll> {
  const response = await send(url, bearer(token, etag === null ? {} : { headers: { 'if-none-match': etag } }), signal)
  if (response.status === 304) { await response.body?.cancel(); return { status: 'unchanged' } }
  if (!response.ok) {
    let refusal: SignInRequired
    try { refusal = await desktopFailure(response) }
    catch (error) { throw withRequestId(error, response) }
    return { status: 'sign-in-required', reason: refusal.reason }
  }
  const answer = parse(syncSchema, await json(response), 'sync')
  return { status: 'changed', answer, etag: response.headers.get('etag') }
}

/**
 * Attach the request id of a Mindeck Cloud response to its failure.
 * @param error - failure classified from the response.
 * @param response - the response that failed.
 * @returns the same failure, carrying the response's `x-request-id`.
 */
function withRequestId(error: unknown, response: Response): unknown {
  if (error instanceof MindeckCloudError) error.requestId = response.headers.get('x-request-id')
  return error
}

/**
 * End the desktop session on Mindeck Cloud. A token that is already invalid counts as signed out.
 * @param cloudUrl - normalized Mindeck Cloud origin.
 * @param token - desktop session token.
 * @param signal - cancellation and timeout.
 */
export async function signOutDevice(cloudUrl: string, token: string, signal: AbortSignal): Promise<void> {
  const response = await send(`${cloudUrl}/api/desktop/sign-out`, bearer(token, { method: 'POST' }), signal)
  if (!response.ok && response.status !== 401) {
    throw new MindeckCloudError('protocol', `sign-out failed with HTTP ${response.status}`)
  }
}
