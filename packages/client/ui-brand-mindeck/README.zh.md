---
description: "在侧栏、会话首页和桌面首次引导中显示 Mindeck 品牌内容。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-mindeck

[English](README.md) | 中文

## 概述

在侧栏和空白会话首页显示 Mindeck 品牌，在桌面首次引导中展示工作区截图。空白首页标语为“开始今天的工作”并带“企业版”徽标，输入框提示使用办公语气。两个标志均使用提供的 SVG，保留原始蓝色和青色。展示内容为静态，不增加模型请求。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在部署的 Cordis 组合中将本包选为品牌条目，与语言、渲染器、侧栏和会话插件一起加载：

```yaml
- name: '@deepseek-ai/dsh-client-ui-brand-mindeck'
```

此条目没有配置项。选择本包替代 `@deepseek-ai/dsh-client-ui-brand-official`；官方包仍可用于上游组合。品牌选择由组合决定，不依赖客户端构建配置。将部署的 locale `parameters.productName` 设置为 `Mindeck`；品牌字典使用 `{productName}`，未设置时继承共享的上游默认值。本插件遵循宿主指定的标志尺寸，不添加鲸鱼背景。

[账号设置](../ui-settings-account/README.zh.md#desktop-onboarding)声明插图槽位时，欢迎页与额度页共用本包的工作区截图，覆盖英文、中文与明暗主题。没有此声明时，插件仅提供侧栏和会话品牌内容。

插件通过 `ctx.locale.override` 覆盖 `conversation` 命名空间的四条中英文文案：空白首页标语、徽标和两条输入框提示。其他语言保留上游文案。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

[浏览器入口](src/client/index.ts) 通过 `locale` 注册 `mindeck` 字典，等待三个槽位全部声明后，一起填充 `sidebar.brand.mark`、`sidebar.brand.name` 和 `conversation.hero.brand.mark`。槽位效果在声明消失时撤销整组占用，重新声明后恢复；卸载插件同时移除其字典。[组件](src/client/Brand.tsx) 通过属性接收尺寸和类型化翻译函数。共享客户端打包器导入未修改的[规范 SVG](src/client/assets/mindeck.svg)，生成包资源地址。宿主入口不执行操作。

[引导插图](src/client/OnboardingIllustration.tsx)通过 `ctx.slots.inject` 和 `register` 独立填充 `desktop.onboarding.illustration`。它通过仅类型依赖接收账号包拥有的 `step`、`locale` 和 `className`，定位仍由账号步骤负责。两个步骤共用四张 WebP 资源。声明消失时撤销占用，重新声明后恢复；卸载插件后恢复账号包提供的上游默认图稿。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

以下文档负责扩展槽位和客户端加载规则。

- [侧栏](../ui-sidebar/README.zh.md) — 侧栏品牌槽位。
- [会话](../ui-conversation/README.zh.md) — 首页标志尺寸。
- [Web 客户端架构](../../../docs/subsystems/web-client.zh.md) — 客户端插件组合。

-----

<a id="model-experience"></a>
## 模型体验

无，本包仅贡献浏览器展示内容，不向模型请求添加任何信息。

#### KV 缓存影响

无，本包不组装或发送模型提供方请求。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

本包负责三个品牌槽位内容和可选的引导插图槽位内容。

- 应用图标、浏览器标题和安装程序标识由对应平台负责。
- 三个品牌槽位必须全部声明后才会显示侧栏与首页标志；引导插图的注册独立进行。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
