---
description: "Mindeck 主图稿、生成的平台图标及应用接入。"
---

# Mindeck 品牌资源

[English](branding.md) | 中文

## 概要

Mindeck 使用一份用户提供的 SVG 生成应用图标和客户端品牌标识。平台产物放在 Mindeck 目录中，上游品牌插件和原始图稿继续保留。

## 目录

- [源图稿](#source-artwork)
- [生成图标](#generate-icons)
- [应用接入](#application-integration)
- [开发说明](#dev-note)

<a id="source-artwork"></a>

## 源图稿

[产品描述](../../apps/desktop/src/product.json)负责产品名称，以及 `branding` 中的主 SVG、桌面、安装器、Web 图标和 PWA manifest（元数据清单）路径。[主 SVG](../../packages/client/ui-brand-mindeck/src/client/assets/mindeck.svg) 保留原图的形状、蓝青配色和透明背景。修改标识时调整这一份源文件，再重新生成平台产物，不逐个手动修改。开发版和正式版使用相同图稿，不加 Dev 角标。

<a id="generate-icons"></a>

## 生成图标

安装项目锁定的依赖后，在仓库根目录执行：

```sh
corepack pnpm run render:mindeck-icons
```

[生成脚本](../../apps/desktop/scripts/render-mindeck-icons.ts) 生成 15 个文件：`apps/desktop/resources/mindeck/` 下的桌面 PNG/ICO、`apps/desktop/installer/assets/mindeck/` 下的安装器图片、`apps/web/public/mindeck/` 下的 Web 图标、`apps/desktop/renderer/assets/mindeck.svg` 欢迎页标识，以及 `apps/web/public/mindeck.webmanifest`。manifest 的 `name` 和 `short_name` 来自产品名称。安装器产物沿用上游图片尺寸。Apple 触屏图标和 maskable 图标使用应用现有的白色背景，其余图标保留透明背景；maskable 版本将图稿保持在平台安全圆内。

<a id="application-integration"></a>

## 应用接入

[Mindeck 展示组合包](../../packages/bundle/mindeck-app/README.zh.md)在原版 Web 组合包之后应用，禁用 `ui-brand-official`，并选择 [Mindeck 品牌插件](../../packages/client/ui-brand-mindeck/README.zh.md)。原版 Web 组合包没有 Mindeck 依赖或配置项。插件通过 slot 提供侧栏图标、名称和空白会话标识；操作系统图标和安装身份仍由构建及启动器负责。

Mindeck 启动器通过 `DSH_LOCALE_PARAMETERS` 公开 `productName` 和 `productTitle`。产品文案使用语言包提供的名称参数，共用标题使用 `{productTitle}`。[语言包](../../packages/client/locale/README.zh.md#use-this-package)负责优先级与插值；[Web 启动包](../../packages/client/web/README.zh.md#use-this-package)负责加载名称和标题的更新时间。[Mindeck Web 构建插件](../../apps/web/mindeck-branding.ts)设置初始 HTML 标题、图标和 manifest 链接。具名 `official` 与 `local` 构建分别使用 Mindeck 和 Mindeck Dev；未指定 profile 的构建遵循 `DSH_CLIENT_TITLE`，默认为 Mindeck Dev。共享构建环境 helper 保留上游 profile 值。源码 Web 启动器也将显式标题覆盖值用作 `productTitle`。[安装隔离](isolation.zh.md)文档负责应用标识和数据目录约定。

构建插件使 manifest、favicon 和触摸图标 URL 相对于页面目录。反向代理通过嵌套路径提供应用时，这些请求与 manifest 的安装作用域都保留在应用挂载路径内。

Web 产品文案使用公开的语言参数。原生菜单、对话框和安装器提示使用同一产品描述中的名称。DeepSeek 账号、模型和充值说明保留服务商名称。上游署名、许可证、包名与兼容标识保留原名。

品牌插件的 assets 中保存四张 Mindeck 工作区截图：中英文各含明暗主题。它通过 root 作用域的 single slot `desktop.onboarding.illustration` 向欢迎与额度步骤提供截图。slot 为空时，包括 provider 卸载后，共享账号 UI 使用上游原始插图。

<a id="dev-note"></a>

## 开发说明

修改主图后重新生成资源，并运行受影响的图稿、品牌、浏览器和打包检查。原生安装器和 macOS 应用验收仍需对应平台工具链；生成图片检查不等于安装测试。
