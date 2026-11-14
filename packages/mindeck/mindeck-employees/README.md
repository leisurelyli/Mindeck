---
description: "Register the digital employees a company sets up in Mindeck Cloud as agent presets with their own persona, and offer them on a Digital employees page."
kind: "package-reference"
---

# @deepseek-ai/dsh-mindeck-employees

English | [中文](README.zh.md)

## Summary

Start a conversation with one of the company's digital employees. An administrator sets up each one in Mindeck Cloud: a job title, an avatar, a tagline, role instructions, up to four starter requests, suggested company skills, a default model, and the file library folders it consults. This plugin registers each employee as an agent preset with the employee's role and folders as its persona, and the general assistant `mindeck-general`, which new Mindeck conversations start with. A conversation with an employee starts on the employee's default model. The **Digital employees** page in the left sidebar starts a conversation with any of them, and the base preset picker on a blank conversation switches between them.

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
| `refreshIntervalMs` | `600000` | Interval between fallback refreshes while signed in |
| `retryIntervalMs` | `15000` | First wait after a failed refresh; it doubles up to `refreshIntervalMs` |
| `requestTimeoutMs` | `15000` | Timeout of one Mindeck Cloud request |
| `modelProviders` | `['mindeck-anthropic', 'mindeck-openai', 'mindeck-openai-responses']` | Model providers searched in order for an employee's default model; the first that lists its id serves it |

