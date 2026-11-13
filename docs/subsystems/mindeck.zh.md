# Mindeck 企业版

[English](mindeck.md) | 中文

[Mindeck 包组](../../packages/mindeck/README.zh.md)把 Mindeck Desktop 连接到公司的 Mindeck Cloud。成员用公司账号登录；模型、技能和资源库都来自该 Cloud，每个模型请求都经过它的计量网关。[Mindeck 应用组合包](../../packages/bundle/mindeck-app/README.zh.md)用这些插件替换 DeepSeek 账号、其模型提供商和个人模型设置。

## 归属

| 负责方 | 职责 |
|---|---|
| [mindeck-account](../../packages/mindeck/mindeck-account/README.zh.md) | `ctx.mindeckAccount`：Cloud 地址、设备登录、保存的 Cloud 会话和登录遮罩 |
| [mindeck-models](../../packages/mindeck/mindeck-models/README.zh.md) | 把成员可用的公司模型作为经 Cloud 网关的模型路由提供，并给出额度与登录失败提示 |
| [mindeck-skills](../../packages/mindeck/mindeck-skills/README.zh.md) | 成员可用的公司技能：缓存在本机，登录期间由技能提供方提供 |
| [mindeck-files](../../packages/mindeck/mindeck-files/README.zh.md) | `ctx.mindeckFiles`：资源库工具、侧栏页面和消息中的 `library:` 引用 |

## 账号会话

`ctx.mindeckAccount.session()` 返回已登录成员的 Cloud 地址、访问令牌和启动数据，未登录时返回 `undefined`。使用方在每次 Cloud 请求时读取它，Cloud 拒绝令牌时调用 `rejectToken(token)`；只有当保存的会话仍持有该令牌时服务才结束会话，因此较晚到达的拒绝不会影响更新的登录。`mindeck-account/changed` 通告每次登录、退出和令牌被拒，使用方据此重新读取 `session()`，而不是读取事件载荷。

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
