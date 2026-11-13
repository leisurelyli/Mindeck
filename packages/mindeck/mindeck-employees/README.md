---
description: "Register the digital employees a company sets up in Mindeck Cloud as agent presets with their own persona, and offer them on a Digital employees page."
kind: "package-reference"
---

# @deepseek-ai/dsh-mindeck-employees

English | [中文](README.zh.md)

## Summary

Start a conversation with one of the company's digital employees. An administrator sets up each one in Mindeck Cloud: a job title, an avatar, a tagline, role instructions, up to four starter requests, and suggested company skills. This plugin registers each employee as an agent preset with the employee's role as its persona, and the general assistant `mindeck-general`, which new Mindeck conversations start with. The **Digital employees** page in the left sidebar starts a conversation with any of them, and the base preset picker on a blank conversation switches between them.

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

Mount the plugin on the Host after the [Mindeck account](../mindeck-account/README.md) and the [agent preset registry](../../preset/agent-preset-registry/README.md). The Mindeck application bundle does this and makes `mindeck-general` the registry's default.

| Field | Default | Meaning |
|---|---|---|
| `basePreset` | `standard` | Preset whose plugin rows every Mindeck preset reuses |
| `generalPersona` | `You are a work assistant powered by the {{model}} model.` | Persona prefix of the general assistant |
| `cacheDir` | `''` | Cache directory; empty means `mindeck` under the DeepSeek Harness home |
| `refreshIntervalMs` | `600000` | Interval between refreshes while signed in |
| `retryIntervalMs` | `15000` | First wait after a failed refresh; it doubles up to `refreshIntervalMs` |
| `requestTimeoutMs` | `15000` | Timeout of one Mindeck Cloud request |

The roster names the general assistant **通用助手**, ordered first. Each employee is `mindeck-employee-<Cloud id>`, named by its job title with its tagline as the description; an administrator's own draft, which only that administrator receives, adds **（草稿）**. The plugin refreshes after each sign-in or sign-out, every `refreshIntervalMs`, and after a failed refresh as `retryIntervalMs` describes; a 401 ends the desktop session. A Mindeck Cloud whose bootstrap names no `endpoints.employees` offers no employees.

A conversation resumes only while its preset is registered, so an employee that leaves the Cloud listing stays registered as retired: **（已停用）** after its name, the description 管理员已停用这位数字员工，可以继续之前的对话。, ordered last, with its last persona, and `listed: false`, so the preset picker shows it only on a conversation already using it and the registry refuses selecting it for another. At start, the plugin registers the employees it saved before it asks Mindeck Cloud. Signing out keeps them. When another member signs in on the same computer, the previous member's employees leave and the new member's saved ones register.