The roster names the general assistant **General assistant**, or **通用助手** in Chinese, ordered first. Each employee is `mindeck-employee-<Cloud id>`, named by its job title with its tagline as the description, both as Mindeck Cloud writes them; an administrator's own draft, which only that administrator receives, adds **(draft)**, or **（草稿）** in Chinese. The plugin refreshes after each sign-in or sign-out, when the [account's sync](../mindeck-account/README.md#use-this-package) reports changed `employees`, so an administrator's change reaches the desktop within about a minute, every `refreshIntervalMs` as a fallback, and after a failed refresh as `retryIntervalMs` describes; a 401 ends the desktop session. A Mindeck Cloud whose bootstrap names no `endpoints.employees` offers no employees.

A conversation resumes only while its preset is registered, so an employee that leaves the Cloud listing stays registered as retired: **(deactivated)** after its name and the description “An administrator deactivated this digital employee. Earlier conversations can continue.”, or **（已停用）** and “管理员已停用这位数字员工，可以继续之前的对话。” in Chinese, ordered last, with its last persona, and `listed: false`, so the preset picker shows it only on a conversation already using it and the registry refuses selecting it for another. At start, the plugin registers the employees it saved before it asks Mindeck Cloud. Signing out keeps them. When another member signs in on the same computer, the previous member's employees leave and the new member's saved ones register.

A blank conversation that gets an employee's preset, whether it opens under it or switches to it in the preset picker, selects the employee's default model through the first of `modelProviders` that lists it. When none lists it, the conversation keeps its model and the Host logs a warning. Switching a blank conversation from that employee to a preset without a default model, such as the general assistant, selects the deployment's default model again, unless the member chose another model in between. A conversation keeps its model once its first turn starts, and resuming it does not choose again. The employee's folders appear in its persona (see [Model Experience](#model-experience)), and [mindeck-files](../mindeck-files/README.md)'s `library_search` searches one of them by its library path. A Mindeck Cloud that sends neither field gives every employee no default model and no folders.

While the company offers at least one employee, the Client entry `@deepseek-ai/dsh-mindeck-employees/client` adds **数字员工** to the left sidebar before Plugins, with its page in the main column. The page shows the general assistant first, then each current employee with a head-to-chest portrait banner (a bundled drawing for each of the 24 avatar keys of Mindeck Cloud, on a soft backdrop that dark mode dims; an unknown key, such as one a newer Mindeck Cloud adds, or an image that fails to load shows the name's leading Latin word or number, such as `IT` for `IT 帮助台`, or else its first two characters, on a tinted square), its tagline, its starter requests, and, when it has them, its folders under **资料** and its default model's name under **模型**; retired employees are not listed, a draft carries **草稿**, and the general assistant's card offers three general requests. Choosing a card opens a blank conversation under its preset through the [Mindeck account](../mindeck-account/README.md)'s `mindeckComposer`, in the current Workspace, with the cursor in the message box; choosing a starter request also puts it in the message box, unsent. Every action on the page waits until that conversation shows. The sidebar row leaves when the company offers no employee or the member signs out. A folder the member's department cannot open reads **（你暂无权限）** after its name, and hovering the folders shows each one's path; a default model that the company models do not list is not shown.

Other Host plugins read `ctx.mindeckEmployees.foldersForSession(sessionId)`, the folders of a live conversation's employee with each one's library path and whether the member can open it, or undefined for the general assistant and other presets; [mindeck-files](../mindeck-files/README.md) scopes `library_search` with it.

Other Host plugins read `ctx.mindeckEmployees.employeeForSession(sessionId)`, the Cloud id of a live conversation's employee, or undefined for the general assistant and other presets; [mindeck-models](../mindeck-models/README.md) names it in gateway requests.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Maintainer details — click to expand</summary>

`agentPresets.readDocument(basePreset)` returns the base preset's rows as entry-list YAML, which the plugin parses with the Loader's `entryListSchema` so `!!js` conditions stay expressions. Each Mindeck preset copies those rows and replaces the whole config of every top-level `@deepseek-ai/dsh-persona` row with `{ prefix }`; rows without one get a persona row first. The base preset's own row may still be activating when this plugin starts, so a missing base preset waits once for the Host Loader to settle and then fails the refresh, which is logged and retried.

All registration changes run in one refresh loop. A refresh compares each wanted definition with the registered one and replaces only those that differ, disposing the old registration first because the registry refuses a second definition under one id; presets no longer wanted are disposed. Disposing the plugin stops the loop and disposes every registration.

`employees.json` in `cacheDir` records the last signed-in member and, for each member (Cloud address and user id), the employees in Cloud order followed by the retired ones. A Cloud listing replaces the member's current employees; cached ones missing from it become retired. Entries with an id outside `[A-Za-z0-9_-]`, without a name, or repeating an id are skipped; starters are trimmed and capped at four, and skill names must be valid skill names. Folders without an item id or repeating one are skipped, a folder without `accessible` counts as accessible, and Mindeck Cloud's `Space / folder` path becomes the library path `/Space/folder`; cache entries saved without these fields read as no default model and no folders.

The model choice listens to `agent/created` for new conversations and to `agent-preset/selected` for preset switches. It appends `model/selection` only while the conversation has no turn, after the preset selection that triggered it has been appended, and remembers the selection it made per Agent so that switching away restores the deployment default only over its own choice.

`ctx.mindeckEmployees.watch()` streams `MindeckEmployeeCatalog` over the `mindeckEmployees` Remote: the general assistant, then the current employees whose preset registered, without retired ones. Each card's model name comes from `llm.listModels` of `modelProviders`, so the catalog is published again on `llm/models-updated`. `employeeForSession` reads the Session's preset through `agentPresets.presetForSession` and answers only for employees of the member whose presets are registered. The Client registers the page in the root `main` slot and its `sidebar.panellist` row at order -30 together when the streamed catalog first lists an employee, and disposes both when it lists none.

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

In a conversation with a digital employee, the `deployment:persona-prefix` section is the text below with the company's values filled in; the identity, the other sections, and the tools come from the base preset and the deployment. `Your role:` is left out without a tagline, the instructions paragraph without instructions, the skills sentence without suggested skills, and the folders paragraph without folders. Each folder line gives its Mindeck Cloud label and library path, including folders the member cannot open, which `library_search` then explains. A space is put between adjacent braces in the company's text, so it never forms a prompt variable.

##### Employee persona

```markdown
You are "<name>", a digital employee of the user's company, powered by the {{model}} model. Your role: <tagline>

The company's instructions for this role:

<instructions>

The company suggests these skills for this role: /<skill>, /<skill>. Use them when they fit the task.

The company keeps the material for this role in these file library folders:
- <label>: folder "/<Space>/<folder>"
Before answering a question this material may cover, search it with library_search, setting folder to one of these folders, instead of answering from memory. Read the files you find with library_download, name the files your answer relies on, and say so when the material does not cover the question.
```

#### Token effect

The fixed text is about 40 tokens; the folders paragraph adds about 70 and about 10 per folder; the company's name, tagline, instructions, skill names, and folder labels and paths add their own length, and the instructions are not shortened.

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
- **A default model the company models do not list is skipped silently for the member** — the conversation keeps its model and only the Host log says why.
- **One cache file per home** — two Hosts of the same Mindeck home that refresh at the same moment each replace `employees.json`; the last write wins.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

None.

</details>
