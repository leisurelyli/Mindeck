---
description: "基于原版 Web 组合的 Mindeck 展示层。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-mindeck-app

[English](README.md) | 中文

## 概述

此层在原版 Web 应用上展示 Mindeck 图稿。Mindeck Desktop 的自有 profile 包含此层；源码 Web 启动器通过 `--patch` 选择其补丁。它修改展示和智能体身份，安装身份和状态路径仍由 Mindeck 启动器控制。该包同时拥有共享产品描述 `src/product.json`，Desktop 与 Web 启动器从中读取产品名称和构建资源；该描述不提供运行时服务。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在 `@deepseek-ai/dsh-base` 和 `@deepseek-ai/dsh-web-app` 之后应用此组合包。Desktop 将这些层按此顺序放在用户扩展组合包之前。仓库的 `start:web` 和 `dev:web` 脚本以相同顺序把它加入开发 Web profile。手动管理 profile 时，遵循 [Plugin Manager](../../boot/plugin-manager/README.zh.md#use-this-package) 与 [profile 分层规则](../../boot/app-boot/README.zh.md#profiles)。

此层禁用 `ui-brand-official`，选择 [Mindeck 品牌插件](../../client/ui-brand-mindeck/README.zh.md)提供侧栏、空白会话和首次引导图稿。原版 Web 组合包保持独立于 Mindeck。Mindeck 启动器通过[语言参数](../../client/locale/README.zh.md#use-this-package)提供公开的产品名称；此补丁不配置这些值。

成员使用 Mindeck Cloud 账号登录，使用企业在 Mindeck Cloud 中配置的模型、联网搜索、技能、资源库和数字员工，并查看企业消息。此层加入[账号](../../mindeck/mindeck-account/README.zh.md)、[企业模型与联网搜索](../../mindeck/mindeck-models/README.zh.md)、[企业技能](../../mindeck/mindeck-skills/README.zh.md)、[资源库](../../mindeck/mindeck-files/README.zh.md)、[数字员工](../../mindeck/mindeck-employees/README.zh.md)和[企业消息](../../mindeck/mindeck-inbox/README.zh.md)插件，并用 `web.searchProvider: mindeck-search` 选择企业联网搜索；补丁会替换一行的整个 config，因此 `web` 行重新写出 `fetchProvider: http`。DeepSeek 账号相关的行（`deepseek-account`、`llm-deepseek-account`、`account-controller`、`ui-settings-account`、`web-deepseek-api` 和 `web-search-deepseek`）保持启用，作为个人登录方式；企业通过 Mindeck Cloud 的 `policies.personalDeepSeek` 允许或禁止它，由 Mindeck 账号插件执行，默认关闭。`ui-settings-account` 行把 DeepSeek 的首次引导标为已跳过（`step: done`、`completion: skipped`），因此登录个人账号时不会打开 DeepSeek 的全屏欢迎、充值和用途页面，这些页面还会改写开发者工具偏好。Mindeck 账号入口以插槽优先级 -1 遮盖 DeepSeek 账号入口。此层禁用 `llm-deepseek`（个人 API Key 路由）、`llm-pi-ai` 和填写个人 API Key 的模型设置页，因为个人 API Key 会同时绕过企业网关和 DeepSeek 账号。首次使用时创建的默认工作区位于 `<Documents>/Mindeck`，与官方 DeepSeek Harness 安装的文件夹分开。

智能体以企业工作助手 Mindeck 的身份自我介绍：此层把 DeepSeek Harness 身份开场白换成 Mindeck 的开场白，它还要求模型在没有联网搜索工具时说明企业没有开启联网搜索，并位于每个 Agent 预设自己的人设之前。新对话默认使用 `mindeck-general`，即数字员工插件注册的通用助手：此层设置预设注册表的 `default`，这也是原版 Web 层给该行的唯一设置。它禁用向模型说明 harness 检出目录与 Web GUI 的 [harness-dev-context](../../context/harness-dev-context/README.zh.md)，以及 [Session log 上传设置](../../client/ui-settings-session-log/README.zh.md)，因为上传只随发往 DeepSeek API 提供方的请求进行，而此层不包含该提供方。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

manifest（元数据清单）将 `dsh.bundle.patch` 声明为 [`cordis.patch.yml`](cordis.patch.yml)。该补丁按 id 禁用官方品牌和被替换的行，插入 Mindeck 插件，设置 `web` 的提供方、DeepSeek 引导状态、预设注册表的 `default` 和工作区控制器的 `documentsFolder`，并把 `system-prompt` 配置替换为 Mindeck 的 `identity` 和 Web 层的 `personaPrefix`。它不添加服务或可变运行时状态；所选插件负责注册与清理。后续补丁遵循普通 profile 优先级。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [组合包组](../README.zh.md)——相邻应用层。
- [Mindeck 品牌资源](../../../docs/mindeck/branding.zh.md)——产品值与生成资源。
- [Mindeck 隔离](../../../docs/mindeck/isolation.zh.md)——启动器状态与 Desktop profile 准备。

-----

<a id="model-experience"></a>
## 模型体验

### Mindeck 身份

#### 模型看到什么

系统提示词以 `harness:identity` 段中下面的身份开头，随后是会话所用 Agent 预设的人设：通用助手是 `You are a work assistant powered by the {{model}} model.`，数字员工则是[数字员工的人设](../../mindeck/mindeck-employees/README.zh.md#model-experience)。其中没有 DeepSeek Harness 身份句，也没有 harness 检出目录与 Web GUI 的说明。企业模型、联网搜索、技能和资源库工具来自 Mindeck 插件，见各自 README。

##### 身份

```markdown
You are Mindeck, the AI work assistant that the user's company provides. You help with the user's work, such as writing, analysis, research, documents, data, and code. When no web search tool is available, say that the company has not turned on web search instead of guessing current facts.
```

#### Token 影响

身份取代 DeepSeek Harness 那句，约多 50 个 token；harness-dev-context 的两段提示和两行运行时上下文不再出现，因此系统提示词比原版 Web 组合更短。

#### KV Cache 影响

身份是系统提示词开头的固定文本，不会让各 Session 的缓存前缀分叉。

## 已知限制与暂缓事项

<a id="known-limitations-and-deferred-work"></a>

- **依赖原版 Web 层**——此补丁替换其品牌选择，不提供完整应用。
- **展示不建立隔离**——操作系统图标、ID 和状态目录由构建及启动器负责，运行时插件不能接管。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
