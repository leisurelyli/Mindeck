---
kind: upgrade-guide
description: "Agent 预设的名称和说明可以是译文表，presetDisplayText 新增 resolveText 参数。"
---

# Agent 预设名称支持译文

[English](guide.md) | 中文

## 变更

`@deepseek-ai/dsh-agent-preset-registry` 导出的 `PresetDefinition`、`AgentPreset`、`AgentPresetRow` 和 `AgentPresetDocument` 的 `name` 与 `description`，以及 `AgentPresetComposition` 的 `name`，类型改为 `LocalizedText`：一段原文，或按小写语言 id 列出的译文（必须包含英文）。`@deepseek-ai/dsh-host-plugin-inventory` 的 `AgentPresetPluginGroup.name` 随之改变。`agentPresets/list`、`agentPresets/read` 和 `pluginInventory/list` Remote 按原样返回发布的译文表。`@deepseek-ai/dsh-agent-preset-registry/display` 的 `presetDisplayText` 新增必填的第三个参数 `resolveText`。`cordis.yml` 中的 `@deepseek-ai/dsh-agent-preset` 行仍只接受原文。读取预设名称或调用 `presetDisplayText` 的扩展和客户端受影响。

## 迁移

1. 在客户端插件中，为每次 `presetDisplayText` 调用传入第三个参数 `text => ctx.locale.resolveText(text)`。
2. 直接读取预设 `name` 或 `description` 的代码，先用 `ctx.locale.resolveText` 解析，再当作字符串使用。没有 DSH 语言服务的客户端按 `typeof text === 'string' ? text : text[language] ?? text.en` 读取。
3. 运行扩展的类型检查，确认没有把 `LocalizedText` 值赋给 `string`。
