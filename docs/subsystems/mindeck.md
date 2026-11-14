# Mindeck Enterprise

English | [中文](mindeck.zh.md)

The [Mindeck package group](../../packages/mindeck/README.md) connects Mindeck Desktop to a company's Mindeck Cloud. Members sign in with a company account; the models, web search, skills, file library, and digital employees come from that Cloud, and every company model request and search goes through its metered gateway. The [Mindeck application bundle](../../packages/bundle/mindeck-app/README.md) composes these plugins beside the DeepSeek account rows (`deepseek-account`, `llm-deepseek-account`, `account-controller`, `ui-settings-account`, `web-deepseek-api`, and `web-search-deepseek`), which stay enabled as a personal sign-in. A member may use it only while the company allows it through the bootstrap's `policies.personalDeepSeek`, which mindeck-account's client enforces. The bundle still disables `llm-deepseek` (the personal API-key route), `llm-pi-ai`, and `ui-settings-models`.

## Ownership

| Owner | Responsibility |
|---|---|
| [mindeck-account](../../packages/mindeck/mindeck-account/README.md) | `ctx.mindeckAccount`: the Cloud address, device sign-in, the stored Cloud session, the full-screen sign-in, and Settings → Account; the Client's `ctx.mindeckComposer`, through which the Mindeck pages open conversations |
| [mindeck-models](../../packages/mindeck/mindeck-models/README.md) | The member's company models as model routes through the Cloud gateway, with quota and sign-in failures, and the `mindeck-search` web search provider, which searches through the gateway's `/gateway/v1/tools/search` only while the company has turned search on |
| [mindeck-skills](../../packages/mindeck/mindeck-skills/README.md) | The member's company skills, cached on the device and served by a skill provider while signed in, and the Skills page |
| [mindeck-files](../../packages/mindeck/mindeck-files/README.md) | `ctx.mindeckFiles`: the file-library tools, the right-sidebar panel, the File library page, and `library:` references in messages |
| [mindeck-employees](../../packages/mindeck/mindeck-employees/README.md) | `ctx.mindeckEmployees`: the general assistant and the company's digital employees as agent presets with their own persona, the Digital employees page, and the employee of a live conversation |
| [mindeck-inbox](../../packages/mindeck/mindeck-inbox/README.md) | `ctx.mindeckInbox`: the member's company messages, the unread count beside their sidebar row, read marks, and the recommended desktop version |

## Account session

`ctx.mindeckAccount.session()` returns the signed-in member's Cloud URL, access token, and bootstrap data, or `undefined` when signed out. Consumers read it for each Cloud request and call `rejectToken(token)` when Cloud rejects that token; the service ends the stored session only while it still holds that token, so a newer sign-in survives a late rejection. `mindeck-account/changed` announces every sign-in, sign-out, and rejected token, and consumers refresh from `session()` instead of reading the event payload.

