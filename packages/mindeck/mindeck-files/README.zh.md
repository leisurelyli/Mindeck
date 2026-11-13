---
description: "让 Mindeck Desktop 的智能体和成员浏览、搜索、下载公司资源库中的文件，并把文件存回资源库。"
kind: "package-reference"
---

# @deepseek-ai/dsh-mindeck-files

[English](README.md) | 中文

## 概述

在 Mindeck Desktop 中使用公司资源库。智能体可以列出成员的空间、按文件名搜索、下载文件后阅读，并把工作区文件存回资源库。成员在右侧栏面板和左侧栏的**资源库**页面中浏览同样的空间，把文件加入消息或用它开始对话，并从电脑上传文件。预览、历史版本和分享仍在资源库网页中进行。

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

在 Host 上于 [Mindeck 账号](../mindeck-account/README.zh.md)、工具运行时、文件系统和工作目录服务之后挂载默认导出，并在 Web 客户端挂载 `./client` 入口。Mindeck 应用组合包会完成这两步。成员已登录且公司在 Mindeck Cloud 中启用了资源库时，工具才可用；未满足时，面板和页面会说明原因。

资源库路径以空间名开头：`/Personal` 是成员自己的空间，`/Shared with me` 存放其他成员共享的条目，公司空间和各部门空间沿用各自的名称，例如 `/星河科技/制度/报销制度.md`。面板和页面按成员的语言把前两者显示为“我的文件”和“共享给我”。

`library_download` 把文件保存到 `downloadDir`（默认是 DeepSeek Harness 主目录下的 `mindeck/library-downloads`）中按会话划分的目录，并返回本地路径。智能体用文件工具读取这份副本，修改前先复制进工作区。超过 `downloadRetentionDays`（默认七天）未变化的会话目录会在插件启动时删除。`library_upload` 通过文件系统服务读取工作区文件，创建缺少的文件夹；目标文件已存在时，除非设置 `overwrite`，否则拒绝替换；资源库会把被替换的内容保留为历史版本。`maxDownloadBytes` 与 `maxUploadBytes`（默认各 100 MiB）限制传输大小。

右侧栏面板列出空间（个人、部门与公司、共享各有图标）、打开文件夹，并在输入停顿片刻后按名称搜索。单击文件把引用加入消息草稿；文件夹的加号按钮把文件夹加入草稿；文件的箭头在资源库网页中打开它，成员在那里预览、恢复历史版本和分享。在文件夹中，上传按钮和拖到面板上的文件会逐个保存到该文件夹；同名文件会列出并提供替换按钮，其他失败会停止上传并说明原因。在输入框中输入 `@` 和部分名称，也会在停顿片刻后搜索资源库，并在 **资源库** 下列出匹配项及其所在空间和文件夹。消息中的引用写作 `library:"/路径"`，文件夹以 `/` 结尾；发出的消息把它显示为文件或文件夹标签。对话记录中每次资源库工具调用都显示为智能体做了什么、用到哪个位置，例如 **读取资源库文件 · 研发部 / 规范.md**，个人空间和共享空间使用成员看到的名称；结果文本含有本机下载路径，不在这一行中显示。成员未登录、公司未启用资源库或资源库无响应时，面板会说明原因。

客户端入口还会在左侧栏“插件”之前加入**资源库**，其页面显示在主区域。空间排成一列，位于打开的文件夹旁边，页面默认打开第一个空间。文件夹区域显示路径导航、覆盖全部空间的搜索、上传按钮、刷新按钮，以及在资源库网页中打开该文件夹的链接。单击文件夹即打开它，单击文件名会在资源库网页中打开文件。指针移到某一行或该行获得焦点时，日期和大小的位置会显示**在新对话中使用**；它通过 [Mindeck 账号](../mindeck-account/README.zh.md)的 `mindeckComposer` 打开一个空白对话，并把该条目的 `library:"/path"` 引用加在草稿末尾。通过按钮或把文件拖到文件夹上传，规则与面板相同；列表标为只读的文件夹和**共享给我**的顶层不接受上传，并显示**只读**。搜索结果会写明每个条目所在的空间和文件夹。文件夹加载时页面显示骨架行，读取失败时提供重试，文件夹为空、成员未登录、公司未启用资源库或资源库无响应时显示说明。

-----

<a id="understand-the-implementation"></a>
## 了解实现

<details>
<summary>维护者细节——点击展开</summary>

Mindeck Cloud 在 `POST {endpoints.files.token}` 为桌面会话签发 15 分钟有效的 OpenCloud 令牌。Host 按会话令牌缓存它，在到期前一分钟申请新令牌，并发调用共用同一次申请。OpenCloud 返回 401 时，请求换新令牌重试一次；Mindeck Cloud 返回 401 时，由账号的 `rejectToken` 结束会话。

空间来自 `GET /graph/v1.0/me/drives`（个人空间、项目空间和虚拟的共享空间）。文件通过 `/dav/spaces/{driveId}/` 下的 WebDAV 访问：深度为 0 或 1 的 `PROPFIND`、`GET`、`PUT`（即使带 `If-None-Match: *` 也会替换已有文件，因此不允许替换时先用 `PROPFIND` 检查路径），以及为每个缺少的文件夹发送的 `MKCOL`。名称搜索向 `/dav/spaces/` 发送带 `oc:search-files` 的 `REPORT`，模式为 `name:"*文本*"`；OpenCloud 异步建立索引，刚保存的文件可能暂时搜不到。不在成员已列出空间中的结果没有资源库路径，会被略过。条目的网页地址是 `{opencloud}/f/{fileid}`。

本地下载路径会替换 Windows 不接受的字符、末尾的点和空格以及保留设备名。Remote 命名空间 `mindeckFiles` 以 `watch` 流式提供可用状态，并为面板和页面提供 `spaces`、`list`、`search` 和 `upload`，二者通过同一个共享 hook 浏览；`upload` 以 base64 接收内容，超过 `maxUploadBytes` 时在解码前拒绝。失败带有 `mindeck-files/*` 错误码，上传另有 `exists`、`quota` 和 `too-large`。客户端在拥有 `mindeckFiles/watch` 访问权限期间，在根 `main` 插槽注册页面，并以 order -10 在 `sidebar.panellist` 注册这一行。

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
- 不支持把资源库条目拖进输入框；页面通过单击加入引用。

-----

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者细节——点击展开</summary>

无。

</details>
