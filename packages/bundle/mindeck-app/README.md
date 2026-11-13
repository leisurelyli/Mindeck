---
description: "Mindeck presentation over the stock Web composition."
kind: "package-bundle"
---

# @deepseek-ai/dsh-mindeck-app

English | [中文](README.zh.md)

## Summary

Use this layer to display Mindeck artwork over the stock Web application. Mindeck Desktop includes it in its owned profile; source Web launchers select its patch through `--patch`. It changes presentation and the agent's persona while installation identity and state paths remain controlled by the Mindeck launcher. This package also owns the shared product descriptor at `src/product.json`, which the Desktop and Web launchers read for product names and build assets; the descriptor adds no runtime service.

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

Members sign in with a Mindeck Cloud account and use the models, skills, and file library their company configures there. The layer adds the [account](../../mindeck/mindeck-account/README.md), [company models](../../mindeck/mindeck-models/README.md), [company skills](../../mindeck/mindeck-skills/README.md), and [file library](../../mindeck/mindeck-files/README.md) plugins. It disables the DeepSeek account and its sign-in UI, the DeepSeek model providers and web search, the `llm-pi-ai` routes from personal settings, and the Models settings page with personal API keys. Every model request therefore goes through the Mindeck Cloud gateway, which meters it against the company quotas. A first-use default Workspace is created under `<Documents>/Mindeck`, apart from the folder of an official DeepSeek Harness installation.

The agent introduces itself as Mindeck, the company's work assistant: the layer replaces the DeepSeek Harness identity and the coding-agent persona with a Mindeck persona and disables [harness-dev-context](../../context/harness-dev-context/README.md), which tells the model about the harness checkout and Web GUI. It also disables the [Session log upload setting](../../client/ui-settings-session-log/README.md), because uploads only accompany requests to the DeepSeek API provider that this layer leaves out.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The manifest declares `dsh.bundle.patch` as [`cordis.patch.yml`](cordis.patch.yml). That patch disables the official brand and the replaced rows by id, inserts the Mindeck plugins, sets the Workspace controller's `documentsFolder`, and replaces the `system-prompt` configuration with `includeHarnessIdentity: false` and the Mindeck `personaPrefix`. It adds no service or mutable runtime state; the selected plugin owns registration and cleanup. Later patches follow normal profile precedence.

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

### Mindeck persona

#### What the model sees

The system prompt opens with the persona below in the deployment persona-prefix section, with `{{model}}` replaced by the selected model's name. The DeepSeek Harness identity sentence, the Web layer's coding-agent persona, and the harness checkout and Web GUI guidance are absent. The company models, skills, and file-library tools come from the Mindeck plugins and are described in their READMEs.

##### Persona prefix

```markdown
You are Mindeck, the AI work assistant that the user's company provides, powered by the {{model}} model. You help with the user's work, such as writing, analysis, research, documents, data, and code.
```

#### Token effect

The persona replaces the identity sentence, the Web persona, and the two harness-dev-context paragraphs and runtime-context lines, so the system prompt is shorter than in the stock Web composition.

#### KV Cache effect

The persona is fixed text for each model, so Sessions with the same model share the cached prefix.

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
