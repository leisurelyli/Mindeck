---
description: "Mindeck 上游集成约定，以及经过评审的同步工作记录格式。"
---

# 上游同步

[English](upstream-sync.md) | 中文

## 概述

本文约定维护者如何评审 Mindeck 要接收的上游变更。项目保留公开 fork 关系，集成时同时保留上游历史和 Mindeck 改动。这是维护约定，不是已执行的同步记录，也不是经过验证的命令教程。

## 目录

- [集成约定](#integration-policy)
- [定制维护](#customization-maintenance)
- [共享代码改动](#shared-code-changes)
- [同步记录](#synchronization-record)
- [开发备注](#dev-note)

<a id="integration-policy"></a>

## 集成约定

从当前 Mindeck 开发分支创建专门的同步分支。确认目标上游版本，阅读其升级说明，并保留历史合入该分支。解决冲突时保留双方需要的行为，评审合并后的变更，相关检查通过后通过 PR（Pull Request）集成。

按 [dsh-pre-push-checks](../../.agents/skills/dsh-pre-push-checks/SKILL.md)选择检查。记录需要区分文本合并无冲突与应用行为已验证。验证未通过时，同步不予验收；需要保留的合并工作留在其同步分支。

<a id="customization-maintenance"></a>

## 定制维护

本 fork 的默认开发和发行身份是 Mindeck。品牌资源与业务行为由各自的插件和资源文件负责。产品专属的构建与启动实现集中在 Mindeck 自有模块中，共享文件只保留少量接入调用。优先使用现有配置与扩展点，确需修改共享代码时使用范围集中的提交。每项定制链接到其包文档或决策记录。上游变更扩展点时，同时更新 Mindeck 调用方与验证。

通用单元测试与 Web fixture 保留上游组合及语言默认值。产品品牌验收显式选择 Mindeck，同时覆盖上游和其他产品配置。品牌预期保留在产品专属用例中；不要向测试运行器全局注入 Mindeck，也不要改写无关的上游快照。

同步前后运行 `pnpm run start:web:stock --dump-config`，确认原版 profile 仍能在不含 Mindeck 行的情况下组合；`start:web` 只用于 Mindeck 品牌验收。

平台修复与品牌定制分开跟踪：Windows 打包预备使用归档文件名及显式工作目录，文档 fixture 在文件符号链接需要提升权限的环境中使用目录 junction。同步时独立评审这些补丁，上游提供等效行为后撤销。

在此 fork 启用或运行 workflow 前，先评审其变更。记录 runner 可用性、所需凭据，以及发布或部署副作用。上游运行成功不代表 fork 的 workflow 配置可用。

<a id="shared-code-changes"></a>

## 共享代码改动

Mindeck 企业版插件位于 `packages/mindeck/`。下列共享文件带有 Mindeck 改动；上游版本涉及这些文件时逐一评审。

| 路径 | Mindeck 改动 | 原因 |
|---|---|---|
| `tsconfig.base.json`、`tsconfig.host.json`、`tsconfig.client.json` | `packages/mindeck/*` 的路径别名和项目引用。 | 汇总构建与检查需要包含 Mindeck 包。 |
| `scripts/product-package-policy.ts` | 只由 Mindeck 组合包挂载的 Mindeck 包登记为可选；`mindeck-app` 由桌面端主进程导入，不再登记。 | 否则产品使用检查会拒绝不在原版 profile 中的包。 |
| `scripts/verify-package-readme-model-experience.ts` | 为 `mindeck-account` 登记简短的模型体验说明。 | 账号不增加模型输入。 |
| `packages/llm/llm-pi-ai/src/index.ts` | 导出 `createPiAiAdapter` 和 `piAiAuthFrom`；插件自身的适配器也经同一套接线构建。 | `mindeck-models` 通过 pi-ai 提供云端目录中的路由，而不写入 `providers` 配置。 |
| `packages/client/locale/package.json`、`packages/client/locale/tsdown.config.ts`、`scripts/check-workspace-constraints.ts` | 为 `./parameters` 入口构建并发布 `lib/parameters.js`。 | Web 启动和客户端测试运行时不经客户端包即可导入语言参数。 |
| `scripts/package-dependency-policy.ts` | 把 `defineTool`（`dsh-tools`）和 `resolveDshHome`（`dsh-home-paths`）登记为需要对等依赖的 Host 导出。 | `mindeck-files` 同时有 Host 与 Client 两面，依赖门禁会审查它的 Host 导入。 |
| `packages/api/workspace-controller/src/index.ts`、`packages/api/workspace-controller/src/default-directory.ts` | 增加 `documentsFolder` 配置，指定 Documents 下的文件夹，默认 `deepseek-harness`。 | Mindeck 组合包把默认工作区建在 `<Documents>/Mindeck`，而不是官方产品的文件夹。 |
| `packages/api/remotes/src/remote-events.ts`、`packages/client/ui-skill/src/client/index.ts` | 把 `skills/change` 转发给客户端；`/` 技能菜单收到后丢弃缓存的目录。 | 登录后同步的公司技能无需重启即可出现在已打开会话的 `/` 菜单中。 |
| `scripts/gen-cordis-catalog.ts`、`scripts/gen-doc-graphs.ts`、`docs/subsystems/README.*` | 为 Mindeck 服务登记子系统页面、类型链接例外和服务角色；生成的目录与关系图包含它们。 | 目录与关系图生成器会拒绝没有文档归属的服务、事件作用域和服务类型。 |
| `apps/desktop/src/main.ts` | 读取产品描述的 `nativeWelcome`；为 `false` 时，启动只读取语言偏好并打开工作区，不监听 DeepSeek 账号。 | Mindeck 禁用了 DeepSeek 账号，原生欢迎无法读取其状态；成员在工作区内通过 Mindeck 账号登录。 |

<a id="synchronization-record"></a>

## 同步记录

每次集成使用[模板](README.zh.md#local-work)记录在本地规格或工单中。验收证据保留在对应工作记录中，本文不再维护另一份历史。

| 字段 | 必填内容 |
|---|---|
| 目标 | 选定的上游版本与 Mindeck 基础版本。 |
| 范围 | 上游发布说明、受影响的本地定制与迁移要求。 |
| 冲突 | 受影响路径、保留行为与评审证据。 |
| 检查 | 实际命令、环境、结果与未验证项。 |
| 自动化 | runner 与凭据要求，以及发布或部署影响。 |
| 验收 | PR 引用、验收版本与后续负责人。 |

<a id="dev-note"></a>

## 开发备注

同步频率、首次验收的上游基线与 fork 专属 CI 配置需要分别安排明确范围的工作。本文不启用 workflow、不发布软件包，也不安排定时同步。
