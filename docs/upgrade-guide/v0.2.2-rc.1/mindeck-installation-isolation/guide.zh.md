---
kind: upgrade-guide
description: "Mindeck Desktop 使用独立安装身份与数据身份，不安装 Harness 命令，也不使用其更新服务。"
---

# Mindeck 安装与状态隔离

[English](guide.md) | 中文

## 变更

此 fork 的桌面产品为 Mindeck，应用 ID 为 `io.github.leisurelyli.mindeck.workspace`，外部协议为 `mindeck-workspace`。开发版使用 Mindeck Dev 与 `mindeck-workspace-dev`。它使用独立状态，不使用官方 Harness 主目录，通用的 `DSH_HOME` 或 `DSH_AGENTS_HOME` 覆盖不用于选择其桌面状态。自动更新、强制更新策略及全局 `dsh` 命令安装均已关闭。这些变更不会迁移或升级官方安装。

打包元数据使用名称 `mindeck-workspace`，使 Windows 安装器清理与更新缓存不复用上游包名。更新关闭时，发布记录不包含更新 URL；继承的更新资格准备工具拒绝新建测试运行。

原版 Web 组合包使用上游品牌。Mindeck 展示以 `@deepseek-ai/dsh-mindeck-app` 叠加在其后。仓库的 `start:web` 和 `dev:web` 脚本选择该补丁、Mindeck 开发状态与端口 3081。直接执行 `dsh` 命令仍保留上游行为。

产品名称来自启动器公开的语言参数，不再通过替换字典提供。[语言包](../../../../packages/client/locale/README.zh.md#use-this-package)说明优先级与重启要求。

## 迁移

1. 保留现有官方应用及其状态，使用独立状态启动 Mindeck；不提供账号、凭据、插件或会话的自动迁移。
2. 需要自定义桌面路径时，改用 `MINDECK_HOME`、`MINDECK_AGENTS_HOME` 和 `MINDECK_USER_DATA_DIR`。各值必须是保留的官方及现有 Mindeck 状态位置以外的绝对路径。默认值见 [Mindeck 隔离](../../../mindeck/isolation.zh.md)。
3. 将外部应用链接改为 `mindeck-workspace://open`。仅对已注册的开发应用使用 `mindeck-workspace-dev://open`。官方 `dsh://` 链接仍交由官方应用处理。
4. 使用 Mindeck 启动脚本选择其展示。Desktop 准备会将 base、原版 Web 和 Mindeck 层放在用户扩展之前。已有 profile manifest（元数据清单）需要改写时，在 `package.json` 旁保存原字节备份 `package.before-mindeck-UUID.json`；保留用户依赖与补丁。按[隔离说明](../../../mindeck/isolation.zh.md#development-entry-points)核对 `dsh.profile.bundles` 中的必需组合包顺序。
5. 自定义名称时，设置非空的 Host 语言 `parameters` 映射，或公开的 `DSH_LOCALE_PARAMETERS` JSON 输入。普通字典文案使用 `{productName}`，标题使用 `{productTitle}`。不要放入密钥；重启对应 Host 并重新加载页面。源码 Web 启动器也将显式 `DSH_CLIENT_TITLE` 覆盖应用到 `productTitle`。
6. 后续 Mindeck 版本通过独立且经过评审的安装包流程分发。安装前确认身份与数据隔离；发行产物的安装、升级、卸载和签名需要单独验收，源码测试不能证明这些操作已通过。
