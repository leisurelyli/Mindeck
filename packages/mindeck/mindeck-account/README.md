---
description: "Sign Mindeck Desktop in to Mindeck Cloud with a device code and keep the desktop session for other Mindeck plugins."
kind: "package-reference"
---

# @deepseek-ai/dsh-mindeck-account

English | [中文](README.zh.md)

## Summary

Sign Mindeck Desktop in to the company's Mindeck Cloud. The member enters the Cloud address once, confirms a device code in the browser, and the desktop stores the resulting session in the credential store. Other Mindeck Host plugins read that session for the company models, skills, and file library. While no session exists, a full-screen sign-in on the base first-run page covers the workspace.

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

Mount the default export on the Host beside the credentials, settings, and Typert services, and the `./client` entry in the Web Client. The Mindeck application bundle does both.

While signed out, the sign-in draws the base [first-run page](../../client/ui-settings-account/README.md#pages-for-other-accounts) over the workspace, on Desktop and in a browser. On a device's first start, a welcome page names what the company account gives; **Get started**, a sign-in, or a session stored before sets the plugin's `welcomed` configuration field, so the page appears once per device. The address page then asks for the Cloud address that the administrator provides, such as `cloud.example.com`; an address without a scheme means HTTPS. Pasting a whole activation message or an invitation link keeps its first web address without the query. The Host accepts the address when it, or a shorter path prefix of it down to the origin, answers as a Mindeck Cloud, so a link to a Cloud page resolves to that Cloud; it stores the result in the `cloudUrl` configuration field. A deployment can preset that field with a profile patch row `- id: mindeck-account` whose `config` sets `cloudUrl`, which fills in the address; the member can change it only while signed out. **Continue** starts the device sign-in: the confirmation page shows the code, the time left until it expires, **Copy link**, and **Open browser**, and the window where the member continued also opens the approval page by itself; **Back** cancels the attempt. After the member approves the code, the desktop reports its name, platform, and app version, reads the member's details, and stores the session; the stage greets the member and fades into the workspace as it was. A declined or expired code, an unreachable Cloud, or another failure returns to the address page with the reason. Settings → Account, drawn with the base account page parts before the DeepSeek page, shows the member with a link to the admin console (or Mindeck Cloud for a member), the company, department, role, this month's usage against the limit with its reset date, the Cloud address, **Help**, and **Sign out**; signing out from it closes Settings. The sidebar menu opens Settings and Mindeck Cloud, opens the Cloud help page, sends written feedback, shows **About Mindeck** (edition, version, company, Cloud address, the administrator contact the company set, and links to the Cloud privacy page and downloads), and signs out.

The DeepSeek account stays part of the composition as a second, personal sign-in that the company decides on. While the bootstrap's `policies.personalDeepSeek` is true, Settings → Account shows a **Personal DeepSeek account** card that says its usage is paid by the member's DeepSeek account outside the company quota, and signs in to or out of that account through the DeepSeek account Remote; after sign-in, its models and the base account page appear, renamed **DeepSeek account** through `ctx.locale.override`, with the balance and top-up. While the policy is false or absent, as with a Mindeck Cloud that predates it, the card is hidden and a stored DeepSeek credential is signed out. The company account's launcher registers at priority -1, so it shadows the DeepSeek account launcher in the sidebar.

Signing out removes the local session at once and ends it on Mindeck Cloud in the background. When Mindeck Cloud rejects the session, for example after an administrator disables the member or signs the device out, the session ends and the address page says so, with the Cloud address kept.

While signed in, the Host reads the month-to-date quota from `/api/desktop/quota` after sign-in, every `quotaRefreshMs` milliseconds (two minutes by default), and when the account menu opens or a request is refused for quota; a failed read keeps the last quota. The account menu shows the member's month-to-date cost against the limit, and the department's when it has one. When the company budget stops every member's requests once used up, the quota also carries the share of that budget used; members never see the company's amounts. From 75% of the limit that runs out first, a reminder above the composer names that limit, its usage, and the reset date, with a link to the usage page; it returns at 95% and when the limit is used up, even after the member dismissed the previous level. Feedback goes to the company's administrators through `POST /api/desktop/feedback` and never carries conversation content: the menu's written report, each `/feedback` remark with text or a category, and each answer the member rates down with its category and note. Rating the same answer again replaces what was sent, and taking the rating back or rating the answer up withdraws it; a positive rating sends nothing else. Forwarding follows `session/event` for live conversations and `feedback/committed` for closed ones, and a failure is only logged. When Mindeck Cloud refuses a model request for quota, a dialog names the used-up limit (the company budget first, then the member's or the department's) and the reset date from the quota read again on open, with the general explanation until that read shows a used-up limit, shows the administrator contact when the company set one, and links to the member's usage page in Mindeck Cloud.

Other Host plugins call `ctx.mindeckAccount.session()` for the Cloud address, the bearer token, and the bootstrap endpoints, re-read it on `mindeck-account/changed`, and report an HTTP 401 with `rejectToken(token)`. The token never reaches a Client.

Host services that stream a value they read again after each change use the exported `followChanges(listeners, signal, lifetime, read)`: it yields `read()` at once and again after each change notice, collapses notices that arrive during a read into one read, and ends when either signal aborts; [mindeck-skills](../mindeck-skills/README.md) and [mindeck-files](../mindeck-files/README.md) stream their listings with it.

In the Web Client, the plugin provides `ctx.mindeckComposer` while the sessions, Workspace, Workspace UI, and agent preset Remote services exist. `draft(sessionId)` returns the scope and input of a conversation the Client has open. `startConversation({ agentPreset, prepare })` opens a blank conversation in the current Workspace as New Session does: the Workspace of the conversation in the main column, otherwise the Workspace whose conversations changed last. It asks for `agentPreset`, or for the Host's default preset from the preset roster, and reuses that Workspace's first blank conversation of no other preset, with its draft, or creates one; when the roster cannot be read, any blank conversation can be reused. `prepare` edits the draft before the conversation shows, and the message box takes focus. A refused creation appears in the Workspace notice and keeps the current page; without any Workspace, it behaves as New Session and skips `prepare`. The digital employee, skills, and file library pages start conversations through it.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Maintainer details — click to expand</summary>

The Host service extends `TypertRemoteService` under the `mindeckAccount` Remote namespace. It owns at most one sign-in attempt; `startSignIn` joins a running attempt, and `cancelSignIn` aborts the attempt and waits for it. An attempt requests a device code, reports the computer's name, platform, and app version to `PUT /api/desktop/device-request` so the Cloud approval page can show them (a failed report only leaves them out), polls the token endpoint at the interval Mindeck Cloud returns (five seconds longer after each `slow_down`; a poll that gets no response sets the attempt's `retrying` flag and polling continues until the code expires), reports the device, reads `/api/desktop/bootstrap`, and stores `{ version: 1, cloudUrl, token, bootstrap }` as the `mindeck-account/default` grant record. When an attempt fails after the token was issued, the Host ends that token on Mindeck Cloud so that no session is left behind. A stored record that fails validation counts as signed out.

