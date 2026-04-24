# Strict Messaging/AdminInbox Verification

- Generated: 2026-04-22T11:50:25.755Z
- Base: https://www.auraterminal.ai

## live messaging: admin sends to user realtime — PASS
- Steps: Open /admin/inbox -> Send unique message -> Observe /messages receive
- Expected: User receives without waiting full poll interval when websocket healthy
- Actual: User saw admin message in messages thread.
- Timing: 6629ms
- Console issues: 0
- Network issues: 2
- Completion: complete

## live messaging: user sends to admin delivery — PASS
- Steps: Open /messages -> User sends unique message -> Observe /admin/inbox thread
- Expected: Admin receives new user message
- Actual: Admin inbox displayed the user message.
- Timing: 3143ms
- Console issues: 0
- Network issues: 5
- Completion: complete

## live messaging: websocket unhealthy polling fallback — PASS
- Steps: Abort ws/info on user context -> Admin sends message -> Wait on user /messages
- Expected: Message arrives via polling fallback within expected interval (~8s + render)
- Actual: Message arrived while websocket bootstrap was blocked.
- Timing: 3159ms
- Console issues: 0
- Network issues: 6
- Completion: complete

## live messaging: unread/read state after view — PASS
- Steps: Send user message -> Keep thread open -> Check read indicator
- Expected: Read indicator appears for user message after admin view/mark read
- Actual: Read indicator visible.
- Console issues: 0
- Network issues: 6
- Completion: complete

## admin inbox: rapid thread switching / stale overwrite — FAIL
- Steps: Rapidly switch between two user items -> Observe final selected header/thread
- Expected: Final selected thread remains active; no stale overwrite from prior request
- Actual: Could not confidently confirm stale-protection under this dataset.
- Console issues: 1
- Network issues: 14
- Completion: partial_or_unreliable

## admin inbox: controls disabled while unresolved — PASS
- Steps: Load inbox -> Before selecting ready thread inspect send button
- Expected: Send remains blocked until active thread ready
- Actual: Send button disabled in unresolved state.
- Console issues: 1
- Network issues: 14
- Completion: complete

## admin inbox: no duplicate/out-of-order under quick interactions — FAIL
- Steps: Send 3 rapid unique messages -> Count rendered unique messages
- Expected: All unique messages appear once in order (no duplicate loss)
- Actual: Observed 1 quick messages with marker STRICT_QUICK_1776858618169.
- Console issues: 1
- Network issues: 14
- Completion: partial_or_unreliable
