# Production Verification Checklist

## Overview

This checklist must be completed before deploying to production. All items must pass.

**Last Updated:** 2025-01-24

---

## 1. Pre-Deployment Checks

### 1.1 Code Quality
- [ ] All linter errors resolved
- [ ] No `console.log` statements in production code (use structured logger)
- [ ] No hardcoded credentials or secrets
- [ ] All API endpoints return consistent JSON response shape
- [ ] All endpoints include `requestId` in responses

### 1.2 Database
- [ ] All migrations are idempotent (safe to run multiple times)
- [ ] Database indexes applied: `node api/utils/database-indexes.js`
- [ ] No N+1 query patterns
- [ ] All LIMIT/OFFSET values are validated and clamped
- [ ] Prepared statement parameters are validated (no undefined)

### 1.3 Security
- [ ] Rate limiting enabled on all public endpoints
- [ ] Authentication required on sensitive endpoints
- [ ] Input validation on all user inputs
- [ ] SQL injection prevention (parameterized queries only)
- [ ] XSS prevention (output encoding)

---

## 2. Integration Tests

Run: `node tests/reliability-integration.test.js`

### 2.1 Community
- [ ] Load users list returns array
- [ ] Online count returns valid number
- [ ] Response includes requestId

### 2.2 Leaderboard
- [ ] Daily timeframe returns valid response
- [ ] Weekly timeframe returns valid response
- [ ] Monthly timeframe returns valid response
- [ ] All-time timeframe returns valid response
- [ ] Invalid timeframe falls back to default

### 2.3 Notifications
- [ ] GET returns items array and unreadCount
- [ ] Mark as read works
- [ ] Mark all as read works
- [ ] Cursor pagination works

### 2.4 Friends
- [ ] List returns friends array
- [ ] Send request works
- [ ] Accept request works
- [ ] Decline request works
- [ ] Cancel request works
- [ ] Remove friend works
- [ ] Duplicate request rejected
- [ ] Self-add rejected

### 2.5 Chat/AI
- [ ] Chatbot returns reply for message
- [ ] Premium check works correctly
- [ ] Rate limiting works

### 2.6 Error Handling
- [ ] Error responses include errorCode
- [ ] Error responses include requestId
- [ ] Error responses include message
- [ ] No uncaught exceptions

---

## 3. Load Testing

Run: `node tests/load-test.js 1000 60` (1000 users, 60 seconds)

### 3.1 Latency Targets
- [ ] Community APIs p95 < 800ms
- [ ] Leaderboard APIs p95 < 1500ms
- [ ] Chatbot p95 < 3000ms

### 3.2 Error Targets
- [ ] Error rate < 1%
- [ ] No timeout errors under load
- [ ] No connection refused errors

### 3.3 Scalability
- [ ] Test with 1000 concurrent users: PASS
- [ ] Test with 2000 concurrent users: PASS
- [ ] Test with 5000 concurrent users: PASS (if applicable)

---

## 4. WebSocket Testing

### 4.1 Connection Handling
- [ ] New connections accepted
- [ ] Max connection limit enforced (10,000)
- [ ] Per-user connection limit enforced (5)
- [ ] Dead connections cleaned up

### 4.2 Message Handling
- [ ] Messages broadcast to channel subscribers
- [ ] Rate limiting prevents spam (60/min/user)
- [ ] Invalid messages don't crash server

### 4.3 Graceful Shutdown
- [ ] Server closes connections on shutdown
- [ ] No data loss during shutdown

---

## 5. Monitoring & Observability

### 5.1 Logging
- [ ] All requests logged with requestId
- [ ] Latency breakdown included in logs
- [ ] Error codes included in error logs
- [ ] No sensitive data in logs

### 5.2 Health Endpoints
- [ ] `/api/ai/health` returns status
- [ ] WebSocket `/health` returns stats
- [ ] Pool health exposed

### 5.3 Metrics
- [ ] Cache hit rate trackable
- [ ] Request rate trackable
- [ ] Error rate trackable

---

## 6. Caching Verification

### 6.1 Cache Usage
- [ ] Leaderboard cached (1-5 min TTL)
- [ ] Online count cached (30s TTL)
- [ ] User summaries cached (1 min TTL)
- [ ] Friends list cached (30s TTL)

### 6.2 Cache Invalidation
- [ ] Friends list invalidated on add/remove
- [ ] Leaderboard pattern invalidation works
- [ ] No stale data issues

---

## 7. Circuit Breaker Verification

### 7.1 Failure Handling
- [ ] Circuit opens after 5 failures
- [ ] Fallback responses used when open
- [ ] Circuit closes after successful requests

### 7.2 Timeout Handling
- [ ] DB queries timeout after 10s
- [ ] External API calls timeout after 5s
- [ ] No hanging requests

---

## 8. Production Configuration

### 8.1 Environment Variables
- [ ] `NODE_ENV=production`
- [ ] `MYSQL_*` credentials set
- [ ] `JWT_SECRET` set
- [ ] `OPENAI_API_KEY` set (if using AI)
- [ ] `LOG_LEVEL=INFO` (or WARN for less noise)

### 8.2 Database Configuration
- [ ] Connection pool limit appropriate (100)
- [ ] Query queue limit set (500)
- [ ] SSL enabled if required

### 8.3 Rate Limits
- [ ] Community: 120 req/min
- [ ] Leaderboard: 120 req/min
- [ ] Notifications: 60 req/min
- [ ] Friends: 60 req/min
- [ ] AI/Chat: 20 req/min

---

## 9. Sign-Off

### Test Results Summary

| Category | Status | Notes |
|----------|--------|-------|
| Integration Tests | ⬜ | |
| Load Test 1k | ⬜ | |
| Load Test 2k | ⬜ | |
| WebSocket Test | ⬜ | |
| Security Check | ⬜ | |

### Approval

- [ ] Developer sign-off: _______________
- [ ] QA sign-off: _______________
- [ ] Deployment date: _______________

---

## Quick Commands

```bash
# Run integration tests
node tests/reliability-integration.test.js

# Run load test (1000 users, 60 seconds)
node tests/load-test.js 1000 60

# Apply database indexes
node api/utils/database-indexes.js

# Check for linter errors
npm run lint
```

---

## Rollback Procedure

If issues are detected after deployment:

1. Revert to previous deployment in Vercel/Railway
2. Check logs for errors
3. Run integration tests against previous version
4. Document issue for investigation

---

## Contact

For urgent production issues, contact the development team.
