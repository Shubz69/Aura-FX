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
    path: '/ws'
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

// WebSocket connection handling
wss.on('connection', (ws, req) => {
    console.log('New WebSocket connection');
    
    let clientChannel = null;
    let userId = null;

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message.toString());
            
            if (data.type === 'subscribe') {
                // Subscribe to a channel
                clientChannel = data.channelId;
                userId = data.userId;
                
                if (!channelClients.has(clientChannel)) {
                    channelClients.set(clientChannel, new Set());
                }
                channelClients.get(clientChannel).add(ws);
                
                console.log(`Client subscribed to channel: ${clientChannel}`);
                
                // Send confirmation
                ws.send(JSON.stringify({
                    type: 'subscribed',
                    channelId: clientChannel
                }));
            } else if (data.type === 'message') {
                // Broadcast message to all clients in the channel
                const channelId = data.channelId;
                const messageData = {
                    type: 'new_message',
                    message: data.message
                };
                
                // Save to database if pool is available
                if (dbPool && data.message) {
                    try {
                        await dbPool.execute(
                            'INSERT INTO messages (channel_id, sender_id, content, timestamp) VALUES (?, ?, ?, NOW())',
                            [channelId, data.userId || null, data.message.content || '']
                        );
                    } catch (dbError) {
                        console.error('Error saving message to database:', dbError.message);
                    }
                }
                
                // Broadcast to all clients in the channel
                if (channelClients.has(channelId)) {
                    channelClients.get(channelId).forEach((client) => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify(messageData));
                        }
                    });
                }
            } else if (data.type === 'ping') {
                // Respond to ping
                ws.send(JSON.stringify({ type: 'pong' }));
            }
        } catch (error) {
            console.error('Error processing WebSocket message:', error);
        }
    });

    ws.on('close', () => {
        console.log('WebSocket connection closed');
        if (clientChannel && channelClients.has(clientChannel)) {
            channelClients.get(clientChannel).delete(ws);
            if (channelClients.get(clientChannel).size === 0) {
                channelClients.delete(clientChannel);
            }
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });

    // Send welcome message
    ws.send(JSON.stringify({
        type: 'connected',
        message: 'WebSocket connected successfully'
    }));
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

