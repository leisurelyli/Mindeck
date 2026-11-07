---
description: "Show Mindeck branding in the sidebar, conversation home, and desktop onboarding."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-mindeck

English | [中文](README.zh.md)

## Summary

Show Mindeck branding in the sidebar and blank conversation home, and workspace screenshots during desktop onboarding. Both marks use the supplied SVG in its original blue and cyan colors. The presentation is static and adds no model requests.

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

Choose this package as the brand row in a deployment's Cordis composition, alongside the locale, renderer, sidebar and conversation plugins:

```yaml
- name: '@deepseek-ai/dsh-client-ui-brand-mindeck'
```

The row takes no configuration. Select it instead of `@deepseek-ai/dsh-client-ui-brand-official`; the official package remains available for upstream compositions. Selection follows composition rather than the client build profile. Set the deployment's locale `parameters.productName` to `Mindeck`; the brand dictionary uses `{productName}` and inherits the shared upstream default when omitted. The plugin uses each host's requested mark size and adds no whale background.

When [account settings](../ui-settings-account/README.md#desktop-onboarding) declares its illustration slot, the welcome and credit pages share this package's workspace screenshots, with English and Chinese variants for light and dark themes. Without that declaration, the plugin contributes only the sidebar and conversation branding.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The [browser entry](src/client/index.ts) registers the `mindeck` dictionaries through `locale` and waits for all three slot declarations before filling `sidebar.brand.mark`, `sidebar.brand.name` and `conversation.hero.brand.mark` together. Slot effects remove the complete set when a declaration disappears and restore it on redeclaration; unloading the plugin also removes its dictionaries. The [components](src/client/Brand.tsx) receive geometry and typed translation props. The shared client bundler imports the unchanged [canonical SVG](src/client/assets/mindeck.svg) and emits a package asset URL. The host entry is inert.

The [onboarding illustration](src/client/OnboardingIllustration.tsx) independently fills `desktop.onboarding.illustration` through `ctx.slots.inject` and `register`. It consumes the account-owned `step`, `locale` and `className` inputs through a type-only package dependency; positioning stays with the account step. Both steps use the same four WebP assets. Removing the declaration removes the occupant, redeclaration restores it, and unloading the plugin restores the account package's upstream fallback artwork.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

These references own the extension slots and client loading rules.

- [Sidebar](../ui-sidebar/README.md) — sidebar brand slots.
- [Conversation](../ui-conversation/README.md) — hero mark geometry.
- [Web client architecture](../../../docs/subsystems/web-client.md) — client plugin composition.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package contributes browser presentation only; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

The package owns the three brand occupants and the optional onboarding illustration occupant.

- Application icons, browser titles and installer identity belong to their platform owners.
- All three brand slot declarations are required before the sidebar and hero occupants appear; onboarding illustration registration is independent.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
