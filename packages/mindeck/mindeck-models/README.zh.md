---
description: "通过 Mindeck Cloud 网关、使用桌面会话提供公司在 Mindeck Cloud 中配置的模型。"
kind: "package-reference"
---

# @deepseek-ai/dsh-mindeck-models

[English](README.md) | 中文

## 概述

使用公司在 Mindeck Cloud 中提供的模型。Mindeck 桌面端登录期间，本插件读取成员的模型目录，并在模型选择器中提供每个模型。请求带着桌面会话令牌发往 Mindeck Cloud 网关，由云端执行公司的模型权限、额度和用量记录。退出登录后这些模型随即移除。

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

在 Host 上于 [Mindeck 账号](../mindeck-account/README.zh.md)和 LLM 服务之后挂载本插件，Mindeck 应用组合包已完成这一步。登录后模型按公司名称分组出现；默认模型指向本机无法使用的模型时，会改为第一个公司模型。

每次登录或退出后、每隔 `refreshIntervalMs`（默认十分钟），以及网关报告模型已不存在后，都会重新读取目录。刷新失败时保留当前模型。`defaultContextWindow` 和 `defaultMaxTokens` 为目录未给出尺寸的模型提供尺寸；`requestTimeoutMs` 限制每次目录请求的时长。

网关拒绝时保留 Mindeck Cloud 自己的消息。401 结束桌面会话并弹出登录对话框。402 表示成员或部门的月度额度已用完，不会重试。404 表示管理员移除了该模型或成员对它的使用权限，随后会重新读取目录。

-----

<a id="understand-the-implementation"></a>
## 了解实现

<details>
<summary>维护者细节 — 点击展开</summary>

插件读取会话 bootstrap 中的 `GET {endpoints.models}`，按客户端接口把模型分成三条 pi-ai 路由：`mindeck-anthropic`（`anthropic-messages`）、`mindeck-openai`（`openai-completions`）和 `mindeck-openai-responses`（`openai-responses`）。路由只在有模型时存在，其端点取第一个模型的网关地址。适配器来自 [llm-pi-ai](../../llm/llm-pi-ai/README.zh.md) 的 `createPiAiAdapter`，因此请求头、图片附件和回放与普通 pi-ai 路由一致；凭据是每次请求时读取的当前会话令牌。目录未变时不改动任何注册。模型有变化的路由会发出 `llm/models-updated`。

`GatewayAdapter` 委托给 pi-ai 适配器并改写错误结束块。它从 SDK 的失败文本中读出 HTTP 状态和网关的 `error.message`：401 映射为 `ACCOUNT_TOKEN_INVALID` 并把令牌报告给 `mindeckAccount.rejectToken`，402 映射为 `QUOTA`，403 映射为 `AUTH`，404 映射为 `UNKNOWN_MODEL`，其他错误码保持不变。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [Mindeck 账号](../mindeck-account/README.zh.md) — 本插件使用的桌面会话。
- [llm-pi-ai](../../llm/llm-pi-ai/README.zh.md) — 路由背后的适配器。
- [Mindeck 开发文档](../../../docs/mindeck/README.zh.md) — Mindeck 应用及其云端服务。

-----

<a id="model-experience"></a>
## 模型体验

### 公司模型请求

#### What the model sees

发往 `mindeck-anthropic`、`mindeck-openai` 和 `mindeck-openai-responses` 的请求不包含本插件添加的模型可见文本；pi-ai 按路由的客户端接口序列化每个请求。网关把模型名换成管理员配置的上游模型后原样转发。

#### Token effect

本插件不增加输入 token。目录为每个模型设定上下文窗口和输出上限，缺省时取 `defaultContextWindow` 与 `defaultMaxTokens`，每个请求记录的上下文和请求头会记下这些值。

#### KV Cache effect

会话令牌和目录不进入模型输入。提示缓存取决于网关背后的上游模型服务。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 云端目录不含模型的推理等级和价格；路由使用 pi-ai 的默认值。
- 网关 502（例如上游密钥问题）会像其他服务器错误一样先重试，之后才显示其消息。

-----

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者细节 — 点击展开</summary>

无。

</details>
