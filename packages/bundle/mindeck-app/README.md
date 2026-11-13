---
description: "Mindeck presentation over the stock Web composition."
kind: "package-bundle"
---

# @deepseek-ai/dsh-mindeck-app

English | [中文](README.zh.md)

## Summary

Use this layer to display Mindeck artwork over the stock Web application. Mindeck Desktop includes it in its owned profile; source Web launchers select its patch through `--patch`. It changes presentation and the agent's identity while installation identity and state paths remain controlled by the Mindeck launcher. This package also owns the shared product descriptor at `src/product.json`, which the Desktop and Web launchers read for product names and build assets; the descriptor adds no runtime service.

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

Members sign in with a Mindeck Cloud account and use the models, web search, skills, file library, and digital employees their company configures there. The layer adds the [account](../../mindeck/mindeck-account/README.md), [company models and web search](../../mindeck/mindeck-models/README.md), [company skills](../../mindeck/mindeck-skills/README.md), [file library](../../mindeck/mindeck-files/README.md), and [digital employees](../../mindeck/mindeck-employees/README.md) plugins, and selects company web search with `web.searchProvider: mindeck-search`; a patch replaces a row's whole config, so the `web` row restates `fetchProvider: http`. The DeepSeek account rows stay enabled (`deepseek-account`, `llm-deepseek-account`, `account-controller`, `ui-settings-account`, `web-deepseek-api`, and `web-search-deepseek`) as a personal sign-in, which the company allows or forbids through Mindeck Cloud's `policies.personalDeepSeek`; the Mindeck account plugin applies that policy, and it is off by default. The `ui-settings-account` row marks DeepSeek's first-run introduction as skipped (`step: done`, `completion: skipped`), so a personal sign-in does not open DeepSeek's full-screen welcome, recharge, and purpose pages, which would also rewrite the Developer tools preference. The Mindeck account launcher shadows the DeepSeek launcher at slot priority -1. The layer disables `llm-deepseek` (the personal API-key route), `llm-pi-ai`, and the Models settings page with personal API keys, because personal API keys would bypass both the company gateway and a DeepSeek account. A first-use default Workspace is created under `<Documents>/Mindeck`, apart from the folder of an official DeepSeek Harness installation.

The agent introduces itself as Mindeck, the company's work assistant: the layer replaces the DeepSeek Harness identity opener with a Mindeck one, which also tells the model to say that the company has not turned on web search when no search tool is available, and which stays in front of each agent preset's own persona. New conversations start with `mindeck-general`, the general assistant that the digital-employee plugin registers: the layer sets the preset registry's `default`, the only setting the stock Web layer gives that row. It disables [harness-dev-context](../../context/harness-dev-context/README.md), which tells the model about the harness checkout and Web GUI, and the [Session log upload setting](../../client/ui-settings-session-log/README.md), because uploads only accompany requests to the DeepSeek API provider that this layer leaves out.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The manifest declares `dsh.bundle.patch` as [`cordis.patch.yml`](cordis.patch.yml). That patch disables the official brand and the replaced rows by id, inserts the Mindeck plugins, sets the `web` providers, the DeepSeek introduction state, the preset registry's `default`, and the Workspace controller's `documentsFolder`, and replaces the `system-prompt` configuration with the Mindeck `identity` and the Web layer's `personaPrefix`. It adds no service or mutable runtime state; the selected plugin owns registration and cleanup. Later patches follow normal profile precedence.

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

### Mindeck identity

#### What the model sees

The system prompt opens with the identity below in the `harness:identity` section, followed by the persona of the session's agent preset: `You are a work assistant powered by the {{model}} model.` for the general assistant, or a [digital employee's persona](../../mindeck/mindeck-employees/README.md#model-experience). The DeepSeek Harness identity sentence and the harness checkout and Web GUI guidance are absent. The company models, web search, skills, and file-library tools come from the Mindeck plugins and are described in their READMEs.

##### Identity

```markdown
You are Mindeck, the AI work assistant that the user's company provides. You help with the user's work, such as writing, analysis, research, documents, data, and code. When no web search tool is available, say that the company has not turned on web search instead of guessing current facts.
```

#### Token effect

The identity replaces the DeepSeek Harness sentence and adds about 50 tokens; the two harness-dev-context paragraphs and runtime-context lines are gone, so the system prompt is shorter than in the stock Web composition.

#### KV Cache effect

The identity is fixed text at the start of the system prompt, so it does not split the cached prefix between Sessions.

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
