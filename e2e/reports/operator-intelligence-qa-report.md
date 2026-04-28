# Operator Intelligence — Playwright QA report

**Generated:** 2026-04-27T22:09:30.043Z

## Overall: PASS


## Screenshots

- `C:\Users\1230s\OneDrive\Documents\Samy\Aura FX\e2e\artifacts\operator-intelligence-qa\oi-desktop.png`
- `C:\Users\1230s\OneDrive\Documents\Samy\Aura FX\e2e\artifacts\operator-intelligence-qa\oi-tablet.png`
- `C:\Users\1230s\OneDrive\Documents\Samy\Aura FX\e2e\artifacts\operator-intelligence-qa\oi-mobile.png`

## Console errors (blocking)

- (none)

## Console errors (ignored — documented dev / stale JWT noise)

- `[console.error] Failed to load resource: the server responded with a status of 403 (Forbidden)`
- `[console.error] WebSocket connection to 'ws://localhost:3000/ws' failed: Invalid frame header`
- `[console.error] [observability] {scope: auth.session_verify_user, type: unknown, correlationId: null, status: null, code: null}`
- `[console.error] Failed to load resource: the server responded with a status of 403 (Forbidden)`
- `[console.error] WebSocket connection to 'ws://localhost:3000/ws' failed: Invalid frame header`
- `[console.error] Failed to load resource: the server responded with a status of 403 (Forbidden)`
- `[console.error] [observability] {scope: api.response_interceptor, type: auth, correlationId: d8a273be-6b25-49fa-9a5a-8922da2e87e6, status: 403, code: ERR_BAD_REQUEST}`
- `[console.error] Access forbidden: Authentication failed or insufficient permissions`
- `[console.error] Subscription fetch error: AxiosError`
- `[console.error] Failed to load resource: the server responded with a status of 403 (Forbidden)`
- `[console.error] [observability] {scope: api.response_interceptor, type: auth, correlationId: caa8f2df-fcad-47a9-a7c7-e8d0cdbaf41f, status: 403, code: ERR_BAD_REQUEST}`
- `[console.error] Access forbidden: Authentication failed or insufficient permissions`
- `[console.error] Failed to load resource: the server responded with a status of 403 (Forbidden)`
- `[console.error] WebSocket connection to 'ws://localhost:3000/ws' failed: Invalid frame header`
- `[console.error] WebSocket connection to 'ws://localhost:3000/ws' failed: Invalid frame header`
- `[console.error] WebSocket connection to 'ws://localhost:3000/ws' failed: Invalid frame header`
- `[console.error] WebSocket connection to 'ws://localhost:3000/ws' failed: Invalid frame header`
- `[console.error] Failed to load resource: the server responded with a status of 403 (Forbidden)`
- `[console.error] [observability] {scope: api.response_interceptor, type: auth, correlationId: c425ea23-904f-41c3-b623-e92539f918df, status: 403, code: ERR_BAD_REQUEST}`
- `[console.error] Access forbidden: Authentication failed or insufficient permissions`
- `[console.error] Subscription fetch error: AxiosError`
- `[console.error] Failed to load resource: the server responded with a status of 403 (Forbidden)`
- `[console.error] Failed to load resource: the server responded with a status of 403 (Forbidden)`
- `[console.error] WebSocket connection to 'ws://localhost:3000/ws' failed: Invalid frame header`
- `[console.error] Failed to load resource: the server responded with a status of 403 (Forbidden)`
- `[console.error] [observability] {scope: api.response_interceptor, type: auth, correlationId: a2c98632-84d6-42c6-8278-4ccdf81140ce, status: 403, code: ERR_BAD_REQUEST}`
- `[console.error] Access forbidden: Authentication failed or insufficient permissions`
- `[console.error] Subscription fetch error: AxiosError`
- `[console.error] Failed to load resource: the server responded with a status of 403 (Forbidden)`
- `[console.error] [observability] {scope: api.response_interceptor, type: auth, correlationId: 451fb813-9b6b-465f-997f-ac8255ecb8cc, status: 403, code: ERR_BAD_REQUEST}`
- `[console.error] Access forbidden: Authentication failed or insufficient permissions`
- `[console.error] Failed to load resource: the server responded with a status of 403 (Forbidden)`
- `[console.error] WebSocket connection to 'ws://localhost:3000/ws' failed: Invalid frame header`
- `[console.error] Failed to load resource: the server responded with a status of 403 (Forbidden)`
- `[console.error] Failed to load resource: the server responded with a status of 403 (Forbidden)`
- `[console.error] Failed to load resource: the server responded with a status of 403 (Forbidden)`
- `[console.error] WebSocket connection to 'ws://localhost:3000/ws' failed: Invalid frame header`
- `[console.error] Failed to load resource: the server responded with a status of 403 (Forbidden)`
- `[console.error] [observability] {scope: api.response_interceptor, type: auth, correlationId: 879b207c-0225-4fff-b976-8710e1d95500, status: 403, code: ERR_BAD_REQUEST}`
- `[console.error] Access forbidden: Authentication failed or insufficient permissions`
- `[console.error] Failed to load resource: the server responded with a status of 403 (Forbidden)`
- `[console.error] [observability] {scope: api.response_interceptor, type: auth, correlationId: 0a9464d6-8f6e-4561-83d0-6f4e9ff4d16d, status: 403, code: ERR_BAD_REQUEST}`
- `[console.error] Access forbidden: Authentication failed or insufficient permissions`
- `[console.error] Subscription fetch error: AxiosError`
- `[console.error] Failed to load resource: the server responded with a status of 403 (Forbidden)`
- `[console.error] WebSocket connection to 'ws://localhost:3000/ws' failed: Invalid frame header`

## Visual / layout issues

- (none noted)

## Build (npm run build)

- *(pending — run `npm run build` after Playwright)*

## Recommended fixes

- If auth storage expires, regenerate `e2e/reports/auraterminal-normal-user.json` via `create-normal-user-state` / `manual-save-normal-user-state`.
