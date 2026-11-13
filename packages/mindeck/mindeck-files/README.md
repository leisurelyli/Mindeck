---
description: "Let Mindeck Desktop agents and members browse, search, download, and save files in the company file library."
kind: "package-reference"
---

# @deepseek-ai/dsh-mindeck-files

English | [中文](README.zh.md)

## Summary

Use the company file library from Mindeck Desktop. The agent can list the member's spaces, search file names, download a file to read it, and save a workspace file back. The member browses the same spaces in a sidebar page, adds files to a message, and uploads files from the computer. Preview, versions, and sharing stay in the file library's web app.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the default export on the Host after the [Mindeck account](../mindeck-account/README.md), the tool runtime, the filesystem, and the working-directory service, and the `./client` entry in the Web Client. The Mindeck application bundle does both. The tools and the page appear while the member is signed in and the company has enabled the file library in Mindeck Cloud.

A library path starts with a space name: `/Personal` is the member's own space, `/Shared with me` holds items other members share, and the company and each department space keep their names, such as `/星河科技/制度/报销制度.md`. The page shows the first two as "My files" and "Shared with me" in the member's language.

`library_download` saves the file under `downloadDir` (by default `mindeck/library-downloads` in the DeepSeek Harness home), in a directory per Session, and returns the local path. The agent reads that copy with its file tools and copies it into the workspace before changing it. Session directories unchanged for `downloadRetentionDays` (seven by default) are removed when the plugin starts. `library_upload` reads a workspace file through the filesystem service, creates missing folders, and refuses to replace an existing file unless `overwrite` is set; the library keeps the replaced content as a version. `maxDownloadBytes` and `maxUploadBytes` (100 MiB each by default) bound the transfers.

The page lists the spaces with an icon for the member's own, department and company, and shared spaces, opens folders, and searches names after a short pause in typing. Clicking a file adds a reference to the message draft; a folder's plus button does the same for the folder, and a file's arrow opens it in the library's web app, where the member previews, restores versions, and shares. Inside a folder, the upload button and files dropped on the page save files from the computer into that folder, one at a time; files whose name is taken are listed with a button that replaces them, and the first other failure stops the upload and is explained. Typing `@` and part of a name in the composer also searches the library after a short pause and lists matches under **File library** with their space and folders. The message carries a reference as `library:"/path"`, with a trailing `/` for a folder, and the sent message shows it as a file or folder label. Each library tool call in the transcript reads as what the agent did and the place it used, such as **Read from the file library · 研发部 / 规范.md**, with the member's names for the personal and shared spaces; the result text, which carries local download paths, stays out of the row. The page explains when the member is signed out, the company has not enabled the library, or the library does not respond.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Maintainer details — click to expand</summary>

Mindeck Cloud issues a 15-minute OpenCloud token at `POST {endpoints.files.token}` for the desktop session. The Host caches it per session token, requests a new one a minute before expiry, and shares one request among concurrent callers. When OpenCloud answers 401, the request repeats once with a new token; when Mindeck Cloud answers 401, the account's `rejectToken` ends the session.

Spaces come from `GET /graph/v1.0/me/drives` (personal, project, and the virtual shares drive). Files use WebDAV under `/dav/spaces/{driveId}/`: `PROPFIND` with depth 0 or 1, `GET`, `PUT` with `If-None-Match: *` unless overwriting, and `MKCOL` for each missing folder. Name search sends `REPORT /dav/spaces/` with `oc:search-files` and the pattern `name:"*text*"`; OpenCloud indexes new files asynchronously, so a file saved a moment ago may not match yet. A result outside the member's listed drives has no library path and is left out. An item's web page is `{opencloud}/f/{fileid}`.

Local download paths replace characters Windows rejects, trailing dots and spaces, and reserved device names. The Remote namespace `mindeckFiles` streams availability with `watch` and serves `spaces`, `list`, `search`, and `upload` to the page; `upload` takes the content in base64 and refuses it before decoding when it exceeds `maxUploadBytes`. Failures carry `mindeck-files/*` codes, including `exists`, `quota`, and `too-large` for uploads.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Mindeck account](../mindeck-account/README.md) — the desktop session this plugin uses.
- [Tool authoring reference](../../../docs/cookbook/adding-a-tool.md) — the tool contracts these tools follow.
- [Mindeck development documentation](../../../docs/mindeck/README.md) — the Mindeck application and its Cloud services.

-----

<a id="model-experience"></a>
## Model Experience

### File-library tools

#### What the model sees

Four tool schemas: `library_list`, `library_search`, `library_download`, and `library_upload`. Results list library paths with the kind, size, modification date, and a read-only mark, or name the local path of a download and the library path of a saved file. Failures explain what to change, such as the existing space names or passing `overwrite`. A member's message can contain `library:"/path"` references; the tool descriptions name that form, and the tools accept it as a path.

#### Token effect

The schemas add a fixed amount to every request while the library is available. A listing or search result grows with the number of entries, up to `maxSearchResults` for a search; a download adds one line, not the file content.

#### KV Cache effect

The tools appear or disappear when the member signs in or out or the company enables the library, which changes the tool list for later requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Downloads are written on the Host machine; an agent whose execution environment is another machine, such as an SSH workspace, cannot read them.
- Dragging library items into the composer is not supported; the page adds references with a click.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

None.

</details>
