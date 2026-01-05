const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mysql = require('mysql2/promise');
const cors = require('cors');
const { Server: StompServer } = require('stomp-broker-js');

const app = express();
const server = http.createServer(app);

// Enable CORS
app.use(cors());
app.use(express.json());

// WebSocket Server (for STOMP)
const wss = new WebSocket.Server({ 
    server,
    path: '/ws',
    perMessageDeflate: false
});

// STOMP Server
const stompServer = new StompServer({
    server: wss,
    path: '/ws',
    heartbeat: [4000, 4000]
});

// Database connection pool
let dbPool = null;

const createDbPool = () => {
    if (!process.env.MYSQL_HOST || !process.env.MYSQL_USER || !process.env.MYSQL_PASSWORD || !process.env.MYSQL_DATABASE) {
        console.warn('Database credentials not found. WebSocket will work but without database features.');
        return null;
    }

    return mysql.createPool({
        host: process.env.MYSQL_HOST,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
        port: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT) : 3306,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: false } : false
    });
};

// Initialize database pool
dbPool = createDbPool();

// Store connected clients by channel
const channelClients = new Map();

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'websocket-server' });
});

// Store STOMP subscriptions by channel
const stompSubscriptions = new Map();

// STOMP message handlers
stompServer.on('connect', (sessionId) => {
    console.log(`STOMP client connected: ${sessionId}`);
});

stompServer.on('subscribe', (subscription) => {
    const destination = subscription.destination;
    console.log(`Client subscribed to: ${destination}`);
    
    // Extract channel ID from destination (format: /topic/chat/{channelId} or /topic/online-users)
    let channelId = null;
    if (destination.startsWith('/topic/chat/')) {
        channelId = destination.replace('/topic/chat/', '');
    } else if (destination === '/topic/online-users') {
        channelId = 'online-users';
    }
    
    if (channelId) {
        if (!stompSubscriptions.has(channelId)) {
            stompSubscriptions.set(channelId, new Set());
        }
        stompSubscriptions.get(channelId).add(subscription);
    }
});

stompServer.on('unsubscribe', (subscription) => {
    const destination = subscription.destination;
    console.log(`Client unsubscribed from: ${destination}`);
    
    let channelId = null;
    if (destination.startsWith('/topic/chat/')) {
        channelId = destination.replace('/topic/chat/', '');
    } else if (destination === '/topic/online-users') {
        channelId = 'online-users';
    }
    
    if (channelId && stompSubscriptions.has(channelId)) {
        stompSubscriptions.get(channelId).delete(subscription);
        if (stompSubscriptions.get(channelId).size === 0) {
            stompSubscriptions.delete(channelId);
        }
    }
});

stompServer.on('send', async (frame) => {
    try {
        const destination = frame.headers.destination;
        const messageBody = frame.body;
        
        // Extract channel ID from destination (format: /app/chat/{channelId})
        let channelId = null;
        if (destination && destination.startsWith('/app/chat/')) {
            channelId = destination.replace('/app/chat/', '');
        }
        
        if (!channelId) {
            console.warn('Unknown message destination:', destination);
            return;
        }
        
        console.log(`Message received for channel: ${channelId}`);
        
        let data;
        try {
            data = JSON.parse(messageBody);
        } catch (parseError) {
            console.error('Error parsing message body:', parseError);
            return;
        }
        
        // Save to database if pool is available
        if (dbPool && data.content) {
            try {
                await dbPool.execute(
                    'INSERT INTO messages (channel_id, sender_id, content, timestamp) VALUES (?, ?, ?, NOW())',
                    [channelId, data.userId || data.senderId || null, data.content]
                );
            } catch (dbError) {
                console.error('Error saving message to database:', dbError.message);
            }
        }
        
        // Broadcast to all subscribers of this channel
        const topic = `/topic/chat/${channelId}`;
        if (stompSubscriptions.has(channelId)) {
            const messageToSend = JSON.stringify({
                id: Date.now(),
                channelId: channelId,
                content: data.content,
                sender: data.sender || { 
                    id: data.userId || data.senderId, 
                    username: data.username || 'User',
                    avatar: data.avatar || '/avatars/avatar_ai.png'
                },
                timestamp: new Date().toISOString(),
                userId: data.userId || data.senderId,
                username: data.username || 'User'
            });
            
            stompSubscriptions.get(channelId).forEach((sub) => {
                if (sub && sub.send) {
                    try {
                        sub.send(messageToSend);
                    } catch (error) {
                        console.error('Error sending message to subscriber:', error);
                    }
                }
            });
        }
    } catch (error) {
        console.error('Error processing STOMP message:', error);
    }
});

stompServer.on('disconnect', (sessionId) => {
    console.log(`STOMP client disconnected: ${sessionId}`);
    // Clean up subscriptions
    stompSubscriptions.forEach((subs, channelId) => {
        subs.forEach((sub) => {
            if (sub.sessionId === sessionId) {
                subs.delete(sub);
            }
        });
        if (subs.size === 0) {
            stompSubscriptions.delete(channelId);
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`WebSocket server running on port ${PORT}`);
    console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing server...');
    wss.close(() => {
        server.close(() => {
            if (dbPool) {
                dbPool.end();
            }
            process.exit(0);
        });
    });
});

