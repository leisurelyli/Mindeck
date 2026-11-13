---
description: "Mindeck 企业版的包映射：Mindeck Cloud 账号、公司模型、公司技能和公司资源库。"
kind: "package-group"
---

# mindeck/：Mindeck 企业版

[English](README.md) | 中文

## 概述

`mindeck/` 组把 Mindeck Desktop 连接到公司的 Mindeck Cloud。使用 `mindeck-account/` 设置 Cloud 地址并完成设备登录，`mindeck-models/` 提供公司模型，`mindeck-skills/` 提供公司技能，`mindeck-files/` 提供公司资源库。[Mindeck 应用组合包](../bundle/mindeck-app/README.zh.md)组合这四个包；官方 DeepSeek Harness 的 profile 不加载它们。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

账号包持有 Cloud 会话；其余三个包在每次 Cloud 请求时读取它，退出登录后不再提供公司内容。各包 README 说明用法与配置；子系统参考负责共享契约。

| 包 | 作用 | ctx 键 |
|---|---|---|
| [`mindeck-account/`](mindeck-account/README.zh.md) | Cloud 地址、设备登录、保存的会话和登录遮罩 | `ctx.mindeckAccount` |
| [`mindeck-models/`](mindeck-models/README.zh.md) | 把公司模型作为经计量 Cloud 网关的模型路由提供 | — |
| [`mindeck-skills/`](mindeck-skills/README.zh.md) | 缓存在本机、由技能提供方提供并在技能页列出的公司技能 | `ctx.mindeckSkills` |
| [`mindeck-files/`](mindeck-files/README.zh.md) | 资源库工具、侧栏页面和 `library:` 引用 | `ctx.mindeckFiles` |

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
