# AURA FX - Performance & Scaling Guide

## ⚠️ Current Performance Issues

### **CRITICAL: Database Connection Problem**
Your API endpoints are creating **new database connections for every request**. This will cause severe slowdowns under high traffic.

**Current Problem:**
- Most API files use `mysql.createConnection()` which creates a new connection per request
- Connections are not reused, causing overhead and potential connection exhaustion
- Only WebSocket server uses connection pooling (10 connections limit)

**Impact:**
- **Low traffic (< 10 users)**: Works fine
- **Medium traffic (10-50 users)**: Noticeable slowdowns
- **High traffic (50+ users)**: Server crashes, timeouts, database connection errors

---

## 🚀 Immediate Fixes (Do These First)

### 1. **Implement Database Connection Pooling** (CRITICAL)

**Problem:** Every API request creates a new database connection.

**Solution:** Create a shared connection pool module.

**Create:** `api/db.js`
```javascript
const mysql = require('mysql2/promise');

let pool = null;

const getDbPool = () => {
  if (pool) return pool;

  if (!process.env.MYSQL_HOST || !process.env.MYSQL_USER || 
      !process.env.MYSQL_PASSWORD || !process.env.MYSQL_DATABASE) {
    console.warn('Database credentials not found');
    return null;
  }

  pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    port: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT) : 3306,
    waitForConnections: true,
    connectionLimit: 20, // Increase from 10 to 20
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: false } : false
  });

  return pool;
};

const getDbConnection = async () => {
  const pool = getDbPool();
  if (!pool) return null;
  return await pool.getConnection();
};

module.exports = { getDbPool, getDbConnection };
```

**Then update ALL API files** to use this instead of creating new connections:
```javascript
// OLD (BAD):
const connection = await mysql.createConnection({...});

// NEW (GOOD):
const { getDbConnection } = require('../db');
const connection = await getDbConnection();
// Don't forget to release: connection.release();
```

**Files to update:**
- `api/admin/index.js`
- `api/auth/login.js`
- `api/auth/register.js`
- `api/auth/mfa.js`
- `api/auth/password-reset.js`
- `api/auth/signup-verification.js`
- `api/community/channels.js`
- `api/community/channels/messages.js`
- `api/community/index.js`
- `api/courses.js`
- `api/leaderboard.js`
- `api/messages/threads.js`
- `api/stripe/index.js`
- `api/users/update.js`

### 2. **Add Response Caching** (High Priority)

**For Leaderboard:**
- Cache leaderboard data for 5-10 minutes
- Only refresh when new XP is added

**For Courses:**
- Cache course list (rarely changes)
- Cache for 1 hour

**For Channels:**
- Cache channel list (rarely changes)
- Cache for 30 minutes

**Implementation:**
```javascript
// Simple in-memory cache
const cache = new Map();

const getCached = (key, ttl = 300000) => { // 5 min default
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.timestamp > ttl) {
    cache.delete(key);
    return null;
  }
  return item.data;
};

const setCached = (key, data) => {
  cache.set(key, { data, timestamp: Date.now() });
};
```

### 3. **Optimize Database Queries**

**Add Indexes:**
```sql
-- For messages table
CREATE INDEX idx_channel_timestamp ON messages(channel_id, timestamp);
CREATE INDEX idx_sender ON messages(sender_id);

-- For users table
CREATE INDEX idx_xp ON users(xp DESC);
CREATE INDEX idx_level ON users(level DESC);
CREATE INDEX idx_email ON users(email);
CREATE INDEX idx_username ON users(username);

-- For contact_messages
CREATE INDEX idx_created_read ON contact_messages(created_at, `read`);
```

### 4. **Add Database Query Limits**

**Current Issue:** Some queries fetch unlimited rows.

**Fix:**
```javascript
// Always limit queries
const [rows] = await connection.execute(
  'SELECT * FROM messages WHERE channel_id = ? ORDER BY timestamp DESC LIMIT 100',
  [channelId]
);
```

---

## 📊 Scaling Strategy

### **Current Architecture:**
- **Frontend:** Vercel (auto-scales)
- **Backend API:** Vercel Serverless Functions (auto-scales)
- **WebSocket:** Railway (single instance - bottleneck)
- **Database:** Railway MySQL (shared instance)

### **Traffic Capacity Estimates:**

| Traffic Level | Current Capacity | After Fixes |
|--------------|------------------|-------------|
| **Low (< 50 concurrent)** | ✅ Works | ✅ Works smoothly |
| **Medium (50-200 concurrent)** | ⚠️ Slowdowns | ✅ Works with caching |
| **High (200-500 concurrent)** | ❌ Crashes | ⚠️ Needs WebSocket scaling |
| **Very High (500+ concurrent)** | ❌ Down | ❌ Needs full scaling |

