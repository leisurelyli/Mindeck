---
description: "Mindeck application identity, independent data locations, and the limits of source-development isolation."
---

# Mindeck installation isolation

English | [中文](isolation.zh.md)

## Summary

This reference describes how Mindeck separates its installation and local state from official Harness and an existing application named Mindeck. The desktop [product description](../../packages/bundle/mindeck-app/src/product.json) owns the stable identity. Isolation does not migrate existing accounts, credentials, plugins, or sessions, and does not change the Agent or Session format.

## Table of Contents

- [Identity and state](#identity-and-state)
- [Development entry points](#development-entry-points)
- [External services and distribution](#external-services-and-distribution)
- [Acceptance](#acceptance)

<a id="identity-and-state"></a>

## Identity and state

Desktop resolves these locations before reading Electron settings, acquiring the single-instance lock, or starting the Host.

| Setting | Installed application | Development application |
|---|---|---|
| Display name | Mindeck | Mindeck Dev |
| Packaged application name | `mindeck-workspace` | Source development is not an installer. |
| Application ID | `io.github.leisurelyli.mindeck.workspace` | `io.github.leisurelyli.mindeck.workspace.dev` |
| External link | `mindeck-workspace://open` | `mindeck-workspace-dev://open` |
| Harness state | `~/.mindeck-workspace` | `~/.mindeck-workspace-dev` |
| Shared agent configuration | `agents/` under the selected state root | `agents/` under the selected state root |
| Electron user data | `MindeckWorkspace` under Electron appData | `MindeckWorkspaceDev` under Electron appData |

Use `MINDECK_HOME`, `MINDECK_AGENTS_HOME`, and `MINDECK_USER_DATA_DIR` for explicit absolute locations. Inherited `DSH_HOME`, `DSH_AGENTS_HOME`, and `DSH_DESKTOP_USER_DATA_DIR` do not select Desktop state. The launcher supplies the resolved directories to its own Host. Existing directory aliases are resolved, and paths overlapping the official `.dsh`, shared `.agents`, official Electron data, or existing Mindeck data are refused before creating Mindeck state. This check prevents accidental reuse; it is not an operating-system sandbox against concurrent filesystem changes.

The application keeps the internal `dsh-app` document scheme and package names because those are implementation interfaces. Its external operating-system protocol is separate. [Brand presentation](branding.md) does not change the workspace-suffixed installation IDs or directories.

Installed and development defaults separate saved sessions, settings, credential storage, plugin installations, browser caches, and logs. Keep custom path overrides and service credentials specific to each launch environment; a shared global environment variable or an explicit common path can still share configuration. Application-state isolation does not isolate project working files: use a dedicated test project directory for development instead of selecting the production project's writable directory.

<a id="development-entry-points"></a>

## Development entry points

The root `dev:desktop` and `start:desktop` scripts launch the development identity. The root `dev:web` and `start:web` scripts preload the same Mindeck development environment, use the supported `dsh web` profile with `--patch packages/bundle/mindeck-app/cordis.patch.yml`, and default to port 3081. Web and Desktop development share product data deliberately; their profiles remain distinct. Use explicit Mindeck overrides for independent checkouts or test runs.

`start:web:stock` and `dev:web:stock` boot the unmodified upstream composition: neither the Mindeck environment nor its patch applies, and the launcher uses the default `$DSH_HOME` (`~/.dsh`) and port 3080. Point `DSH_HOME` at a temporary directory when checking upstream behavior without touching local Mindeck state.

Desktop owns a profile ordered as base, stock Web, then Mindeck presentation, followed by user extension bundles. During preparation, the [Mindeck profile helper](../../apps/desktop/src/mindeck-profile.ts) fills in these required layers for an older profile and preserves user dependencies and `cordis.patch.yml`. Before changing an existing `package.json`, it copies the original bytes to `package.before-mindeck-UUID.json` in that profile directory. Repeated preparation leaves an already-correct bundle order unchanged.

The source Web environment and native `product-bootstrap.ts` derive public `DSH_LOCALE_PARAMETERS` from the product description. These presentation values do not select state paths. Their [locale configuration and restart rules](../../packages/client/locale/README.md#use-this-package) apply independently of installation isolation.

Direct `dsh` commands and the generic upstream CLI retain their own environment rules; they are not Mindeck-isolated launch shortcuts. Mindeck installers omit the public terminal launcher, and command-registration operations return `ENOTSUP`, so they do not take over the official command or alter PATH.

<a id="external-services-and-distribution"></a>

## External services and distribution

Automatic update and mandatory-update policy are disabled in the product description. Packaging embeds no update feed or mandatory policy, and the running shell disables update execution. Signing remains a separate requirement for a signed installer. Local unsigned package preparation uses the Mindeck application ID without requiring official release settings. Signed packaging does not require updater credentials or feed metadata; its release record states `automaticUpdates: false` and carries no update URL. Updater qualification preparation is refused while updates are disabled.

The packaged application name gives Windows its own installer data path and `mindeck-workspace-updater` cache. Uninstall cleanup selects the product's Electron data directory and preserves `MINDECK_HOME` or its default. The source package remains in the upstream namespace; it is not the installed application's identity.

The existing DeepSeek account integration, model providers, plugin catalog, and [product analytics](../../packages/client/product-analytics/README.md) are retained upstream capabilities; this isolation change does not replace them with team services or claim an offline product. Their deployment choices require separate review before team rollout. The inherited publication workflows and upload scripts are not a Mindeck release pipeline and must not be used to publish Mindeck artifacts without that review.

<a id="acceptance"></a>

## Acceptance

Source checks cover installation identity, independent directories, reserved paths and directory aliases, inherited environment replacement in a real child process, and refusal of global command registration. Actual installer coexistence requires independent acceptance of installation, upgrade, uninstall, signing, and protocol routing on each target platform. Keep that evidence with the release work; successful source tests do not establish those results.
