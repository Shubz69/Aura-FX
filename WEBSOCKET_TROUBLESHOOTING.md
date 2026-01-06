# WebSocket Connection Troubleshooting

## Current Issue
Frontend is trying to connect to `aurafx-realtime-production.up.railway.app` but should use `aura-fx-production.up.railway.app`

## Solutions

### 1. Clear Browser Cache & Hard Refresh
- Press `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac) to hard refresh
- Or clear browser cache completely

### 2. Wait for Vercel Rebuild
The code is updated on GitHub, but Vercel needs to rebuild:
- Go to Vercel Dashboard → Your Project → Deployments
- Check if there's a new deployment running
- Wait for it to complete (2-3 minutes)

### 3. Check Railway Service Status

**In Railway:**
1. Go to "Aura-FX" service
2. Check "Logs" tab - should see: `WebSocket server running on port [number]`
3. If you see errors, share them

**Test Health Endpoint:**
Visit: `https://aura-fx-production.up.railway.app/health`
Should return: `{"status":"ok","service":"websocket-server"}`

### 4. Verify Environment Variables
In Railway "Aura-FX" service → Variables tab, make sure these are set:
```
MYSQL_HOST=tramway.proxy.rlwy.net
MYSQL_PORT=49989
MYSQL_USER=root
MYSQL_PASSWORD=FGcoKdqpUYWNb1nXzdGmBUACzeYDmewb
MYSQL_DATABASE=railway
MYSQL_SSL=true
```

### 5. Check Railway Service is Running
- Service should show "Online" (green dot)
- If it's paused or stopped, start it

### 6. Force Vercel Rebuild
If Vercel hasn't rebuilt automatically:
1. Go to Vercel Dashboard
2. Click on your project
3. Go to "Deployments" tab
4. Click "..." on latest deployment
5. Click "Redeploy"

## Expected Behavior After Fix

Once working, you should see in browser console:
- `WebSocket Connected` instead of connection errors
- Messages update in real-time (no 5-second delay)
- No more "HTTP 200 instead of 101" errors


