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
- [Shared-code changes](#shared-code-changes)
- [Synchronization record](#synchronization-record)
- [Dev Note](#dev-note)

<a id="integration-policy"></a>

## Integration policy

Use a dedicated synchronization branch from the current Mindeck development branch. Confirm the target upstream revision, read its upgrade guidance, and merge it into that branch with its history intact. Resolve conflicts by preserving the required behavior from both projects, review the combined changes, and integrate through a PR after the relevant checks pass.

Select checks using [dsh-pre-push-checks](../../.agents/skills/dsh-pre-push-checks/SKILL.md). The record must distinguish a textually clean merge from verified application behavior. An unsuccessful validation leaves the synchronization unaccepted; any retained merge work belongs on its synchronization branch.

<a id="customization-maintenance"></a>

## Customization maintenance

This fork's default development and distribution identity is Mindeck. Keep brand assets and business behavior in their owning plugins and resources. Keep product-specific build and launcher implementations in Mindeck-owned modules, with small integration calls in shared files. Prefer existing configuration and extension points, and isolate required shared-code edits in focused commits. Link each customization to its package documentation or decision owner. When upstream changes an extension point, update the Mindeck consumer and its verification together.

Generic unit and Web fixtures retain upstream composition and locale defaults. Product-branding acceptance selects Mindeck explicitly and also exercises upstream and alternate-product configurations. Keep branded expectations in product-specific cases; do not inject Mindeck globally into the test runner or rewrite unrelated upstream snapshots.

Run `pnpm run start:web:stock --dump-config` before and after a synchronization to confirm the stock profile still composes without Mindeck rows; reserve `start:web` for Mindeck-branded acceptance.

Track platform fixes separately from branding: Windows package preparation uses archive basenames with an explicit working directory, and documentation fixtures use directory junctions where file symlinks require elevated privileges. Review these patches independently during synchronization and retire them when upstream provides equivalent behavior.

Review workflow changes before enabling or running them on this fork. Record runner availability, required credentials, and any publication or deployment side effects. A successful upstream run does not establish that the fork's workflow configuration is usable.

<a id="shared-code-changes"></a>

## Shared-code changes

Mindeck Enterprise plugins live in `packages/mindeck/`. The following shared files carry Mindeck changes; review each one when an upstream revision touches it.

| Path | Mindeck change | Reason |
|---|---|---|
| `tsconfig.base.json`, `tsconfig.host.json`, `tsconfig.client.json` | Path aliases and project references for `packages/mindeck/*`. | The aggregate builds and checks include Mindeck packages. |
| `scripts/product-package-policy.ts` | Optional classification for Mindeck packages that only the Mindeck bundle mounts; no entry for `mindeck-app`, which Desktop main imports. | The product-use gate otherwise rejects packages outside the stock profiles. |
| `scripts/verify-package-readme-model-experience.ts` | Short Model Experience entry for `mindeck-account`. | The account adds no model input. |
| `packages/llm/llm-pi-ai/src/index.ts` | Exports `createPiAiAdapter` and `piAiAuthFrom`; the plugin builds its own adapter through the same wiring. | `mindeck-models` serves Cloud catalog routes through pi-ai without writing the `providers` configuration. |
| `packages/client/locale/package.json`, `packages/client/locale/tsdown.config.ts`, `scripts/check-workspace-constraints.ts` | Builds and publishes `lib/parameters.js` for the `./parameters` entry. | Web boot and the Client test runtime import the locale parameters without the Client bundle. |
| `scripts/package-dependency-policy.ts` | Classifies `defineTool` (`dsh-tools`) and `resolveDshHome` (`dsh-home-paths`) as peer-required Host exports. | `mindeck-files` has Host and Client faces, so the dependency gate reviews its Host imports. |
| `apps/desktop/src/main.ts` | Reads the product descriptor's `nativeWelcome`; when it is `false`, startup reads only the language preference, opens the workspace, and does not watch the DeepSeek account. | Mindeck disables the DeepSeek account, so the native welcome cannot read its state; members sign in through the Mindeck account in the workspace. |

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
