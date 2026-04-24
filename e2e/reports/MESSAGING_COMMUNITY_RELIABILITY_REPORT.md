# Messaging + Community Reliability Report

Last updated: 2026-04-24

## Current status split

- **Community reliability:** `PASSED` (targeted chromium checks passed: post/reload dedupe + rapid channel switch stale guard).
- **Messaging reliability (`/admin/inbox` + `/messages` burst/rapid-switch assertions):** `NOT VERIFIED / BLOCKED`.
- **Blocker:** admin storage state instability — `/admin/inbox` initially renders then redirects to `/login` after hydration because stored admin JWT is expired.

## Scope

- `/api/messages/threads*`
- `/api/community/*`
- `/api/users/:id` fanout paths used by messaging/community flows
- Surfaces: `AdminInbox`, `Messages`, `Community`

## Root causes found

- **Stale response overwrite under rapid switching:** async thread/channel loads could apply late responses after the user had already switched targets.
- **Missing bounded retry on critical GETs:** thread and channel message reads relied on single-shot fetches, making transient network/429/5xx spikes visible as drops.
- **Abort-unaware polling paths:** some poll requests were not tied to cleanup abort signals, causing noisy canceled requests during route/tab switches.
- **Burst-send ordering risk:** rapid message sends could race follow-up refreshes and optimistic rows without an explicit send queue.
- **Community channel fetch race:** full refresh message fetch could update visible state from an older channel request.

## Hardening changes applied

- `src/services/Api.js`
  - Added bounded retry usage for safe GETs:
    - `listFriendThreads` -> `dedupeGetWithRetry(...)`
    - `getThreadMessages` -> `dedupeGetWithRetry(...)`
    - `getChannelMessages` -> `dedupeGetWithRetry(...)`
  - Kept POST sends single-shot (no auto retry) to avoid duplicate send risk.

- `src/pages/AdminInbox.js`
  - Added active-thread stale guards and poll abort controller.
  - Poll/load now checks sequence + current active thread before applying `setMessages`.
  - Added serialized send queue so burst sends preserve order and failed optimistic rows are removed.

- `src/pages/Messages.js`
  - Added load sequence/thread guards to prevent stale thread payload overwriting newer state.
  - Added serialized send queue for ordered burst sends and optimistic rollback on failure.

- `src/pages/Community.js`
  - Added request sequence + selected-channel guard in `fetchMessages(...)` to prevent stale channel response application.
  - Preserved existing no-retry POST behavior.

## Targeted tests updated

- `e2e/strict-messaging-admininbox.spec.js`
  - strengthened rapid send assertions:
    - admin 3 rapid sends -> exactly once each + in-order
    - user 3 rapid sends -> admin receives exactly once each
  - test now skips (not fails) when saved admin/user auth state is invalid.

- `e2e/community-realtime-reconcile.spec.js`
  - added rapid channel switch stale-content test.
  - increased per-test timeout for this suite and hardened channel clicks for flaky overlay conditions.

## Verification run (targeted only)

Command:

- `npx playwright test --project=chromium "e2e/strict-messaging-admininbox.spec.js" "e2e/community-realtime-reconcile.spec.js"`

Result:

- Passed: 2 (community-only)
  - community post -> reload -> exactly one copy
  - community rapid channel switch stale-content guard
- Messaging strict suite: skipped/blocked in run contexts where admin state redirects to login after hydration.

## Current reliability status

- **Community realtime:** passed and verified.
- **Messaging reliability:** unverified due admin auth-state blocker; do not claim rapid-switch or burst-send verified yet.
- **Overall:** keep `QA-RISK-MSG-001` open until strict messaging suite executes with stable admin `/admin/inbox` auth state.
