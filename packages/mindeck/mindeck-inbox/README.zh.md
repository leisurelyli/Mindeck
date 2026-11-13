---
description: "在左侧栏显示成员来自 Mindeck Cloud 的企业消息：带未读数的公告和个人通知、已读上报和推荐版本。"
kind: "package-reference"
---

# @deepseek-ai/dsh-mindeck-inbox

[English](README.md) | 中文

## 概述

在一个地方查看企业发给成员的所有消息。Mindeck 桌面端登录到带收件箱的 Mindeck Cloud 期间，左侧栏显示**企业消息**和未读消息数，与成员在网页版看到的数字一致。它的页面按时间倒序列出企业公告，以及与成员自己的申请有关的通知，例如提额申请有了结果、反馈收到了回复；打开一条会显示全部内容，并在所有设备上标为已读。当前版本低于企业推荐的版本时，页面最上方显示那个版本和它的安装包。

## 目录

- [使用本包](#use-this-package)
- [了解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在 Host 上于 [Mindeck 账号](../mindeck-account/README.zh.md)之后挂载默认导出，并在 Web 客户端挂载 `./client` 入口。Mindeck 应用组合包已完成这两项。从组合中去掉这一行，只会去掉侧栏行和页面，其他功能不受影响。

成员已登录且 bootstrap 列出 `endpoints.inbox` 时，侧栏行、它的徽标和页面才存在；早于收件箱的 Mindeck Cloud 不显示其中任何一个。这一行排在其他企业行之后，`sidebar.panellist` 的 order 为 -5；收件箱为空时也保留，位置不会变动。徽标从账号的同步应答中读取未读数，最多显示 99+，因此有新消息或在网页上读过之后，1 分钟内数字就会变化。成员在本机打开的消息会立即从数字中扣除。

页面中公告用喇叭图标，个人通知用对应类型的图标（提额申请、反馈、交接；本版本不认识的类型用通用的通知图标）。每条显示标题（重要公告与网页版一样在标题前加**重要**标签）、类型和到达时间，以及正文的前两行。打开一条消息会显示完整正文，其中的网址显示为链接，消息带链接时还有**查看详情**；两者都在系统浏览器中打开。打开未读消息会把它标为已读，**全部标为已读**会标记其余的消息。已读标记没有送达 Mindeck Cloud 时（例如断网），本机仍会立即显示为已读，并在下一次成功同步后重新发送。**查看更早的消息**读取下一页 `pageSize` 条（默认 20 条）。页面打开期间，同步报告有新消息、消息被读过或公告有变化时，会重新读取最新的消息。

页面有加载中、空、离线和失败几种状态。断网时，之前加载的消息保留在一行提示下方；还没有加载过消息时，页面说明暂时连不上企业服务器、网络恢复后会自动刷新。服务器返回错误时显示请求编号，便于企业管理员排查。任何情况都不会弹出对话框。

按语义化版本比较，bootstrap 的 `client.recommendedVersion` 高于当前版本时，页面最上方的卡片写明这个版本、当前版本和企业填写的更新说明，**下载**在系统浏览器中打开企业为本机平台提供的安装包；没有安装包时，卡片请成员向管理员索取。没有版本信息的构建，或者版本号不符合语义化版本格式时，不显示这张卡片，与 Mindeck Cloud 判断桌面端是否落后的规则一致。这张卡片不是消息，不计入未读数。

| 选项 | 默认值 | 含义 |
|---|---|---|
| `pageSize` | `20` | 每页读取的消息数，1 到 50 |
| `requestTimeoutMs` | `15000` | 每次 Mindeck Cloud 请求的超时时间（毫秒） |

-----

<a id="understand-the-implementation"></a>
## 了解实现

<details>
<summary>维护者细节 — 点击展开</summary>

Host 服务继承 `TypertRemoteService`，Remote 命名空间为 `mindeckInbox`；它从 `ctx.mindeckAccount` 读取会话，从 `syncAnswer()` 读取未读数，从 `getState()` 读取推荐版本及本机平台的安装包。`watch` 推送概要（是否有收件箱、未读数、推荐版本）。`items` 在页面持有期间推送已加载的消息：打开时读取最新的消息；页面打开期间收到带 `inbox` 或 `announcements` 的 `mindeck-account/revised` 时重新读取，但变化只是页面自己上报已读后返回的数字时除外；上一次读取失败时，`mindeck-account/synced` 也会让页面重新读取。`reload`、`loadMore` 和 `markRead` 由页面调用；重新读取时保留与当前显示数量相同的消息，最多 50 条；Mindeck Cloud 不再接受游标时，列表从头开始。

`GET {endpoints.inbox}` 和 `POST {endpoints.inbox}/read` 携带会话令牌。未知类型的消息会被略过并记录日志，未知的级别按普通消息处理，不是 `http(s)` 的链接会被丢弃。尚未确认的已读标记按消息保存，或者保存为一次带时间的全部已读，在上报成功之前从 Mindeck Cloud 的数字中扣除；每次同步应答之后的 `mindeck-account/synced` 事件会重新发送它们。401 通过 `rejectToken` 结束会话。另一位成员登录后，状态从头开始。

客户端通过 `remoteAccess.whenAccess('mindeckInbox/watch')` 跟随 `watch`，在概要表明有收件箱期间注册侧栏行（`sidebar.panellist`）、它的徽标（`sidebar.panellist.badge`，由 [ui-sidebar](../../client/ui-sidebar/README.zh.md#use-this-package) 放在标题之后和收起栏中）以及页面（`main`）。页面从挂载到卸载期间跟随 `items`。徽标的无障碍文本带单位说出数字，侧栏行把它作为自己的描述播报。共享图标库里没有铃铛和喇叭，因此这两个图标是 `src/client/icons.tsx` 中的本地绘制。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [Mindeck 账号](../mindeck-account/README.zh.md#use-this-package)：同步及其主题。
- [Mindeck 子系统参考](../../../docs/subsystems/mindeck.zh.md)：归属和生成的 Cordis 接口。

-----

<a id="model-experience"></a>
## 模型体验

无。企业消息只展示给成员，不构成任何模型输入。

#### KV Cache 影响

无。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 重要公告只计入未读数，不会另外弹出提示，因为基座没有用于必读消息的应用内提示。
- 侧栏行被收进“更多”菜单后，那里不显示徽标。
- 客户端提供英文和中文文案；其他语言回退到英文。
- 铃铛和喇叭图标是共享图标库之外的草稿，等待设计评审。

-----

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者细节 — 点击展开</summary>

无。

</details>
