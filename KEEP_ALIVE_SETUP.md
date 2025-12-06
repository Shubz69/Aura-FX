# Keep-Alive Setup for 24/7 Backend

## Automatic Keep-Alive Options

### Option 1: Use UptimeRobot (Free - Recommended)

1. **Sign up**: https://uptimerobot.com (free tier allows 50 monitors)
2. **Add Monitor**:
   - Monitor Type: HTTP(s)
   - Friendly Name: "Glitch WebSocket Keep-Alive"
   - URL: `https://glitch-realtime-production.up.railway.app/health`
   - Monitoring Interval: 5 minutes
   - Alert Contacts: Your email

3. **Benefits**:
   - Free forever
   - Sends HTTP request every 5 minutes
   - Keeps Railway service awake
   - Alerts you if service goes down

### Option 2: Use Cron-Job.org (Free)

1. **Sign up**: https://cron-job.org (free tier available)
2. **Create Cron Job**:
   - URL: `https://glitch-realtime-production.up.railway.app/ping`
   - Schedule: Every 5 minutes (`*/5 * * * *`)
   - Method: GET

3. **Benefits**:
   - Free tier available
   - Customizable schedule
   - Simple setup

### Option 3: Use GitHub Actions (Free)

Create `.github/workflows/keep-alive.yml`:

```yaml
name: Keep Railway Alive

on:
  schedule:
    - cron: '*/5 * * * *'  # Every 5 minutes
  workflow_dispatch:  # Manual trigger

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping Railway WebSocket
        run: |
          curl -f https://glitch-realtime-production.up.railway.app/health || exit 1
```

### Option 4: Use Vercel Cron Jobs (If on Vercel Pro)

Create `api/cron/keep-alive.js`:

```javascript
export default async function handler(req, res) {
  try {
    const response = await fetch('https://glitch-realtime-production.up.railway.app/health');
    const data = await response.json();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
```

Then add to `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/cron/keep-alive",
    "schedule": "*/5 * * * *"
  }]
}
```

## Recommended Setup

**For Free Tier**: Use UptimeRobot (Option 1)
- ✅ Free forever
- ✅ Easy setup
- ✅ Email alerts
- ✅ Keeps service awake

**For Pro Tier**: Use Vercel Cron (Option 4)
- ✅ Integrated with your existing setup
- ✅ No external services needed
- ✅ More control

## Testing Keep-Alive

Test the endpoints:
```bash
# Health check
curl https://glitch-realtime-production.up.railway.app/health

# Ping endpoint
curl https://glitch-realtime-production.up.railway.app/ping
```

Both should return JSON responses.

## Monitoring

After setting up keep-alive, monitor:
1. **Railway Dashboard**: Check service uptime
2. **UptimeRobot Dashboard**: Check ping success rate
3. **Application Logs**: Verify no unexpected restarts


