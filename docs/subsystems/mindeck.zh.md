# Mindeck 企业版

[English](mindeck.md) | 中文

[Mindeck 包组](../../packages/mindeck/README.zh.md)把 Mindeck Desktop 连接到公司的 Mindeck Cloud。成员用公司账号登录；模型、联网搜索、技能、资源库和数字员工都来自该 Cloud，每个公司模型请求和搜索都经过它的计量网关。[Mindeck 应用组合包](../../packages/bundle/mindeck-app/README.zh.md)在 DeepSeek 账号相关的行（`deepseek-account`、`llm-deepseek-account`、`account-controller`、`ui-settings-account`、`web-deepseek-api` 和 `web-search-deepseek`）之外加入这些插件，这些行保持启用，作为个人登录方式。只有公司通过 bootstrap 的 `policies.personalDeepSeek` 允许时，成员才能使用它，由 mindeck-account 的客户端执行。组合包仍禁用 `llm-deepseek`（个人 API Key 路由）、`llm-pi-ai` 和 `ui-settings-models`。

## 归属

| 负责方 | 职责 |
|---|---|
| [mindeck-account](../../packages/mindeck/mindeck-account/README.zh.md) | `ctx.mindeckAccount`：Cloud 地址、设备登录、保存的 Cloud 会话和登录遮罩；客户端的 `ctx.mindeckComposer`，Mindeck 各页面通过它打开对话 |
| [mindeck-models](../../packages/mindeck/mindeck-models/README.zh.md) | 把成员可用的公司模型作为经 Cloud 网关的模型路由提供，并给出额度与登录失败提示；还提供 `mindeck-search` 联网搜索提供方，只在公司开启搜索时经网关的 `/gateway/v1/tools/search` 搜索 |
| [mindeck-skills](../../packages/mindeck/mindeck-skills/README.zh.md) | 成员可用的公司技能：缓存在本机，登录期间由技能提供方提供；以及技能页面 |
| [mindeck-files](../../packages/mindeck/mindeck-files/README.zh.md) | `ctx.mindeckFiles`：资源库工具、右侧栏面板、资源库页面和消息中的 `library:` 引用 |
| [mindeck-employees](../../packages/mindeck/mindeck-employees/README.zh.md) | `ctx.mindeckEmployees`：作为带各自人设的 Agent 预设的通用助手和公司数字员工、新对话卡片、数字员工页面，以及进行中对话所属的员工 |

## 账号会话

`ctx.mindeckAccount.session()` 返回已登录成员的 Cloud 地址、访问令牌和启动数据，未登录时返回 `undefined`。使用方在每次 Cloud 请求时读取它，Cloud 拒绝令牌时调用 `rejectToken(token)`；只有当保存的会话仍持有该令牌时服务才结束会话，因此较晚到达的拒绝不会影响更新的登录。`mindeck-account/changed` 通告每次登录、退出和令牌被拒，使用方据此重新读取 `session()`，而不是读取事件载荷。

## 数字员工

`ctx.mindeckEmployees` 注册 `mindeck-general`，并为每位数字员工注册一个 `mindeck-employee-<Cloud id>` Agent 预设，每个预设都是基础预设的插件行加上各自的人设；组合包把 `mindeck-general` 设为默认预设。离开 Cloud 列表的员工以已停用状态保留注册，因此其对话可以继续。`employeeForSession(sessionId)` 返回进行中对话所属员工的 Cloud id；mindeck-models 在网关模型请求和公司搜索中以 `x-mindeck-employee` 发送它，便于 Mindeck Cloud 归属用量。

## 侧栏页面

成员拥有 Mindeck 访问权限期间，左侧栏在“插件”上方列出**数字员工**、**技能**和**资源库**，在 `sidebar.panellist` 中的 order 分别为 -30、-20 和 -10，各自在根 `main` 插槽打开一个页面；公司提供员工时才显示数字员工这一行。各页面通过 `ctx.mindeckComposer` 开始对话：像“新会话”一样在当前工作区打开一个空白对话，使用所选员工的预设，否则使用 Host 的默认预设，并在对话显示前把示例请求、`/name ` 或 `library:` 引用放进草稿。输入框获得焦点，不会自动发送。右侧栏保留资源库面板；技能不再有右侧栏页面。

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
 * Read the month-to-date quota from Mindeck Cloud now, as after a refused request or when the account
 * menu opens. A failed read keeps the previous quota; a rejected token ends the session.
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

<a id="ctxmindeckemployees--mindeckemployees"></a>

### `ctx.mindeckEmployees` — `MindeckEmployees`

Registers the general assistant and the member's digital employees as agent presets and lists them for the new-conversation screen.

```ts cordis-catalog
/**
 * Read which digital employee a live conversation talks to.
 * @param sessionId - the conversation's Session.
 * @returns the Mindeck Cloud employee id of the Session's preset, or undefined for the general assistant, another
 *   preset, or a Session without a live Agent.
 */
employeeForSession(sessionId: SessionId): string | undefined

/**
 * Stream the cards of the new-conversation screen.
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
 * Search file and folder names across the member's spaces; a blank query returns no entries.
 * @param query - text contained in names.
 * @param signal - caller cancellation.
 * @returns matching files and folders, at most `maxSearchResults`.
 */
@Remote async search(query: string, signal: AbortSignal): Promise<LibraryEntryView[]>

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
<!-- END GENERATED cordis-surface -->
