---
description: "Package map for Mindeck Enterprise: the Mindeck Cloud account, company models, company skills, and the company file library."
kind: "package-group"
---

# mindeck/ — Mindeck Enterprise

English | [中文](README.zh.md)

## Summary

The `mindeck/` group connects Mindeck Desktop to a company's Mindeck Cloud. Use `mindeck-account/` for the Cloud address and device sign-in, `mindeck-models/` for the company models, `mindeck-skills/` for the company skills, and `mindeck-files/` for the company file library. The [Mindeck application bundle](../bundle/mindeck-app/README.md) composes all four; the official DeepSeek Harness profiles do not load them.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

The account package owns the Cloud session; the other three read it for every Cloud request and stop serving company content after sign-out. Their READMEs cover use and configuration; the subsystem reference owns the shared contracts.

| Package | Role | ctx key |
|---|---|---|
| [`mindeck-account/`](mindeck-account/README.md) | Cloud address, device sign-in, the stored session, and the sign-in gate | `ctx.mindeckAccount` |
| [`mindeck-models/`](mindeck-models/README.md) | Company models as model routes through the metered Cloud gateway | — |
| [`mindeck-skills/`](mindeck-skills/README.md) | Company skills cached on the device, served by a skill provider, and listed on the skills page | `ctx.mindeckSkills` |
| [`mindeck-files/`](mindeck-files/README.md) | File-library tools, the sidebar page, and `library:` references | `ctx.mindeckFiles` |

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
