---
description: "基于原版 Web 组合的 Mindeck 展示层。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-mindeck-app

[English](README.md) | 中文

## 概述

此层在原版 Web 应用上展示 Mindeck 图稿。Mindeck Desktop 的自有 profile 包含此层；源码 Web 启动器通过 `--patch` 选择其补丁。它修改展示，安装身份和状态路径仍由 Mindeck 启动器控制。

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

在 `@deepseek-ai/dsh-base` 和 `@deepseek-ai/dsh-web-app` 之后应用此组合包。Desktop 将这些层按此顺序放在用户扩展组合包之前。仓库的 `start:web` 和 `dev:web` 脚本将 `packages/bundle/mindeck-app/cordis.patch.yml` 选为本次调用的补丁。手动管理 profile 时，遵循 [Plugin Manager](../../boot/plugin-manager/README.zh.md#use-this-package) 与 [profile 分层规则](../../boot/app-boot/README.zh.md#profiles)。

此层禁用 `ui-brand-official`，选择 [Mindeck 品牌插件](../../client/ui-brand-mindeck/README.zh.md)提供侧栏、空白会话和首次引导图稿。原版 Web 组合包保持独立于 Mindeck。Mindeck 启动器通过[语言参数](../../client/locale/README.zh.md#use-this-package)提供公开的产品名称；此补丁不配置这些值。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

manifest（元数据清单）将 `dsh.bundle.patch` 声明为 [`cordis.patch.yml`](cordis.patch.yml)。该补丁按 id 禁用官方品牌行，并插入 Mindeck provider。它不添加服务或可变运行时状态；所选插件负责注册与清理。后续补丁遵循普通 profile 优先级。

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

无，因为此组合包只选择 UI 图稿，不添加提示词、工具或 Session 事件。

#### KV Cache 影响

无；此层不添加提供方请求内容。

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
