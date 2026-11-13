---
kind: upgrade-guide
description: "Agent preset names and descriptions may be translation maps, and presetDisplayText takes a resolveText argument."
---

# Agent preset names accept translations

English | [中文](guide.zh.md)

## Change

`name` and `description` of `PresetDefinition`, `AgentPreset`, `AgentPresetRow` and `AgentPresetDocument`, and `name` of `AgentPresetComposition`, all exported from `@deepseek-ai/dsh-agent-preset-registry`, are typed as `LocalizedText`: one literal, or translations keyed by lowercase language id with a required English entry. `AgentPresetPluginGroup.name` from `@deepseek-ai/dsh-host-plugin-inventory` follows. The `agentPresets/list`, `agentPresets/read` and `pluginInventory/list` Remotes return a published map unchanged. `presetDisplayText` from `@deepseek-ai/dsh-agent-preset-registry/display` takes a required third argument, `resolveText`. `@deepseek-ai/dsh-agent-preset` rows in `cordis.yml` still accept only literals. Extensions and clients that read preset names or call `presetDisplayText` are affected.

## Migration

1. Pass `text => ctx.locale.resolveText(text)` as the third argument of every `presetDisplayText` call in a Client plugin.
2. Where code reads a preset `name` or `description` directly, resolve it with `ctx.locale.resolveText` before using it as a string. A client without the DSH locale service reads `typeof text === 'string' ? text : text[language] ?? text.en`.
3. Run the extension's typecheck and confirm that no `LocalizedText` value is assigned to a `string`.
