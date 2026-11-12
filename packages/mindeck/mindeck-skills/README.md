---
description: "Keep a local copy of the skills a company provides in Mindeck Cloud and serve it as a skill provider."
kind: "package-reference"
---

# @deepseek-ai/dsh-mindeck-skills

English | [中文](README.zh.md)

## Summary

Use the skills a company publishes in Mindeck Cloud. While Mindeck Desktop is signed in, this plugin keeps a local copy of the skills the member receives and serves them like skills in a custom skill directory. Signing out removes the copy.

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

Mount the plugin on the Host after the [Mindeck account](../mindeck-account/README.md) and the skill registry. The Mindeck application bundle does this. Company skills appear under the `mindeck` provider with the `custom` source: project skills take precedence over them, and they take precedence over the member's own user skills of the same name.

The plugin refreshes after each sign-in or sign-out and every `refreshIntervalMs` (ten minutes by default). It downloads only skills whose content changed and removes skills the member no longer receives. A skill that fails to download keeps its previous copy until the next refresh. `maxSkillBytes` and `maxSkillFiles` bound one skill, `requestTimeoutMs` bounds each request, and `cacheDir` moves the cache from its default, `mindeck` under the DeepSeek Harness home.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Maintainer details — click to expand</summary>

The cache directory holds `skills/` (one directory per skill), `staging/`, and `skills.json`, which records the Cloud address, the member, and each skill's content hash. A sync lists `GET {endpoints.skills}`, downloads `GET {endpoints.skills}/{name}` for each skill whose hash or `SKILL.md` is missing, checks every path and the size limits, writes the files into `staging/`, and renames the result over the cached directory. A manifest for another member or Cloud address clears the cache before syncing; sign-out clears it entirely. A 401 reports the token to `mindeckAccount.rejectToken`.

A `FileSystemSkillProvider` from [skill-filesystem](../../skill/skill-filesystem/README.md) serves `skills/` as its only root, without watching it; the plugin invalidates the catalog after each sync that changed the cache. Paths must be relative, use `/`, avoid `.` and `..` segments, and avoid names Windows cannot store; file names that differ only in case are refused.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Mindeck account](../mindeck-account/README.md) — the desktop session this plugin uses.
- [Skill registry](../../skill/skill/README.md) — how skills reach the model.
- [Mindeck development documentation](../../../docs/mindeck/README.md) — the Mindeck application and its Cloud services.

-----

<a id="model-experience"></a>
## Model Experience

### Company skills

#### What the model sees

Each company skill reaches the model the same way as a skill in a custom skill directory: its name and description in the skill catalog, and its `SKILL.md` body when the skill is used.

#### Token effect

Each skill adds its catalog entry; a used skill adds its body. The administrator controls both through the skill content.

#### KV Cache effect

A refresh that adds, changes, or removes a skill changes the skill catalog for later requests, like editing a skill directory.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Two Hosts of the same Mindeck home that sync at the same moment may each replace a skill directory; the last replacement wins.
- File permissions are not part of the Cloud format; scripts in a skill are written without the executable bit.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

None.

</details>