While the company offers at least one employee, the Client entry `@deepseek-ai/dsh-mindeck-employees/client` adds **数字员工** to the left sidebar before Plugins, with its page in the main column. The page shows the general assistant first, then each current employee with a half-body portrait (a bundled image by avatar key; an unknown key or an image that fails to load shows the name's first character on a tinted square), its tagline, and its starter requests; retired employees are not listed, a draft carries **草稿**, and the general assistant's card offers three general requests. Choosing a card opens a blank conversation under its preset through the [Mindeck account](../mindeck-account/README.md)'s `mindeckComposer`, in the current Workspace, with the cursor in the message box; choosing a starter request also puts it in the message box, unsent. Every action on the page waits until that conversation shows. The sidebar row leaves when the company offers no employee or the member signs out.

Other Host plugins read `ctx.mindeckEmployees.employeeForSession(sessionId)`, the Cloud id of a live conversation's employee, or undefined for the general assistant and other presets; [mindeck-models](../mindeck-models/README.md) names it in gateway requests.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Maintainer details — click to expand</summary>

`agentPresets.readDocument(basePreset)` returns the base preset's rows as entry-list YAML, which the plugin parses with the Loader's `entryListSchema` so `!!js` conditions stay expressions. Each Mindeck preset copies those rows and replaces the whole config of every top-level `@deepseek-ai/dsh-persona` row with `{ prefix }`; rows without one get a persona row first. The base preset's own row may still be activating when this plugin starts, so a missing base preset waits once for the Host Loader to settle and then fails the refresh, which is logged and retried.

All registration changes run in one refresh loop. A refresh compares each wanted definition with the registered one and replaces only those that differ, disposing the old registration first because the registry refuses a second definition under one id; presets no longer wanted are disposed. Disposing the plugin stops the loop and disposes every registration.

`employees.json` in `cacheDir` records the last signed-in member and, for each member (Cloud address and user id), the employees in Cloud order followed by the retired ones. A Cloud listing replaces the member's current employees; cached ones missing from it become retired. Entries with an id outside `[A-Za-z0-9_-]`, without a name, or repeating an id are skipped; starters are trimmed and capped at four, and skill names must be valid skill names.

`ctx.mindeckEmployees.watch()` streams `MindeckEmployeeCatalog` over the `mindeckEmployees` Remote: the general assistant, then the current employees whose preset registered, without retired ones. `employeeForSession` reads the Session's preset through `agentPresets.presetForSession` and answers only for employees of the member whose presets are registered. The Client registers the page in the root `main` slot and its `sidebar.panellist` row at order -30 together when the streamed catalog first lists an employee, and disposes both when it lists none.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Agent preset registry](../../preset/agent-preset-registry/README.md) — how presets compose and resume conversations.
- [Persona row](../../preset/persona/README.md) — the persona each preset replaces.
- [Mindeck development documentation](../../../docs/mindeck/README.md) — the Mindeck application and its Cloud services.

-----

<a id="model-experience"></a>
## Model Experience

### Digital employee persona

#### What the model sees

In a conversation with a digital employee, the `deployment:persona-prefix` section is the text below with the company's values filled in; the identity, the other sections, and the tools come from the base preset and the deployment. `Your role:` is left out without a tagline, the instructions paragraph without instructions, and the skills sentence without suggested skills. A space is put between adjacent braces in the company's text, so it never forms a prompt variable.

##### Employee persona

```markdown
You are "<name>", a digital employee of the user's company, powered by the {{model}} model. Your role: <tagline>

The company's instructions for this role:

<instructions>

The company suggests these skills for this role: /<skill>, /<skill>. Use them when they fit the task.
```

#### Token effect

The fixed text is about 40 tokens; the company's name, tagline, instructions, and skill names add their own length, and the instructions are not shortened.

#### KV Cache effect

The persona sits near the start of the system prompt, so conversations with different employees share only the cached identity before it. When an administrator changes an employee, conversations whose Agent starts after the refresh use the new persona; a resumed conversation then no longer matches its earlier cached prefix.

### General assistant persona

#### What the model sees

In a conversation with the general assistant, `generalPersona` replaces the base preset's persona; by default `You are a work assistant powered by the {{model}} model.`

#### Token effect

The default persona is about 10 tokens, the same length as the base persona it replaces.

#### KV Cache effect

The persona is fixed deployment text, so it does not change between requests or conversations.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Retired employees stay registered** — they are cached and registered without end, so the roster grows with every employee a company retires; the picker hides them, but nothing removes them.
- **The base preset menu lists the roster it last read** — it reads the roster when a new conversation opens, so employees that arrive while it is open appear there only in the next one; the Digital employees page updates at once.
- **Each employee mounts a full plugin tree** — the registry composes every preset eagerly, so memory and start time grow with the number of employees.
- **Resuming before registration fails** — a conversation with an employee opened before the saved employees register at start, or one with another member's employee, reports the preset as unknown until it registers.
- **One cache file per home** — two Hosts of the same Mindeck home that refresh at the same moment each replace `employees.json`; the last write wins.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

None.

</details>
