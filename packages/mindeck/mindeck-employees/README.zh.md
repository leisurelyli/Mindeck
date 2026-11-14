---
description: "把企业在 Mindeck Cloud 中设置的数字员工注册为带有各自人设的 Agent 预设，并在数字员工页面中提供它们。"
kind: "package-reference"
---

# @deepseek-ai/dsh-mindeck-employees

[English](README.md) | 中文

## 概述

与企业的数字员工开始对话。管理员在 Mindeck Cloud 中设置每位数字员工：岗位名称、头像、一句话介绍、岗位说明、最多 4 条示例请求、建议技能、默认模型，以及它查阅的资源库文件夹。本插件把每位员工注册为一个 Agent 预设，人设写明其岗位和资料文件夹，对话使用其默认模型开始；另注册新对话默认使用的通用助手 `mindeck-general`。**数字员工**页面可以与其中任意一位开始对话，空白对话的预设选择器可以在员工之间切换。

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

在 Host 上于 [Mindeck 账号](../mindeck-account/README.zh.md)和 [Agent 预设注册表](../../preset/agent-preset-registry/README.zh.md)之后挂载本插件。Mindeck 应用组合包会这样做，并把 `mindeck-general` 设为注册表的默认预设。

| 字段 | 默认值 | 含义 |
|---|---|---|
| `basePreset` | `standard` | 所有 Mindeck 预设沿用其插件行的预设 |
| `generalPersona` | `You are a work assistant powered by the {{model}} model.` | 通用助手的人设前缀 |
| `cacheDir` | `''` | 缓存目录；为空时使用 DeepSeek Harness 主目录下的 `mindeck` |
| `refreshIntervalMs` | `600000` | 登录期间两次兜底刷新的间隔 |
| `retryIntervalMs` | `15000` | 刷新失败后的首次等待时间，之后逐次加倍，最多到 `refreshIntervalMs` |
| `requestTimeoutMs` | `15000` | 单次 Mindeck Cloud 请求的超时时间 |
| `modelProviders` | `['mindeck-anthropic', 'mindeck-openai', 'mindeck-openai-responses']` | 按顺序查找员工默认模型的模型提供方；第一个列出该 id 的提供方负责它 |

