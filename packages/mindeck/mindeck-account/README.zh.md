---
description: "用设备码将 Mindeck 桌面端登录到 Mindeck Cloud，并为其他 Mindeck 插件保存桌面会话。"
kind: "package-reference"
---

# @deepseek-ai/dsh-mindeck-account

[English](README.md) | 中文

## 概述

将 Mindeck 桌面端登录到公司的 Mindeck Cloud。成员输入一次云端地址，在浏览器中确认设备码，桌面端便将得到的会话保存到凭据存储。其他 Mindeck Host 插件读取该会话，以使用公司的模型、技能和资源库。没有会话时，登录对话框会覆盖工作区。

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

在 Host 上与凭据、设置和 Typert 服务一起挂载默认导出，并在 Web 客户端挂载 `./client` 入口。Mindeck 应用组合包已完成这两项。

登录对话框先请成员输入管理员提供的云端地址，例如 `cloud.example.com`；不带协议的地址按 HTTPS 处理。在输入框中粘贴整段开通消息时，只保留其中第一个网址。只有当该地址的桌面 API 以 Mindeck Cloud 的方式应答时，Host 才接受它，并将其保存到插件的 `cloudUrl` 配置字段。部署可以用 profile 补丁中 `- id: mindeck-account` 行的 `config` 预设 `cloudUrl`，成员即可跳过填写地址；成员只能在未登录时修改。随后对话框显示一个代码、代码过期前的剩余时间和指向云端确认页面的**打开浏览器**链接；成员点击**登录**的那个窗口还会自动在浏览器中打开该页面。成员在该页面确认代码后，桌面端上报设备名称、平台和应用版本，读取成员信息并保存会话。设置 → 账号显示成员、公司、部门和角色，提供 Mindeck Cloud 链接和退出登录。侧栏菜单可打开设置和 Mindeck Cloud、打开云端使用帮助、发送书面反馈、查看**关于 Mindeck**（版本类型、版本号、公司、云端地址，以及云端数据与隐私页和下载页的链接），也可退出登录。

退出登录会立即删除本机会话，并在后台结束其在 Mindeck Cloud 上的会话。当 Mindeck Cloud 拒绝该会话时，例如管理员停用成员或让设备退出登录后，会话结束，对话框请成员重新登录。

登录期间，Host 在登录后、每隔 `quotaRefreshMs` 毫秒（默认两分钟）以及账号菜单打开或请求因额度被拒时，从 `/api/desktop/quota` 读取本月额度；读取失败时保留上一次的额度。账号菜单显示成员本月已用金额与上限，部门设有上限时也显示部门的。公司预算设为用完即暂停全公司请求时，额度中还带有该预算的已用比例；成员看不到公司的金额。最先用完的那个上限用到 75% 起，输入框上方出现提醒，写明是哪一个上限、用量和恢复日期，并链接到用量页；到 95% 和用完时会再次出现，即使成员已关闭上一级提醒。反馈通过 `POST /api/desktop/feedback` 发给公司管理员，从不包含对话内容：菜单中的书面反馈、每条带文字或分类的 `/feedback` 备注，以及成员点踩的每个回答及其分类和说明。再次评价同一回答会替换之前发送的内容，撤销点踩或改为点赞会撤回它；点赞本身不发送其他内容。实时对话通过 `session/event`、已关闭的对话通过 `feedback/committed` 转发，失败只记录日志。当 Mindeck Cloud 因额度拒绝模型请求时，对话框按打开时重新读取的额度写明用完的是哪一个上限（先看公司预算，再看成员或部门的额度）及恢复日期；读取结果显示有上限用完之前，显示一般说明。对话框链接到成员在 Mindeck Cloud 的用量页。

其他 Host 插件调用 `ctx.mindeckAccount.session()` 获取云端地址、Bearer 令牌和 bootstrap 端点，在 `mindeck-account/changed` 时重新读取，并用 `rejectToken(token)` 报告 HTTP 401。令牌不会到达任何客户端。

-----

<a id="understand-the-implementation"></a>
## 了解实现

<details>
<summary>维护者细节 — 点击展开</summary>

Host 服务继承 `TypertRemoteService`，Remote 命名空间为 `mindeckAccount`。它同一时间最多持有一个登录尝试；`startSignIn` 会加入正在进行的尝试，`cancelSignIn` 中止尝试并等待其结束。一次尝试会请求设备码，向 `PUT /api/desktop/device-request` 上报电脑名称、平台和应用版本，供云端确认页面显示（上报失败只会让页面缺少这些信息），按 Mindeck Cloud 返回的间隔轮询令牌端点（每收到一次 `slow_down` 延长五秒；某次轮询没有收到响应时，尝试的 `retrying` 标记置为真，并继续轮询到代码过期），上报设备，读取 `/api/desktop/bootstrap`，再把 `{ version: 1, cloudUrl, token, bootstrap }` 保存为 `mindeck-account/default` 授权记录。若令牌签发后尝试失败，Host 会在 Mindeck Cloud 上结束该令牌，不留下孤立会话。未通过校验的已存记录视为未登录。

启动时 Host 会重新读取 bootstrap：401 结束会话，变化的信息替换缓存，云端不可达时保留会话以便离线使用。`rejectToken` 只在会话仍持有被拒绝的令牌时才删除会话，因此迟到的拒绝不会结束较新的登录。

客户端挂载生成的 Remote，并通过 `remoteAccess.whenAccess('mindeckAccount/watch')` 跟随 `watch` 流，没有账号访问权限的客户端不会渲染任何账号界面。它在 `shell.overlay` 注册登录对话框，在 `settings.launcher` 注册侧栏入口，在 `settings.section` 注册设置页并在 `settings.section.icon` 注册其图标，为 `QUOTA` 失败码在 `shell.quota-notice` 注册额度对话框，并在 `conversation.input.dock` 注册额度提醒。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [Mindeck 开发文档](../../../docs/mindeck/README.zh.md) — Mindeck 应用及其云端服务。
- [凭据](../../credentials/credentials/README.zh.md) — 授权记录。
- [Web 客户端 Slot](../../../docs/subsystems/slots.zh.md) — 贡献的生命周期。

-----

<a id="model-experience"></a>
## 模型体验

无，因为登录和保存桌面会话不会构造模型输入。

#### KV 缓存影响

无；使用该会话的 Mindeck 插件负责各自的模型请求及其缓存影响。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 客户端提供英文和中文文案；其他语言回退到英文。
- 一台桌面端只持有一个会话；切换账号需要先退出登录。
- 登录期间云端地址必须保持不变；云端迁移后需要退出并重新登录。

-----

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者细节 — 点击展开</summary>

无。

</details>
