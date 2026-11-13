---
description: "在本机保存公司在 Mindeck Cloud 中提供的技能副本，作为技能提供方使用，并在技能页中列出。"
kind: "package-reference"
---

# @deepseek-ai/dsh-mindeck-skills

[English](README.md) | 中文

## 概述

使用公司在 Mindeck Cloud 中发布的技能。Mindeck 桌面端登录期间，本插件在本机保存成员可用技能的副本，并像自定义技能目录中的技能一样提供它们。退出登录后副本随即删除。右侧栏的**技能**页按公司设置的名称和分类列出它们，推荐技能排在最前，单击即可放入输入框。

## 目录

- [使用本包](#use-this-package)
- [了解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在 Host 上于 [Mindeck 账号](../mindeck-account/README.zh.md)和技能注册表之后挂载本插件，Mindeck 应用组合包已完成这一步。公司技能以 `mindeck` 提供方、`custom` 来源出现：项目技能优先于它们，它们又优先于成员自己的同名用户技能。

每次登录或退出后，以及每隔 `refreshIntervalMs`（默认十分钟），插件都会刷新。它只下载内容有变化的技能，并删除成员已不再可用的技能。下载失败的技能保留之前的副本，等待下次刷新。`maxSkillBytes` 和 `maxSkillFiles` 限制单个技能，`requestTimeoutMs` 限制每次请求，`cacheDir` 可把缓存从默认位置（DeepSeek Harness 主目录下的 `mindeck`）移走。

Client 入口 `@deepseek-ai/dsh-mindeck-skills/client` 在右侧栏及其指引中加入**技能**页。页面写明提供技能的公司，先列推荐技能，再按中文读音顺序列出各分类，然后是未分类的技能，最后在 **Mindeck 内置**下列出对话中的其他技能。搜索匹配名称、分类、描述以及 Mindeck Cloud 下发的拼音，因此输入 `zb` 能找到“周报助手”。单击技能会把 `/name ` 放在消息草稿开头，替换已经在那里的技能；信息按钮在侧栏中打开技能的 `SKILL.md`。Mindeck Cloud 应答之前，页面列出随缓存保存的技能。

-----

<a id="understand-the-implementation"></a>
## 了解实现

<details>
<summary>维护者细节 — 点击展开</summary>

缓存目录包含 `skills/`（每个技能一个目录）、`staging/` 和 `skills.json`；后者记录云端地址、成员、每个技能的内容哈希，以及已安装技能的列表信息（显示名称、分类、描述、推荐和拼音）。一次同步会列出 `GET {endpoints.skills}`，对哈希不同或缺少 `SKILL.md` 的技能下载 `GET {endpoints.skills}/{name}`，检查每个路径和大小限制，把文件写入 `staging/`，再改名覆盖缓存中的目录。清单属于其他成员或其他云端地址时，同步前先清空缓存；退出登录时整体清空。401 会把令牌报告给 `mindeckAccount.rejectToken`。

`ctx.mindeckSkills.watch()` 通过 `mindeckSkills` Remote 推送 `MindeckSkillCatalog`：公司名称和按云端顺序排列的已安装技能；没有本地副本的技能不会列出。页面通过 `skills/list` 读取对话自身的技能目录，得到内置技能和 `SKILL.md` 路径。

[skill-filesystem](../../skill/skill-filesystem/README.zh.md) 的 `FileSystemSkillProvider` 以 `skills/` 作为唯一根目录提供技能，不监视目录；每次改变缓存的同步之后，插件使技能目录失效。路径必须是相对路径、使用 `/`、不含 `.` 和 `..` 段，并避开 Windows 无法保存的名称；仅大小写不同的文件名会被拒绝。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [Mindeck 账号](../mindeck-account/README.zh.md) — 本插件使用的桌面会话。
- [技能注册表](../../skill/skill/README.zh.md) — 技能如何到达模型。
- [Mindeck 开发文档](../../../docs/mindeck/README.zh.md) — Mindeck 应用及其云端服务。

-----

<a id="model-experience"></a>
## 模型体验

### 公司技能

#### What the model sees

每个公司技能到达模型的方式与自定义技能目录中的技能相同：名称和描述出现在技能目录中，使用技能时提供其 `SKILL.md` 正文。

#### Token effect

每个技能增加一条目录条目；被使用的技能再增加其正文。两者都由管理员通过技能内容控制。

#### KV Cache effect

刷新时新增、修改或删除技能，会像编辑技能目录一样改变之后请求的技能目录。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 同一 Mindeck 主目录下的两个 Host 同时同步时，可能各自替换同一技能目录，以最后一次替换为准。
- 云端格式不含文件权限；技能中的脚本写入时没有可执行位。

-----

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者细节 — 点击展开</summary>

无。

</details>
