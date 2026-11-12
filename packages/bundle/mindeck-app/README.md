---
description: "Mindeck presentation over the stock Web composition."
kind: "package-bundle"
---

# @deepseek-ai/dsh-mindeck-app

English | [中文](README.zh.md)

## Summary

Use this layer to display Mindeck artwork over the stock Web application. Mindeck Desktop includes it in its owned profile; source Web launchers select its patch through `--patch`. It changes presentation while installation identity and state paths remain controlled by the Mindeck launcher. This package also owns the shared product descriptor at `src/product.json`, which the Desktop and Web launchers read for product names and build assets; the descriptor adds no runtime service.

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

Apply this bundle after `@deepseek-ai/dsh-base` and `@deepseek-ai/dsh-web-app`. Desktop prepares that order before user extension bundles. The repository's `start:web` and `dev:web` scripts add it to the development Web profile in the same order. For manual profile management, follow [Plugin Manager](../../boot/plugin-manager/README.md#use-this-package) and the [profile layering rules](../../boot/app-boot/README.md#profiles).

The layer disables `ui-brand-official` and selects the [Mindeck brand plugin](../../client/ui-brand-mindeck/README.md) for the sidebar, empty conversation and onboarding artwork. The stock Web bundle remains independent of Mindeck. The Mindeck launchers supply public product names through the [locale parameters](../../client/locale/README.md#use-this-package); this patch does not configure them.

Members sign in with a Mindeck Cloud account and use the models and skills their company configures there. The layer adds the [account](../../mindeck/mindeck-account/README.md), [company models](../../mindeck/mindeck-models/README.md) and [company skills](../../mindeck/mindeck-skills/README.md) plugins. It disables the DeepSeek account and its sign-in UI, the DeepSeek model providers and web search, the `llm-pi-ai` routes from personal settings, and the Models settings page with personal API keys. Every model request therefore goes through the Mindeck Cloud gateway, which meters it against the company quotas.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The manifest declares `dsh.bundle.patch` as [`cordis.patch.yml`](cordis.patch.yml). That patch disables the official brand and the replaced rows by id and inserts the Mindeck plugins. It adds no service or mutable runtime state; the selected plugin owns registration and cleanup. Later patches follow normal profile precedence.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Bundle group](../README.md) — adjacent application layers.
- [Mindeck branding](../../../docs/mindeck/branding.md) — product values and generated assets.
- [Mindeck isolation](../../../docs/mindeck/isolation.md) — launcher state and Desktop profile preparation.

-----

<a id="model-experience"></a>
## Model Experience

None, as this bundle selects UI artwork and adds no prompts, tools or Session events.

#### KV Cache effect

None; this layer adds no provider request content.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Requires the stock Web layer** — this patch replaces its brand selection rather than supplying a complete application.
- **Presentation does not establish isolation** — operating-system icons, IDs and state directories belong to the build and launcher; runtime plugins cannot take them over.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
