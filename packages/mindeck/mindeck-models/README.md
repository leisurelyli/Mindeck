---
description: "Serve the models and web search a company provides in Mindeck Cloud through the Cloud gateway with the desktop session."
kind: "package-reference"
---

# @deepseek-ai/dsh-mindeck-models

English | [中文](README.zh.md)

## Summary

Use the models and web search a company provides in Mindeck Cloud. While Mindeck Desktop is signed in, this plugin reads the member's model catalog and offers each model in the model selector, and it offers web search while the company has turned it on. Requests and searches go to the Mindeck Cloud gateway with the desktop session token, so the Cloud applies the company's model access, quotas, and usage records. Signing out removes the models and search.

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

The catalog and the web search status are read again after each sign-in or sign-out, when the [account's sync](../mindeck-account/README.md#use-this-package) reports changed `models` or `webSearch`, every `refreshIntervalMs` (ten minutes by default) as a fallback, and after the gateway reports a model that no longer exists, which also asks the account to sync. A failed read keeps the current models and is retried after `retryIntervalMs` (15 seconds by default), twice as long after each further failure, up to `refreshIntervalMs`. Each catalog read is saved to `models-catalog.json` in `cacheDir` (empty means `mindeck` under the DeepSeek Harness home); at start, the member's saved catalog for the same Mindeck Cloud is offered until the Cloud answers. Models the company recommends come first and carry a **Recommended** badge in the model selector; the company's description of a model is part of the model listing. `defaultContextWindow` and `defaultMaxTokens` size a model whose catalog entry leaves the size unset; `requestTimeoutMs` bounds each catalog request.

A catalog model may carry the company's thinking levels, each with the value its request sends (`reasoningEfforts`; `false` for a model that does not think), the level a conversation starts at (`defaultReasoning`), and pi-ai request compatibility switches for its client API (`compat`), in the formats of [llm-pi-ai](../../llm/llm-pi-ai/README.md). With levels, the model selector offers them, and a conversation on the model starts at the company's level until the member picks the model or a level in the selector, which saves that level with the default model for new conversations; a digital employee's conversation starts at the level of the employee's default model. Without levels the selector offers none and the request carries no level, as before. Each setting is checked as a `providers` write checks it; one pi-ai refuses is left out of that model alone, the model stays usable, and the Host log names the model, the setting, and pi-ai's reason. When the company withdraws the level a member saved as the default, the saved default drops the level, so new conversations start at the company's level.

While the [web service](../../web/web/README.md) is present, the plugin registers the `mindeck-search` search provider. The Mindeck application bundle selects it with `web.searchProvider`. Each catalog read also reads `GET {endpoints.webSearch}`; while that reports the company's search as enabled, model steps are offered `web_search`, and while it is off they are not. A search sends the query, a result count of `searchCount` (10 by default) or the caller's smaller bound, and the member's latest question, shortened to 128 characters, to the gateway, which uses the company's DeepSeek key, counts the search against the member's quota and daily search limit, and returns the DeepSeek Search API's results. The gateway's refusal message, such as a used-up quota or daily limit, becomes the search failure the model reads. A Mindeck Cloud without web search offers none.

Gateway refusals keep Mindeck Cloud's own message. A 401 ends the desktop session, and the sign-in dialog appears. A 402 means the member's or department's monthly quota is used up and is not retried. A 403 means the account cannot use models now, such as a disabled account or an initial password still to change, and the transcript shows the Cloud's reason. A 404 means the administrator removed the model or the member's access to it, and the catalog is read again. A request that starts after the session ends fails with "已退出 Mindeck 企业账号，请登录后重试。" and is not sent. A 429 prompts the account to sync and is told apart by its `error.reason`, never by its message. The company's limit on requests per minute (`MEMBER_RATE_LIMIT`) or on requests running at once (`MEMBER_CONCURRENCY_LIMIT`) is waited out once: the transcript says that requests are many and the conversation continues by itself, after `minuteLimitWaitMs` (one minute by default) for the per-minute limit and after the gateway's fixed three seconds for the other. When the same limit refuses the conversation's retry, the request stops with an explanation that the conversation exceeds the company's limit, to try again later and to contact an administrator when it happens often. A 429 without a reason comes from the model provider; the transcript names the provider's limit, and the base retry policy retries it.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Maintainer details — click to expand</summary>

The plugin reads `GET {endpoints.models}` from the session bootstrap and groups the models by client API into three pi-ai routes: `mindeck-anthropic` (`anthropic-messages`), `mindeck-openai` (`openai-completions`), and `mindeck-openai-responses` (`openai-responses`). Every route shows the company name, so the model selector lists the models under one heading instead of by protocol. A route exists only while it has models; its endpoint is the gateway URL of its first model. The gateway adapter adds each model's description and, for a recommended model, the `RECOMMENDED_BADGE` to the route's model listing. Each model entry carries its catalog settings as its own `reasoningEfforts`, `reasoning`, and `compat`; the routes set no `reasoning` or `compat`, so a model whose settings change stays on the route its conversations name. `withSettings` checks the settings in order with `assertModelProfile`, adding each to the entry only when pi-ai accepts it, so `defaultReasoning` is checked against the levels kept before it; a read of the saved catalog checks them again. The adapter comes from `createPiAiAdapter` in [llm-pi-ai](../../llm/llm-pi-ai/README.md), so request headers, image attachments, and replay follow the ordinary pi-ai routes; the credential is the current session token, read for each request. In a conversation with a [digital employee](../mindeck-employees/README.md), a `llm-pi-ai/request-headers` listener adds `x-mindeck-employee` with the employee's Mindeck Cloud id to these routes' requests, and searches the conversation runs carry the same header, so Mindeck Cloud can attribute their usage. An unchanged catalog changes no registration. Each route whose models change emits `llm/models-updated`.

`MindeckSearchProvider` is available once the search status was read for the signed-in member and ready while that status is enabled, so the web service selects it but a model step admits no `web_search` while the company has search off. Its results are validated with zod before they become web sources. A 401 from the search endpoint reports the token to `mindeckAccount.rejectToken`; a status read that fails keeps the last status for the session.

`GatewayAdapter` delegates to the pi-ai adapter and rewrites error finishes. It reads the HTTP status and the gateway's `error.message` from the SDK failure text, maps 401 to `ACCOUNT_TOKEN_INVALID` and reports the token to `mindeckAccount.rejectToken`, maps 402 to `QUOTA`, 403 to `ACCOUNT_UNAVAILABLE`, and 404 to `UNKNOWN_MODEL`, and keeps other codes. A 429 whose `error.reason` names a company limit becomes `RATE_LIMIT` with `providerRetryAfterMs`, which the base retry policy waits for; every route's `retryPolicy` raises the accepted wait to `minuteLimitWaitMs`, because pi-ai drops the response's `Retry-After`. The adapter remembers, per conversation, that a company limit refused the last request, and maps a second refusal in a row to `MINDECK_RATE_LIMITED`, which no policy retries; any other finish forgets it. A request without a session fails with `MINDECK_SIGN_IN_REQUIRED`. The transcript shows the message of a code it does not translate, so these Mindeck codes carry Chinese explanations instead of the DeepSeek account and API-key texts.

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

Requests on `mindeck-anthropic`, `mindeck-openai`, and `mindeck-openai-responses` add no model-visible text from this plugin; pi-ai serializes each request for the route's client API, with the conversation's thinking level and the model's compatibility switches from the catalog. The session log records the level each request used. The gateway replaces the model name with the administrator's upstream model and forwards the request unchanged.

#### Token effect

The plugin adds no input tokens. The catalog sets each model's context window and output limit, falling back to `defaultContextWindow` and `defaultMaxTokens`, which each request's logged context and header record. Thinking at a higher level spends more output tokens, which count toward the output limit and the member's quota.

#### KV Cache effect

The session token and the catalog do not enter model input. Prompt caching depends on the upstream model service behind the gateway.

### Company web search

#### What the model sees

The `web_search` tool of [tool-web](../../web/tool-web/README.md) while the company has search on; its results are the DeepSeek Search API's titles, URLs, snippets, summaries, and dates. A refusal reads as the gateway's Chinese message, for example that today's searches are used up.

#### Token effect

The tool definition and each result count as input tokens, bounded by tool-web's result limits.

#### KV Cache effect

Turning search on or off changes the tools a step admits, which changes the request's tool list from that step on.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Pricing is not part of the Cloud catalog.
- Only the saved default drops a level the company withdraws. A conversation that selected that level fails its next request with `UNSUPPORTED_REASONING_EFFORT` until the member selects another level.
- A gateway 502, such as an upstream key problem, is retried like other server errors before its message appears.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

None.

</details>
