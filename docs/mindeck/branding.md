---
description: "Mindeck master artwork, generated platform icons, and application integration."
---

# Mindeck brand assets

English | [中文](branding.zh.md)

## Summary

Mindeck uses one supplied SVG for its application icons and client brand marks. Platform outputs live in Mindeck directories, while the upstream brand plugin and original artwork remain available.

## Table of Contents

- [Source artwork](#source-artwork)
- [Generate icons](#generate-icons)
- [Application integration](#application-integration)
- [Dev Note](#dev-note)

<a id="source-artwork"></a>

## Source artwork

The [product description](../../packages/bundle/mindeck-app/src/product.json) owns the product name and the `branding` paths for the master SVG, Desktop, installer, Web icons and PWA manifest. The [master SVG](../../packages/client/ui-brand-mindeck/src/client/assets/mindeck.svg) preserves the supplied geometry, blue/cyan colors and transparent background. Change this source when revising the mark; regenerate its platform derivatives rather than editing them individually. Development and release builds use the same artwork without a Dev badge.

<a id="generate-icons"></a>

## Generate icons

From the repository root, after installing the pinned dependencies, run:

```sh
corepack pnpm run render:mindeck-icons
```

The [generator](../../apps/desktop/scripts/render-mindeck-icons.ts) produces 15 files: Desktop PNG/ICO assets under `apps/desktop/resources/mindeck/`, installer images under `apps/desktop/installer/assets/mindeck/`, Web icons under `apps/web/public/mindeck/`, the Welcome mark at `apps/desktop/renderer/assets/mindeck.svg`, and `apps/web/public/mindeck.webmanifest`. The manifest derives `name` and `short_name` from the product name. Installer derivatives retain the upstream image dimensions. Apple touch and maskable icons use the existing white application background; other icons preserve transparency. The maskable variant keeps the artwork inside the platform safe circle.

<a id="application-integration"></a>

## Application integration

The [Mindeck presentation bundle](../../packages/bundle/mindeck-app/README.md) follows the stock Web bundle, disables `ui-brand-official` and selects the [Mindeck brand plugin](../../packages/client/ui-brand-mindeck/README.md). The stock Web bundle has no Mindeck dependency or row. The plugin supplies the sidebar mark/name and empty-conversation mark through slots; operating-system icons and installation identity remain owned by the build and launcher.

Mindeck launchers publish `productName` and `productTitle` through `DSH_LOCALE_PARAMETERS`. Product copy uses locale-owned name parameters; shared titles use `{productTitle}`. The [locale package](../../packages/client/locale/README.md#use-this-package) owns precedence and interpolation; the [Web boot package](../../packages/client/web/README.md#use-this-package) owns loading-name and title timing. The [Mindeck Web build plugin](../../apps/web/mindeck-branding.ts) applies initial HTML titles, icons and manifest links. Named `official` and `local` builds use Mindeck and Mindeck Dev respectively; unnamed builds honor `DSH_CLIENT_TITLE` and default to Mindeck Dev. Shared build-environment helpers retain upstream profile values. Source Web launchers also use an explicit title override as `productTitle`. [Installation isolation](isolation.md) owns application identifiers and data directories.

The build plugin keeps manifest, favicon and touch-icon URLs relative to the page directory. Their requests and the manifest's install scope stay under the application's mount when a reverse proxy serves it at a nested path.

Web product copy uses the public locale parameters. Native menus, dialogs and installer messages use the same product description's name. DeepSeek account, model and recharge references retain the service provider's name. Upstream credits, licenses, package names and compatibility identifiers retain their original names.

The brand plugin owns four Mindeck workspace screenshots in its assets: English and Chinese, each in light and dark themes. Each shows the signed-in workspace at 1280 × 640 CSS pixels, the width of a new Desktop window, with the Digital employees, Skills, and File library pages in the left sidebar, a few conversations, and the new-conversation headline. The workspace is drawn as a window at (320, 80) with a drop shadow on a transparent 1331 × 900 canvas, the frame that the account UI positions, so the welcome page shows the sidebar at common window widths and the headline from about 1,900 pixels wide. Recapture them from the running app when the workspace changes visibly. The plugin provides them to the welcome and credit steps through the root-scoped single slot `desktop.onboarding.illustration`, and to the hero of the shared first-run page, which the Mindeck sign-in uses, through `desktop.onboarding.page.illustration`. The shared account UI supplies the original upstream illustrations when a slot is empty, including after the provider unloads.

<a id="dev-note"></a>

## Dev Note

After changing the master, regenerate assets and run the affected artwork, branding, browser and packaging checks. Native installer and macOS bundle acceptance still requires the corresponding platform toolchain; generated image checks do not replace installation testing.