---

## 🔧 Medium-Term Optimizations

### 1. **Upgrade Railway Database Plan**
- Current: Shared MySQL instance
- Recommended: Dedicated MySQL with more connections
- Cost: ~$5-20/month

### 2. **Add Redis for Caching**
- Cache leaderboard, courses, channels
- Cache user sessions
- Cost: Railway Redis ~$5/month

### 3. **Optimize WebSocket Server**
- Current: Single Railway instance
- Add connection limits per user
- Implement message queuing for high traffic

### 4. **Add CDN for Static Assets**
- Vercel already provides CDN
- Ensure proper cache headers
- Optimize images

### 5. **Database Read Replicas** (For Very High Traffic)
- Read-heavy queries use replicas
- Write queries use primary
- Cost: ~$10-30/month

---

## 🎯 Long-Term Scaling Solutions

### **Option 1: Keep Current Setup (Up to 500 concurrent users)**
- ✅ Implement connection pooling
- ✅ Add caching
- ✅ Optimize queries
- ✅ Upgrade Railway database plan
- **Cost:** ~$20-50/month
- **Capacity:** 200-500 concurrent users

### **Option 2: Scale WebSocket (Up to 2000 concurrent users)**
- ✅ All Option 1 fixes
- ✅ Multiple WebSocket instances with load balancer
- ✅ Redis for shared state
- ✅ Database read replicas
- **Cost:** ~$100-200/month
- **Capacity:** 1000-2000 concurrent users

### **Option 3: Full Scaling (Unlimited)**
- ✅ All previous fixes
- ✅ Kubernetes or managed containers
- ✅ Auto-scaling WebSocket servers
- ✅ Database cluster
- ✅ Redis cluster
- ✅ Load balancers
- **Cost:** ~$500-2000/month
- **Capacity:** 10,000+ concurrent users

---

## 📈 Monitoring & Alerts

### **What to Monitor:**

1. **Database Connections:**
   - Active connections
   - Connection pool usage
   - Connection errors

2. **Response Times:**
   - API endpoint response times
   - Database query times
   - WebSocket latency

3. **Error Rates:**
   - 500 errors
   - Database connection errors
   - Timeout errors

4. **Resource Usage:**
   - CPU usage
   - Memory usage
   - Database CPU/Memory

### **Tools:**
- **Vercel Analytics:** Built-in (free)
- **Railway Metrics:** Built-in dashboard
- **Sentry:** Error tracking (free tier available)
- **Uptime Robot:** Uptime monitoring (free)

---

## ⚡ Quick Performance Checklist

### **Immediate (Do Today):**
- [ ] Create shared database connection pool
- [ ] Update all API files to use connection pool
- [ ] Add query limits to all database queries
- [ ] Add basic caching for leaderboard

### **This Week:**
- [ ] Add database indexes
- [ ] Implement caching for courses and channels
- [ ] Optimize slow queries
- [ ] Set up basic monitoring

### **This Month:**
- [ ] Upgrade Railway database plan
- [ ] Add Redis caching
- [ ] Optimize WebSocket server
- [ ] Set up error tracking (Sentry)

### **Future:**
- [ ] Consider read replicas if traffic grows
- [ ] Scale WebSocket horizontally if needed
- [ ] Implement rate limiting
- [ ] Add CDN optimization

---

## 🚨 Red Flags (When to Scale)

**Scale immediately if you see:**
- Database connection errors
- Response times > 5 seconds
- 500 errors > 1% of requests
- WebSocket disconnections
- Database CPU > 80%

**Current Limits:**
- **Database connections:** 10-20 (after pooling fix)
- **WebSocket connections:** ~1000 per instance
- **API requests:** Unlimited (Vercel auto-scales)
- **Database queries:** Limited by connection pool

---

## 💡 Cost vs Performance

| Solution | Monthly Cost | Performance Gain |
|----------|-------------|-------------------|
| Connection Pooling | $0 | 10x improvement |
| Caching | $0 | 5x improvement |
| Database Indexes | $0 | 3x improvement |
| Upgrade Railway DB | $5-20 | 2x improvement |
| Add Redis | $5 | 3x improvement |
| Read Replicas | $10-30 | 2x improvement |

**Best ROI:** Connection pooling + Caching = **15x improvement for $0**

---

## 📞 Support

If you experience performance issues:
1. Check Railway dashboard for database metrics
2. Check Vercel analytics for API response times
3. Monitor error logs
4. Review this guide for optimization opportunities

---

**Last Updated:** 2025-01-XX
**Priority:** Implement connection pooling immediately - this is the #1 bottleneck.
