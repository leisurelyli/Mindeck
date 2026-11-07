---
description: "Reusable specification worksheet for one local Mindeck feature and its dependent tickets."
---

# Feature specification template

English | [中文](spec.zh.md)

## Summary

Use this worksheet as `.scratch/<feature>/spec.md`. Replace each field with a concrete answer or an explicitly open question. This file is a template, not an approved feature specification.

## Table of Contents

- [Identification](#identification)
- [Problem and scope](#problem-and-scope)
- [Design and dependencies](#design-and-dependencies)
- [Acceptance and evidence](#acceptance-and-evidence)
- [Dev Note](#dev-note)

<a id="identification"></a>

## Identification

Record who owns the specification and what has been agreed.

| Field | Value to supply |
|---|---|
| Feature | Name and directory slug. |
| Owner | Person responsible for scope decisions. |
| Status | Draft, agreed, implementing, or accepted. |
| Scope agreement | Date and reference to the agreed scope; leave explicitly pending until agreed. |
| References | Relevant product, architecture, and decision documents. |

<a id="problem-and-scope"></a>

## Problem and scope

- User and need: describe the person, context, and problem.
- Desired outcome: describe an observable user result.
- Included behavior: list the smallest complete workflow.
- Exclusions: list adjacent work intentionally outside this specification.
- Constraints: identify data sensitivity, permissions, compatibility, and deployment assumptions.

<a id="design-and-dependencies"></a>

## Design and dependencies

- Existing owners: identify packages, services, UI, and documentation to reuse.
- Proposed changes: explain responsibilities, data flow, persistence, and failure handling as applicable.
- Decisions: link durable rationale to its Agent Note; separate unresolved choices.
- Tickets: list relative paths under `issues/`, each with prerequisites and acceptance responsibility.
- Migration and recovery: identify affected saved data, upgrade guidance, and recovery verification, or explain why they do not apply.

<a id="acceptance-and-evidence"></a>

## Acceptance and evidence

Give each observable result one acceptance item and one owning ticket. Select checks appropriate to the change under the [testing policy](../../testing.md).

| Acceptance item | Owning ticket | Verification | Observed result |
|---|---|---|---|
| Describe a user-observable outcome. | Supply a relative ticket path. | Name the check, environment, and required inputs. | Record actual evidence or mark not run. |

Consider unit, real-composition, e2e, recorded-session snapshot, UI, documentation, and build checks as applicable. Explain exclusions and missing test support; never treat a proposed command as a passing result.

<a id="dev-note"></a>

## Dev Note

Record open questions, the person who can resolve them, and the work each question blocks. Replace template-relative links with paths relative to the actual local specification, and remove the template language switcher when creating a single-language local file.
