---
description: "Show a member's company messages from Mindeck Cloud in the left sidebar: announcements and personal notices with the unread count, read marks, and the recommended version."
kind: "package-reference"
---

# @deepseek-ai/dsh-mindeck-inbox

English | [中文](README.zh.md)

## Summary

Read what the company sends a member in one place. While Mindeck Desktop is signed in to a Mindeck Cloud with an inbox, the left sidebar shows **Company messages** with the unread count the web console also shows. Its page lists company announcements and notices about the member's own requests, such as a decided quota request or a feedback reply, newest first; opening one shows all of it and marks it read on every device. When this build is older than the version the company recommends, the page starts with that version and its installer.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the default export on the Host after the [Mindeck account](../mindeck-account/README.md), and the `./client` entry in the Web Client. The Mindeck application bundle does both. Removing the row from a composition removes the sidebar row and the page and nothing else.

The row, its badge, and the page exist while the member is signed in and the bootstrap lists `endpoints.inbox`; a Mindeck Cloud that predates the inbox shows none of them. The row follows the other company rows, at `sidebar.panellist` order -5, and stays when the inbox is empty, so its place does not move. Its badge counts unread messages, up to 99+, from the account's sync answer, so the count changes within a minute of a new message or of a read on the web. Messages the member opens on this computer leave the count at once.

The page lists announcements with a megaphone and personal notices with an icon of their kind (quota request, feedback, handover, or a generic notice for a kind this build does not know), each with its title, an **Important** tag for an important announcement, the kind and the time it arrived, and the first two lines of its text. Opening a message shows its whole text, with web addresses as links, and **View details** for its link; both open in the system browser. Opening an unread message marks it read, and **Mark all as read** marks the rest. A read mark that does not reach Mindeck Cloud, as offline, still shows at once and is sent again after the next sync. **Show earlier messages** reads the next page of `pageSize` items (20 by default). While the page is open, a sync that reports a new or read message or a changed announcement reads the newest messages again.

The page has a loading, an empty, an offline, and a failed state. Without a connection, the messages loaded before stay under a one-line notice; with none loaded, the page says that the company's server cannot be reached and that the messages refresh by themselves. A failed answer shows its request ID for the company administrator. Nothing opens a dialog.

When the bootstrap's `client.recommendedVersion` sorts after this build's version by Semantic Versioning, a card at the top names that version, this build's version, and the company's release notes, and **Download** opens the company's installer for this computer in the system browser; without one, the card tells the member to ask the administrator. A build without release metadata shows no card. The card is not a message and does not count as unread.

| Option | Default | Meaning |
|---|---|---|
| `pageSize` | `20` | Messages read per page, from 1 through 50 |
| `requestTimeoutMs` | `15000` | Timeout of one Mindeck Cloud request in milliseconds |

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Maintainer details — click to expand</summary>

The Host service extends `TypertRemoteService` under the `mindeckInbox` Remote namespace and reads `ctx.mindeckAccount` for the session, `syncAnswer()` for the unread count, and `getState()` for the recommended version with this platform's installer. `watch` streams the summary (whether the inbox exists, the unread count, the recommendation). `items` streams the loaded messages while a page holds it open: opening it reads the newest messages, and `mindeck-account/revised` with `inbox` or `announcements` reads them again while one is open, unless the change is only the count returned by the page's own read report. `reload`, `loadMore`, and `markRead` drive the page; a reload keeps as many messages as are shown, up to 50, and a cursor Mindeck Cloud refuses starts the list again.

`GET {endpoints.inbox}` and `POST {endpoints.inbox}/read` carry the session token. Items of an unknown type are left out and logged, an unknown level reads as ordinary, and a link that is not `http(s)` is dropped. Unconfirmed read marks are kept per item, or as one mark-all with its time, and subtracted from Mindeck Cloud's count until a report succeeds; the next `revised` event sends them again. A 401 ends the session through `rejectToken`. Another member's sign-in starts the state over.

The Client follows `watch` through `remoteAccess.whenAccess('mindeckInbox/watch')` and registers the row (`sidebar.panellist`), its badge (`sidebar.panellist.badge`, which [ui-sidebar](../../client/ui-sidebar/README.md#use-this-package) places after the title and in the rail), and the page (`main`) while the summary says the inbox exists. The page follows `items` from mount to unmount. The badge's accessible text names the count with its unit, which the sidebar row announces as its description. The bell and megaphone glyphs are local drawings in `src/client/icons.tsx` because the shared icon set has neither.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Mindeck account](../mindeck-account/README.md#use-this-package) — the sync and its topics.
- [Mindeck subsystem reference](../../../docs/subsystems/mindeck.md) — ownership and the generated Cordis surface.

-----

<a id="model-experience"></a>
## Model Experience

None, as company messages are shown to the member and construct no model input.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- An important announcement only counts as unread; it raises no prompt of its own, because the base has no in-app prompt for messages that must be read.
- A row unpinned into the sidebar's More menu shows no badge there.
- The Client has English and Chinese copy; other locales fall back to English.
- The bell and megaphone glyphs are drafts outside the shared icon set and await designer review.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

None.

</details>
