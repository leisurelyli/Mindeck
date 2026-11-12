---
description: "让 Mindeck Desktop 的智能体和成员浏览、搜索、下载公司资源库中的文件，并把文件存回资源库。"
kind: "package-reference"
---

# @deepseek-ai/dsh-mindeck-files

[English](README.md) | 中文

## 概述

在 Mindeck Desktop 中使用公司资源库。智能体可以列出成员的空间、按文件名搜索、下载文件后阅读，并把工作区文件存回资源库。成员在侧栏页面中浏览同样的空间，并把文件加入消息。上传、预览、历史版本和分享仍在资源库网页中进行。

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

在 Host 上于 [Mindeck 账号](../mindeck-account/README.zh.md)、工具运行时、文件系统和工作目录服务之后挂载默认导出，并在 Web 客户端挂载 `./client` 入口。Mindeck 应用组合包会完成这两步。成员已登录且公司在 Mindeck Cloud 中启用了资源库时，工具和页面才会出现。

资源库路径以空间名开头：`/Personal` 是成员自己的空间，`/Shared with me` 存放其他成员共享的条目，公司空间和各部门空间沿用各自的名称，例如 `/星河科技/制度/报销制度.md`。页面按成员的语言把前两者显示为“我的文件”和“共享给我”。

`library_download` 把文件保存到 `downloadDir`（默认是 DeepSeek Harness 主目录下的 `mindeck/library-downloads`）中按会话划分的目录，并返回本地路径。智能体用文件工具读取这份副本，修改前先复制进工作区。超过 `downloadRetentionDays`（默认七天）未变化的会话目录会在插件启动时删除。`library_upload` 通过文件系统服务读取工作区文件，创建缺少的文件夹；目标文件已存在时，除非设置 `overwrite`，否则拒绝替换；资源库会把被替换的内容保留为历史版本。`maxDownloadBytes` 与 `maxUploadBytes`（默认各 100 MiB）限制传输大小。

页面列出空间、打开文件夹，并在输入停顿片刻后按名称搜索。每个条目都可以在资源库网页中打开，成员在那里上传、预览、恢复历史版本和分享；加号按钮把引用加入消息草稿。消息中的引用写作 `library:"/路径"`，文件夹以 `/` 结尾；发出的消息把它显示为文件或文件夹标签。成员未登录、公司未启用资源库或资源库无响应时，页面会说明原因。

-----

<a id="understand-the-implementation"></a>
## 了解实现

<details>
<summary>维护者细节——点击展开</summary>

Mindeck Cloud 在 `POST {endpoints.files.token}` 为桌面会话签发 15 分钟有效的 OpenCloud 令牌。Host 按会话令牌缓存它，在到期前一分钟申请新令牌，并发调用共用同一次申请。OpenCloud 返回 401 时，请求换新令牌重试一次；Mindeck Cloud 返回 401 时，由账号的 `rejectToken` 结束会话。

空间来自 `GET /graph/v1.0/me/drives`（个人空间、项目空间和虚拟的共享空间）。文件通过 `/dav/spaces/{driveId}/` 下的 WebDAV 访问：深度为 0 或 1 的 `PROPFIND`、`GET`、不覆盖时带 `If-None-Match: *` 的 `PUT`，以及为每个缺少的文件夹发送的 `MKCOL`。名称搜索向 `/dav/spaces/` 发送带 `oc:search-files` 的 `REPORT`，模式为 `name:"*文本*"`；OpenCloud 异步建立索引，刚保存的文件可能暂时搜不到。不在成员已列出空间中的结果没有资源库路径，会被略过。条目的网页地址是 `{opencloud}/f/{fileid}`。

本地下载路径会替换 Windows 不接受的字符、末尾的点和空格以及保留设备名。Remote 命名空间 `mindeckFiles` 以 `watch` 流式提供可用状态，并为页面提供 `spaces`、`list` 和 `search`；失败带有 `mindeck-files/*` 错误码。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [Mindeck 账号](../mindeck-account/README.zh.md)——本插件使用的桌面会话。
- [工具编写参考](../../../docs/cookbook/adding-a-tool.zh.md)——这些工具遵循的工具约定。
- [Mindeck 开发文档](../../../docs/mindeck/README.zh.md)——Mindeck 应用及其云端服务。

-----

<a id="model-experience"></a>
## 模型体验

### 资源库工具

#### What the model sees

四个工具定义：`library_list`、`library_search`、`library_download` 和 `library_upload`。结果列出资源库路径及其类型、大小、修改日期和只读标记，或给出下载后的本地路径和已保存文件的资源库路径。失败时说明需要改什么，例如现有的空间名称或传入 `overwrite`。成员的消息中可以包含 `library:"/路径"` 引用；工具说明写明了这种形式，工具把它当作路径接受。

#### Token effect

资源库可用时，这些定义会给每次请求增加固定数量的 token。列表或搜索结果随条目数增长，搜索最多 `maxSearchResults` 条；下载只增加一行，不包含文件内容。

#### KV Cache effect

成员登录或退出、公司启用资源库时，这些工具会出现或消失，从而改变后续请求的工具列表。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 下载的文件写在 Host 所在机器上；执行环境在另一台机器（例如 SSH 工作区）的智能体无法读取。
- 页面只把资源库引用加入消息；把条目拖进输入框和从页面上传交给资源库网页完成。

-----

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者细节——点击展开</summary>

无。

</details>
