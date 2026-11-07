---
description: "Mindeck product and engineering references, document ownership, and local development templates."
---

# Mindeck documentation

English | [中文](README.zh.md)

## Summary

This reference is the entry point for Mindeck development in this public DeepSeek Harness fork. It separates confirmed product direction from implementation questions. The pages below guide development; they do not establish runtime acceptance.

## Table of Contents

- [Reading order](#reading-order)
- [Document ownership](#document-ownership)
- [Local work](#local-work)
- [Dev Note](#dev-note)

<a id="reading-order"></a>

## Reading order

Read the product scope before choosing an implementation, then consult the architecture and maintenance references.

1. [Product](product.md): confirmed goals and open scope questions.
2. [Architecture](architecture.md): reuse strategy, upstream references, and design questions.
3. [Upstream synchronization](upstream-sync.md): integration policy and verification records.
4. [Glossary](glossary.md): Mindeck business terminology.
5. [Installation isolation](isolation.md): application identity, independent state, and release limitations.
6. [Brand assets](branding.md): master artwork, platform generation, and UI integration.

<a id="document-ownership"></a>

## Document ownership

Keep each fact with its owner and link to it from other documents.

| Material | Location | Maintenance rule |
|---|---|---|
| Mindeck product and cross-package design | `docs/mindeck/` | Maintain with the affected implementation; keep open design questions explicit. |
| Shared Harness architecture and APIs | Existing upstream documentation | Update the owner when shared behavior changes; link instead of copying. |
| Package behavior and configuration | The owning package's README and JSDoc | Update together with code. |
| Lasting decision rationale | `.agents/notes/` | Follow the existing lifecycle and naming rules; include `mindeck` in Mindeck-specific filenames. |
| Active specifications and tickets | `.scratch/<feature>/` | Local and ignored by Git; promote durable knowledge to its owning document. |
| Business documents, accounts, and secrets | A private directory outside this checkout | Never include them in tracked documentation, fixtures, or attachments to public issues. |

The [root instructions](../../AGENTS.md), [documentation standard](../AGENTS.md), and [Agent Note policy](../../.agents/notes/README.md) govern these locations. Formal documentation follows the existing [English/Chinese pairing rules](../i18n/README.md); local tickets may use the team's working language.

<a id="local-work"></a>

## Local work

Use the [specification template](templates/spec.md) for `.scratch/<feature>/spec.md` and the [ticket template](templates/issue.md) for `.scratch/<feature>/issues/<NN>-<slug>.md`. Create one file per ticket, declare dependencies by relative path, and record acceptance evidence in the ticket that owns it. The committed templates contain no active product work.

Choose one triage value per ticket: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, or `wontfix`. Triage describes the next kind of attention; track execution progress separately in the ticket. A local ticket is not a backup or a shared project record: team handoff must explicitly provide the required specification and tickets without publishing private material.

<a id="dev-note"></a>

## Dev Note

MVP selection and implementation decomposition remain open. Record the agreed scope in a local specification before creating implementation tickets; these templates do not authorize product implementation or deployment.
