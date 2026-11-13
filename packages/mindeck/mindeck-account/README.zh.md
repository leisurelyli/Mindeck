---
description: "用设备码将 Mindeck 桌面端登录到 Mindeck Cloud，并为其他 Mindeck 插件保存桌面会话。"
kind: "package-reference"
---

# @deepseek-ai/dsh-mindeck-account

[English](README.md) | 中文

## 概述

将 Mindeck 桌面端登录到企业的 Mindeck Cloud。成员输入一次企业地址，在浏览器中确认设备码，桌面端便将得到的会话保存到凭据存储。其他 Mindeck Host 插件读取该会话，以使用企业的模型、技能和资源库。没有会话时，基座首次引导页上的全屏登录会覆盖工作区。

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

未登录时，登录界面在工作区上方绘制基座的[首次引导页](../../client/ui-settings-account/README.zh.md#pages-for-other-accounts)，桌面端和浏览器都是如此。设备第一次启动时，欢迎页说明企业账号能带来什么；点击**开始**、完成一次登录或本机已有保存的会话时，都会设置插件的 `welcomed` 配置字段，因此每台设备只出现一次。随后的地址页请成员填写管理员提供的企业地址，例如 `cloud.example.com`；不带协议的地址按 HTTPS 处理。粘贴整段开通消息或邀请链接时，保留其中第一个网址并去掉查询参数。只要该地址或它直到域名为止的某个较短路径前缀以 Mindeck Cloud 的方式应答，Host 就接受它，因此指向 Cloud 某个页面的链接会解析到该 Cloud；结果保存到 `cloudUrl` 配置字段。部署可以用 profile 补丁中 `- id: mindeck-account` 行的 `config` 预设 `cloudUrl`，地址会自动填好；成员只能在未登录时修改。**继续**发起设备登录：确认页显示代码、代码过期前的剩余时间、**复制链接**和**打开浏览器**，成员点击继续的那个窗口还会自动打开确认页面；**上一步**取消这次尝试。成员确认代码后，桌面端上报设备名称、平台和应用版本，读取成员信息并保存会话；舞台向成员问好，然后淡出，露出原样的工作区。代码被拒绝或过期、Cloud 无法连接或其他失败时，回到地址页并说明原因。设置 → 账号用基座账号页的部件绘制，排在 DeepSeek 账号页之前，显示成员及管理后台链接（普通成员显示 Mindeck Cloud 链接）、企业、部门、角色、本月用量与额度及重新计算日期、企业地址、**使用帮助**和**退出登录**；在这里退出登录会关闭设置。侧栏菜单可打开设置和 Mindeck Cloud、打开云端使用帮助、发送书面反馈、查看**关于 Mindeck**（版本类型、版本号、企业、企业地址、企业填写的管理员联系方式，以及云端数据与隐私页和下载页的链接），也可退出登录。

DeepSeek 账号仍保留在组合中，作为由企业决定是否允许的第二个个人登录。bootstrap 的 `policies.personalDeepSeek` 为 true 时，设置 → 账号显示**个人 DeepSeek 账号**卡片：说明这部分用量由成员的 DeepSeek 账号承担、不计入企业额度，并通过 DeepSeek 账号的 Remote 登录或退出该账号；登录后会出现它的模型和基座账号页，后者通过 `ctx.locale.override` 改名为**DeepSeek 账号**，显示余额和充值。该策略为 false 或缺失时（例如早于这项策略的 Mindeck Cloud），卡片隐藏，本机保存的 DeepSeek 凭据会被退出。企业账号的侧栏入口以优先级 -1 注册，因此会覆盖侧栏中 DeepSeek 账号的入口。

退出登录会立即删除本机会话，并在后台结束其在 Mindeck Cloud 上的会话。当 Mindeck Cloud 拒绝该会话时，例如管理员停用成员或让设备退出登录后，会话结束，地址页说明原因并保留企业地址。

登录期间，Host 在登录后、每隔 `quotaRefreshMs` 毫秒（默认两分钟）以及账号菜单打开或请求因额度被拒时，从 `/api/desktop/quota` 读取本月额度；读取失败时保留上一次的额度。账号菜单显示成员本月已用金额与上限，部门设有上限时也显示部门的。企业预算设为用完即暂停全员请求时，额度中还带有该预算的已用比例；成员看不到企业的金额。最先用完的那个上限用到 75% 起，输入框上方出现提醒，写明是哪一个上限、用量和恢复日期，并链接到用量页；到 95% 和用完时会再次出现，即使成员已关闭上一级提醒。反馈通过 `POST /api/desktop/feedback` 发给企业管理员，从不包含对话内容：菜单中的书面反馈、每条带文字或分类的 `/feedback` 备注，以及成员点踩的每个回答及其分类和说明。再次评价同一回答会替换之前发送的内容，撤销点踩或改为点赞会撤回它；点赞本身不发送其他内容。实时对话通过 `session/event`、已关闭的对话通过 `feedback/committed` 转发，失败只记录日志。当 Mindeck Cloud 因额度拒绝模型请求时，对话框按打开时重新读取的额度写明用完的是哪一个上限（先看企业预算，再看成员或部门的额度）及恢复日期；读取结果显示有上限用完之前，显示一般说明。企业填写了管理员联系方式时，对话框也会显示它。对话框链接到成员在 Mindeck Cloud 的用量页。

其他 Host 插件调用 `ctx.mindeckAccount.session()` 获取云端地址、Bearer 令牌和 bootstrap 端点，在 `mindeck-account/changed` 时重新读取，并用 `rejectToken(token)` 报告 HTTP 401。令牌不会到达任何客户端。

需要推送“每次变更后重新读取的值”的 Host 服务使用导出的 `followChanges(listeners, signal, lifetime, read)`：它先立即产出一次 `read()`，之后每收到一次变更通知再产出一次；读取期间到达的多次通知合并为一次读取；任一信号中止时结束。[mindeck-skills](../mindeck-skills/README.zh.md) 和 [mindeck-files](../mindeck-files/README.zh.md) 用它推送各自的列表。

在 Web 客户端中，只要会话、工作区、工作区界面和 Agent 预设 Remote 服务存在，本插件就提供 `ctx.mindeckComposer`。`draft(sessionId)` 返回客户端已打开的某个对话的 scope 和输入框。`startConversation({ agentPreset, prepare })` 像“新会话”一样在当前工作区打开一个空白对话：当前工作区是主区域所显示对话所在的工作区，否则是对话最近有变化的工作区。它请求 `agentPreset`，未指定时请求预设列表中 Host 的默认预设，并复用该工作区中第一个不属于其他预设的空白对话及其草稿，没有时新建一个；读不到预设列表时，任何空白对话都可能被复用。`prepare` 在对话显示前编辑草稿，随后输入框获得焦点。创建被拒绝时，工作区提示会说明原因，当前页面保持不变；没有任何工作区时，它的行为与“新会话”相同，且不调用 `prepare`。数字员工、技能和资源库页面都通过它开始对话。

-----

<a id="understand-the-implementation"></a>
## 了解实现

<details>
<summary>维护者细节 — 点击展开</summary>

Host 服务继承 `TypertRemoteService`，Remote 命名空间为 `mindeckAccount`。它同一时间最多持有一个登录尝试；`startSignIn` 会加入正在进行的尝试，`cancelSignIn` 中止尝试并等待其结束。一次尝试会请求设备码，向 `PUT /api/desktop/device-request` 上报电脑名称、平台和应用版本，供云端确认页面显示（上报失败只会让页面缺少这些信息），按 Mindeck Cloud 返回的间隔轮询令牌端点（每收到一次 `slow_down` 延长五秒；某次轮询没有收到响应时，尝试的 `retrying` 标记置为真，并继续轮询到代码过期），上报设备，读取 `/api/desktop/bootstrap`，再把 `{ version: 1, cloudUrl, token, bootstrap }` 保存为 `mindeck-account/default` 授权记录。若令牌签发后尝试失败，Host 会在 Mindeck Cloud 上结束该令牌，不留下孤立会话。未通过校验的已存记录视为未登录。

启动时 Host 会重新读取 bootstrap：401 结束会话，变化的信息替换缓存，云端不可达时保留会话以便离线使用。`rejectToken` 只在会话仍持有被拒绝的令牌时才删除会话，因此迟到的拒绝不会结束较新的登录。

客户端挂载生成的 Remote，并通过 `remoteAccess.whenAccess('mindeckAccount/watch')` 跟随 `watch` 流，没有账号访问权限的客户端不会渲染任何账号界面。它在 `shell.overlay` 注册登录舞台，在第一份账号状态到达之前一直覆盖工作区，因此已登录的启动不会出现登录页，未登录的启动也不会露出工作区；以优先级 -1 在 `settings.launcher` 注册侧栏入口，以 order -20 在 `settings.section` 注册设置页并在 `settings.section.icon` 注册其图标，为 `QUOTA` 失败码在 `shell.quota-notice` 注册额度对话框，并在 `conversation.input.dock` 注册额度提醒。它在注入 `sessions`、`workspaces`、`uiWorkspace` 和 `remote.agentPresets` 的子作用域中提供 `mindeckComposer`，其中任一服务离开时该服务随之撤回。

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
- 企业的个人 DeepSeek 账号策略随 bootstrap 在启动和登录时读取，因此改动要等桌面端下次打开 Mindeck 才生效。退出不被允许的 DeepSeek 凭据由客户端执行，所以要等 Mindeck 窗口打开后才会发生。
- 个人 DeepSeek 登录只能从 Mindeck 桌面端发起，由桌面端自己打开授权页；普通浏览器窗口会提示只能在桌面端登录。
- 登录舞台和账号页使用基座账号插件的工厂。没有 `ui-settings-account` 时，登录退回为普通对话框，账号页只显示成员姓名和**退出登录**。

-----

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者细节 — 点击展开</summary>

无。

</details>
