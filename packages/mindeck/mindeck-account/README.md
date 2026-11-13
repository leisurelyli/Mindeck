---
description: "Sign Mindeck Desktop in to Mindeck Cloud with a device code and keep the desktop session for other Mindeck plugins."
kind: "package-reference"
---

# @deepseek-ai/dsh-mindeck-account

English | [中文](README.zh.md)

## Summary

Sign Mindeck Desktop in to the company's Mindeck Cloud. The member enters the Cloud address once, confirms a device code in the browser, and the desktop stores the resulting session in the credential store. Other Mindeck Host plugins read that session for the company models, skills, and file library. While no session exists, a sign-in dialog covers the workspace.

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

The sign-in dialog first asks for the Cloud address that the administrator provides, such as `cloud.example.com`; an address without a scheme means HTTPS. Pasting a whole account message into the field keeps only its first web address. The Host accepts the address only when its desktop API answers as a Mindeck Cloud, then stores it in the plugin's `cloudUrl` configuration field. A deployment can preset that field with a profile patch row `- id: mindeck-account` whose `config` sets `cloudUrl`, so members skip the address step; the member can change it only while signed out. The dialog then shows a code, the time left until it expires, and an **Open browser** link to the Cloud approval page; the window where the member chose **Sign in** also opens that page in the browser by itself. After the member approves the code there, the desktop reports its name, platform, and app version, reads the member's details, and stores the session. Settings → Account shows the member, company, department, and role, links to Mindeck Cloud, and signs out. The sidebar menu opens Settings and Mindeck Cloud, opens the Cloud help page, sends written feedback, shows **About Mindeck** (edition, version, company, Cloud address, and links to the Cloud privacy page and downloads), and signs out.

Signing out removes the local session at once and ends it on Mindeck Cloud in the background. When Mindeck Cloud rejects the session, for example after an administrator disables the member or signs the device out, the session ends and the dialog asks the member to sign in again.

While signed in, the Host reads the month-to-date quota from `/api/desktop/quota` after sign-in, every `quotaRefreshMs` milliseconds (two minutes by default), and when the account menu opens or a request is refused for quota; a failed read keeps the last quota. The account menu shows the member's month-to-date cost against the limit, and the department's when it has one. From 75% of the limit that runs out first, a reminder above the composer names that limit, its usage, and the reset date, with a link to the usage page; it returns at 95% and when the limit is used up, even after the member dismissed the previous level. Feedback goes to the company's administrators through `POST /api/desktop/feedback` and never carries conversation content: the menu's written report, each `/feedback` remark with text or a category, and each answer the member rates down with its category and note. Rating the same answer again replaces what was sent, and taking the rating back or rating the answer up withdraws it; a positive rating sends nothing else. Forwarding follows `session/event` for live conversations and `feedback/committed` for closed ones, and a failure is only logged. When Mindeck Cloud refuses a model request because the member's or the department's monthly quota is used up, a dialog shows Mindeck Cloud's explanation, which names the exhausted limit and the reset date, and links to the member's usage page in Mindeck Cloud.

Other Host plugins call `ctx.mindeckAccount.session()` for the Cloud address, the bearer token, and the bootstrap endpoints, re-read it on `mindeck-account/changed`, and report an HTTP 401 with `rejectToken(token)`. The token never reaches a Client.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Maintainer details — click to expand</summary>

The Host service extends `TypertRemoteService` under the `mindeckAccount` Remote namespace. It owns at most one sign-in attempt; `startSignIn` joins a running attempt, and `cancelSignIn` aborts the attempt and waits for it. An attempt requests a device code, reports the computer's name, platform, and app version to `PUT /api/desktop/device-request` so the Cloud approval page can show them (a failed report only leaves them out), polls the token endpoint at the interval Mindeck Cloud returns (five seconds longer after each `slow_down`; a poll that gets no response sets the attempt's `retrying` flag and polling continues until the code expires), reports the device, reads `/api/desktop/bootstrap`, and stores `{ version: 1, cloudUrl, token, bootstrap }` as the `mindeck-account/default` grant record. When an attempt fails after the token was issued, the Host ends that token on Mindeck Cloud so that no session is left behind. A stored record that fails validation counts as signed out.

At startup the Host reads the bootstrap again: a 401 ends the session, changed details replace the cached ones, and an unreachable Cloud keeps the session for offline use. `rejectToken` removes the session only when it still holds the rejected token, so a late rejection never ends a newer sign-in.

The Client mounts the generated Remote and follows the `watch` stream through `remoteAccess.whenAccess('mindeckAccount/watch')`, so a Client without account access renders none of the account UI. It registers the sign-in dialog in `shell.overlay`, the launcher in `settings.launcher`, the page in `settings.section` with its icon in `settings.section.icon`, the quota dialog in `shell.quota-notice` for the `QUOTA` failure code, and the quota reminder in `conversation.input.dock`.

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

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

None.

</details>
