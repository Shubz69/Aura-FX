# Operator Intelligence — Playwright QA report

**Generated:** 2026-04-28T10:38:08.718Z

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
- `[console.error] [observability] {scope: api.response_interceptor, type: auth, correlationId: c4ce9291-0dd6-4c92-b767-39de2257e322, status: 403, code: ERR_BAD_REQUEST}`
- `[console.error] Access forbidden: Authentication failed or insufficient permissions`
- `[console.error] Failed to load resource: the server responded with a status of 403 (Forbidden)`
- `[console.error] [observability] {scope: api.response_interceptor, type: auth, correlationId: 768d50a6-6c2f-40ce-a2ad-05ee9672e18e, status: 403, code: ERR_BAD_REQUEST}`
- `[console.error] Access forbidden: Authentication failed or insufficient permissions`
- `[console.error] Subscription fetch error: AxiosError`
- `[console.error] Failed to load resource: the server responded with a status of 403 (Forbidden)`
- `[console.error] WebSocket connection to 'ws://localhost:3000/ws' failed: Invalid frame header`
- `[console.error] WebSocket connection to 'ws://localhost:3000/ws' failed: Invalid frame header`
- `[console.error] WebSocket connection to 'ws://localhost:3000/ws' failed: Invalid frame header`
- `[console.error] WebSocket connection to 'ws://localhost:3000/ws' failed: Invalid frame header`
- `[console.error] WebSocket connection to 'ws://localhost:3000/ws' failed: Invalid frame header`
- `[console.error] WebSocket connection to 'ws://localhost:3000/ws' failed: Invalid frame header`
- `[console.error] Failed to load resource: the server responded with a status of 403 (Forbidden)`
- `[console.error] Failed to load resource: the server responded with a status of 403 (Forbidden)`
- `[console.error] [observability] {scope: api.response_interceptor, type: auth, correlationId: 2118b6ba-6aff-4ec5-815a-8c8d69204759, status: 403, code: ERR_BAD_REQUEST}`
- `[console.error] Access forbidden: Authentication failed or insufficient permissions`
- `[console.error] Failed to load resource: the server responded with a status of 403 (Forbidden)`
- `[console.error] [observability] {scope: api.response_interceptor, type: auth, correlationId: 974ca747-bf15-45de-95bc-48eb83cc4a8e, status: 403, code: ERR_BAD_REQUEST}`
- `[console.error] Access forbidden: Authentication failed or insufficient permissions`
- `[console.error] Subscription fetch error: AxiosError`
- `[console.error] [observability] {scope: auth.session_verify_user, type: unknown, correlationId: null, status: null, code: null}`
- `[console.error] WebSocket connection to 'ws://localhost:3000/ws' failed: Invalid frame header`
- `[console.error] Failed to load resource: the server responded with a status of 403 (Forbidden)`
- `[console.error] Failed to load resource: the server responded with a status of 403 (Forbidden)`
- `[console.error] [observability] {scope: api.response_interceptor, type: auth, correlationId: 4d46be86-cd09-4d81-98cd-10df1574cdb3, status: 403, code: ERR_BAD_REQUEST}`
- `[console.error] Access forbidden: Authentication failed or insufficient permissions`
- `[console.error] Failed to load resource: the server responded with a status of 403 (Forbidden)`
- `[console.error] [observability] {scope: api.response_interceptor, type: auth, correlationId: bd0c72b2-7592-4ef1-9604-c266e45b506b, status: 403, code: ERR_BAD_REQUEST}`
- `[console.error] Access forbidden: Authentication failed or insufficient permissions`
- `[console.error] Subscription fetch error: AxiosError`
- `[console.error] Failed to load resource: the server responded with a status of 403 (Forbidden)`
- `[console.error] WebSocket connection to 'ws://localhost:3000/ws' failed: Invalid frame header`
- `[console.error] Failed to load resource: the server responded with a status of 403 (Forbidden)`
- `[console.error] WebSocket connection to 'ws://localhost:3000/ws' failed: Invalid frame header`
- `[console.error] [observability] {scope: auth.session_verify_user, type: unknown, correlationId: null, status: null, code: null}`
- `[console.error] Failed to load resource: the server responded with a status of 403 (Forbidden)`
- `[console.error] Failed to load resource: the server responded with a status of 403 (Forbidden)`
- `[console.error] [observability] {scope: api.response_interceptor, type: auth, correlationId: 142e1968-fc51-4244-98c3-be8ed061d236, status: 403, code: ERR_BAD_REQUEST}`
- `[console.error] Access forbidden: Authentication failed or insufficient permissions`
- `[console.error] WebSocket connection to 'ws://localhost:3000/ws' failed: Invalid frame header`
- `[console.error] Failed to load resource: the server responded with a status of 403 (Forbidden)`
- `[console.error] Failed to load resource: the server responded with a status of 403 (Forbidden)`
- `[console.error] [observability] {scope: api.response_interceptor, type: auth, correlationId: 73d290c8-9ae4-4607-9db4-671a7342229d, status: 403, code: ERR_BAD_REQUEST}`
- `[console.error] Access forbidden: Authentication failed or insufficient permissions`
- `[console.error] Subscription fetch error: AxiosError`
- `[console.error] WebSocket connection to 'ws://localhost:3000/ws' failed: Invalid frame header`

## Visual / layout issues

- (none noted)

## Build (npm run build)

- *(pending — run `npm run build` after Playwright)*

## Recommended fixes

- If auth storage expires, regenerate `e2e/reports/auraterminal-normal-user.json` via `create-normal-user-state` / `manual-save-normal-user-state`.
