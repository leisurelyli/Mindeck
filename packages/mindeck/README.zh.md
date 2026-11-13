---
description: "Mindeck 企业版的包映射：Mindeck Cloud 账号、企业模型、企业技能、企业资源库、数字员工和企业消息。"
kind: "package-group"
---

# mindeck/：Mindeck 企业版

[English](README.md) | 中文

## 概述

`mindeck/` 组把 Mindeck Desktop 连接到企业的 Mindeck Cloud。使用 `mindeck-account/` 设置 Cloud 地址、完成设备登录并同步企业的改动，`mindeck-models/` 提供企业模型，`mindeck-skills/` 提供企业技能，`mindeck-files/` 提供企业资源库，`mindeck-employees/` 提供企业的数字员工，`mindeck-inbox/` 提供企业消息。[Mindeck 应用组合包](../bundle/mindeck-app/README.zh.md)组合这六个包；官方 DeepSeek Harness 的 profile 不加载它们。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

账号包持有 Cloud 会话，并负责报告企业数据变化的同步；其余包在每次 Cloud 请求时读取会话，按同步报告的变化刷新，并保留 10 分钟一次的兜底刷新。模型、技能和资源库在退出登录后不再提供企业内容；数字员工保留注册，以便继续已有对话。从组合中去掉 `mindeck-inbox` 只会去掉它的侧栏行和页面。各包 README 说明用法与配置；子系统参考负责共享契约。

| 包 | 作用 | ctx 键 |
|---|---|---|
| [`mindeck-account/`](mindeck-account/README.zh.md) | Cloud 地址、设备登录、保存的会话、与企业改动的同步、全屏登录和账号页 | `ctx.mindeckAccount` |
| [`mindeck-models/`](mindeck-models/README.zh.md) | 把企业模型作为经计量 Cloud 网关的模型路由提供 | — |
| [`mindeck-skills/`](mindeck-skills/README.zh.md) | 缓存在本机、由技能提供方提供并在技能页列出的企业技能 | `ctx.mindeckSkills` |
| [`mindeck-files/`](mindeck-files/README.zh.md) | 资源库工具、右侧栏面板、资源库页面和 `library:` 引用 | `ctx.mindeckFiles` |
| [`mindeck-employees/`](mindeck-employees/README.zh.md) | 作为 Agent 预设的数字员工、通用助手和数字员工页面 | `ctx.mindeckEmployees` |
| [`mindeck-inbox/`](mindeck-inbox/README.zh.md) | 企业消息：左侧栏带未读数的公告和个人通知、已读上报和推荐版本 | `ctx.mindeckInbox` |

-----

<a id="related-documentation"></a>
## 相关文档

- [Mindeck 子系统参考](../../docs/subsystems/mindeck.zh.md)：归属、账号会话契约和生成的 Cordis 接口。
- [Mindeck 开发文档](../../docs/mindeck/README.zh.md)：产品范围、隔离、品牌和上游同步。

<a id="dev-note"></a>
## 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
