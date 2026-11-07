---
description: "Mindeck 产品与工程参考、文档归属，以及本地开发模板。"
---

# Mindeck 文档

[English](README.md) | 中文

## 概述

本文是公开 DeepSeek Harness fork 中 Mindeck 开发的参考入口，区分已确定的产品方向与待解决的实施问题。以下页面为开发提供依据，不代表已通过运行验收。

## 目录

- [阅读顺序](#reading-order)
- [文档归属](#document-ownership)
- [本地工作](#local-work)
- [开发备注](#dev-note)

<a id="reading-order"></a>

## 阅读顺序

先阅读产品范围，再选择实施方案，并查阅架构与维护参考。

1. [产品](product.zh.md)：已确定目标与待定范围。
2. [架构](architecture.zh.md)：复用策略、上游参考与设计问题。
3. [上游同步](upstream-sync.zh.md)：集成约定与验证记录。
4. [术语表](glossary.zh.md)：Mindeck 业务术语。
5. [安装隔离](isolation.zh.md)：应用身份、独立状态与发布限制。
6. [品牌资源](branding.zh.md)：主图稿、平台生成与界面接入。

<a id="document-ownership"></a>

## 文档归属

每项事实保留在其负责文档中，其他文档通过链接引用。

| 材料 | 位置 | 维护约定 |
|---|---|---|
| Mindeck 产品与跨包设计 | `docs/mindeck/` | 随受影响的实现维护，明确标注尚未解决的设计问题。 |
| 共享的 Harness 架构与 API | 现有上游文档 | 共享行为变化时更新负责文档，通过链接引用，不复制内容。 |
| 包行为与配置 | 对应包的 README 与 JSDoc | 与代码一起更新。 |
| 长期决策理由 | `.agents/notes/` | 沿用现有生命周期与命名规则，Mindeck 专属文件名包含 `mindeck`。 |
| 当前规格与工单 | `.scratch/<feature>/` | 本地保存并由 Git 忽略；长期知识归入对应正式文档。 |
| 业务资料、账号与密钥 | 此工作区外的私有目录 | 不写入受版本管理的文档、fixture（测试前置数据）或公开 Issue 的附件。 |

这些位置遵循[根规则](../../AGENTS.md)、[文档规范](../AGENTS.md)和 [Agent Note 规则](../../.agents/notes/README.zh.md)。正式文档沿用现有[中英双语配对规则](../i18n/README.zh.md)，本地工单可以使用团队的工作语言。

<a id="local-work"></a>

## 本地工作

使用[规格模板](templates/spec.zh.md)编写 `.scratch/<feature>/spec.md`，使用[工单模板](templates/issue.zh.md)编写 `.scratch/<feature>/issues/<NN>-<slug>.md`。一票一文件，以相对路径声明依赖，并在负责该验收项的工单中记录证据。仓库中的模板不包含实际产品任务。

每张工单选择一个分诊值：`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human` 或 `wontfix`。分诊表示下一步需要哪类处理，执行进度在工单中单独记录。本地工单不等于备份或团队共享记录；交接时需要明确提供所需规格与工单，并避免公开私有材料。

<a id="dev-note"></a>

## 开发备注

MVP 选择与实施拆分尚未确定。创建实施工单前，先在本地规格中记录已确认范围；这些模板不构成产品实施或部署授权。
