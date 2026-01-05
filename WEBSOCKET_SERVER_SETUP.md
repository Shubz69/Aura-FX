# WebSocket Server Setup Guide

## Current Issue
The WebSocket server at `aurafx-realtime-production.up.railway.app` is not deployed or not working. The frontend is trying to connect but getting HTTP 200 instead of HTTP 101 (WebSocket upgrade).

## Solution: Deploy WebSocket Server to Railway

I've created a WebSocket server in the `websocket-server/` folder. Follow these steps:

### Step 1: Deploy to Railway

1. **Go to Railway Dashboard**: https://railway.app
2. **Create New Service**:
   - Click "New Project" or add to existing project
   - Select "Deploy from GitHub repo"
   - OR: Select "Empty Project" and upload the `websocket-server` folder

3. **Configure the Service**:
   - Railway will auto-detect Node.js
   - It will run `npm install` and `npm start` automatically

### Step 2: Set Environment Variables

In Railway service settings, add these variables:

```
MYSQL_HOST=tramway.proxy.rlwy.net
MYSQL_PORT=49989
MYSQL_USER=root
MYSQL_PASSWORD=FGcoKdqpUYWNb1nXzdGmBUACzeYDmewb
MYSQL_DATABASE=railway
MYSQL_SSL=true
```

(Use your actual Railway MySQL credentials)

### Step 3: Get Public URL

1. In Railway service settings, click **"Generate Domain"**
2. Copy the public URL (e.g., `aurafx-websocket-production.up.railway.app`)
3. Note this URL - you'll need it for the frontend

### Step 4: Update Frontend (Optional)

The frontend is already configured to use `aurafx-realtime-production.up.railway.app`. 

**Option A**: Use the new Railway service URL
- Update `src/utils/useWebSocket.js` line 28 and 32 to use your new Railway URL

**Option B**: Keep using the existing URL
- Just make sure the Railway service name matches `aurafx-realtime-production`

### Step 5: Verify It Works

1. **Check Railway Logs**:
   - Should see: `WebSocket server running on port 3000`
   - Should see: `New WebSocket connection` when frontend connects

2. **Test Health Check**:
   - Visit: `https://your-railway-url.up.railway.app/health`
   - Should return: `{"status":"ok","service":"websocket-server"}`

3. **Test WebSocket**:
   - Open browser console on your site
   - Should see: `WebSocket connected` instead of connection errors

## Current Status

- ✅ **REST API Polling**: Working (messages update every 5 seconds)
- ❌ **WebSocket**: Not connected (falling back to REST)
- ✅ **WebSocket Server Code**: Created and ready to deploy

## After Deployment

Once the WebSocket server is deployed and running:
- Messages will update in real-time (no 5-second delay)
- Better user experience
- Less server load (no constant polling)

## Database Requirements

The WebSocket server needs access to the `messages` table. This should already exist from your previous setup. If not, the server will still work but won't save messages to the database (they'll only be broadcast in real-time).

## Troubleshooting

### Service Won't Start
- Check Railway logs for errors
- Verify all environment variables are set
- Ensure Node.js version is 18+ (Railway auto-detects)

### WebSocket Still Not Connecting
- Verify the Railway service is running (not paused)
- Check the public URL is correct
- Verify frontend is using the correct URL
- Check Railway logs for connection attempts

### Messages Not Broadcasting
- Check WebSocket connection is established (Railway logs)
- Verify clients are subscribed to channels
- Check database connection (if saving messages)

