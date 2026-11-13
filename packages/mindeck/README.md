---
description: "Package map for Mindeck Enterprise: the Mindeck Cloud account, company models, company skills, the company file library, digital employees, and company messages."
kind: "package-group"
---

# mindeck/ — Mindeck Enterprise

English | [中文](README.zh.md)

## Summary

The `mindeck/` group connects Mindeck Desktop to a company's Mindeck Cloud. Use `mindeck-account/` for the Cloud address, device sign-in, and the sync with company changes, `mindeck-models/` for the company models, `mindeck-skills/` for the company skills, `mindeck-files/` for the company file library, `mindeck-employees/` for the company's digital employees, and `mindeck-inbox/` for company messages. The [Mindeck application bundle](../bundle/mindeck-app/README.md) composes all six; the official DeepSeek Harness profiles do not load them.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

The account package owns the Cloud session and the sync that reports changed company data; the others read the session for every Cloud request and refresh what the sync reports, keeping a ten-minute refresh as a fallback. Models, skills, and the file library stop serving company content after sign-out; digital employees stay registered so their conversations continue. Removing `mindeck-inbox` from a composition removes only its sidebar row and page. Their READMEs cover use and configuration; the subsystem reference owns the shared contracts.

| Package | Role | ctx key |
|---|---|---|
| [`mindeck-account/`](mindeck-account/README.md) | Cloud address, device sign-in, the stored session, the sync with company changes, the full-screen sign-in, and the Account page | `ctx.mindeckAccount` |
| [`mindeck-models/`](mindeck-models/README.md) | Company models as model routes through the metered Cloud gateway | — |
| [`mindeck-skills/`](mindeck-skills/README.md) | Company skills cached on the device, served by a skill provider, and listed on the skills page | `ctx.mindeckSkills` |
| [`mindeck-files/`](mindeck-files/README.md) | File-library tools, the right-sidebar panel, the File library page, and `library:` references | `ctx.mindeckFiles` |
| [`mindeck-employees/`](mindeck-employees/README.md) | Digital employees as agent presets, the general assistant, and the Digital employees page | `ctx.mindeckEmployees` |
| [`mindeck-inbox/`](mindeck-inbox/README.md) | Company messages: announcements and personal notices with the unread count in the left sidebar, read marks, and the recommended version | `ctx.mindeckInbox` |

-----

<a id="related-documentation"></a>
## Related documentation

- [Mindeck subsystem reference](../../docs/subsystems/mindeck.md) — ownership, the account session contract, and the generated Cordis surface.
- [Mindeck development documentation](../../docs/mindeck/README.md) — product scope, isolation, branding, and upstream synchronization.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
