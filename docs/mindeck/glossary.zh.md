---
description: "Mindeck 业务术语，以及它们与 Harness 实现类型的区别。"
---

# Mindeck 术语表

[English](glossary.md) | 中文

## 概述

本文定义 Mindeck 需求中使用的业务术语。这些定义不确定数据库 schema、API 或首版实现。Harness 技术术语仍以[上游术语表](../glossary.zh.md)为准。

## 目录

- [术语](#terms)
- [维护](#maintenance)
- [开发备注](#dev-note)

<a id="terms"></a>

## 术语

讨论范围与验收时，使用以下含义。

| 术语 | 含义 |
|---|---|
| 项目 | 多名真人共享资料、角色 agent（智能体）、对话与成果的业务分组。 |
| 成员 | 参与项目的真人，具体成员关系与权限规则仍需设计。 |
| 角色 agent | 配置了角色与系统指令的 agent，角色本身不授予访问权限。 |
| 知识库 | 为检索与 agent 使用而组织的可复用来源资料。 |
| 文件资源库 | 对可复用原始文件与产出文件的持久存储和组织。 |
| 成果 | 协作中产生的工作结果，包括文本与文件，保留规则仍需设计。 |
| Harness Workspace | [Workspace 参考](../subsystems/workspace.zh.md)定义的上游目录与会话分组。 |

<a id="maintenance"></a>

## 维护

术语含义影响需求、API 或设计决策时再添加。在此保留单一定义，适当引用上游定义，并同步更新两种语言。业务术语到实现类型的对应关系由负责该设计的架构或包文档说明。

<a id="dev-note"></a>

## 开发备注

项目与 Harness Workspace 或 Session 的对应关系尚未确定。知识索引、文件版本与成果评审术语只在相应产品决策需要时补充。
