# Backend 24/7 Setup Guide

## Current Setup

### 1. **Vercel API Endpoints** (Serverless Functions)
- **Status**: Always available, but can have cold starts (2-5 second delay on first request after inactivity)
- **Location**: `api/**/*.js` files deployed as Vercel serverless functions
- **Cost**: Free tier available, Pro recommended for production

### 2. **Railway WebSocket Service** (Always-On)
- **Status**: Should run 24/7 on Railway
- **Location**: `glitch-realtime` service on Railway
- **Cost**: Railway free tier allows 500 hours/month, Pro recommended for unlimited

## Ensuring 24/7 Operation

### Option 1: Keep Current Setup (Recommended for Most Cases)

#### Vercel API Endpoints
Vercel serverless functions are always available, but to minimize cold starts:

1. **Upgrade to Vercel Pro** ($20/month)
   - Eliminates cold starts
   - Better performance
   - More bandwidth

2. **Or Keep Free Tier** (Works but with cold starts)
   - Functions wake up automatically on first request
   - Usually takes 2-5 seconds
   - No action needed - already configured

#### Railway WebSocket Service ✅
Already configured for 24/7 operation:

1. **Railway Plan**: Premium (already paid) ✅
   - Unlimited hours
   - Always running
   - No sleep mode

2. **Configure Railway Service** (Already done in `railway.json`):
   ```json
   {
     "deploy": {
       "restartPolicy": {
         "onFailure": {
           "maxRetries": 10
         }
       }
     }
   }
   ```

3. **Add Health Check** (Already configured):
   - Endpoint: `/health`
   - Railway will automatically restart if health check fails

### Option 2: Move API to Railway (True 24/7, No Cold Starts)

If you want to eliminate all cold starts, you can move your API endpoints to Railway:

1. **Create a new Railway service** for your API
2. **Deploy all API endpoints** as a Node.js/Express server
3. **Benefits**:
   - No cold starts
   - Always warm
   - Better for real-time features

**Steps to move API to Railway:**

1. Create `api-server.js`:
```javascript
const express = require('express');
const app = express();

// Import all your API routes
app.use('/api/courses', require('./api/courses'));
app.use('/api/community', require('./api/community'));
// ... etc

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`API server running on port ${PORT}`);
});
```

2. Deploy to Railway as a new service
3. Update frontend `API_BASE_URL` to point to Railway API service

## Recommended Setup for Production

### Your Current Setup ✅
- ✅ Railway WebSocket (Premium) - 24/7, unlimited hours
- ⚠️ Vercel API (Free) - works but has cold starts (2-5s delay on first request)

### Recommended Upgrade
- ✅ Railway WebSocket (Premium) - Already configured ✅
- ✅ Vercel Pro ($20/month) - Eliminates cold starts, better performance
- **Total Cost**: ~$20/month (Railway already paid)

### Enterprise Setup
- ✅ Railway for both API and WebSocket
- ✅ Better performance, no cold starts
- ✅ Single platform management
- **Total Cost**: ~$10-15/month + usage

## Monitoring & Alerts

### Railway
1. Go to Railway Dashboard → Your Service
2. Enable **"Alerts"** for:
   - Service down
   - High memory usage
   - High CPU usage

### Vercel
1. Go to Vercel Dashboard → Your Project
2. Enable **"Deployment Notifications"**
3. Monitor function execution times

## Health Checks

### Railway WebSocket Service
- Already configured: `GET /health`
- Railway checks this automatically

### Vercel API
- No health check needed (serverless)
- Functions wake up on first request

## Troubleshooting

### If Railway Service Goes to Sleep
1. Check Railway dashboard for service status
2. Verify you haven't exceeded free tier hours
3. Upgrade to Pro for unlimited hours

### If Vercel Functions Are Slow
1. First request after inactivity = cold start (normal)
2. Upgrade to Vercel Pro to eliminate cold starts
3. Or move API to Railway for always-warm functions

## Next Steps

1. **Check Railway Service Status**
   - Go to Railway dashboard
   - Verify `glitch-realtime` service is running
   - Check if you need to upgrade plan

2. **Monitor Usage**
   - Railway: Check hours used this month
   - Vercel: Check function invocations

3. **Set Up Alerts**
   - Enable Railway alerts
   - Enable Vercel notifications

4. **Consider Upgrading** (if needed)
   - Railway Pro for unlimited hours
   - Vercel Pro for no cold starts


