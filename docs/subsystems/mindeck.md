# Mindeck Enterprise

English | [中文](mindeck.zh.md)

The [Mindeck package group](../../packages/mindeck/README.md) connects Mindeck Desktop to a company's Mindeck Cloud. Members sign in with a company account; the models, skills, and file library come from that Cloud, and every model request goes through its metered gateway. The [Mindeck application bundle](../../packages/bundle/mindeck-app/README.md) composes these plugins in place of the DeepSeek account, its model providers, and the personal model settings.

## Ownership

| Owner | Responsibility |
|---|---|
| [mindeck-account](../../packages/mindeck/mindeck-account/README.md) | `ctx.mindeckAccount`: the Cloud address, device sign-in, the stored Cloud session, and the sign-in gate |
| [mindeck-models](../../packages/mindeck/mindeck-models/README.md) | The member's company models as model routes through the Cloud gateway, with quota and sign-in failures |
| [mindeck-skills](../../packages/mindeck/mindeck-skills/README.md) | The member's company skills, cached on the device and served by a skill provider while signed in |
| [mindeck-files](../../packages/mindeck/mindeck-files/README.md) | `ctx.mindeckFiles`: the file-library tools, the sidebar page, and `library:` references in messages |

## Account session

`ctx.mindeckAccount.session()` returns the signed-in member's Cloud URL, access token, and bootstrap data, or `undefined` when signed out. Consumers read it for each Cloud request and call `rejectToken(token)` when Cloud rejects that token; the service ends the stored session only while it still holds that token, so a newer sign-in survives a late rejection. `mindeck-account/changed` announces every sign-in, sign-out, and rejected token, and consumers refresh from `session()` instead of reading the event payload.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxmindeckaccount--mindeckaccount"></a>

### `ctx.mindeckAccount` — `MindeckAccount`

Mindeck Cloud account service and its Remote namespace.

```ts cordis-catalog
/**
 * Read the account state.
 * @returns configured address, signed-in member, and the latest sign-in attempt; never the token.
 */
@Remote async getState(): Promise<MindeckAccountView>

/**
 * Read the month-to-date quota from Mindeck Cloud now, as after a refused request or when the account
 * menu opens. A failed read keeps the previous quota; a rejected token ends the session.
 * @param signal - caller cancellation.
 * @returns state with the latest quota.
 */
@Remote async refreshQuota(signal: AbortSignal): Promise<MindeckAccountView>

/**
 * Stream account state.
 * @param signal - stream lifetime; ending it never cancels a sign-in.
 * @returns the current state, then every change.
 */
@Remote({ mode: 'stream' }) async *watch(signal: AbortSignal): AsyncIterable<MindeckAccountView>

/**
 * Set the Mindeck Cloud address after checking that it answers as one. Only while signed out.
 * @param input - address typed by the member; a missing scheme means HTTPS.
 * @param signal - caller cancellation.
 * @returns state with the new address.
 */
@Remote async setCloudUrl(input: string, signal: AbortSignal): Promise<MindeckAccountView>

/**
 * Join the running sign-in or start device authorization. The Client opens the returned
 * `verificationUrl` in a browser; the attempt finishes after the member approves it there.
 * @param appVersion - version of the requesting app, reported with the device.
 * @returns state with the attempt, without waiting for approval.
 */
@Remote async startSignIn(appVersion: string): Promise<MindeckAccountView>

/**
 * Cancel the named attempt and wait for it to stop.
 * @param id - attempt identity from {@link getState}.
 * @returns state after the attempt ended.
 */
@Remote async cancelSignIn(id: MindeckSignInAttemptId): Promise<MindeckAccountView>

/**
 * Sign this desktop out: remove the stored session, then end it on Mindeck Cloud in the background.
 * @returns the signed-out state.
 */
@Remote async signOut(): Promise<MindeckAccountView>

/**
 * Read the signed-in session for a Host consumer such as the model routes.
 * @returns the session with its token, or undefined while signed out.
 */
async session(): Promise<MindeckSession | undefined>

/**
 * Report that Mindeck Cloud rejected a session token (HTTP 401). The stored session is removed only
 * when it still holds that token, so a newer sign-in survives a late rejection.
 * @param token - the token the rejected request carried.
 */
async rejectToken(token: string): Promise<void>
```

Source: [`packages/mindeck/mindeck-account/src/index.ts`](../../packages/mindeck/mindeck-account/src/index.ts)

<a id="ctxmindeckfiles--mindeckfiles"></a>

### `ctx.mindeckFiles` — `MindeckFiles`

File-library tools and the panel's Remote for the signed-in member.

```ts cordis-catalog
/**
 * Read the current availability after refreshing it from the account and Mindeck Cloud.
 * @returns whether the member can use the file library now.
 */
@Remote async getAvailability(): Promise<LibraryAvailability>

/**
 * Stream availability.
 * @param signal - stream lifetime.
 * @returns the current availability, then every change.
 */
@Remote({ mode: 'stream' }) async *watch(signal: AbortSignal): AsyncIterable<LibraryAvailability>

/**
 * List the spaces the member can open.
 * @param signal - caller cancellation.
 * @returns the member's spaces, personal first.
 */
@Remote async spaces(signal: AbortSignal): Promise<LibrarySpaceView[]>

/**
 * List one space or folder.
 * @param path - library path of a space or folder.
 * @param signal - caller cancellation.
 * @returns the folder's entries, folders first.
 */
@Remote async list(path: string, signal: AbortSignal): Promise<LibraryEntryView[]>

/**
 * Search file and folder names across the member's spaces; a blank query returns no entries.
 * @param query - text contained in names.
 * @param signal - caller cancellation.
 * @returns matching files and folders, at most `maxSearchResults`.
 */
@Remote async search(query: string, signal: AbortSignal): Promise<LibraryEntryView[]>
```

Source: [`packages/mindeck/mindeck-files/src/index.ts`](../../packages/mindeck/mindeck-files/src/index.ts)

<a id="ctxmindeckskills--mindeckskills"></a>

### `ctx.mindeckSkills` — `MindeckSkills`

Keeps the member's company skills in the local cache, serves them while signed in, and lists them for the skills page.

```ts cordis-catalog
/**
 * Stream the company skills the signed-in member has on this computer.
 * @param signal - stream lifetime.
 * @returns the current listing, then every change.
 */
@Remote({ mode: 'stream' }) async *watch(signal: AbortSignal): AsyncIterable<MindeckSkillCatalog>
```

Source: [`packages/mindeck/mindeck-skills/src/index.ts`](../../packages/mindeck/mindeck-skills/src/index.ts)

<a id="mindeck-account-events"></a>

### `mindeck-account/*` events

<a id="mindeck-accountchanged--emit"></a>

#### `mindeck-account/changed` — emit

The stored session started, ended, or its cached account details changed. Consumers re-read MindeckAccount.session.

```ts cordis-catalog
/**
 * The stored session started, ended, or its cached account details changed. Consumers re-read
 * {@link MindeckAccount.session}.
 * @mode emit
 */
'mindeck-account/changed'(): void
```

Source: [`packages/mindeck/mindeck-account/src/index.ts`](../../packages/mindeck/mindeck-account/src/index.ts)
<!-- END GENERATED cordis-surface -->