预设列表中通用助手名为**通用助手**，英文界面为 **General assistant**，排在最前。每位员工的预设是 `mindeck-employee-<Cloud id>`，名称为岗位名称，说明为一句话介绍，二者都按 Mindeck Cloud 中的原文显示；管理员自己的草稿只有该管理员能收到，名称后加**（草稿）**，英文界面为 **(draft)**。插件在每次登录或退出后、[账号的同步](../mindeck-account/README.zh.md#use-this-package)报告 `employees` 有变化时（管理员的改动因此约 1 分钟内到达桌面端）、作为兜底每隔 `refreshIntervalMs`，以及刷新失败后按 `retryIntervalMs` 的规则刷新；401 会结束桌面会话。bootstrap 中没有 `endpoints.employees` 的 Mindeck Cloud 不提供数字员工。

只有预设仍在注册时，对话才能继续，因此离开 Cloud 列表的员工会以已停用状态保留注册：名称后加**（已停用）**，说明为“管理员已停用这位数字员工，可以继续之前的对话。”，英文界面为 **(deactivated)** 和“An administrator deactivated this digital employee. Earlier conversations can continue.”，排在最后，保留最后的人设，并带 `listed: false`：预设选择器只在已经使用它的对话里显示它，注册表也拒绝把别的对话切换到它。启动时，插件先注册已保存的员工，再请求 Mindeck Cloud。退出登录后这些预设仍然保留。另一位成员在同一台电脑上登录时，上一位成员的员工预设会移除，新成员已保存的员工随即注册。

空白对话得到员工的预设时，无论是以该预设打开，还是在预设选择器中切换过去，都会通过 `modelProviders` 中第一个列出员工默认模型的提供方选择该模型。没有提供方列出它时，对话保留原来的模型，Host 记录一条警告。空白对话从这位员工切换到没有默认模型的预设（例如通用助手）时，会重新选择部署的默认模型，除非成员在此期间选了别的模型。对话的第一轮开始后模型不再变化，恢复对话也不会重新选择。员工的资料文件夹写在它的人设里（见[模型体验](#model-experience)），[mindeck-files](../mindeck-files/README.zh.md) 的 `library_search` 按资源库路径在其中一个文件夹里搜索。不发送这两个字段的 Mindeck Cloud 让每位员工都没有默认模型和资料文件夹。

企业至少提供一位员工时，客户端入口 `@deepseek-ai/dsh-mindeck-employees/client` 会在左侧栏“插件”之前加入**数字员工**，其页面显示在主区域。页面先显示通用助手，再显示每位当前员工，附头部到胸口的人物横幅（Mindeck Cloud 的 24 个头像键各有一张随包附带的插图，画在柔和的底色上，深色模式下底色调暗；未知的键，例如较新的 Mindeck Cloud 新增的键，或加载失败的图片在带色方块上显示名称开头的英文单词或数字，例如 `IT 帮助台` 显示 `IT`，否则显示前两个字）、一句话介绍、示例请求，以及（如果有）**资料**下的资料文件夹和**模型**下的默认模型名称；已停用的员工不列出，草稿带**草稿**标记，通用助手的卡片提供 3 条通用请求。单击卡片会通过 [Mindeck 账号](../mindeck-account/README.zh.md)的 `mindeckComposer` 在当前工作区以该卡片的预设打开一个空白对话，光标位于输入框；单击示例请求还会把它填入输入框，但不会发送。对话显示之前，页面上的所有操作都会等待。企业不再提供员工或成员退出登录时，左侧栏的这一行随之移除。成员所在部门无权打开的文件夹在名称后显示**（你暂无权限）**，鼠标悬停在资料上会显示每个文件夹的路径；企业模型中没有列出的默认模型不显示。

其他 Host 插件可以调用 `ctx.mindeckEmployees.foldersForSession(sessionId)`，得到进行中对话所属员工的资料文件夹，每个都带资源库路径和成员能否打开；通用助手和其他预设返回 undefined。[mindeck-files](../mindeck-files/README.zh.md) 用它限定 `library_search` 的范围。

其他 Host 插件可以调用 `ctx.mindeckEmployees.employeeForSession(sessionId)`，得到进行中对话所属员工的 Cloud id；通用助手和其他预设返回 undefined。[mindeck-models](../mindeck-models/README.zh.md) 会在网关请求中带上它。

-----

<a id="understand-the-implementation"></a>
## 了解实现

<details>
<summary>维护者细节——点击展开</summary>

`agentPresets.readDocument(basePreset)` 以 entry-list YAML 返回基础预设的插件行，插件用 Loader 的 `entryListSchema` 解析，`!!js` 条件因此保持为表达式。每个 Mindeck 预设复制这些行，把每个顶层 `@deepseek-ai/dsh-persona` 行的整个 config 替换为 `{ prefix }`；没有这种行时，在最前面加一行人设。插件启动时基础预设自己的行可能仍在激活，因此找不到基础预设时会等待 Host Loader 稳定一次，之后仍找不到就让本次刷新失败，记录日志并重试。

所有注册变更都在同一个刷新循环中进行。刷新时逐个比较期望的定义与已注册的定义，只替换不同的那些；注册表不接受同一 id 的第二个定义，所以先释放旧注册。不再需要的预设会被释放。释放插件时停止循环并释放所有注册。

`cacheDir` 中的 `employees.json` 记录最后登录的成员，并按成员（Cloud 地址和用户 id）记录员工：先是 Cloud 顺序的当前员工，再是已停用的员工。新的 Cloud 列表替换该成员的当前员工；缓存中不在列表里的员工变为已停用。id 含 `[A-Za-z0-9_-]` 以外字符、缺少名称或 id 重复的条目会被跳过；示例请求去掉首尾空白，最多保留 4 条，技能名必须是有效的技能名。缺少条目 id 或 id 重复的文件夹会被跳过，没有 `accessible` 的文件夹视为可以打开，Mindeck Cloud 的 `空间 / 文件夹` 路径转为资源库路径 `/空间/文件夹`；没有这些字段的缓存条目读作没有默认模型和资料文件夹。

模型选择监听新对话的 `agent/created` 和切换预设的 `agent-preset/selected`。只有对话还没有任何一轮时才追加 `model/selection`，并且排在触发它的预设选择追加之后；插件按 Agent 记住自己做的选择，因此切走时只在当前模型仍是它选的模型时才恢复部署默认值。

`ctx.mindeckEmployees.watch()` 通过 `mindeckEmployees` Remote 推送 `MindeckEmployeeCatalog`：先是通用助手，再是预设已注册的当前员工，不含已停用员工。每张卡片的模型名称来自 `modelProviders` 的 `llm.listModels`，因此收到 `llm/models-updated` 时会重新推送列表。`employeeForSession` 通过 `agentPresets.presetForSession` 读取 Session 的预设，只对当前已注册其预设的成员的员工给出结果。推送的列表首次出现员工时，客户端同时在根 `main` 插槽注册页面、以 order -30 在 `sidebar.panellist` 注册这一行；列表中没有员工时两者一起释放。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [Agent 预设注册表](../../preset/agent-preset-registry/README.zh.md) — 预设如何组合并恢复对话。
- [人设行](../../preset/persona/README.zh.md) — 每个预设替换的人设。
- [Mindeck 开发文档](../../../docs/mindeck/README.zh.md) — Mindeck 应用及其云端服务。

-----

<a id="model-experience"></a>
## 模型体验

### 数字员工人设

#### What the model sees

在与数字员工的对话中，`deployment:persona-prefix` 段是下面的文本，并填入企业设置的值；身份、其他段落和工具来自基础预设与部署配置。没有一句话介绍时省略 `Your role:`，没有岗位说明时省略说明段，没有建议技能时省略技能那句，没有资料文件夹时省略文件夹段。每个文件夹一行，写出它在 Mindeck Cloud 中的名称和资源库路径；成员无权打开的文件夹也会列出，由 `library_search` 加以说明。企业文本中相邻的花括号之间会加一个空格，因此不会构成提示词变量。

##### 员工人设

```markdown
You are "<name>", a digital employee of the user's company, powered by the {{model}} model. Your role: <tagline>

The company's instructions for this role:

<instructions>

The company suggests these skills for this role: /<skill>, /<skill>. Use them when they fit the task.

The company keeps the material for this role in these file library folders:

- <label>: folder "/<Space>/<folder>"

Before answering a question this material may cover, search it with library_search, setting folder to one of these folders, instead of answering from memory. Read the files you find with library_download, name the files your answer relies on, and say so when the material does not cover the question.
```

#### Token effect

固定文本约 40 个 token；文件夹段另加约 70 个，每个文件夹再加约 10 个；企业填写的名称、介绍、岗位说明、技能名以及文件夹名称和路径按各自长度增加，岗位说明不会被截短。

#### KV Cache effect

人设位于系统提示词靠前的位置，因此与不同员工的对话只共享它之前的身份缓存。管理员修改员工后，在刷新之后启动 Agent 的对话使用新人设；恢复的对话因此不再匹配之前缓存的前缀。

### 通用助手人设

#### What the model sees

在与通用助手的对话中，`generalPersona` 替换基础预设的人设；默认是 `You are a work assistant powered by the {{model}} model.`

#### Token effect

默认人设约 10 个 token，与它替换的基础人设长度相同。

#### KV Cache effect

该人设是固定的部署文本，不会随请求或对话变化。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- **已停用员工一直保留注册**——它们会一直缓存并注册，企业每停用一位员工，预设列表就多一项；选择器会隐藏它们，但不会移除。
- **基础预设菜单列出它上次读取的预设列表**——菜单在打开新对话时读取列表，因此菜单打开期间新到的员工要到下一次新对话才出现；数字员工页面会立即更新。
- **每位员工都挂载完整的插件树**——注册表会立即组合每个预设，因此内存和启动时间随员工数量增加。
- **注册之前无法恢复对话**——启动时在已保存员工注册之前打开的员工对话，以及其他成员的员工对话，在预设注册之前会报告预设不存在。
- **企业模型中没有列出的默认模型对成员静默跳过**——对话保留原来的模型，只有 Host 日志说明原因。
- **每个主目录只有一个缓存文件**——共用同一 Mindeck 主目录的两个 Host 同时刷新时都会替换 `employees.json`，以最后一次写入为准。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者细节——点击展开</summary>

None.

</details>
