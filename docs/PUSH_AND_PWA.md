# Web Push, PWA (Safari), and channel activity

This document is the **verification source of truth** for ops and QA. Code references are current as of the repo’s `api/push/webPushNotify.js` and `api/messages/threads.js`.

---

## 1. Environment (must pass before device tests)

| Check | Variable | Requirement |
|-------|-----------|--------------|
| ☐ | `REACT_APP_VAPID_PUBLIC_KEY` | Build-time (Vercel / `.env` for client). **Must equal** server `VAPID_PUBLIC_KEY` string. |
| ☐ | `VAPID_PUBLIC_KEY` | Server — same public key as above. |
| ☐ | `VAPID_PRIVATE_KEY` | Server — private key paired with that public key. |
| ☐ | `COMMUNITY_NOTIFICATIONS_ENABLE_DB_SIDE_EFFECTS` | Server toggle. Set to `1` on Vercel if you want DB-backed community notification fanout/web-push side-effects enabled there. |
| ☐ | HTTPS | Production site served over HTTPS (required for PWA + push). |

Generate keys once, e.g. `npx web-push generate-vapid-keys`. If any of the trio is wrong or missing, subscribe or send can **fail silently**.

**Optional sanity check (after deploy):**

- Logged-in user enables push on **Profile** → server should accept `POST /api/push/subscribe` (200).
- If you have DB access: `push_subscriptions` should gain a row for that `user_id` with a non-null `endpoint`.

---

## 2. iOS / Safari constraints (educate testers)

| # | Requirement |
|---|-------------|
| 1 | **iOS 16.4+** for Web Push on a Home Screen web app. |
| 2 | Install via **Share → Add to Home Screen** (not only a Safari tab bookmark). |
| 3 | **Allow notifications** when the app asks (or **Settings → Notifications → [your app]**). |
| 4 | Locked screen: delivery is **OS + Apple’s push path**; the app does not run JS in the background. Reliability depends on server-sent Web Push and system policy. |

**Service worker:** `src/index.js` registers `/service-worker.js` in **production** only. Test push on a **production** (or staging) HTTPS build, not plain `localhost` on a phone, unless you have a dev tunnel with HTTPS.

---

## 3. Push open URLs (what tapping the notification should do)

Implemented in `api/push/webPushNotify.js` → `resolveOpenUrl`.

| Notification type | Typical source | Open URL (payload `url`) |
|-------------------|----------------|---------------------------|
| `REPLY` with `channelId` **0** or null | Thread / Messages (`api/messages/threads.js`) | `/messages` |
| `MENTION` | Community channel @mention (`api/community/channels/messages.js`) | `/community` |
| `REPLY` with real channel id | Community reply flows | `/community` |
| `CHANNEL_ACTIVITY` | Opt-in channel chat (`api/community/channels/messages.js`) | `/community` |
| `REPLY` / friend types | Friend flows | `/messages` (see code for `FRIEND*`) |

`public/service-worker.js` uses `notificationclick` → `clients.openWindow(targetUrl)` with that `url`.

---

## 4. Manual verification checklist (iPhone)

Use **two accounts** (A = tester on device, B = helper) unless noted.

### 4.1 Install & subscribe

| Step | Action | Pass criteria |
|------|--------|----------------|
| 1 | On iPhone Safari, open the live site, log in as **A**. | Logged in. |
| 2 | Add to **Home Screen**, launch from the icon (standalone). | App opens full-screen. |
| 3 | **Profile** → **Enable** push (or user menu → **Push notifications** → Profile). **Allow** iOS notification permission. | No error banner; optional: confirm subscription row exists server-side. |
| 4 | Lock the phone. | — |

### 4.2 DM / thread message (server: `REPLY`, `channelId: 0`)

| Step | Action | Pass criteria |
|------|--------|----------------|
| 1 | **B** sends a message in a **thread** that notifies **A** (see `api/messages/threads.js`: admin↔user threads). | — |
| 2 | **A**’s phone is locked (or home screen). | **A** receives a push within a reasonable time. |
| 3 | **A** taps the notification. | App opens to **`/messages`** (Messages inbox). |

If **A** is admin and **B** is user (or vice versa), match your product’s thread rules so `recipientId` resolves to a numeric user id (notifications are skipped for invalid recipient).

### 4.3 Channel @mention

| Step | Action | Pass criteria |
|------|--------|----------------|
| 1 | **B** posts in Community with `@` **A**’s username (or valid mention flow). | — |
| 2 | **A**’s phone locked. | Push received. |
| 3 | **A** taps notification. | Opens **`/community`**. |

### 4.4 Channel activity (opt-in + throttle)

| Step | Action | Pass criteria |
|------|--------|----------------|
| 1 | **A** opens Community, selects a channel, sets header **Push on** (not Push off). | Preference saved (no error toast). |
| 2 | **B** sends a **normal** message (no need to @mention **A**). **A** must not be the sender. | — |
| 3 | **A** locked. | At most **one** `CHANNEL_ACTIVITY` push per **~10 minutes** per **user + channel** (throttle on `last_push_at`). |
| 4 | Tap notification. | Opens **`/community`**. |

**Note:** If **B**’s message only @mentions **A**, **A** gets **MENTION**; channel-activity logic skips users already in the mention set for that message.

---

## 5. Regression: desktop Chrome / Firefox

| Step | Pass criteria |
|------|----------------|
| Production build, HTTPS, enable push on Profile. | Subscribe succeeds. |
| Trigger mention or thread message. | Push appears; click opens correct URL per §3. |

---

## 6. Troubleshooting quick reference

| Symptom | Things to check |
|---------|------------------|
| No subscribe / errors | `REACT_APP_VAPID_PUBLIC_KEY` set at **build** time; redeploy after changing env. |
| Subscribe OK, never receive push | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` on server; same keys as client public key. |
| Works in Safari tab but not Home Screen app | Test push from **installed** PWA; iOS 16.4+. |
| Push only in-app, not on lock screen | iOS notification permission for the app; Focus / Do Not Disturb. |
| Channel activity never fires | **Push on** for that channel; another user must send; throttle window (10 min). |

---

## 7. Implementation pointers (for developers)

- **Opt-in channel prefs:** `channel_push_prefs` + `GET/POST /api/community/channel-push-preference` (`api/community/channel-push-preference.js`).
- **Throttle + emit:** `api/community/channels/messages.js` → `notifyChannelActivityOptIn`, type `CHANNEL_ACTIVITY`.
- **PWA safe area:** `html.pwa-standalone` + `src/styles/index.css` (`env(safe-area-inset-*)` on `.app-container`).
