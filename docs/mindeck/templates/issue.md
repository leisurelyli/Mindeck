---
description: "Reusable local Mindeck ticket with triage, dependencies, acceptance, and verification evidence."
---

# Implementation ticket template

English | [中文](issue.zh.md)

## Summary

Use one file at `.scratch/<feature>/issues/<NN>-<slug>.md` for one independently reviewable unit of work. Link it to the feature specification and its prerequisite tickets. This template assigns no active implementation work.

## Table of Contents

- [Tracking](#tracking)
- [Work definition](#work-definition)
- [Verification record](#verification-record)
- [Completion](#completion)
- [Dev Note](#dev-note)

<a id="tracking"></a>

## Tracking

Triage and execution progress answer different questions; record both.

| Field | Value to supply |
|---|---|
| Ticket | Number and short title. |
| Specification | Relative path to the owning specification. |
| Triage | One of `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, or `wontfix`; start with `needs-triage`. |
| Progress | Not started, in progress, blocked, or done. |
| Owner | Assigned implementer or explicitly unassigned. |
| Depends on | Relative paths to prerequisite tickets, or explicitly none. |
| Blocks | Relative paths to dependent tickets, or explicitly none. |

<a id="work-definition"></a>

## Work definition

- Outcome: describe the behavior or artifact this ticket delivers.
- Scope: name the owning packages, files, and documentation.
- Exclusions: identify work assigned to another ticket.
- Constraints: link applicable rules and existing decisions.
- Acceptance: list observable criteria, including denial, recovery, or teardown where relevant.
- Test plan: name focused checks and required inputs; explain inapplicable test categories.

<a id="verification-record"></a>

## Verification record

Record actual executions without secrets or private business data. Keep planned checks in the test plan until they run.

| Check | Environment and inputs | Result | Evidence |
|---|---|---|---|
| Exact command or manual procedure. | Relevant versions and non-sensitive setup. | Pass, fail, or not run with reason. | Output summary or an accessible non-sensitive reference. |

<a id="completion"></a>

## Completion

Completion requires evidence for the agreed acceptance criteria, not only an implementation diff.

- [ ] Prerequisite tickets are satisfied and scope matches the specification.
- [ ] Acceptance criteria have recorded verification; remaining limits are explicit.
- [ ] Affected package documentation and formal references are updated.
- [ ] Required persistence acknowledgements, upgrade guides, and snapshots are addressed or explicitly inapplicable.
- [ ] Review findings and dependent-ticket handoff are recorded.

<a id="dev-note"></a>

## Dev Note

Record blockers and the next responsible person. Explain a `wontfix` disposition; it does not mean implementation completed. Replace template-relative links and remove the language switcher when creating a single-language local ticket.
