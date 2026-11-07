---
description: "Mindeck upstream integration policy and a record format for reviewed synchronization work."
---

# Upstream synchronization

English | [中文](upstream-sync.zh.md)

## Summary

This reference defines how maintainers review upstream changes for Mindeck. The public fork relationship is retained, and integration preserves both upstream history and Mindeck changes. This is a maintenance policy, not an executed synchronization record or a verified command tutorial.

## Table of Contents

- [Integration policy](#integration-policy)
- [Customization maintenance](#customization-maintenance)
- [Synchronization record](#synchronization-record)
- [Dev Note](#dev-note)

<a id="integration-policy"></a>

## Integration policy

Use a dedicated synchronization branch from the current Mindeck development branch. Confirm the target upstream revision, read its upgrade guidance, and merge it into that branch with its history intact. Resolve conflicts by preserving the required behavior from both projects, review the combined changes, and integrate through a PR after the relevant checks pass.

Select checks using [dsh-pre-push-checks](../../.agents/skills/dsh-pre-push-checks/SKILL.md). The record must distinguish a textually clean merge from verified application behavior. An unsuccessful validation leaves the synchronization unaccepted; any retained merge work belongs on its synchronization branch.

<a id="customization-maintenance"></a>

## Customization maintenance

This fork's default development and distribution identity is Mindeck. Keep brand assets and business behavior in their owning plugins and resources. Keep product-specific build and launcher implementations in Mindeck-owned modules, with small integration calls in shared files. Prefer existing configuration and extension points, and isolate required shared-code edits in focused commits. Link each customization to its package documentation or decision owner. When upstream changes an extension point, update the Mindeck consumer and its verification together.

Review workflow changes before enabling or running them on this fork. Record runner availability, required credentials, and any publication or deployment side effects. A successful upstream run does not establish that the fork's workflow configuration is usable.

<a id="synchronization-record"></a>

## Synchronization record

Record each integration in a local specification or ticket using the [templates](README.md#local-work). Keep acceptance evidence with that work instead of maintaining a second history in this reference.

| Field | Required content |
|---|---|
| Target | Selected upstream revision and Mindeck base revision. |
| Scope | Upstream release notes, affected local customizations, and migration requirements. |
| Conflicts | Affected paths, retained behavior, and review evidence. |
| Checks | Exact commands, environment, results, and unverified cases. |
| Automation | Runner and credential requirements; publication or deployment effects. |
| Acceptance | PR reference, accepted revision, and any follow-up owner. |

<a id="dev-note"></a>

## Dev Note

Synchronization cadence, the first accepted upstream baseline, and fork-specific CI configuration require their own scoped work. This reference does not enable workflows, publish packages, or schedule synchronization.
