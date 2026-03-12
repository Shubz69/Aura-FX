# Community / Network Issues – Context for Fixes

This file explains **what the code is supposed to do**, **what’s been going wrong**, and **what we’ve already changed**. Use it if errors persist so the next fix is based on the real situation, not guesswork.

---

## What the code is supposed to do

- **Community page** (e.g. `/community/announcements`): Shows channels (sidebar), messages in the selected channel, user XP/level, presence, and subscription state.
- **Data flow:**
  - **Channels:** Loaded once on mount (and when URL/auth changes) via `refreshChannelList()` → `Api.getChannelsBootstrap()` (or fallback `Api.getChannels()`). Cached in localStorage and refreshed on a timer so new channels appear.
  - **Messages:** Loaded when you select a channel; then either WebSocket updates or polling (`Api.getChannelMessages`) fetches new messages.
  - **User (XP/level):** Fetched from `GET /api/users/:id` on a timer so the sidebar/profile show up‑to‑date XP and level.
  - **Subscription:** Checked via `GET /api/subscription/check` and `GET /api/subscription/status` for access control and UI (e.g. which channels you can see).
  - **Notifications:** Navbar bell calls `GET /api/notifications?limit=1` on a timer for unread count.
- **Backend:** Vercel serverless APIs talk to **Railway MySQL**. All DB access should use the **shared connection pool** in `api/db.js` and **release** connections (e.g. `connection.release()`), not open a new connection per request.

---

## What’s been going wrong

1. **`net::ERR_INSUFFICIENT_RESOURCES` / “Network Error” / “Failed to fetch”**  
   The **browser** runs out of sockets or similar resources because the app was firing **too many requests at once** or **retrying too aggressively** when requests failed (channels, users, messages, subscription, notifications). That overloads the browser and leads to more failures and console spam.

2. **Backend 500s**  
   Earlier, the backend was hitting **“Too many connections”** and **“Queue limit reached”** because:
   - `api/users/update.js` was using **its own** `mysql.createConnection()` per request instead of the shared pool, so every GET/PUT to `/api/users/:id` opened a new DB connection.
   - `/api/subscription/check` (in `api/admin/index.js`) also used a dedicated connection per request instead of the pool.
   Those have been switched to the shared pool and proper release.

3. **403 on community routes**  
   `/api/community/update-presence` and `/api/community/users` were returning 403 when the **subscription guard** (`checkCommunityAccess`) failed—e.g. missing DB columns like `subscription_plan`. We added schema migrations (e.g. in `api/community/index.js` `ensureSchema`) and made subscription/check use the pool and add missing columns.

---

## What we’ve already changed (so we don’t redo or break it)

- **api/db.js:** Shared pool only; configurable `MYSQL_POOL_SIZE` / `MYSQL_QUEUE_LIMIT`; “Too many connections” / “Queue limit reached” treated as connection errors.
- **api/users/update.js:** Uses `getDbConnection()` from `api/db.js` and `releaseDb(db)` only (no `createConnection`, no `db.end()`).
- **api/admin/index.js (subscription/check):** Uses pool, adds `subscription_plan` if missing, releases in `finally` and on error.
- **api/community/index.js:** `ensureSchema()` adds subscription-related columns on `users` so the guard’s query doesn’t fail.
- **Community.js (frontend):**
  - **User data:** Single in-flight guard, 90s poll, 2‑min backoff after failure, 5s initial delay; removed extra fetch from navigate effect; no `console.error` on network errors.
  - **Channels:** In-flight guard and 45s backoff for `refreshChannelList`; periodic refresh 90s; no `console.error`/`console.warn` on network errors for channels.
  - **Messages:** In-flight guard for message polling; 15s/10s intervals; no `console.error` on network errors for messages.
- **Api.js:** getChannels, getChannelsBootstrap, getChannelMessages: we only log (e.g. `console.error`) when the error is **not** a network error (`ERR_NETWORK` / “Network Error”), to avoid console flood.
- **NavbarNotifications:** In-flight guard, 45s poll, no log on fetch errors.
- **SubscriptionContext:** No `console.error` on network/fetch errors.

---

## If it still doesn’t work

Before changing more code:

1. **Confirm what’s actually failing:**  
   - Browser: still `ERR_INSUFFICIENT_RESOURCES` / “Failed to fetch” on specific URLs? Which ones (channels, users, messages, subscription, notifications)?  
   - Backend: any 500/403 in Vercel logs? For which routes?

2. **Confirm deployment:**  
   - Is the **latest** commit (with pool fixes and throttling) the one deployed on Vercel?  
   - Have you done a **hard refresh** (e.g. Ctrl+Shift+R) so the new JS runs?

3. **Use this doc:**  
   - The “What the code is supposed to do” and “What we’ve already changed” sections above are the source of truth.  
   - Any new fix should respect that the app is **supposed** to poll channels, user, messages, subscription, and notifications on timers, but with **guards and backoff** so we don’t overwhelm the browser or backend.

If you share the exact errors and routes (and that the deployed build is up to date), the next fix can target the real remaining cause instead of guessing.