At startup the Host reads the bootstrap again: a 401 ends the session, changed details replace the cached ones, and an unreachable Cloud keeps the session for offline use. `rejectToken` removes the session only when it still holds the rejected token, so a late rejection never ends a newer sign-in.

The Client mounts the generated Remote and follows the `watch` stream through `remoteAccess.whenAccess('mindeckAccount/watch')`, so a Client without account access renders none of the account UI. It registers the sign-in stage in `shell.overlay`, which covers the workspace until the first account state so that a signed-in start never shows a sign-in page and a signed-out start never shows the workspace, the launcher in `settings.launcher` at priority -1, the page in `settings.section` at order -20 with its icon in `settings.section.icon`, the quota dialog in `shell.quota-notice` for the `QUOTA` failure code, and the quota reminder in `conversation.input.dock`. It provides `mindeckComposer` from a child scope that injects `sessions`, `workspaces`, `uiWorkspace`, and `remote.agentPresets`, so the service leaves with any of them.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Mindeck development documentation](../../../docs/mindeck/README.md) — the Mindeck application and its Cloud services.
- [Credentials](../../credentials/credentials/README.md) — grant records.
- [Web Client Slots](../../../docs/subsystems/slots.md) — contribution lifetimes.

-----

<a id="model-experience"></a>
## Model Experience

None, as signing in and storing the desktop session construct no model input.

#### KV Cache effect

None; the Mindeck plugins that use the session own their model requests and cache effects.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The Client has English and Chinese copy; other locales fall back to English.
- One desktop holds one session; switching accounts requires signing out first.
- The Cloud address must stay the same while signed in; a moved Cloud requires signing out and in again.
- The company's personal DeepSeek policy is read with the bootstrap at start and sign-in, so a change reaches a desktop the next time Mindeck opens. Signing out a disallowed DeepSeek credential runs in the Client, so it happens once a Mindeck window is open.
- A personal DeepSeek sign-in starts only from Mindeck Desktop, which opens the authorization page itself; a plain browser window reports that it is desktop-only.
- The sign-in stage and the account page use the base account plugin's Factories. Without `ui-settings-account`, sign-in falls back to a plain dialog and the account page to the member's name and **Sign out**.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

None.

</details>
