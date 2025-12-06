# Railway WebSocket Troubleshooting Guide

## Problem
The Railway WebSocket service at `glitch-realtime-production.up.railway.app` is returning **HTTP 200** instead of **HTTP 101 Switching Protocols**, which means it's not upgrading HTTP connections to WebSocket.

## Step-by-Step Checklist

### 1. Check Railway Service Status
- [ ] Go to Railway dashboard: https://railway.app
- [ ] Navigate to the `glitch-realtime` service
- [ ] Verify the service status shows **"Active"** (green)
- [ ] Check if the service is actually running (not paused or stopped)

### 2. Check Railway Service Logs
- [ ] Open the **"Logs"** tab in Railway dashboard
- [ ] Look for any error messages when WebSocket connection attempts are made
- [ ] Check for:
  - Port binding errors
  - WebSocket upgrade errors
  - Connection refused errors
  - Any stack traces or exceptions

### 3. Check HTTP Logs (What You Already Saw)
- [ ] In Railway dashboard, go to **"HTTP Logs"** tab
- [ ] Look for requests to `/ws` endpoint
- [ ] **Current Issue**: You're seeing `GET /ws` returning `200 OK`
- [ ] **Expected**: Should return `101 Switching Protocols` for WebSocket upgrades
- [ ] Note: If you see `200 OK`, the server is treating WebSocket as regular HTTP

### 4. Check Railway Service Code
You need to verify the WebSocket server implementation. Check:

#### A. Port Configuration
- [ ] Does the service use `process.env.PORT`?
- [ ] Railway assigns a dynamic port via `PORT` environment variable
- [ ] **Wrong**: `server.listen(3000)` or hardcoded port
- [ ] **Correct**: `server.listen(process.env.PORT || 3000)`

#### B. WebSocket Upgrade Handling
- [ ] Does the server handle `Upgrade: websocket` header?
- [ ] Does it return `101 Switching Protocols` status?
- [ ] Is it using a proper WebSocket library?

#### C. WebSocket Library
- [ ] If Node.js: Is it using `ws` library or similar?
- [ ] If Spring Boot: Is WebSocket configuration correct?
- [ ] If Express: Is it using `express-ws` or similar?

### 5. Test WebSocket Endpoint Directly

#### Option A: Browser Console Test
Open browser console and run:
```javascript
const ws = new WebSocket('wss://glitch-realtime-production.up.railway.app/ws');
ws.onopen = () => console.log('Connected!');
ws.onerror = (e) => console.error('Error:', e);
ws.onclose = (e) => console.log('Closed:', e.code, e.reason);
```

#### Option B: curl Test
```bash
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: test" \
  https://glitch-realtime-production.up.railway.app/ws
```

**Expected Response:**
```
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
```

**Current Response (Problem):**
```
HTTP/1.1 200 OK
```

### 6. Check Railway Environment Variables
- [ ] Go to Railway service **"Settings"** tab
- [ ] Check **"Variables"** section
- [ ] Verify `PORT` is set (Railway usually sets this automatically)
- [ ] Check for any WebSocket-related environment variables
- [ ] Verify database connection strings if WebSocket needs DB access

### 7. Check Railway Service Type
- [ ] What type of service is `glitch-realtime`?
  - [ ] Node.js/Express
  - [ ] Spring Boot
  - [ ] Python/Flask
  - [ ] Other: ___________
- [ ] Does it have a `package.json`, `pom.xml`, `requirements.txt`, etc.?

### 8. Check Service Repository/Code
If you have access to the Railway service code:

#### For Node.js/Express:
```javascript
// Check if it has something like this:
const express = require('express');
const app = express();
const server = require('http').createServer(app);
const WebSocket = require('ws');

// WebSocket server should be created like this:
const wss = new WebSocket.Server({ server });

// Server should listen on Railway's PORT:
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
```

#### For Spring Boot:
- [ ] Check `@EnableWebSocket` annotation
- [ ] Check WebSocket configuration class
- [ ] Verify `application.properties` or `application.yml` has correct port: `server.port=${PORT:8080}`

### 9. Common Issues and Fixes

#### Issue 1: Server Not Handling WebSocket Upgrades
**Symptom**: HTTP 200 instead of 101
**Fix**: Ensure WebSocket upgrade logic is implemented

#### Issue 2: Wrong Port
**Symptom**: Connection refused errors
**Fix**: Use `process.env.PORT`

#### Issue 3: Missing WebSocket Library
**Symptom**: Server crashes or doesn't recognize WebSocket
**Fix**: Install and configure proper WebSocket library

#### Issue 4: Railway Networking Configuration
**Symptom**: Service not accessible
**Fix**: Check Railway's public networking settings

### 10. What Information to Share
If you need help fixing the Railway service, please share:
1. Service type (Node.js, Spring Boot, etc.)
2. Service code (or relevant parts)
3. Railway logs (error messages)
4. `package.json` or dependencies file
5. Any WebSocket-related configuration files

## Current Status
- ✅ Frontend: Working correctly (tries 5 times, falls back to REST polling)
- ❌ Railway WebSocket: Not handling upgrades (returns 200 instead of 101)
- ✅ REST API: Working (messages update every 5 seconds)

## Next Steps
1. Check Railway logs for specific errors
2. Verify the service code handles WebSocket upgrades
3. Test the WebSocket endpoint directly (see Step 5)
4. Share the service code if you need help fixing it

