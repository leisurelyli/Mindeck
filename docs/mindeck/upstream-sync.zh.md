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
| `scripts/package-dependency-policy.ts` | 把以下导出登记为需要对等依赖的 Host 导出：`defineTool`（`dsh-tools`）、`resolveDshHome`（`dsh-home-paths`）、`isSkillName`（`dsh-skill`）、`FileSystemSkillProvider`（`dsh-skill-filesystem`）、`followChanges`（`dsh-mindeck-account`）、`entryListSchema`（`cordis-plugin-include`）和 `entryListProblem`（`dsh-agent-preset-registry`）。 | Mindeck 各包同时有 Host 与 Client 两面，依赖门禁会审查它们的 Host 导入。 |
| `packages/api/workspace-controller/src/index.ts`、`packages/api/workspace-controller/src/default-directory.ts` | 增加 `documentsFolder` 配置，指定 Documents 下的文件夹，默认 `deepseek-harness`。 | Mindeck 组合包把默认工作区建在 `<Documents>/Mindeck`，而不是官方产品的文件夹。 |
| `packages/api/remotes/src/remote-events.ts`、`packages/client/ui-skill/src/client/index.ts` | 把 `skills/change` 转发给客户端；`/` 技能菜单收到后丢弃缓存的目录。 | 登录后同步的企业技能无需重启即可出现在已打开会话的 `/` 菜单中。 |
| `scripts/gen-cordis-catalog.ts`、`scripts/gen-doc-graphs.ts`、`docs/subsystems/README.*` | 为 Mindeck 服务登记子系统页面、类型链接例外和服务角色；生成的目录与关系图包含它们。 | 目录与关系图生成器会拒绝没有文档归属的服务、事件作用域和服务类型。 |
| `packages/client/locale/src/client/index.ts` | 增加 `ctx.locale.override(ns, dicts)`，按 locale 为其他插件拥有的命名空间叠加覆盖。 | Mindeck 在品牌插件中替换共享界面文案，例如空白会话的标语。 |
| `packages/core/system-prompt/src/index.ts` | 增加 `identity` 配置字段，即 `harness:identity` 开场白的文本；默认值仍是 DeepSeek Harness 那句。 | Agent 预设会遮蔽部署人设，因此 Mindeck 在预设不遮蔽的开场白里写自己的名称。 |
| `packages/client/ui-model-selection/src/client/provider-order.ts`、`ModelSelect.tsx`、`index.ts` | composer 模型菜单和 `/model` 弹窗中，显示名称相同且相邻的提供方共用一个分组标题。 | Mindeck 按客户端接口为企业模型分多条路由，它们都以企业名称命名。 |
| `apps/desktop/src/main.ts` | 读取产品描述的 `nativeWelcome`；为 `false` 时，启动只读取语言偏好并打开工作区，不监听 DeepSeek 账号。 | 成员在工作区内通过 Mindeck 账号登录，而不是经由 DeepSeek 欢迎页。设置里可选的个人 DeepSeek 登录由客户端打开授权页。 |
| `packages/client/ui-settings-account/src/client/AccountParts.tsx`、`AccountSection.tsx`、`AccountSection.module.css`、`index.ts` | 把账号页的分区、身份卡片、信息行、链接和金额移入组件，由插件注册为根级工厂 `settings.account.page`、`settings.account.identity`、`settings.account.rows`、`settings.account.links` 和 `settings.account.amount`；DeepSeek 账号页通过它们绘制，DOM 不变。没有地址的链接绘制为按钮，并有禁用样式。 | Mindeck 的账号页复用基座账号页，而不是复制其样式。 |
| `packages/client/ui-settings-account/src/client/OnboardingPage.tsx`、`OnboardingWelcomeStep.tsx`、`onboarding-contract.ts`、`DesktopOnboarding.module.css`、`index.ts` | 注册根级工厂 `desktop.onboarding.page`：与账号无关的首次引导页，提供主视觉、居中表单和状态三种布局、返回控件和退出淡出，并带子插槽 `desktop.onboarding.page.illustration`；DeepSeek 欢迎步骤通过同一主视觉绘制。 | Mindeck 的全屏登录使用 DeepSeek 首次引导页。 |
| `packages/client/ui-settings-account/src/client/overlay-inert.ts`、`OnboardingSurface.tsx` | 像已有的 `inert` 计数一样，统计应用根节点隐藏状态的持有方。 | 否则重叠的引导舞台（例如 Mindeck 登录下方的 DeepSeek 加载舞台）结束时，工作区会过早露出或一直隐藏。 |
| `packages/client/ui-settings-account/tests/initialization.client.spec.ts`、`access-revocation.client.spec.ts` | 其中手工构造的客户端上下文增加空实现的 `slots.registerFactory`。 | 插件挂载时会注册工厂。 |
| `packages/preset/agent-preset-registry/src/definition.ts`、`preset.ts`、`types.ts`、`index.ts`、`packages/preset/agent-preset/src/index.ts` | 为预设定义、预设和列表行增加 `listed?: false`；除非 Session 已记录该预设，`select` 以 `agent-preset/unlisted` 拒绝未列出的预设。 | 已停用的数字员工保留注册，原有对话可以继续，但新对话不能选择它们。 |
| `packages/client/ui-agent-preset/src/client/settings-store.ts`、`AgentPresetSeat.tsx`、`AgentPresetSection.tsx` | 输入框的预设菜单不显示未列出的预设，Session 当前使用的除外；Agent 预设页面不显示它们，默认预设除外。 | 同样针对已停用的数字员工。 |
| `packages/preset/agent-preset-registry/src/definition.ts`、`preset.ts`、`types.ts`、`composition-inventory.ts`、`display.ts`、`package.json`、`packages/preset/agent-preset/src/index.ts`、`packages/host/plugin-inventory/src/types.ts`、`packages/client/ui-agent-preset/src/client/`、`packages/client/ui-settings-plugin-inventory/src/client/index.ts` | 预设的 `name` 和 `description` 接受 `LocalizedText`。`presetDisplayText` 接收语言服务的 `resolveText`，输入框的预设菜单、会话标签、Agent 预设页面和插件清单按当前语言显示译文。`@deepseek-ai/dsh-agent-preset` 的 YAML 行仍只用原文。 | Mindeck 用中英文命名通用助手以及草稿、已停用后缀。 |
| `packages/client/ui-sidebar/src/client/contract/slots.ts`、`index.ts`、`SidebarRoot.tsx`、`SidebarRoot.module.css` 及其测试 | 新增 root list `sidebar.panellist.badge`：按面板 id 注册的徽标显示在展开行的标题之后和窄栏图标的右上角，并作为该行的描述播报；没有徽标的行保持原有标记。测试中手工构造的 `SidebarRoot` props 增加 `usePanelBadges`。 | 企业消息行显示未读数。 |
| `packages/client/ui-message-feedback/src/client/slots.ts`、`FeedbackDialog.tsx`、`surface.ts`、`index.ts`、它的 README 和测试 | 在弹窗详情输入框下方声明 Session 列表 `feedback.dialog.options`，并新增 `feedbackUi.beforeSubmit(hook)`：弹窗的每次提交都先等待钩子再记录；钩子拒绝时提交以 `submit-hook-failed` 失败。没有条目和钩子时弹窗不变。 | 点踩时可以选择附上这一轮的问题和回答，账号插件的 Host 在转发评价之前就知道这个选择。 |
| `packages/client/ui-workspace/src/client/locales.ts`、`ui-reference/src/client/locales.ts`、`ui-chat/src/client/locale.ts`、`ui-chat/src/client/chat/TurnProcessNodeView.tsx`、`ui-jobs/src/client/locales.ts`、`ui-subagent/src/client/locales.ts`、`ui-schedule/src/client/locales.ts`、`ui-schedule/src/client/frequency-locales.ts` 及其测试 | 中文模板在数字和单位之间加空格，例如 `{n} 分钟`、`{seconds} 秒` 和 `{m} 月 {d} 日`；轮次用时把单位渲染为文本节点，使可访问名称也保留空格。 | Mindeck 的中文文案规范；Mindeck Cloud 显示为 `7 小时前` 和 `11 月 1 日`。 |

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
