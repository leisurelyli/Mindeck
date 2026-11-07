---
description: "Confirmed Mindeck product direction and the questions that define its first release."
---

# Mindeck product

English | [中文](product.zh.md)

## Summary

Mindeck targets an internally self-hosted AI collaboration workspace for a team. Development takes place directly in a public DeepSeek Harness fork and reuses its UI, sessions, agent execution, and plugin system. This reference records product intent, not a list of delivered capabilities.

## Table of Contents

- [Confirmed goals](#confirmed-goals)
- [Scope discipline](#scope-discipline)
- [Dev Note](#dev-note)

<a id="confirmed-goals"></a>

## Confirmed goals

The product direction includes four related capabilities; their first-release depth is still a design question.

- Knowledge bases for reusable project information.
- Configurable role agents with role and system instructions.
- Projects in which multiple people share materials, agents, conversations, and outputs.
- A persistent file library for reusable source files and outputs.

Use the [glossary](glossary.md) for these terms and the [architecture reference](architecture.md) for implementation constraints.

<a id="scope-discipline"></a>

## Scope discipline

A feature enters the MVP only through an agreed specification with observable acceptance criteria. Keep proposed features separate from confirmed scope. Task boards and simultaneous document editing are not confirmed requirements. Public source code does not make business data public; follow the [document ownership rules](README.md#document-ownership).

<a id="dev-note"></a>

## Dev Note

The following questions are a design worksheet, not implementation commitments.

- [ ] Choose the smallest complete user workflow for the first release.
- [ ] Define project membership, shared conversation participation, and access revocation.
- [ ] Define role-agent configuration, reuse, and editing rights.
- [ ] Select supported knowledge sources and the expected retrieval evidence.
- [ ] Define file upload, reuse, output retention, and deletion behavior.
- [ ] Set deployment assumptions, expected concurrency, and acceptance evidence.

Capture the resulting scope, exclusions, and unanswered questions in the [specification template](templates/spec.md).
