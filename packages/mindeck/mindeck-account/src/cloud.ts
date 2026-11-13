/** Mindeck Cloud HTTP endpoints used by desktop sign-in; every response is validated before use. */
import { z } from 'zod'
import type { MindeckAccountErrorCode, MindeckFeedback, MindeckQuota } from './types.ts'

/** OAuth client id Mindeck Cloud accepts on its device authorization endpoints. */
export const DESKTOP_CLIENT_ID = 'mindeck-desktop'

/** A failed Mindeck Cloud call, classified for the Client's dictionary. */
export class MindeckCloudError extends Error {
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
    files: z.object({ url: z.url(), token: z.url() }).nullable().optional(),
    /** Company web search status; absent from a Mindeck Cloud without web search. */
    webSearch: z.url().optional(),
    /** The member's digital employees; absent from a Mindeck Cloud without them. */
    employees: z.url().optional(),
  }),
  /** Company decisions the desktop applies; absent from an older Mindeck Cloud, which allows nothing extra. */
  policies: z.object({
    /** Whether members may sign in to a personal DeepSeek account beside the company account. */
    personalDeepSeek: z.boolean(),
  }).optional(),
})

/** Account, company, and service addresses returned to a signed-in desktop. */
export type MindeckBootstrap = z.infer<typeof bootstrapSchema>

const desktopErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) })

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
 * @returns `sign-in-required` when the token is no longer valid, otherwise throws.
 * @throws MindeckCloudError `account-unavailable` or `protocol`.
 */
async function desktopFailure(response: Response): Promise<'sign-in-required'> {
  const parsed = desktopErrorSchema.safeParse(await response.json().catch(() => undefined))
  const code = parsed.success ? parsed.data.error.code : undefined
  if (response.status === 401) return 'sign-in-required'
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
 * @returns `sign-in-required` when the token is no longer valid.
 */
export async function reportDevice(
  cloudUrl: string, token: string, device: DeviceInfo, signal: AbortSignal,
): Promise<'ok' | 'sign-in-required'> {
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
 * @returns `sign-in-required` when the token is no longer valid.
 * @throws MindeckCloudError `account-unavailable` or `protocol` when Mindeck Cloud refuses it.
 */
export async function sendFeedback(
  cloudUrl: string, token: string, feedback: MindeckFeedback, signal: AbortSignal,
): Promise<'ok' | 'sign-in-required'> {
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
const quotaSchema = z.object({
  user: quotaUsageSchema,
  department: quotaUsageSchema.nullable(),
  // Mindeck Cloud releases before company budgets leave the field out.
  companyBudget: z.object({ usedPercent: z.number() }).nullable().optional(),
  resetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

/**
 * Read the member's month-to-date quota.
 * @param cloudUrl - normalized Mindeck Cloud origin.
 * @param token - desktop session token.
 * @param signal - cancellation and timeout.
 * @returns the quota, or `sign-in-required` when the token is no longer valid.
 */
export async function readQuota(
  cloudUrl: string, token: string, signal: AbortSignal,
): Promise<MindeckQuota | 'sign-in-required'> {
  const response = await send(`${cloudUrl}/api/desktop/quota`, bearer(token), signal)
  if (!response.ok) return await desktopFailure(response)
  const quota = parse(quotaSchema, await json(response), 'quota')
  const usage = ({ used, limit }: z.infer<typeof quotaUsageSchema>) => ({ used, limit })
  return {
    user: usage(quota.user),
    department: quota.department === null ? null : usage(quota.department),
    companyBudgetPercent: quota.companyBudget?.usedPercent ?? null,
    resetDate: quota.resetDate,
  }
}

/**
 * Read the signed-in account and service addresses.
 * @param cloudUrl - normalized Mindeck Cloud origin.
 * @param token - desktop session token.
 * @param signal - cancellation and timeout.
 * @returns the bootstrap document, or `sign-in-required` when the token is no longer valid.
 */
export async function readBootstrap(
  cloudUrl: string, token: string, signal: AbortSignal,
): Promise<MindeckBootstrap | 'sign-in-required'> {
  const response = await send(`${cloudUrl}/api/desktop/bootstrap`, bearer(token), signal)
  if (!response.ok) return await desktopFailure(response)
  return parse(bootstrapSchema, await json(response), 'bootstrap')
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
