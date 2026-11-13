---
description: "基于原版 Web 组合的 Mindeck 展示层。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-mindeck-app

[English](README.md) | 中文

## 概述

此层在原版 Web 应用上展示 Mindeck 图稿。Mindeck Desktop 的自有 profile 包含此层；源码 Web 启动器通过 `--patch` 选择其补丁。它修改展示和智能体人设，安装身份和状态路径仍由 Mindeck 启动器控制。该包同时拥有共享产品描述 `src/product.json`，Desktop 与 Web 启动器从中读取产品名称和构建资源；该描述不提供运行时服务。

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

成员使用 Mindeck Cloud 账号登录，并使用公司在 Mindeck Cloud 中配置的模型、技能和资源库。此层加入[账号](../../mindeck/mindeck-account/README.zh.md)、[公司模型](../../mindeck/mindeck-models/README.zh.md)、[公司技能](../../mindeck/mindeck-skills/README.zh.md)和[资源库](../../mindeck/mindeck-files/README.zh.md)插件。它禁用 DeepSeek 账号及其登录界面、DeepSeek 模型提供商与联网搜索、来自个人设置的 `llm-pi-ai` 路由，以及填写个人 API Key 的模型设置页。因此每个模型请求都经过 Mindeck Cloud 网关，并按公司额度计量。首次使用时创建的默认工作区位于 `<Documents>/Mindeck`，与官方 DeepSeek Harness 安装的文件夹分开。

智能体以公司工作助手 Mindeck 的身份自我介绍：此层用 Mindeck 人设替换 DeepSeek Harness 身份和编程智能体人设，并禁用向模型说明 harness 检出目录与 Web GUI 的 [harness-dev-context](../../context/harness-dev-context/README.zh.md)。它还禁用 [Session log 上传设置](../../client/ui-settings-session-log/README.zh.md)，因为上传只随发往 DeepSeek API 提供方的请求进行，而此层不包含该提供方。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

manifest（元数据清单）将 `dsh.bundle.patch` 声明为 [`cordis.patch.yml`](cordis.patch.yml)。该补丁按 id 禁用官方品牌和被替换的行，插入 Mindeck 插件，设置工作区控制器的 `documentsFolder`，并把 `system-prompt` 配置替换为 `includeHarnessIdentity: false` 和 Mindeck 的 `personaPrefix`。它不添加服务或可变运行时状态；所选插件负责注册与清理。后续补丁遵循普通 profile 优先级。

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

### Mindeck 人设

#### 模型看到什么

系统提示词在部署人设前缀段开头放入下面的人设，`{{model}}` 替换为所选模型的名称。其中没有 DeepSeek Harness 身份句、Web 层的编程智能体人设，也没有 harness 检出目录与 Web GUI 的说明。公司模型、技能和资源库工具来自 Mindeck 插件，见各自 README。

##### 人设前缀

```markdown
You are Mindeck, the AI work assistant that the user's company provides, powered by the {{model}} model. You help with the user's work, such as writing, analysis, research, documents, data, and code.
```

#### Token 影响

该人设取代身份句、Web 人设，以及 harness-dev-context 的两段提示和两行运行时上下文，因此系统提示词比原版 Web 组合更短。

#### KV Cache 影响

人设对每个模型是固定文本，因此使用同一模型的 Session 共享缓存前缀。

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
