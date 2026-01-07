# AURA FX WebSocket Server

Real-time WebSocket server for AURA FX community messaging.

## Deployment to Railway

### Step 1: Create New Railway Service
1. Go to Railway dashboard: https://railway.app
2. Click "New Project"
3. Select "Deploy from GitHub repo" (or upload this folder)
4. Select this `websocket-server` directory

### Step 2: Configure Environment Variables
Add these environment variables in Railway:

```
MYSQL_HOST=your_mysql_host
MYSQL_PORT=your_mysql_port
MYSQL_USER=your_mysql_user
MYSQL_PASSWORD=your_mysql_password
MYSQL_DATABASE=railway
MYSQL_SSL=true
PORT=3000
```

### Step 3: Deploy
Railway will automatically:
- Detect Node.js
- Install dependencies (`npm install`)
- Start the server (`npm start`)

### Step 4: Get Public URL
1. Go to Railway service settings
2. Click "Generate Domain"
3. Copy the public URL (e.g., `aurafx-websocket-production.up.railway.app`)
4. Update frontend `REACT_APP_WS_URL` or use the URL in `useWebSocket.js`

## Local Development

```bash
cd websocket-server
npm install
npm start
```

Server will run on `http://localhost:3000`
WebSocket endpoint: `ws://localhost:3000/ws`

## Health Check

The server has a health check endpoint:
```
GET /health
```

Returns: `{ status: 'ok', service: 'websocket-server' }`

Railway will use this to monitor the service.

## WebSocket Protocol

### Subscribe to Channel
```json
{
  "type": "subscribe",
  "channelId": "forex",
  "userId": 123
}
```

### Send Message
```json
{
  "type": "message",
  "channelId": "forex",
  "userId": 123,
  "message": {
    "content": "Hello world",
    "timestamp": "2025-01-01T00:00:00Z"
  }
}
```

### Receive Message
```json
{
  "type": "new_message",
  "message": {
    "id": 1,
    "content": "Hello world",
    "sender": {...},
    "timestamp": "2025-01-01T00:00:00Z"
  }
}
```

## Troubleshooting

### Connection Fails
- Check Railway logs for errors
- Verify environment variables are set
- Ensure database is accessible
- Check Railway service is running (not paused)

### Messages Not Broadcasting
- Check WebSocket connection is established
- Verify client is subscribed to channel
- Check Railway logs for errors
- Verify database connection




