# Strict Messaging/AdminInbox Verification

- Generated: 2026-04-24T12:51:49.057Z
- Base: https://www.auraterminal.ai

## Final classification

- rapidSwitchProductCorrectness: `PASS`
- adminUsersFetchReliability: `RISK`
- rapidSwitchOverall: `PASS_WITH_RISK`
- admin 3-message burst: `PASS`
- user 3-message burst: `PASS`
- QA-RISK-MSG-001: `PASS/CLOSED` (product correctness)
- Concurrency/load validation requirement: keep `QA-RISK-MSG-CONCURRENCY-001` open until bounded simultaneous multi-user messaging checks pass.

## live messaging: admin sends to user realtime — PASS
- Steps: Open /admin/inbox -> Send unique message -> Observe /messages receive
- Expected: User receives without waiting full poll interval when websocket healthy
- Actual: User saw admin message in messages thread.
- Timing: 4244ms
- Console issues: 0
- Network issues: 1
- Completion: complete

## live messaging: user sends to admin delivery — PASS
- Steps: Open /messages -> User sends unique message -> Observe /admin/inbox thread
- Expected: Admin receives new user message
- Actual: Admin inbox displayed the user message.
- Timing: 5219ms
- Console issues: 0
- Network issues: 3
- Completion: complete

## live messaging: websocket unhealthy polling fallback — PASS
- Steps: Abort ws/info on user context -> Admin sends message -> Wait on user /messages
- Expected: Message arrives via polling fallback within expected interval (~8s + render)
- Actual: Message arrived while websocket bootstrap was blocked.
- Timing: 4304ms
- Console issues: 0
- Network issues: 5
- Completion: complete

## live messaging: unread/read state after view — PASS
- Steps: Send user message -> Keep thread open -> Check read indicator
- Expected: Read indicator appears for user message after admin view/mark read
- Actual: Read indicator visible.
- Console issues: 0
- Network issues: 5
- Completion: complete

## admin inbox: rapid thread switching / stale overwrite — PASS
- Steps: Rapidly switch between two user items -> Observe final selected header/thread
- Expected: Final selected thread remains active; no stale overwrite from prior request
- Actual: Fallback model confirmed final thread correctness (expectedThread=13, postedThread=13).
- Console issues: 16
- Network issues: 63
- Completion: complete

## admin inbox: controls disabled while unresolved — PASS
- Steps: Load inbox -> Before selecting ready thread inspect send button
- Expected: Send remains blocked until active thread ready
- Actual: Send button disabled in unresolved state.
- Console issues: 16
- Network issues: 63
- Completion: complete

## admin inbox: 3 rapid sends preserve order without duplicates — PASS
- Steps: Send 3 rapid unique messages -> Verify each appears once -> Verify relative order in thread UI
- Expected: Exactly 3 messages, no duplicates, order _0 -> _1 -> _2
- Actual: Observed count=3, unique=3, inOrder=true.
- Console issues: 16
- Network issues: 63
- Completion: complete

## user->admin: 3 rapid sends received once each — PASS
- Steps: User sends 3 rapid unique messages -> Admin thread observes burst
- Expected: Admin sees all 3 unique user messages exactly once
- Actual: Observed count=3, unique=3.
- Console issues: 16
- Network issues: 65
- Completion: complete

## auth stability: no login redirect during strict run — PASS
- Steps: Observe top-frame navigations during entire strict suite
- Expected: No main-frame navigation to /login
- Actual: No login redirect observed.
- Console issues: 16
- Network issues: 65
- Completion: complete
