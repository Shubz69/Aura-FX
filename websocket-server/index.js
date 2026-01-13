const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Enable CORS
app.use(cors());
app.use(express.json());

// WebSocket Server
const wss = new WebSocket.Server({ 
    server,
    path: '/ws',
    perMessageDeflate: false
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
        connectionLimit: 20, // Increased for WebSocket server
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: false } : false
    });
};

// Initialize database pool
dbPool = createDbPool();

// Store subscriptions: channelId -> Set of WebSocket connections
const subscriptions = new Map();

// Store client info
const clients = new Map();

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'websocket-server' });
});

// Simple STOMP frame parser
function parseStompFrame(data) {
    const lines = data.split('\n');
    const command = lines[0];
    const headers = {};
    let body = '';
    let bodyStart = false;
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line === '') {
            bodyStart = true;
            continue;
        }
        if (bodyStart) {
            body += line + '\n';
        } else {
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0) {
                const key = line.substring(0, colonIndex);
                const value = line.substring(colonIndex + 1);
                headers[key] = value;
            }
        }
    }
    
    // Remove trailing null character if present
    body = body.replace(/\0$/, '');
    
    return { command, headers, body };
}

// Create STOMP frame
function createStompFrame(command, headers = {}, body = '') {
    let frame = command + '\n';
    for (const [key, value] of Object.entries(headers)) {
        frame += `${key}:${value}\n`;
    }
    frame += '\n';
    frame += body;
    frame += '\0';
    return frame;
}

// WebSocket connection handling
wss.on('connection', (ws, req) => {
    console.log('New WebSocket connection');
    const clientId = Date.now().toString();
    clients.set(ws, { id: clientId, subscriptions: new Set() });
    
    // Send CONNECTED frame
    const connectedFrame = createStompFrame('CONNECTED', {
        'version': '1.2',
        'heart-beat': '4000,4000'
    });
    ws.send(connectedFrame);
    
    ws.on('message', async (data) => {
        try {
            const frame = parseStompFrame(data.toString());
            
            if (frame.command === 'CONNECT' || frame.command === 'STOMP') {
                // Already sent CONNECTED, nothing more needed
                console.log('Client connected:', clientId);
            } else if (frame.command === 'SUBSCRIBE') {
                const destination = frame.headers.destination;
                console.log(`Client ${clientId} subscribed to: ${destination}`);
                
                // Extract channel ID from destination (format: /topic/chat/{channelId})
                let channelId = null;
                if (destination && destination.startsWith('/topic/chat/')) {
                    channelId = destination.replace('/topic/chat/', '');
                } else if (destination === '/topic/online-users') {
                    channelId = 'online-users';
                }
                
                if (channelId) {
                    if (!subscriptions.has(channelId)) {
                        subscriptions.set(channelId, new Set());
                    }
                    subscriptions.get(channelId).add(ws);
                    clients.get(ws).subscriptions.add(channelId);
                }
                
                // Send receipt if requested
                if (frame.headers.receipt) {
                    const receiptFrame = createStompFrame('RECEIPT', {
                        'receipt-id': frame.headers.receipt
                    });
                    ws.send(receiptFrame);
                }
            } else if (frame.command === 'UNSUBSCRIBE') {
                const destination = frame.headers.destination;
                console.log(`Client ${clientId} unsubscribed from: ${destination}`);
                
                let channelId = null;
                if (destination && destination.startsWith('/topic/chat/')) {
                    channelId = destination.replace('/topic/chat/', '');
                } else if (destination === '/topic/online-users') {
                    channelId = 'online-users';
                }
                
                if (channelId && subscriptions.has(channelId)) {
                    subscriptions.get(channelId).delete(ws);
                    if (subscriptions.get(channelId).size === 0) {
                        subscriptions.delete(channelId);
                    }
                }
                clients.get(ws).subscriptions.delete(channelId);
            } else if (frame.command === 'SEND') {
                const destination = frame.headers.destination;
                
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
                    data = JSON.parse(frame.body);
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
                
                const topic = `/topic/chat/${channelId}`;
                if (subscriptions.has(channelId)) {
                    subscriptions.get(channelId).forEach((client) => {
                        if (client.readyState === WebSocket.OPEN) {
                            const messageFrame = createStompFrame('MESSAGE', {
                                'destination': topic,
                                'content-type': 'application/json',
                                'message-id': Date.now().toString()
                            }, messageToSend);
                            client.send(messageFrame);
                        }
                    });
                }
            } else if (frame.command === 'DISCONNECT') {
                console.log(`Client ${clientId} disconnecting`);
                ws.close();
            }
        } catch (error) {
            console.error('Error processing WebSocket message:', error);
        }
    });

    ws.on('close', () => {
        console.log('WebSocket connection closed:', clientId);
        const clientInfo = clients.get(ws);
        if (clientInfo) {
            // Remove from all subscriptions
            clientInfo.subscriptions.forEach(channelId => {
                if (subscriptions.has(channelId)) {
                    subscriptions.get(channelId).delete(ws);
                    if (subscriptions.get(channelId).size === 0) {
                        subscriptions.delete(channelId);
                    }
                }
            });
            clients.delete(ws);
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
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
