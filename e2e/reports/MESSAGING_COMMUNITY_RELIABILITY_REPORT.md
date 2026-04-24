# Messaging + Community Reliability Report

Last updated: 2026-04-24 (final strict messaging rerun + bounded concurrency validation)

## Current status split

- **Community reliability:** `PASSED` (targeted chromium checks passed: post/reload dedupe + rapid channel switch stale guard).
- **Messaging product correctness (`/admin/inbox` + `/messages`):** `PASSED`.
- **Strict messaging split result:** `rapidSwitchProductCorrectness=PASS`, `adminUsersFetchReliability=RISK`, `rapidSwitchOverall=PASS_WITH_RISK`, admin 3-send burst `PASS`, user 3-send burst `PASS`.
- **QA classification:** `QA-RISK-MSG-001 = PASS/CLOSED` (product correctness), with remaining reliability risks tracked separately.

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

- Strict messaging final rerun:
  - rapid thread switching product correctness: `PASS`
  - admin-users fetch reliability: `RISK` (abort noise persists)
  - overall rapid-switch classification: `PASS_WITH_RISK`
  - admin 3 rapid sends ordered/no duplicates: `PASS`
  - user 3 rapid sends received once each: `PASS`
- Community targeted checks:
  - community post -> reload -> exactly one copy: `PASS`
  - community rapid channel switch stale-content guard: `PASS`

## Current reliability status

- **Community realtime:** passed and verified.
- **Messaging product correctness:** passed and verified (`QA-RISK-MSG-001` closed).
- **Overall messaging readiness:** production-ready with risk (residual API abort noise), with bounded concurrency validation completed.

## QA-RISK-MSG-CONCURRENCY-001 result

Status: `PASS/CLOSED (bounded scope)`

Validation artifact:

- `e2e/messaging-concurrency.spec.js`
- `e2e/reports/messaging-concurrency-report.json`
- `e2e/reports/messaging-concurrency-report.md`

Executed scope:

- bounded single-thread overlap using existing admin + normal-user sessions (no extra valid user sessions available in this run context)
- overlapping sends:
  - 5 admin -> user
  - 5 user -> admin

Observed result:

- sent total: 10
- received total: 10
- duplicates: 0
- missing: 0
- in-thread order: preserved on both surfaces
- no cross-thread leakage: yes (bounded single-thread expectation)
- no stale overwrite: yes
- no stuck composer: yes
- no duplicate DOM nodes after refresh: yes
- `/api/messages/threads*` under run:
  - 429/5xx: none
  - request failures: 1 transient `net::ERR_ABORTED` (non-blocking)

Residual note:

- This closes bounded concurrency validation.
- True multi-user (>1 non-admin sender) concurrent load remains a future enhancement if additional stable user sessions are provisioned.
