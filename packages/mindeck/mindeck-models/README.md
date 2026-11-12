---
description: "Serve the models a company provides in Mindeck Cloud through the Cloud gateway with the desktop session."
kind: "package-reference"
---

# @deepseek-ai/dsh-mindeck-models

English | [中文](README.zh.md)

## Summary

Use the models a company provides in Mindeck Cloud. While Mindeck Desktop is signed in, this plugin reads the member's model catalog and offers each model in the model selector. Requests go to the Mindeck Cloud gateway with the desktop session token, so the Cloud applies the company's model access, quotas, and usage records. Signing out removes the models.

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

Mount the plugin on the Host after the [Mindeck account](../mindeck-account/README.md) and the LLM service. The Mindeck application bundle does this. Models appear after sign-in, grouped under the company name, and the default model moves to the first company model when it names a model this desktop cannot use.

The catalog is read again after each sign-in or sign-out, every `refreshIntervalMs` (ten minutes by default), and after the gateway reports a model that no longer exists. A failed refresh keeps the current models. `defaultContextWindow` and `defaultMaxTokens` size a model whose catalog entry leaves the size unset; `requestTimeoutMs` bounds each catalog request.

Gateway refusals keep Mindeck Cloud's own message. A 401 ends the desktop session, and the sign-in dialog appears. A 402 means the member's or department's monthly quota is used up and is not retried. A 404 means the administrator removed the model or the member's access to it, and the catalog is read again.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Maintainer details — click to expand</summary>

The plugin reads `GET {endpoints.models}` from the session bootstrap and groups the models by client API into three pi-ai routes: `mindeck-anthropic` (`anthropic-messages`), `mindeck-openai` (`openai-completions`), and `mindeck-openai-responses` (`openai-responses`). A route exists only while it has models; its endpoint is the gateway URL of its first model. The adapter comes from `createPiAiAdapter` in [llm-pi-ai](../../llm/llm-pi-ai/README.md), so request headers, image attachments, and replay follow the ordinary pi-ai routes; the credential is the current session token, read for each request. An unchanged catalog changes no registration. Each route whose models change emits `llm/models-updated`.

`GatewayAdapter` delegates to the pi-ai adapter and rewrites error finishes. It reads the HTTP status and the gateway's `error.message` from the SDK failure text, maps 401 to `ACCOUNT_TOKEN_INVALID` and reports the token to `mindeckAccount.rejectToken`, maps 402 to `QUOTA`, 403 to `AUTH`, and 404 to `UNKNOWN_MODEL`, and keeps other codes.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Mindeck account](../mindeck-account/README.md) — the desktop session this plugin uses.
- [llm-pi-ai](../../llm/llm-pi-ai/README.md) — the adapter behind the routes.
- [Mindeck development documentation](../../../docs/mindeck/README.md) — the Mindeck application and its Cloud services.

-----

<a id="model-experience"></a>
## Model Experience

### Company model requests

#### What the model sees

Requests on `mindeck-anthropic`, `mindeck-openai`, and `mindeck-openai-responses` add no model-visible text from this plugin; pi-ai serializes each request for the route's client API. The gateway replaces the model name with the administrator's upstream model and forwards the request unchanged.

#### Token effect

The plugin adds no input tokens. The catalog sets each model's context window and output limit, falling back to `defaultContextWindow` and `defaultMaxTokens`, which each request's logged context and header record.

#### KV Cache effect

The session token and the catalog do not enter model input. Prompt caching depends on the upstream model service behind the gateway.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Model reasoning levels and pricing are not part of the Cloud catalog; routes use pi-ai defaults.
- A gateway 502, such as an upstream key problem, is retried like other server errors before its message appears.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

None.

</details>
