/** Mindeck Cloud inbox endpoints of the desktop API; every response is validated before use. */
import { z } from 'zod'
import type { MindeckInboxItem, MindeckInboxReadTarget } from './types.ts'

/**
 * A failed inbox request. `unreachable`: no response; `invalid-cursor`: Mindeck Cloud no longer accepts the page
 * cursor, so the list starts again from its first page; `failed`: any other refusal or an unexpected answer.
 */
export class InboxRequestError extends Error {
  /**
   * @param reason - failure class.
   * @param message - diagnostic text; never contains a token.
   * @param requestId - `x-request-id` of the failed response; null without a response.
   * @param options - original failure.
   */
  constructor(
    readonly reason: 'unreachable' | 'invalid-cursor' | 'failed', message: string, readonly requestId: string | null,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'InboxRequestError'
  }
}

const itemSchema = z.object({
  type: z.enum(['notification', 'announcement']),
  id: z.string().min(1),
  kind: z.string(),
  // A level a newer Mindeck Cloud adds reads as an ordinary message.
  level: z.string().transform((level): MindeckInboxItem['level'] => level === 'important' ? 'important' : 'info'),
  title: z.string(),
  body: z.string().nullable(),
  // Only web addresses open in the system browser; anything else is dropped.
  link: z.url({ protocol: /^https?$/ }).nullable().catch(null),
  createdAt: z.string(),
  readAt: z.string().nullable(),
})

const listSchema = z.object({
  items: z.array(z.unknown()),
  nextCursor: z.string().nullable(),
  unread: z.number().int().nonnegative(),
})

const readSchema = z.object({ unread: z.number().int().nonnegative() })

const errorSchema = z.object({ error: z.object({ code: z.string(), requestId: z.string().optional() }) })

/** One page of the inbox. */
export interface InboxListing {
  /** Items newest first; items in a format this desktop does not know are left out. */
  readonly items: readonly MindeckInboxItem[]
  /** How many items were left out. */
  readonly skipped: number
  readonly nextCursor: string | null
  /** Unread items of the whole inbox. */
  readonly unread: number
}

async function send(url: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
  try { return await fetch(url, { ...init, redirect: 'error', signal }) }
  catch (error) {
    if (signal.aborted) throw signal.reason
    throw new InboxRequestError('unreachable', `no response from ${new URL(url).origin}`, null, { cause: error })
  }
}

/** Classify a refused inbox request; 401 means the session ended. */
async function refusal(response: Response): Promise<'sign-in-required'> {
  if (response.status === 401) { await response.body?.cancel(); return 'sign-in-required' }
  const parsed = errorSchema.safeParse(await response.json().catch(() => undefined))
  const requestId = response.headers.get('x-request-id') ?? (parsed.success ? parsed.data.error.requestId ?? null : null)
  const reason = response.status === 400 && parsed.success && parsed.data.error.code === 'INVALID_REQUEST' ? 'invalid-cursor' : 'failed'
  throw new InboxRequestError(reason, `inbox request failed with HTTP ${response.status}`, requestId)
}

async function readAnswer<T>(response: Response, schema: z.ZodType<T>, what: string): Promise<T> {
  const parsed = schema.safeParse(await response.json().catch(() => undefined))
  if (!parsed.success) throw new InboxRequestError('failed', `unexpected ${what} response`, response.headers.get('x-request-id'))
  return parsed.data
}

/**
 * Read one page of the member's inbox.
 * @param url - the bootstrap's `endpoints.inbox`.
 * @param token - desktop session token.
 * @param page - page size and the cursor of the previous page; a null cursor reads the newest items.
 * @param signal - cancellation and timeout.
 * @returns the page, or `sign-in-required` when the token is no longer valid.
 * @throws InboxRequestError when Mindeck Cloud cannot be reached or refuses the request.
 */
export async function listInbox(
  url: string, token: string, page: { readonly limit: number; readonly cursor: string | null }, signal: AbortSignal,
): Promise<InboxListing | 'sign-in-required'> {
  const address = new URL(url)
  address.searchParams.set('limit', String(page.limit))
  if (page.cursor !== null) address.searchParams.set('cursor', page.cursor)
  const response = await send(address.href, { headers: { authorization: `Bearer ${token}` } }, signal)
  if (!response.ok) return await refusal(response)
  const listing = await readAnswer(response, listSchema, 'inbox')
  const items: MindeckInboxItem[] = []
  for (const value of listing.items) {
    const item = itemSchema.safeParse(value)
    if (item.success) items.push(item.data)
  }
  return { items, skipped: listing.items.length - items.length, nextCursor: listing.nextCursor, unread: listing.unread }
}

/**
 * Mark inbox items read; Mindeck Cloud ignores ids that are unknown, already read, or another member's.
 * @param url - the bootstrap's `endpoints.inbox`.
 * @param token - desktop session token.
 * @param target - every unread item, or up to 100 listed ones.
 * @param signal - cancellation and timeout.
 * @returns the unread count after marking, or `sign-in-required` when the token is no longer valid.
 * @throws InboxRequestError when Mindeck Cloud cannot be reached or refuses the request.
 */
export async function markInboxRead(
  url: string, token: string, target: MindeckInboxReadTarget, signal: AbortSignal,
): Promise<{ readonly unread: number } | 'sign-in-required'> {
  const payload = 'all' in target ? { all: true } : { items: target.items.map(({ type, id }) => ({ type, id })) }
  const response = await send(`${url}/read`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(payload),
  }, signal)
  if (!response.ok) return await refusal(response)
  return await readAnswer(response, readSchema, 'inbox read')
}
