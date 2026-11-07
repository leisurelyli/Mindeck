---
kind: upgrade-guide
description: "Mindeck Desktop uses separate installation and data identities and does not install the Harness command or use its update services."
---

# Mindeck installation and state isolation

English | [中文](guide.zh.md)

## Change

This fork's Desktop product is Mindeck, with the application ID `io.github.leisurelyli.mindeck.workspace` and external scheme `mindeck-workspace`. Development uses Mindeck Dev and `mindeck-workspace-dev`. It uses independent state instead of the official Harness home, and generic `DSH_HOME` or `DSH_AGENTS_HOME` overrides do not select its Desktop state. Automatic updates, mandatory update policy, and global `dsh` command installation are disabled. Official installations are not migrated or upgraded by these changes.

Packaged metadata uses the name `mindeck-workspace` so Windows installer cleanup and update caching do not reuse the upstream package name. Release records omit update URLs while updates are disabled; the inherited updater qualification preparer refuses new runs.

The stock Web bundle uses upstream branding. Mindeck presentation follows it as `@deepseek-ai/dsh-mindeck-app`. The repository's `start:web` and `dev:web` scripts select that patch, Mindeck development state and port 3081. Direct `dsh` commands retain their upstream behavior.

Product names come from the launcher's public locale parameters instead of dictionary replacement. The [locale package](../../../../packages/client/locale/README.md#use-this-package) defines precedence and restart requirements.

## Migration

1. Keep the existing official application and its state in place. Start Mindeck with separate state; no automatic account, credential, plugin, or session migration is provided.
2. Replace Desktop path overrides with `MINDECK_HOME`, `MINDECK_AGENTS_HOME`, and `MINDECK_USER_DATA_DIR` where needed. Each must be an absolute path outside reserved official and existing Mindeck state locations. Defaults are documented in [Mindeck isolation](../../../mindeck/isolation.md).
3. Update external application links to `mindeck-workspace://open`. Use `mindeck-workspace-dev://open` only for registered development applications. Keep official `dsh://` links assigned to the official application.
4. Use the Mindeck launch scripts for its presentation. Desktop preparation adds base, stock Web and Mindeck layers before user extensions. If an existing profile manifest needs rewriting, it saves an original-byte `package.before-mindeck-UUID.json` backup beside `package.json`; user dependencies and patches remain. Confirm the required bundle order in `dsh.profile.bundles` as described in [isolation](../../../mindeck/isolation.md#development-entry-points).
5. For custom names, set a nonempty Host locale `parameters` map or the public `DSH_LOCALE_PARAMETERS` JSON input. Use `{productName}` in ordinary dictionary copy and `{productTitle}` in titles. Keep secrets out; restart the corresponding Host and reload the page. Source Web launchers also apply an explicit `DSH_CLIENT_TITLE` override to `productTitle`.
6. Distribute later Mindeck versions through a separate reviewed installer process. Confirm identity and data isolation before installation; installing, upgrading, uninstalling, and signing release artifacts require their own acceptance and are not established by source tests.
