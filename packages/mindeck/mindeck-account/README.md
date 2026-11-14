---
description: "Sign Mindeck Desktop in to Mindeck Cloud with a device code, keep the desktop session for other Mindeck plugins, and sync with company changes."
kind: "package-reference"
---

# @deepseek-ai/dsh-mindeck-account

English | [中文](README.zh.md)

## Summary

Sign Mindeck Desktop in to the company's Mindeck Cloud. The member enters the Cloud address once, confirms a device code in the browser, and the desktop stores the resulting session in the credential store. Other Mindeck Host plugins read that session for the company models, skills, file library, digital employees, and company messages, and the account's sync tells them within a minute when the company changes one of them. While no session exists, a full-screen sign-in on the base first-run page covers the workspace.

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

While signed out, the sign-in draws the base [first-run page](../../client/ui-settings-account/README.md#pages-for-other-accounts) over the workspace, on Desktop and in a browser. On a device's first start, a welcome page names what the company account gives; **Get started**, a sign-in, or a session stored before sets the plugin's `welcomed` configuration field, so the page appears once per device. The address page then asks for the Cloud address that the administrator provides, such as `cloud.example.com`; an address without a scheme means HTTPS. Pasting a whole activation message or an invitation link keeps its first web address without the query. The Host accepts the address when it, or a shorter path prefix of it down to the origin, answers as a Mindeck Cloud, so a link to a Cloud page resolves to that Cloud; it stores the result in the `cloudUrl` configuration field. A deployment can preset that field with a profile patch row `- id: mindeck-account` whose `config` sets `cloudUrl`, which fills in the address; the member can change it only while signed out. **Continue** starts the device sign-in: the confirmation page shows the code, the time left until it expires, **Copy link**, and **Open browser**, and the window where the member continued also opens the approval page by itself; **Back** cancels the attempt. After the member approves the code, the desktop reports its name, platform, and app version, reads the member's details, and stores the session; the stage greets the member and fades into the workspace as it was. A declined or expired code, an unreachable Cloud, or another failure returns to the address page with the reason. Settings → Account, drawn with the base account page parts before the DeepSeek page, shows the member with a link to the admin console (or Mindeck Cloud for a member), the company, department, role, this month's usage against the limit with its reset date, the Cloud address, when company data was last synced with **Sync now**, **Help**, and **Sign out**; signing out from it closes Settings. The sidebar menu opens Settings and Mindeck Cloud, opens the Cloud help page, sends written feedback, shows **About Mindeck** (edition, version, the version the company recommends, company, Cloud address, the administrator contact the company set, and links to the Cloud privacy page and to the company's installer for this computer; when the company recommends versions but offers no installer for this computer, About names the administrator to ask, as the company messages page does, and a Mindeck Cloud that does not report installers links to its home page), and signs out.

The DeepSeek account stays part of the composition as a second, personal sign-in that the company decides on. While the bootstrap's `policies.personalDeepSeek` is true, Settings → Account shows a **Personal DeepSeek account** card that says its usage is paid by the member's DeepSeek account outside the company quota, and signs in to or out of that account through the DeepSeek account Remote; after sign-in, its models and the base account page appear, renamed **DeepSeek account** through `ctx.locale.override`, with the balance and top-up. While the policy is false or absent, as with a Mindeck Cloud that predates it, the card is hidden and a stored DeepSeek credential is signed out. The company account's launcher registers at priority -1, so it shadows the DeepSeek account launcher in the sidebar.

Signing out removes the local session at once and ends it on Mindeck Cloud in the background. When Mindeck Cloud rejects the session, the session ends and the address page says why, with the Cloud address kept: the 401's `error.reason` `SIGNED_OUT_BY_ADMIN` reads as an administrator signing this computer out (an administrator also disabling the account), with the administrator contact of the ended session; `SIGNED_OUT_BY_MEMBER` as the member signing it out on the web; no reason, or one this desktop does not know, as an expired sign-in.

While signed in, the Host reads the month-to-date quota from `/api/desktop/quota` after sign-in, every `quotaRefreshMs` milliseconds (two minutes by default), and when the account menu opens or a request is refused for quota; a failed read keeps the last quota. The account menu shows the member's month-to-date cost against the limit, and the department's when it has one. When the company budget stops every member's requests once used up, the quota also carries the share of that budget used; members never see the company's amounts. From 75% of the limit that runs out first, a reminder above the composer names that limit, its usage, and the reset date, with a link to the usage page; it returns at 95% and when the limit is used up, even after the member dismissed the previous level. When the personal limit runs out first and Mindeck Cloud accepts a request for more, the reminder offers **Ask for more quota** in place of the link, and **View request** while one is pending; both open the quota dialog described below. Feedback goes to the company's administrators through `POST /api/desktop/feedback`: the menu's written report, each `/feedback` remark with text or a category, and each answer the member rates down with its category and note. A rating down also carries the context of the answer's round, as far as the conversation still holds it: the model id that produced the answer, the digital employee that a `mindeck-account/employee` listener names (mindeck-models answers it), and the skills the member invoked or the model loaded since the member's question, at most 50. Conversation content goes along only when the member ticks **Attach this round's question and answer**, which the account adds to the base feedback dialog through the `feedback.dialog.options` slot: a `feedbackUi.beforeSubmit` hook sends the choice to the Host with `prepareFeedback` before the rating is recorded, and the rating then carries the question and the answer's text, each cut to 4,000 characters. The choice starts unticked at every opening and applies to one rating. The dialog's rows say that administrators read the round only when it is ticked, that a written remark carries no conversation content, and that a rating up stays on this computer; the base hint that the submission includes the conversation log reads "Describe what happened (optional)" instead. Rating the same answer again replaces what was sent, an excerpt left out included, and taking the rating back or rating the answer up withdraws it; a positive rating sends nothing else. Forwarding follows `session/event` for live conversations, reading the Session's derived history, and `feedback/committed` for closed ones, reading the committed log; a failure is only logged. When Mindeck Cloud refuses a model request for quota, a dialog names the used-up limit (the company budget first, then the member's or the department's) and the reset date from the quota read again on open, with the general explanation until that read shows a used-up limit, shows the administrator contact when the company set one, and links to the member's usage page in Mindeck Cloud. When the quota read carries Mindeck Cloud's request state, the dialog also handles requests for more quota. While Mindeck Cloud accepts a request (the personal limit is at least 90% used and nothing blocks it), the dialog shows an optional reason of up to 200 characters and **Ask for more quota**, which posts `/api/desktop/quota-requests`. A pending request shows when it was sent, its reason, and **Withdraw request**, which asks for confirmation and then deletes `/api/desktop/quota-requests/current`. A used-up department limit or company budget shows the administrator contact and no request, since a personal request cannot raise it. The outcome of this month's last request appears above a new one, and an approval that gives the member room again says so. Mindeck Cloud's own refusal message, such as for a request already pending from another device, appears in the dialog, and the quota is read again after every answer. A decision changes the sync answer's `quota-request` topic, which reads the quota again, and reaches the member in Company messages.

Other Host plugins call `ctx.mindeckAccount.session()` for the Cloud address, the bearer token, and the bootstrap endpoints, re-read it on `mindeck-account/changed`, and report an HTTP 401 with `rejectToken(token, reason)`, where `reason` comes from the 401's `error.reason` through the exported `signOutReasonOf`; a plugin that does not read the body leaves it out, and the account asks Mindeck Cloud once more with the rejected token to learn it. The token never reaches a Client.

While signed in to a Mindeck Cloud whose bootstrap lists `endpoints.sync`, the Host polls that sync endpoint every `syncIntervalMs` milliseconds (one minute by default) with the `ETag` of its last answer, and at once when the window regains focus, when the network comes back, when the account menu or the quota dialog reads the quota, and when another plugin calls `requestSync()`, as mindeck-models does after the gateway no longer offers a model; such a prompted sync is skipped for `syncCooldownMs` milliseconds (ten seconds by default) after a successful one. A changed answer emits `mindeck-account/revised` with the topics whose data changed: `models`, `skills`, `employees`, `webSearch`, `policies`, `announcements`, and `client` follow the Cloud revisions of those names; a changed department or role (`access`) also names `models`, `skills`, `employees`, and `policies`; `inbox` follows the unread count and the newest item; `quota-request` follows the member's latest quota request. The first answer of a session names only `inbox` and `quota-request`, because the catalogs load with the session. Before emitting, the Host reads the bootstrap again for `policies`, `client`, and `access`, so a turned-off personal DeepSeek account and a new recommended version apply at once, and the quota for `quota-request`. Every answer, changed or not, then emits `mindeck-account/synced`, so a plugin can retry requests that failed for lack of a connection. `syncAnswer()` returns the session's latest answer, which [mindeck-inbox](../mindeck-inbox/README.md) reads for the unread count. **Sync now** on the Account page syncs at once and names every topic, so every company list on this computer is read again. Network errors and error responses are quiet: the Account page shows that the last sync did not finish, nothing opens a dialog, and the next scheduled sync tries again. On a Mindeck Cloud without the sync endpoint the Host reads the bootstrap every `fallbackRefreshMs` milliseconds (ten minutes by default), and the other plugins keep their own ten-minute refreshes, which also bound the delay when a sync is missed.

Host services that stream a value they read again after each change use the exported `followChanges(listeners, signal, lifetime, read)`: it yields `read()` at once and again after each change notice, collapses notices that arrive during a read into one read, and ends when either signal aborts; [mindeck-skills](../mindeck-skills/README.md) and [mindeck-files](../mindeck-files/README.md) stream their listings with it.

In the Web Client, the plugin provides `ctx.mindeckComposer` while the sessions, Workspace, Workspace UI, and agent preset Remote services exist. `draft(sessionId)` returns the scope and input of a conversation the Client has open. `startConversation({ agentPreset, prepare })` opens a blank conversation in the current Workspace as New Session does: the Workspace of the conversation in the main column, otherwise the Workspace whose conversations changed last. It asks for `agentPreset`, or for the Host's default preset from the preset roster, and reuses that Workspace's first blank conversation of no other preset, with its draft, or creates one; when the roster cannot be read, any blank conversation can be reused. `prepare` edits the draft before the conversation shows, and the message box takes focus. A refused creation appears in the Workspace notice and keeps the current page; without any Workspace, it behaves as New Session and skips `prepare`. The digital employee, skills, and file library pages start conversations through it.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Maintainer details — click to expand</summary>

The Host service extends `TypertRemoteService` under the `mindeckAccount` Remote namespace. It owns at most one sign-in attempt; `startSignIn` joins a running attempt, and `cancelSignIn` aborts the attempt and waits for it. An attempt requests a device code, reports the computer's name, platform, and app version to `PUT /api/desktop/device-request` so the Cloud approval page can show them (a failed report only leaves them out), polls the token endpoint at the interval Mindeck Cloud returns (five seconds longer after each `slow_down`; a poll that gets no response sets the attempt's `retrying` flag and polling continues until the code expires), reports the device, reads `/api/desktop/bootstrap`, and stores `{ version: 1, cloudUrl, token, bootstrap }` as the `mindeck-account/default` grant record. When an attempt fails after the token was issued, the Host ends that token on Mindeck Cloud so that no session is left behind. A stored record that fails validation counts as signed out.

At startup the Host reads the bootstrap again: a 401 ends the session, changed details replace the cached ones, and an unreachable Cloud keeps the session for offline use. `rejectToken` removes the session only when it still holds the rejected token, so a late rejection never ends a newer sign-in.

`SyncLoop` in `src/sync.ts` keeps the last sync answer and its `ETag` per session token, so another member's answer is never compared with the previous member's; a sign-in or sign-out during a poll discards its answer. Requests during a run join it, and a stronger request (scheduled over prompted, the member's over both) runs once more afterwards. A 304 changes no topic; a 401 ends the session through `rejectToken`.

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
- On a Mindeck Cloud with the sync endpoint, a change of the personal DeepSeek policy reaches a signed-in desktop within a minute; on one without it, within ten minutes. Signing out a disallowed DeepSeek credential runs in the Client, so it happens once a Mindeck window is open.
- A personal DeepSeek sign-in starts only from Mindeck Desktop, which opens the authorization page itself; a plain browser window reports that it is desktop-only.
- The sign-in stage and the account page use the base account plugin's Factories. Without `ui-settings-account`, sign-in falls back to a plain dialog and the account page to the member's name and **Sign out**.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

None.

</details>
