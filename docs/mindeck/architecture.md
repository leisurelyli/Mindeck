---
description: "Mindeck's fork development constraints, upstream reuse references, and architecture design worksheet."
---

# Mindeck architecture

English | [中文](architecture.zh.md)

## Summary

This reference guides Mindeck changes within the Harness monorepo. Mindeck extends the existing application and favors documented plugin extension points. It records the reuse policy and sources for design; it does not claim that the team product is implemented or validated.

## Table of Contents

- [Development constraints](#development-constraints)
- [Reuse references](#reuse-references)
- [Verification boundaries](#verification-boundaries)
- [Dev Note](#dev-note)

<a id="development-constraints"></a>

## Development constraints

Use the [upstream architecture](../architecture.md) as the shared application reference. Keep Mindeck business rules in their owning plugins and services; reuse the existing UI and session execution mechanisms. Changes to shared code update its existing consumers and documentation under the [root rules](../../AGENTS.md). The product direction and scope remain owned by the [product reference](product.md).

[Installation isolation](isolation.md) owns Mindeck's application identity, startup paths, and update policy.

Presentation follows `dsh-base` → stock `dsh-web-app` → [dsh-mindeck-app](../../packages/bundle/mindeck-app/README.md). The Mindeck layer selects brand artwork while the stock Web layer stays independent. The [product description](../../packages/bundle/mindeck-app/src/product.json) supplies launch-time names and build assets; the shared [locale package](../../packages/client/locale/README.md) projects public interpolation defaults to the initial document. [Brand assets](branding.md) owns this integration. Runtime artwork providers do not own operating-system identity or state isolation.

<a id="reuse-references"></a>

## Reuse references

These owners describe the existing mechanisms to inspect before selecting an implementation.

| Concern | Upstream owner |
|---|---|
| Application composition and launch | [Architecture](../architecture.md) |
| Brand presentation | [Brand replacement](../../packages/client/ui-brand-official/README.md) |
| Role and system instructions | [System prompt](../subsystems/system-prompt.md) |
| Durable conversation state | [Session](../subsystems/session.md) |
| Directory and session grouping | [Workspace](../subsystems/workspace.md) |
| Non-owner access decisions | [Remote access](../../packages/api/remote-access/README.md) |
| Experimental shared sessions | [LiveShare](../subsystems/liveshare.md) |

<a id="verification-boundaries"></a>

## Verification boundaries

A Harness Workspace groups a directory and sessions; the Mindeck Project term does not establish a one-to-one mapping to that record. Remote access and LiveShare provide collaboration mechanisms, but their documented behavior is not acceptance evidence for project-wide membership or data isolation.

Before a design relies on cross-user isolation, verify the attachment-store access described in [Remote access](../../packages/api/remote-access/README.md) and the `run_code` file policy described in [LiveShare](../subsystems/liveshare.md). Treat upstream developer-preview and safety limits as stated in the [safety notice](../../SAFETY.md).

<a id="dev-note"></a>

## Dev Note

Complete these design questions after the first-release workflow is agreed. Record lasting decisions under the existing [Agent Note policy](../../.agents/notes/README.md).

- [ ] Identity, project membership, resource ownership, and authorization enforcement.
- [ ] The relation between projects, workspaces, sessions, and message authors.
- [ ] Role-agent definitions, instruction assembly, and tool permissions.
- [ ] Original file storage, knowledge indexing, references, and output retention.
- [ ] Package ownership, persistence requirements, and upgrade compatibility.
- [ ] Cross-user acceptance cases, deployment isolation, and recovery evidence.
