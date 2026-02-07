# Performance Documentation

This document describes performance optimizations across the Aura FX platform.

## Subscription/Tier Lookup (Primary Fix)

### Authoritative Endpoint: GET /api/me
- Single source of truth for entitlements (tier, roles, permissions, feature flags).
- Returns `updatedAt` and `version` for client cache invalidation.

### Caching
- **Server**: In-memory cache (60s TTL) via `api/cache.js` — key `entitlements:${userId}`.
- **Invalidation**: `invalidateEntitlementsCache(userId)` called on tier/role change (e.g. select-free, admin updates).
- **Client**: `EntitlementsContext` caches 45s; fetches once on session start. No re-fetch on every page.

### Database
- **Indexes**: `idx_users_subscription_status`, `idx_users_subscription_plan` (see `api/utils/database-indexes.js`).
- **Query**: Single `SELECT` on users by `id` (primary key). Channels fetched separately; consider aggregation if needed.

## Database Optimization

- **Connection pooling**: `api/db.js` — pool with 100 connections, keep-alive.
- **Parameterized queries**: All queries use `?` placeholders.
- **Indexes**: Run `node api/utils/database-indexes.js` to apply indexes.
- **Query profiling**: Enable in dev/staging via `poolStats` in db.js; log slow queries.

## Caching

- **api/cache.js**: TTL-based, coalescing, pattern invalidation.
- **TTLs**: Leaderboard 1–5 min, channels 2 min, entitlements 60s.
- **Invalidation**: Call `invalidateEntitlementsCache(userId)` on tier/role change.

## Static Assets & HTTP

- **Vercel**: Automatic compression, CDN for static assets.
- **Cache-Control**: API responses use `no-store` for dynamic data.
- **Build**: Create React App produces hashed filenames for long-term caching.

## Frontend

- **Code splitting**: Lazy-loaded routes via `React.lazy()` in App.js.
- **Entitlements**: Single fetch on session start; no duplicate fetches on route change.
- **Memoization**: EntitlementsContext avoids re-render loops.

## Observability

- **Timing**: Add `Date.now()` around critical paths (login → entitlements, TTFB) for debugging.
- **Logs**: Structured logging via `api/utils/logger.js` for subscription resolution path.
- **Cache stats**: `getCacheStats()` from cache.js for hit rate and size.

## Real-Time Messaging Architecture & Sync Strategy

### Transport
- **Primary**: WebSocket (STOMP over raw WebSocket) via Railway server (`websocket-server/index.js`).
- **Fallback**: Long-polling every 1–5s when WebSocket is down; API broadcasts via Pusher + HTTP to WS server.
- **Reconnect**: Exponential backoff with jitter (1s–16s); `addReconnectListener` fires on reconnect for catch-up.

### Message Delivery Guarantees
- **Server-generated ID**: Each message has `id` (AUTO_INCREMENT) used as sequence.
- **Client dedupe**: Client sends `clientMessageId` (UUID); server stores and deduplicates via unique index `(sender_id, client_message_id)`.
- **Idempotent writes**: Duplicate POST with same `clientMessageId` returns existing message (no second insert).
- **Broadcast**: After DB persist, API triggers Pusher + POST to `/api/broadcast-new-message` for cross-device delivery.

### Cross-Device Consistency
- **Persist first, then publish**: Message written to DB → broadcast to Pusher/WebSocket.
- **Catch-up on reconnect**: Client stores `lastSeenCursor` (max message id per channel); on reconnect, `GET /messages?afterId=<cursor>` fetches missed messages.
- **No client-side broadcast for new messages**: Sender uses REST only; broadcast is server-driven to avoid duplicates.

### Ordering & Optimistic UI
- **Ordering**: Per channel by `id` (sequence) or `timestamp` + `id` tie-breaker.
- **Optimistic render**: Client adds message with `clientMessageId` immediately; API response replaces temp with server `id`.
- **Reconciliation**: Match by `clientMessageId` or `id`; fallback to content+userId+timestamp.

### Permissions
- RBAC enforced before send, subscribe, and broadcast; server determines allowed channels from entitlements.

### DB Indexes
- `messages(channel_id, id)` for cursor pagination.
- `messages(sender_id)` for sender lookups.
- Unique `(sender_id, client_message_id)` for dedupe.

### Migration
Run: `node api/utils/messages-migration.js` to add `client_message_id` and indexes.

---

## Roll-Out Plan (Messaging Consistency)

1. **Feature flag**: `REACT_APP_ENABLE_WEBSOCKETS` (default true). Set to `false` to disable WebSocket; app falls back to polling.
2. **Gradual enable**: Deploy API changes first (idempotent writes, `afterId` support); clients work with or without `clientMessageId`.
3. **No UI changes**: All changes are additive; existing flows remain intact.
4. **Migration**: Run `api/utils/messages-migration.js` before or during deploy (idempotent).

---

## Manual Checklist

- [ ] Login → entitlements resolved within 1–2 seconds.
- [ ] Channel switch: no page reset, no "not allowed" flash.
- [ ] FREE user cannot access premium API (403).
- [ ] PREMIUM/ELITE user sees correct channels and AI access.
- [ ] Multi-device: send on A appears on B; reconnect catches up with no gaps/duplicates.
