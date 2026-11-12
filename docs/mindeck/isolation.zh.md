---
description: "Mindeck 应用身份、独立数据位置，以及源码开发隔离的适用范围。"
---

# Mindeck 安装隔离

[English](isolation.md) | 中文

## 概述

本文说明 Mindeck 如何将安装和本地状态与官方 Harness 及已存在的同名 Mindeck 应用分开。桌面的[产品描述](../../packages/bundle/mindeck-app/src/product.json)负责稳定身份。隔离不会迁移已有账号、凭据、插件或会话，也不改变 Agent 或 Session 格式。

## 目录

- [身份与状态](#identity-and-state)
- [开发入口](#development-entry-points)
- [外部服务与分发](#external-services-and-distribution)
- [验收](#acceptance)

<a id="identity-and-state"></a>

## 身份与状态

桌面应用在读取 Electron 设置、获取单实例锁或启动 Host 前解析以下位置。

| 设置 | 安装版应用 | 开发版应用 |
|---|---|---|
| 显示名称 | Mindeck | Mindeck Dev |
| 打包应用名称 | `mindeck-workspace` | 源码开发不属于安装包。 |
| 应用 ID | `io.github.leisurelyli.mindeck.workspace` | `io.github.leisurelyli.mindeck.workspace.dev` |
| 外部链接 | `mindeck-workspace://open` | `mindeck-workspace-dev://open` |
| Harness 状态 | `~/.mindeck-workspace` | `~/.mindeck-workspace-dev` |
| 共享 agent（智能体）配置 | 所选状态根目录下的 `agents/` | 所选状态根目录下的 `agents/` |
| Electron 用户数据 | Electron appData 下的 `MindeckWorkspace` | Electron appData 下的 `MindeckWorkspaceDev` |

使用 `MINDECK_HOME`、`MINDECK_AGENTS_HOME` 和 `MINDECK_USER_DATA_DIR` 指定绝对路径。继承的 `DSH_HOME`、`DSH_AGENTS_HOME` 和 `DSH_DESKTOP_USER_DATA_DIR` 不用于选择桌面状态。启动器向自己的 Host 提供已解析目录。检查会解析现有目录别名，并在创建 Mindeck 状态前拒绝与官方 `.dsh`、共享 `.agents`、官方 Electron 数据或现有 Mindeck 数据重叠的路径。该检查防止误用，不是抵御并发文件系统修改的操作系统沙箱。

应用保留内部 `dsh-app` 文档协议和包名，因为它们属于实现接口；外部操作系统协议单独使用。[品牌展示](branding.zh.md)不改变带 workspace 后缀的安装 ID 或目录。

安装版和开发版的默认值分别保存会话、设置、凭据存储、插件安装、浏览器缓存和日志。自定义路径覆盖与服务凭据应分别配置到各自的启动环境；共用全局环境变量或显式指定同一路径仍可能共享配置。应用状态隔离不等于项目工作文件隔离：开发时应使用专用测试项目目录，避免选择正式项目的可写目录。

<a id="development-entry-points"></a>

## 开发入口

根 `dev:desktop` 与 `start:desktop` 脚本启动开发身份。根 `dev:web` 与 `start:web` 脚本预加载同一 Mindeck 开发环境，像 Desktop 一样把 Mindeck 组合包加入开发 Web profile 的组合包列表，使其中各行可通过设置修改，默认端口为 3081。Web 与 Desktop 开发有意共享产品数据，其 profile 保持独立。独立 checkout 或测试运行应显式指定 Mindeck 路径覆盖。

`start:web:stock` 与 `dev:web:stock` 启动未修改的上游组合：不加载 Mindeck 环境，也不加入其组合包，启动器使用默认 `$DSH_HOME`（`~/.dsh`）和 3080 端口。检查上游行为且不想触及本地 Mindeck 状态时，将 `DSH_HOME` 指向临时目录。

Desktop 自有 profile 依次包含 base、原版 Web 和 Mindeck 展示层，之后保留用户扩展组合包。准备时，[Mindeck profile helper](../../apps/desktop/src/mindeck-profile.ts) 为旧 profile 补齐这些必需层，并保留用户依赖与 `cordis.patch.yml`。修改已有 `package.json` 前，它将原字节复制到同一 profile 目录中的 `package.before-mindeck-UUID.json`。重复准备不会改写已经正确的组合包顺序。

源码 Web 环境与原生 `product-bootstrap.ts` 从产品描述生成公开的 `DSH_LOCALE_PARAMETERS`。这些展示值不选择状态路径。[语言配置与重启规则](../../packages/client/locale/README.zh.md#use-this-package)独立于安装隔离生效。

直接执行 `dsh` 命令及通用上游 CLI（命令行界面）仍遵循各自的环境规则，不属于 Mindeck 隔离启动快捷方式。Mindeck 安装包不包含公开终端启动器，命令注册操作返回 `ENOTSUP`，因此不接管官方命令，也不修改 PATH。

<a id="external-services-and-distribution"></a>

## 外部服务与分发

产品描述已关闭自动更新和强制更新策略。打包不嵌入更新源或强制策略，运行中的桌面壳关闭更新执行。签名安装包仍单独要求签名。本地未签名打包准备使用 Mindeck 应用 ID，无需官方发布设置。签名打包不要求更新凭据或更新源元数据；发布记录标记 `automaticUpdates: false`，不携带更新 URL。更新关闭时拒绝准备更新资格测试。

打包应用名称为 Windows 提供独立的安装器数据路径和 `mindeck-workspace-updater` 缓存。卸载清理选择产品自己的 Electron 数据目录，保留 `MINDECK_HOME` 或其默认目录。源码包仍使用上游命名空间，它不等于安装后的应用身份。

现有 DeepSeek 账号集成、模型提供方、插件目录和[产品分析](../../packages/client/product-analytics/README.zh.md)仍保留为上游能力；此项隔离不将它们替换为团队服务，也不代表产品可离线使用。团队上线前需要单独评审这些部署选择。继承的发布 workflow 和上传脚本不属于 Mindeck 发布流水线，未经该评审不得用于发布 Mindeck 产物。

<a id="acceptance"></a>

## 验收

源码检查覆盖安装身份、独立目录、保留路径及目录别名、真实子进程中的继承环境替换，以及全局命令注册拒绝。真实安装包共存需要在各目标平台单独验收安装、升级、卸载、签名和协议路由。相关证据随发布工作记录；源码测试成功不代表这些操作已经通过。
