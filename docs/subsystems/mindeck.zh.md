# Mindeck 企业版

[English](mindeck.md) | 中文

[Mindeck 包组](../../packages/mindeck/README.zh.md)把 Mindeck Desktop 连接到企业的 Mindeck Cloud。成员用企业账号登录；模型、联网搜索、技能、资源库和数字员工都来自该 Cloud，每个企业模型请求和搜索都经过它的计量网关。[Mindeck 应用组合包](../../packages/bundle/mindeck-app/README.zh.md)在 DeepSeek 账号相关的行（`deepseek-account`、`llm-deepseek-account`、`account-controller`、`ui-settings-account`、`web-deepseek-api` 和 `web-search-deepseek`）之外加入这些插件，这些行保持启用，作为个人登录方式。只有企业通过 bootstrap 的 `policies.personalDeepSeek` 允许时，成员才能使用它，由 mindeck-account 的客户端执行。组合包仍禁用 `llm-deepseek`（个人 API Key 路由）、`llm-pi-ai` 和 `ui-settings-models`。

## 归属

| 负责方 | 职责 |
|---|---|
| [mindeck-account](../../packages/mindeck/mindeck-account/README.zh.md) | `ctx.mindeckAccount`：Cloud 地址、设备登录、保存的 Cloud 会话、全屏登录和“设置 → 账号”；客户端的 `ctx.mindeckComposer`，Mindeck 各页面通过它打开对话 |
| [mindeck-models](../../packages/mindeck/mindeck-models/README.zh.md) | 把成员可用的企业模型作为经 Cloud 网关的模型路由提供，并给出额度与登录失败提示；还提供 `mindeck-search` 联网搜索提供方，只在企业开启搜索时经网关的 `/gateway/v1/tools/search` 搜索 |
| [mindeck-skills](../../packages/mindeck/mindeck-skills/README.zh.md) | 成员可用的企业技能：缓存在本机，登录期间由技能提供方提供；以及技能页面 |
| [mindeck-files](../../packages/mindeck/mindeck-files/README.zh.md) | `ctx.mindeckFiles`：资源库工具、右侧栏面板、资源库页面和消息中的 `library:` 引用 |
| [mindeck-employees](../../packages/mindeck/mindeck-employees/README.zh.md) | `ctx.mindeckEmployees`：作为带各自人设的 Agent 预设的通用助手和企业数字员工、数字员工页面，以及进行中对话所属的员工 |
| [mindeck-inbox](../../packages/mindeck/mindeck-inbox/README.zh.md) | `ctx.mindeckInbox`：成员的企业消息、侧栏行旁的未读数、已读上报和推荐的桌面端版本 |

## 账号会话

`ctx.mindeckAccount.session()` 返回已登录成员的 Cloud 地址、访问令牌和启动数据，未登录时返回 `undefined`。使用方在每次 Cloud 请求时读取它，Cloud 拒绝令牌时调用 `rejectToken(token)`；只有当保存的会话仍持有该令牌时服务才结束会话，因此较晚到达的拒绝不会影响更新的登录。`mindeck-account/changed` 通告每次登录、退出和令牌被拒，使用方据此重新读取 `session()`，而不是读取事件载荷。

登录到带同步端点的 Mindeck Cloud 期间，账号每分钟轮询一次该端点，并发出 `mindeck-account/revised`，带上数据发生变化的[主题](../../packages/mindeck/mindeck-account/README.zh.md#use-this-package)；各使用方重新读取自己主题涵盖的内容，并保留各自 10 分钟一次的兜底刷新，没有同步端点的 Mindeck Cloud 只有这种刷新。使用方不自己启动同步定时器；`requestSync()` 请账号同步一次，`syncAnswer()` 返回最近一次应答，每次应答之后都会发出 `mindeck-account/synced`，断网时失败的请求可以据此重试。

## 登录与账号页

mindeck-account 用 [ui-settings-account](../../packages/client/ui-settings-account/README.zh.md#pages-for-other-accounts) 注册的工厂绘制自己的页面：全屏登录使用首次引导页 `desktop.onboarding.page`，插图来自 ui-brand-mindeck；“设置 → 账号”使用 `settings.account.*` 账号页部件，因此两者都与 DeepSeek 账号页面一致。设置中企业账号排在最前，DeepSeek 账号页改名为**DeepSeek 账号**。

## 数字员工

`ctx.mindeckEmployees` 注册 `mindeck-general`，并为每位数字员工注册一个 `mindeck-employee-<Cloud id>` Agent 预设，每个预设都是基础预设的插件行加上各自的人设；组合包把 `mindeck-general` 设为默认预设。离开 Cloud 列表的员工以已停用、不列出（`listed: false`）的状态保留注册，因此新对话不能选择他们，而原有对话仍以其名称继续。`employeeForSession(sessionId)` 返回进行中对话所属员工的 Cloud id；mindeck-models 在网关模型请求和企业搜索中以 `x-mindeck-employee` 发送它，便于 Mindeck Cloud 归属用量。

## 侧栏页面

成员拥有 Mindeck 访问权限期间，左侧栏在“插件”上方列出**数字员工**、**技能**、**资源库**和**企业消息**，在 `sidebar.panellist` 中的 order 分别为 -30、-20、-10 和 -5，各自在根 `main` 插槽打开一个页面；企业提供员工时才显示数字员工这一行，成员的 Mindeck Cloud 有收件箱时才显示企业消息这一行，它的未读数在 `sidebar.panellist.badge` 中。各页面通过 `ctx.mindeckComposer` 开始对话：像“新会话”一样在当前工作区打开一个空白对话，使用所选员工的预设，否则使用 Host 的默认预设，并在对话显示前把示例请求、`/name ` 或 `library:` 引用放进草稿。输入框获得焦点，不会自动发送。右侧栏保留资源库面板；技能不再有右侧栏页面。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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

Types: [SessionId](core.zh.md)

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

Types: [SessionId](core.zh.md)

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
