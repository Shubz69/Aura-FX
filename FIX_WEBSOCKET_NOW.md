# 🔧 Fix WebSocket Connection - Immediate Steps

## Problem
The frontend is still trying to connect to the old URL `aurafx-realtime-production.up.railway.app` instead of `aura-fx-production.up.railway.app`

## Solution 1: Force Vercel Rebuild (Most Important)

The code is updated on GitHub, but Vercel needs to rebuild:

1. **Go to Vercel Dashboard**: https://vercel.com/dashboard
2. **Click on your "aura-fx" project**
3. **Go to "Deployments" tab**
4. **Click "..." on the latest deployment**
5. **Click "Redeploy"**
6. **Wait 2-3 minutes** for rebuild to complete

## Solution 2: Check Railway Service

1. **Go to Railway** → "Aura-FX" service
2. **Check "Logs" tab**:
   - Should see: `WebSocket server running on port [number]`
   - If you see errors, share them
3. **Test Health Check**:
   - Visit: `https://aura-fx-production.up.railway.app/health`
   - Should return: `{"status":"ok","service":"websocket-server"}`

## Solution 3: Verify Environment Variables

In Railway "Aura-FX" service → "Variables" tab, add these if missing:

```
MYSQL_HOST=tramway.proxy.rlwy.net
MYSQL_PORT=49989
MYSQL_USER=root
MYSQL_PASSWORD=FGcoKdqpUYWNb1nXzdGmBUACzeYDmewb
MYSQL_DATABASE=railway
MYSQL_SSL=true
```

## Solution 4: Clear Browser Cache

After Vercel rebuilds:
- Press `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac) to hard refresh
- Or open in Incognito/Private window

## After These Steps

You should see in browser console:
- ✅ `Connecting to WebSocket at https://aura-fx-production.up.railway.app/ws`
- ✅ `WebSocket Connected`
- ❌ No more connection errors

**The most important step is forcing Vercel to rebuild!**