While signed in to a Mindeck Cloud with a sync endpoint, the account polls it every minute and emits `mindeck-account/revised` with the [topics](../../packages/mindeck/mindeck-account/README.md#use-this-package) whose data changed; each consumer reads again what its topics cover and keeps its own ten-minute refresh as a fallback, which is all a Mindeck Cloud without the endpoint gets. Consumers do not run their own sync timers; `requestSync()` asks the account for a sync, `syncAnswer()` returns the latest answer, and `mindeck-account/synced` follows every answer, so requests that failed offline can be retried.

## Sign-in and the Account page

mindeck-account draws its pages with Factories that [ui-settings-account](../../packages/client/ui-settings-account/README.md#pages-for-other-accounts) registers: the full-screen sign-in on the first-run page `desktop.onboarding.page`, with the Mindeck artwork from ui-brand-mindeck, and Settings → Account on the `settings.account.*` account page parts, so both match the DeepSeek account pages. Settings lists the company account first and renames the DeepSeek account page to **DeepSeek account**.

## Digital employees

`ctx.mindeckEmployees` registers `mindeck-general` and one `mindeck-employee-<Cloud id>` agent preset per digital employee, each the base preset's plugin rows with its own persona; the bundle makes `mindeck-general` the default. Employees that leave the Cloud listing stay registered as retired and unlisted (`listed: false`), so new conversations cannot choose them while their conversations resume under their name. `employeeForSession(sessionId)` returns the Cloud id of a live conversation's employee; mindeck-models sends it as `x-mindeck-employee` on gateway model requests and company searches, so Mindeck Cloud can attribute their usage.

## Sidebar pages

While the member has Mindeck access, the left sidebar lists **数字员工**, **技能**, **资源库**, and **企业消息** above Plugins, at `sidebar.panellist` orders -30, -20, -10, and -5, each opening a page in the root `main` slot; the employee row appears only while the company offers an employee, and the company messages row, with its unread count in `sidebar.panellist.badge`, only while the member's Mindeck Cloud has an inbox. Each page starts a conversation through `ctx.mindeckComposer`: a blank conversation in the current Workspace, as New Session opens it, under the chosen employee's preset or else the Host's default preset, with a starter request, `/name `, or a `library:` reference put in its draft before it shows. The message box takes focus and nothing is sent. The right sidebar keeps the file library panel; skills have no right-sidebar page.

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
 * Sync with Mindeck Cloud now and refresh every company list on this computer, as the member asks on the Account
 * page. A Mindeck Cloud without the sync endpoint has its bootstrap read again instead.
 * @returns state after the sync; its `sync.problem` tells whether Mindeck Cloud answered.
 */
@Remote async syncNow(): Promise<MindeckAccountView>

/**
 * Sync soon after the window regained focus or the network came back, unless a sync succeeded within the
 * configured cool-down.
 */
@Remote syncSoon(): Promise<void>

/**
 * Ask for a sync from another Host plugin, such as after Mindeck Cloud refused a request in a way a company change
 * may explain. Prompted syncs within the cool-down after a successful one are skipped.
 * @param reason - `prompt` for such an event; `timer` for a scheduled sync.
 */
requestSync(reason: 'prompt' | 'timer' = 'prompt'): void

/**
 * Read the latest sync answer of the signed-in session, such as for the inbox summary.
 * @returns the answer, or undefined while signed out, before the first answer, or on a Mindeck Cloud without sync.
 */
syncAnswer(): MindeckSyncAnswer | undefined

/**
 * Read the month-to-date quota from Mindeck Cloud now, as after a refused request or when the account
 * menu opens, and prompt a sync, since a decided quota request or a changed policy may explain the refusal. A
 * failed read keeps the previous quota; a rejected token ends the session.
 * @param signal - caller cancellation.
 * @returns state with the latest quota.
 */
@Remote async refreshQuota(signal: AbortSignal): Promise<MindeckAccountView>

/**
 * Send a written report to the company's Mindeck Cloud.
 * @param text - what the member wrote; blank or longer than 2000 characters is refused.
 * @param signal - caller cancellation.
 * @throws RemoteError `mindeck-account/invalid-feedback` for blank or overlong text, `mindeck-account/signed-out`
 * without a usable session, or `mindeck-account/unreachable` when Mindeck Cloud does not take it.
 */
@Remote async sendFeedback(text: string, signal: AbortSignal): Promise<void>

/**
 * Say whether the next rating of an answer attaches its round's question and answer, as the feedback dialog's choice
 * reads when the member submits; the dialog awaits this before the rating is recorded.
 * @param sessionId - the conversation.
 * @param messageId - the rated answer.
 * @param attach - whether the member ticked the choice.
 */
@Remote prepareFeedback(sessionId: string, messageId: string, attach: boolean): Promise<void>

/**
 * Ask the member's approvers for more quota this month, as the quota notice offers once the personal limit is used
 * up. The quota is read again afterwards, refused or not, since another device may have asked meanwhile.
 * @param reason - what the member wrote; blank sends none. Mindeck Cloud refuses more than 200 characters.
 * @param signal - caller cancellation.
 * @returns state whose quota carries the new request.
 * @throws RemoteError `mindeck-account/quota-request-refused` with Mindeck Cloud's code and explanation,
 *   `mindeck-account/signed-out` without a usable session, or `mindeck-account/unreachable` when Mindeck Cloud does
 *   not take it.
 */
@Remote async requestQuota(reason: string, signal: AbortSignal): Promise<MindeckAccountView>

/**
 * Withdraw the member's pending quota request. The quota is read again afterwards, refused or not.
 * @param signal - caller cancellation.
 * @returns state whose quota carries the withdrawn request.
 * @throws RemoteError `mindeck-account/quota-request-refused` when the request was already decided
 *   (`QUOTA_REQUEST_DECIDED`) or none exists (`NOT_FOUND`), `mindeck-account/signed-out` without a usable session, or
 *   `mindeck-account/unreachable` when Mindeck Cloud does not take it.
 */
@Remote async withdrawQuotaRequest(signal: AbortSignal): Promise<MindeckAccountView>

/**
 * Stream account state.
 * @param signal - stream lifetime; ending it never cancels a sign-in.
 * @returns the current state, then every change.
 */
@Remote({ mode: 'stream' }) async *watch(signal: AbortSignal): AsyncIterable<MindeckAccountView>

/**
 * Set the Mindeck Cloud address after checking that it answers as one. Only while signed out. An address with a
 * page path, such as an invitation link, resolves to the shortest path prefix that answers as a Mindeck Cloud.
 * @param input - address typed or pasted by the member; a missing scheme means HTTPS.
 * @param signal - caller cancellation.
 * @returns state with the resolved address.
 */
@Remote async setCloudUrl(input: string, signal: AbortSignal): Promise<MindeckAccountView>

/**
 * Record that this device showed the welcome page, so it does not appear again.
 * @returns the state with `welcomed` set.
 * @throws RemoteError `mindeck-account/settings` when the profile settings could not be written.
 */
@Remote async finishWelcome(): Promise<MindeckAccountView>

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
 * when it still holds that token, so a newer sign-in survives a late rejection. The sign-in page then says who
 * ended the session; without `reason`, the account asks Mindeck Cloud once more with the rejected token.
 * @param token - the token the rejected request carried.
 * @param reason - who ended the session, from the 401's `error.reason` (see `signOutReasonOf`); null when the 401
 *   gave none, undefined when the caller did not read its body.
 */
async rejectToken(token: string, reason?: MindeckSignOutReason | null): Promise<void>
```

Source: [`packages/mindeck/mindeck-account/src/index.ts`](../../packages/mindeck/mindeck-account/src/index.ts)

<a id="ctxmindeckemployees--mindeckemployees"></a>

### `ctx.mindeckEmployees` — `MindeckEmployees`

Registers the general assistant and the member's digital employees as agent presets and lists them for the digital-employee page.

```ts cordis-catalog
/**
 * Read which digital employee a live conversation talks to.
 * @param sessionId - the conversation's Session.
 * @returns the Mindeck Cloud employee id of the Session's preset, or undefined for the general assistant, another
 *   preset, or a Session without a live Agent.
 */
employeeForSession(sessionId: SessionId): string | undefined

/**
 * Read the library folders that a live conversation's digital employee consults.
 * @param sessionId - the conversation's Session.
 * @returns the employee's folders, empty when it has none; undefined for the general assistant, another preset, or
 *   a Session without a live Agent.
 */
foldersForSession(sessionId: SessionId): readonly EmployeeLibraryFolder[] | undefined

/**
 * Stream the cards of the digital-employee page.
 * @param signal - stream lifetime.
 * @returns the current cards, then every change.
 */
@Remote({ mode: 'stream' }) async *watch(signal: AbortSignal): AsyncIterable<MindeckEmployeeCatalog>
```

Types: [SessionId](core.md)

Source: [`packages/mindeck/mindeck-employees/src/index.ts`](../../packages/mindeck/mindeck-employees/src/index.ts)

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
 * Search the member's spaces; a query without searchable text returns no entries.
 * @param query - search text.
 * @param scope - `names` for file and folder names; `text` also for document text where the library indexes it.
 * @param signal - caller cancellation.
 * @returns matching files and folders, at most `maxSearchResults`, a text match with its passage, and whether the
 *   search looked at document text.
 */
@Remote async search(query: string, scope: LibrarySearchScope, signal: AbortSignal): Promise<LibrarySearchView>

/**
 * Save a file from the member's computer into a library folder.
 * @param folder - library path of a space or folder.
 * @param name - file name without folders.
 * @param contentBase64 - file content in base64, at most `maxUploadBytes` once decoded.
 * @param overwrite - replace a file of the same name; the library keeps the replaced content as a version.
 * @param signal - caller cancellation.
 * @returns the saved file.
 */
@Remote async upload(folder: string, name: string, contentBase64: string, overwrite: boolean, signal: AbortSignal): Promise<LibraryEntryView>
```

Source: [`packages/mindeck/mindeck-files/src/index.ts`](../../packages/mindeck/mindeck-files/src/index.ts)

<a id="ctxmindeckinbox--mindeckinbox"></a>

### `ctx.mindeckInbox` — `MindeckInbox`

Unread count, inbox items, and read reports of the signed-in member's company messages.

```ts cordis-catalog
/**
 * Stream the unread count and the recommended version for the sidebar row and the page header.
 * @param signal - stream lifetime.
 * @returns the current summary, then every change.
 */
@Remote({ mode: 'stream' }) async *watch(signal: AbortSignal): AsyncIterable<MindeckInboxSummary>

/**
 * Stream the inbox items while the company messages page is open. Opening it reads the newest items; while it is
 * open, a sync that reports new or read items or changed announcements reads them again.
 * @param signal - the page's lifetime.
 * @returns the loaded items, then every change.
 */
@Remote({ mode: 'stream' }) async *items(signal: AbortSignal): AsyncIterable<MindeckInboxPage>

/** Read the newest items again, as after a failed read; the page stream carries the result. */
@Remote async reload(): Promise<void>

/** Read the next older page, unless a read is running or no older items remain; the page stream carries the result. */
@Remote async loadMore(): Promise<void>

/**
 * Mark items read, as when the member opens one or marks everything read. The items show as read at once; a report
 * that does not reach Mindeck Cloud is sent again after the next sync.
 * @param target - every unread item, or up to 100 listed ones.
 */
@Remote async markRead(target: MindeckInboxReadTarget): Promise<void>
```

Source: [`packages/mindeck/mindeck-inbox/src/index.ts`](../../packages/mindeck/mindeck-inbox/src/index.ts)

<a id="ctxmindeckskills--mindeckskills"></a>

### `ctx.mindeckSkills` — `MindeckSkills`

Keeps the member's company skills in the local cache, serves them while signed in, and lists them and their instructions for the skills page.

```ts cordis-catalog
/**
 * Stream the company skills the signed-in member has on this computer.
 * @param signal - stream lifetime.
 * @returns the current listing, then every change.
 */
@Remote({ mode: 'stream' }) async *watch(signal: AbortSignal): AsyncIterable<MindeckSkillCatalog>

/**
 * Read the instructions of a company skill the member has on this computer, as the agent receives them.
 * @param name - skill name from the listing.
 * @param signal - caller cancellation.
 * @returns the SKILL.md body without its front matter.
 * @throws RemoteError `mindeck-skills/not-found` when the listing has no such skill, its cached copy is gone, or
 * another provider's skill of that name takes precedence.
 */
@Remote async instructions(name: string, signal: AbortSignal): Promise<string>
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

<a id="mindeck-accountemployee--bail"></a>

#### `mindeck-account/employee` — bail

Name the Mindeck Cloud digital employee a conversation talks to, for the context of feedback on its answers.

```ts cordis-catalog
/**
 * Name the Mindeck Cloud digital employee a conversation talks to, for the context of feedback on its answers.
 * @param sessionId - the conversation's Session.
 * @returns the employee's Mindeck Cloud id, or undefined when the listener does not know one.
 * @mode bail
 */
'mindeck-account/employee'(sessionId: SessionId): string | undefined
```

Types: [SessionId](core.md)

Source: [`packages/mindeck/mindeck-account/src/index.ts`](../../packages/mindeck/mindeck-account/src/index.ts)

<a id="mindeck-accountrevised--emit"></a>

#### `mindeck-account/revised` — emit

A sync with Mindeck Cloud found company or member data that changed, or the member asked to sync, which names every topic. Each plugin reads again what its topics cover; the account has already stored a changed bootstrap.

```ts cordis-catalog
/**
 * A sync with Mindeck Cloud found company or member data that changed, or the member asked to sync, which names
 * every topic. Each plugin reads again what its topics cover; the account has already stored a changed bootstrap.
 * @param topics - what changed.
 * @mode emit
 */
'mindeck-account/revised'(topics: ReadonlySet<MindeckSyncTopic>): void
```

Source: [`packages/mindeck/mindeck-account/src/index.ts`](../../packages/mindeck/mindeck-account/src/index.ts)

<a id="mindeck-accountsynced--emit"></a>

#### `mindeck-account/synced` — emit

Mindeck Cloud answered a sync, whether or not anything changed, after any `mindeck-account/revised` of the same answer. Plugins with requests that failed for lack of a connection, such as unconfirmed read reports, retry them.

```ts cordis-catalog
/**
 * Mindeck Cloud answered a sync, whether or not anything changed, after any `mindeck-account/revised` of the same
 * answer. Plugins with requests that failed for lack of a connection, such as unconfirmed read reports, retry them.
 * @mode emit
 */
'mindeck-account/synced'(): void
```

Source: [`packages/mindeck/mindeck-account/src/index.ts`](../../packages/mindeck/mindeck-account/src/index.ts)
<!-- END GENERATED cordis-surface -->
