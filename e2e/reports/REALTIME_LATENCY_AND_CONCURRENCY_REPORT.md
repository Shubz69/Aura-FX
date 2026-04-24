# Realtime Latency and Concurrency Report

- Generated: 2026-04-24T15:55:00.148Z
- Base: https://www.auraterminal.ai

## Part A — Admin/User Message Latency
- Sent each direction: 10
- Combined min/median/p95/max: 1583/2643/4116/5678 ms
- Missing: 0
- Duplicates: 0
- Composer stuck: false
- Realtime feel: false

## Part B — Community Latency
- Sent: 10
- min/median/p95/max: 102/11946/15011/15011 ms
- Missing: 0
- Duplicates: 0
- Exactly-one-copy after reload: false

## Part C — Multi-channel Community Concurrency
- Verified: true
- Detail: channels=General, A7fx General Chat, noCrossChannelLeakage=true

## Part D — Multi-user Concurrency
- Verified: false
- Detail: True multi-user concurrency NOT VERIFIED (only one normal-user state validated).

## API Issues (/api/messages/threads* + /api/community/*)
- Count: 21
