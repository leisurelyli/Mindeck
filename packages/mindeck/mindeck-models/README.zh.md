---
description: "通过 Mindeck Cloud 网关、使用桌面会话提供公司在 Mindeck Cloud 中配置的模型和联网搜索。"
kind: "package-reference"
---

# @deepseek-ai/dsh-mindeck-models

[English](README.md) | 中文

## 概述

使用公司在 Mindeck Cloud 中提供的模型和联网搜索。Mindeck 桌面端登录期间，本插件读取成员的模型目录，并在模型选择器中提供每个模型；公司开启联网搜索时，还提供联网搜索。请求和搜索都带着桌面会话令牌发往 Mindeck Cloud 网关，由云端执行公司的模型权限、额度和用量记录。退出登录后，这些模型和搜索随即移除。

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

每次登录或退出后、每隔 `refreshIntervalMs`（默认十分钟），以及网关报告模型已不存在后，都会重新读取目录。读取失败时保留当前模型，并在 `retryIntervalMs`（默认 15 秒）后重试，此后每失败一次等待时间加倍，最长为 `refreshIntervalMs`。每次读到的目录保存到 `cacheDir` 下的 `models-catalog.json`（为空时使用 DeepSeek Harness 主目录下的 `mindeck`）；启动时，在云端应答之前先提供该成员在同一 Mindeck Cloud 下保存的目录。公司推荐的模型排在前面，并在模型选择器中带**推荐**徽标；公司对模型的说明随模型列表提供。`defaultContextWindow` 和 `defaultMaxTokens` 为目录未给出尺寸的模型提供尺寸；`requestTimeoutMs` 限制每次目录请求的时长。

存在[网页服务](../../web/web/README.zh.md)时，插件注册 `mindeck-search` 搜索提供方，Mindeck 应用组合包通过 `web.searchProvider` 选中它。每次读取目录时，也会读取 `GET {endpoints.webSearch}`：公司开启搜索时，模型步骤可以使用 `web_search`；关闭时则不提供。一次搜索把查询词、结果条数（`searchCount`，默认 10，调用方给出更小的上限时取其值）和成员最近的提问（截断到 128 个字符）发给网关。网关使用公司的 DeepSeek 密钥，把这次搜索计入成员的额度和每日搜索次数，再返回 DeepSeek 搜索接口的结果。网关拒绝时的消息（例如额度或当天次数已用完）就是模型读到的搜索失败原因。没有联网搜索的 Mindeck Cloud 不提供搜索。

网关拒绝时保留 Mindeck Cloud 自己的消息。401 结束桌面会话并弹出登录对话框。402 表示成员或部门的月度额度已用完，不会重试。403 表示账号当前不能使用模型，例如账号已停用或尚未修改初始密码，对话中显示 Cloud 给出的原因。404 表示管理员移除了该模型或成员对它的使用权限，随后会重新读取目录。会话结束后才开始的请求不会发出，并以“已退出 Mindeck 公司账号，请登录后重试。”失败。

-----

<a id="understand-the-implementation"></a>
## 了解实现

<details>
<summary>维护者细节 — 点击展开</summary>

插件读取会话 bootstrap 中的 `GET {endpoints.models}`，按客户端接口把模型分成三条 pi-ai 路由：`mindeck-anthropic`（`anthropic-messages`）、`mindeck-openai`（`openai-completions`）和 `mindeck-openai-responses`（`openai-responses`）。每条路由都显示公司名称，因此模型选择器把这些模型列在同一个标题下，而不是按协议分组。路由只在有模型时存在，其端点取第一个模型的网关地址。网关适配器在路由的模型列表中补上每个模型的说明，并给推荐模型加上 `RECOMMENDED_BADGE`。适配器来自 [llm-pi-ai](../../llm/llm-pi-ai/README.zh.md) 的 `createPiAiAdapter`，因此请求头、图片附件和回放与普通 pi-ai 路由一致；凭据是每次请求时读取的当前会话令牌。在与[数字员工](../mindeck-employees/README.zh.md)的对话中，`llm-pi-ai/request-headers` 监听器会给这些路由的请求加上 `x-mindeck-employee`，值为该员工在 Mindeck Cloud 中的 id；对话发起的搜索也带同一个请求头，便于 Mindeck Cloud 归属用量。目录未变时不改动任何注册。模型有变化的路由会发出 `llm/models-updated`。

`MindeckSearchProvider` 在读到已登录成员的搜索状态后可用，在状态为开启时就绪，因此网页服务会选中它，但公司关闭搜索时模型步骤不会使用 `web_search`。搜索结果先经 zod 校验，再转成网页来源。搜索接口返回 401 时，把令牌报告给 `mindeckAccount.rejectToken`；状态读取失败时，本次会话保留上一次的状态。

`GatewayAdapter` 委托给 pi-ai 适配器并改写错误结束块。它从 SDK 的失败文本中读出 HTTP 状态和网关的 `error.message`：401 映射为 `ACCOUNT_TOKEN_INVALID` 并把令牌报告给 `mindeckAccount.rejectToken`，402 映射为 `QUOTA`，403 映射为 `ACCOUNT_UNAVAILABLE`，404 映射为 `UNKNOWN_MODEL`，其他错误码保持不变。没有会话的请求以 `MINDECK_SIGN_IN_REQUIRED` 失败。对话界面对未翻译的错误码直接显示消息，因此这些 Mindeck 错误码带中文说明，不再显示 DeepSeek 账号与 API 密钥的文案。

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

### 公司联网搜索

#### What the model sees

公司开启搜索时，模型看到 [tool-web](../../web/tool-web/README.zh.md) 的 `web_search` 工具，结果是 DeepSeek 搜索接口返回的标题、URL、摘要、概要和日期。被拒绝时，模型读到网关的中文消息，例如当天的搜索次数已用完。

#### Token effect

工具定义和每次结果都计入输入 token，受 tool-web 的结果上限约束。

#### KV Cache effect

开启或关闭搜索会改变步骤可用的工具，请求的工具列表从那一步起随之变化。

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
