---
description: "Mindeck 的 fork 开发约束、上游复用参考与架构设计问题。"
---

# Mindeck 架构

[English](architecture.md) | 中文

## 概述

本文为 Harness monorepo 中的 Mindeck 变更提供参考。Mindeck 扩展现有应用，优先使用已记录的插件扩展点。本文记录复用约定与设计依据，不表示团队产品已实现或已通过验证。

## 目录

- [开发约束](#development-constraints)
- [复用参考](#reuse-references)
- [验证边界](#verification-boundaries)
- [开发备注](#dev-note)

<a id="development-constraints"></a>

## 开发约束

以[上游架构](../architecture.zh.md)作为共享应用参考。Mindeck 业务规则由对应插件和服务负责，复用现有 UI 与会话执行机制。修改共享代码时，按[根规则](../../AGENTS.md)更新现有调用方及文档。产品方向与范围以[产品参考](product.zh.md)为准。

[安装隔离](isolation.zh.md)负责 Mindeck 的应用身份、启动路径与更新策略。

展示层按 `dsh-base` → 原版 `dsh-web-app` → [dsh-mindeck-app](../../packages/bundle/mindeck-app/README.zh.md) 组合。Mindeck 层选择品牌图稿，原版 Web 层保持独立。[产品描述](../../packages/bundle/mindeck-app/src/product.json)提供启动时名称与构建资源，共享[语言包](../../packages/client/locale/README.zh.md)将公开的插值默认值投射到初始文档。[品牌资源](branding.zh.md)负责说明这项接入。运行时图稿 provider 不负责操作系统身份或状态隔离。

<a id="reuse-references"></a>

## 复用参考

选择实现方案前，先查阅以下负责文档所描述的现有机制。

| 关注点 | 上游负责文档 |
|---|---|
| 应用组合与启动 | [架构](../architecture.zh.md) |
| 品牌展示 | [品牌替换](../../packages/client/ui-brand-official/README.zh.md) |
| 角色与系统指令 | [系统提示词](../subsystems/system-prompt.zh.md) |
| 持久化对话状态 | [Session](../subsystems/session.zh.md) |
| 目录与会话分组 | [Workspace](../subsystems/workspace.zh.md) |
| 非 owner 访问决策 | [Remote access](../../packages/api/remote-access/README.zh.md) |
| 实验性共享会话 | [LiveShare](../subsystems/liveshare.zh.md) |

<a id="verification-boundaries"></a>

## 验证边界

Harness Workspace 将目录与会话分组；Mindeck 的项目术语不代表已确定与该记录一一对应。Remote access 和 LiveShare 提供协作机制，但其文档行为不能作为项目成员管理或数据隔离的验收证据。

设计依赖跨用户隔离前，需要验证 [Remote access](../../packages/api/remote-access/README.zh.md)记录的附件存储访问范围，以及 [LiveShare](../subsystems/liveshare.zh.md)记录的 `run_code` 文件策略。上游开发者预览与安全限制以[安全说明](../../SAFETY.zh.md)为准。

<a id="dev-note"></a>

## 开发备注

首版用户流程确定后，补充以下设计问题。长期决策按现有 [Agent Note 规则](../../.agents/notes/README.zh.md)记录。

- [ ] 身份、项目成员、资源归属与授权执行位置。
- [ ] 项目、工作区、会话与消息作者之间的关系。
- [ ] 角色 agent（智能体）定义、指令组装与工具权限。
- [ ] 原始文件存储、知识索引、引用与成果保留。
- [ ] 包职责、持久化要求与升级兼容性。
- [ ] 跨用户验收用例、部署隔离与恢复证据。
