# 🚨 CRITICAL: Add Environment Variables to Railway

## The Problem
Your Railway "Aura-FX" service is missing database credentials. The logs show:
```
Database credentials not found. WebSocket will work but without database features.
```

**The WebSocket server is running, but it can't save messages to the database!**

## The Solution

### Step 1: Go to Railway "Aura-FX" Service
1. Go to Railway dashboard
2. Click on **"Aura-FX"** service (not MySQL)
3. Go to **"Variables"** tab

### Step 2: Add These Variables
Click **"New Variable"** and add each one:

```
MYSQL_HOST = tramway.proxy.rlwy.net
MYSQL_PORT = 49989
MYSQL_USER = root
MYSQL_PASSWORD = FGcoKdqpUYWNb1nXzdGmBUACzeYDmewb
MYSQL_DATABASE = railway
MYSQL_SSL = true
```

**Important:** 
- Copy these EXACTLY as shown
- No spaces around the `=` sign
- `MYSQL_SSL` should be the string `"true"` (not boolean)

### Step 3: Wait for Redeploy
After adding variables, Railway will automatically redeploy. Wait 1-2 minutes.

### Step 4: Check Logs
Go to Railway → "Aura-FX" → "Logs" tab. You should see:
- ✅ `Database connection pool created successfully`
- ✅ `WebSocket server running on port 8080`
- ❌ No more "Database credentials not found" warning

### Step 5: Test Health Endpoint
Visit: `https://aura-fx-production.up.railway.app/health`

Should return: `{"status":"ok","service":"websocket-server"}`

## After This

Once the variables are added and the service redeploys:
1. The WebSocket server will be able to save messages to the database
2. Messages will persist across restarts
3. The frontend should connect successfully

**This is the missing piece! Add these variables to Railway now.**


