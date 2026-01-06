# Deploy WebSocket Server to Railway - Step by Step

## Quick Guide

I've already created the WebSocket server code in the `websocket-server/` folder. Now you need to deploy it to Railway.

## Step 1: Create New Service on Railway

1. **Go to Railway Dashboard**: https://railway.app
2. **Open your AuraFx project** (the same project where your MySQL service is)
3. **Click "+ New"** button (top right, or in the project)
4. **Select "Empty Service"** or **"GitHub Repo"**

### Option A: Deploy from GitHub (Recommended)

1. Select **"Deploy from GitHub repo"**
2. Choose your **Aura-FX** repository
3. Railway will ask for the **Root Directory**
4. Enter: `websocket-server`
5. Click **"Deploy"**

### Option B: Deploy from Local Folder

1. Select **"Empty Service"**
2. Click on the service
3. Go to **"Settings"** tab
4. Under **"Source"**, click **"Connect GitHub"** or **"Upload"**
5. If uploading, zip the `websocket-server` folder and upload it

## Step 2: Set Environment Variables

Once the service is created:

1. Click on the **WebSocket service** in Railway
2. Go to **"Variables"** tab
3. Click **"+ New Variable"** for each of these:

```
MYSQL_HOST=tramway.proxy.rlwy.net
MYSQL_PORT=49989
MYSQL_USER=root
MYSQL_PASSWORD=FGcoKdqpUYWNb1nXzdGmBUACzeYDmewb
MYSQL_DATABASE=railway
MYSQL_SSL=true
PORT=3000
```

**Important**: Use the EXACT values from your MySQL service variables (the ones you showed me).

## Step 3: Get Public URL

1. Still in the WebSocket service, go to **"Settings"** tab
2. Scroll down to **"Networking"** section
3. Click **"Generate Domain"** button
4. Railway will create a public URL like: `your-service-name-production.up.railway.app`
5. **Copy this URL** - you'll need it!

## Step 4: Update Frontend

Once you have the public URL, I'll update the frontend code to use it. The URL will look like:
- `https://your-service-name-production.up.railway.app`

## Step 5: Verify It's Working

1. **Check Railway Logs**:
   - Go to **"Logs"** tab in your WebSocket service
   - You should see: `WebSocket server running on port 3000`

2. **Test Health Check**:
   - Visit: `https://your-service-url.up.railway.app/health`
   - Should return: `{"status":"ok","service":"websocket-server"}`

3. **Test on Your Website**:
   - Open your website
   - Go to Community page
   - Check browser console - should see "WebSocket Connected" instead of errors

## Troubleshooting

### Service Won't Start
- Check Railway logs for errors
- Verify all environment variables are set correctly
- Make sure `PORT=3000` is set (Railway will override this, but it's good to have)

### Can't Find Root Directory Option
- If deploying from GitHub, Railway might auto-detect
- If it doesn't work, try creating the service in the `websocket-server` folder directly on GitHub

### Still Getting Connection Errors
- Make sure the service is **"Online"** (green dot)
- Check that the public domain is generated
- Verify the URL in frontend matches the Railway service URL

## What Happens Next

Once deployed:
- ✅ Real-time messaging (no 5-second delay)
- ✅ Better user experience
- ✅ Less server load
- ✅ WebSocket will automatically connect when users visit Community page

**After you deploy, share the public URL with me and I'll update the frontend code!**


