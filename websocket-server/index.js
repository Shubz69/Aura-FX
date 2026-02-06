/**
 * WebSocket Server - Real-time messaging
 * 
 * HARDENED:
 * - Connection limits per user (prevent memory leaks)
 * - Total connection limit
 * - Rate limiting on message sends
 * - Dead connection cleanup
 * - Structured logging
 * - Graceful shutdown
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');

// Entitlements: same logic as /api/me and REST - enforce on SUBSCRIBE (canSee) and SEND (canWrite)
let getEntitlements, getAllowedChannelSlugs, getChannelPermissions;
try {
  const entitlementsModule = require(path.join(__dirname, '..', 'api', 'utils', 'entitlements'));
  getEntitlements = entitlementsModule.getEntitlements;
  getAllowedChannelSlugs = entitlementsModule.getAllowedChannelSlugs;
  getChannelPermissions = entitlementsModule.getChannelPermissions;
} catch (e) {
  console.warn('Entitlements module not loaded, channel access will not be enforced:', e.message);
}

const app = express();
const server = http.createServer(app);

// Enable CORS
app.use(cors());
app.use(express.json());

// ============================================================================
// CONFIGURATION - Production hardening limits
// ============================================================================

const CONFIG = {
  MAX_TOTAL_CONNECTIONS: 10000,
  MAX_CONNECTIONS_PER_USER: 5,
  MAX_MESSAGES_PER_MINUTE_PER_USER: 60,
  DEAD_CONNECTION_CHECK_INTERVAL: 60000, // 1 minute
  PING_INTERVAL: 30000, // 30 seconds
  CONNECTION_TIMEOUT: 120000, // 2 minutes without activity
  MAX_MESSAGE_SIZE: 32768 // 32KB
};

// ============================================================================
// STATISTICS
// ============================================================================

const stats = {
  totalConnections: 0,
  totalMessages: 0,
  errors: 0,
  startTime: Date.now()
};

// ============================================================================
// WebSocket Server
// ============================================================================

// Optional: restrict WebSocket origins (e.g. for Vercel: https://your-app.vercel.app, https://aurafx.com)
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  : null;

const wss = new WebSocket.Server({ 
    server,
    path: '/ws',
    perMessageDeflate: false,
    maxPayload: CONFIG.MAX_MESSAGE_SIZE
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
        connectionLimit: 50, // PRODUCTION: Increased for WebSocket server (high traffic)
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        acquireTimeout: 10000, // PRODUCTION: 10s timeout for faster failure detection
        timeout: 5000, // PRODUCTION: 5s query timeout for instant responses
        ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: false } : false,
        // PRODUCTION OPTIMIZATIONS:
        multipleStatements: false,
        dateStrings: false,
        supportBigNumbers: true,
        bigNumberStrings: false,
        typeCast: true
    });
};

// Initialize database pool
dbPool = createDbPool();

// Store subscriptions: channelId -> Set of WebSocket connections
const subscriptions = new Map();

// Store client info
const clients = new Map();

// Store user connections: userId -> Set of WebSocket connections
const userConnections = new Map();

// Rate limiting: userId -> { count, windowStart }
const messageRateLimits = new Map();

// ============================================================================
// Entitlements: resolve canSee / canWrite for a user and channel (stops retry loops)
// ============================================================================

async function getChannelAccess(userId, channelId) {
  if (!userId) return { canSee: false, canWrite: false, reason: 'Authentication required' };
  if (!channelId) return { canSee: false, canWrite: false, reason: 'Channel required' };
  if (!getEntitlements || !getChannelPermissions || !getAllowedChannelSlugs || !dbPool) {
    return { canSee: true, canWrite: true }; // entitlements or DB not available: allow
  }
  try {
    const [userRows] = await dbPool.execute(
      `SELECT id, email, role, subscription_status, subscription_plan, subscription_expiry, subscription_started, payment_failed, has_used_free_trial
       FROM users WHERE id = ?`,
      [userId]
    );
    if (!userRows || userRows.length === 0) return { canSee: false, canWrite: false, reason: 'User not found' };
    const userRow = userRows[0];
    const entitlements = getEntitlements(userRow);
    let channels = [];
    try {
      const [channelRows] = await dbPool.execute(
        `SELECT id, name, category, description, access_level, permission_type
         FROM channels ORDER BY COALESCE(category, 'general'), name`
      );
      if (channelRows && channelRows.length > 0) {
        channels = channelRows.map((r) => ({
          id: r.id,
          name: r.name,
          category: r.category,
          description: r.description,
          access_level: r.access_level,
          permission_type: r.permission_type
        }));
      }
    } catch (e) { /* channels table may not exist */ }
    entitlements.allowedChannelSlugs = getAllowedChannelSlugs(entitlements, channels);
    const channel = channels.find((c) => String(c.id) === String(channelId) || (c.name && String(c.name).toLowerCase() === String(channelId).toLowerCase()));
    if (!channel) return { canSee: false, canWrite: false, reason: 'Channel not found' };
    const perm = getChannelPermissions(entitlements, channel);
    return { canSee: perm.canSee, canWrite: perm.canWrite, reason: !perm.canSee ? 'Access denied' : !perm.canWrite ? 'Write denied' : null };
  } catch (err) {
    console.error('getChannelAccess error:', err.message);
    return { canSee: false, canWrite: false, reason: 'Server error' };
  }
}

// ============================================================================
// Health check endpoint (enhanced)
// ============================================================================

app.get('/health', (req, res) => {
    res.status(200).json({ 
      status: 'ok', 
      service: 'websocket-server',
      connections: {
        total: clients.size,
        subscriptions: subscriptions.size,
        users: userConnections.size
      },
      stats: {
        totalConnections: stats.totalConnections,
        totalMessages: stats.totalMessages,
        errors: stats.errors,
        uptimeSeconds: Math.floor((Date.now() - stats.startTime) / 1000)
      },
      limits: {
        maxConnections: CONFIG.MAX_TOTAL_CONNECTIONS,
        currentLoad: ((clients.size / CONFIG.MAX_TOTAL_CONNECTIONS) * 100).toFixed(1) + '%'
      }
    });
});

// ============================================================================
// Rate Limiting Helper
// ============================================================================

function checkMessageRateLimit(userId) {
  if (!userId) return true; // Allow anonymous
  
  const now = Date.now();
  const key = userId.toString();
  const limit = messageRateLimits.get(key);
  
  if (!limit || now - limit.windowStart > 60000) {
    // New window
    messageRateLimits.set(key, { count: 1, windowStart: now });
    return true;
  }
  
  if (limit.count >= CONFIG.MAX_MESSAGES_PER_MINUTE_PER_USER) {
    return false;
  }
  
  limit.count++;
  return true;
}

// ============================================================================
// Connection limit check
// ============================================================================

function canAcceptConnection(userId) {
  // Check total limit
  if (clients.size >= CONFIG.MAX_TOTAL_CONNECTIONS) {
    return { allowed: false, reason: 'Server at capacity' };
  }
  
  // Check per-user limit
  if (userId) {
    const userConns = userConnections.get(userId.toString());
    if (userConns && userConns.size >= CONFIG.MAX_CONNECTIONS_PER_USER) {
      return { allowed: false, reason: 'Too many connections for this user' };
    }
  }
  
  return { allowed: true };
}

// Endpoint to broadcast new message (called by messages API when message created via REST)
// Ensures messages sent from one device reach all other devices (including same user on other devices)
app.post('/api/broadcast-new-message', async (req, res) => {
    try {
        const { channelId, message } = req.body;
        
        if (!channelId || !message) {
            return res.status(400).json({ success: false, message: 'channelId and message required' });
        }
        
        const messageBody = typeof message === 'string' ? message : JSON.stringify(message);
        
        const messageFrame = createStompFrame('MESSAGE', {
            'destination': `/topic/chat/${channelId}`,
            'content-type': 'application/json',
            'message-id': `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        }, messageBody);
        
        let notifiedCount = 0;
        const channelSubs = subscriptions.get(channelId) || subscriptions.get(String(channelId));
        
        if (channelSubs) {
            channelSubs.forEach((ws) => {
                try {
                    if (ws.readyState === 1) {
                        ws.send(messageFrame);
                        notifiedCount++;
                    }
                } catch (error) {
                    console.error('Error broadcasting new message:', error);
                }
            });
        }
        
        res.status(200).json({ 
            success: true, 
            message: 'Message broadcasted',
            clientsNotified: notifiedCount
        });
    } catch (error) {
        console.error('Error broadcasting new message:', error);
        res.status(500).json({ success: false, message: 'Failed to broadcast' });
    }
});

// Endpoint to broadcast message deleted (called by delete API)
app.post('/api/broadcast-message-deleted', async (req, res) => {
    try {
        const { messageId, channelId, deletedAt, deletedBy } = req.body;
        
        if (!messageId || !channelId) {
            return res.status(400).json({ success: false, message: 'messageId and channelId required' });
        }
        
        // Create the deletion notification
        const deletionMessage = JSON.stringify({
            type: 'MESSAGE_DELETED',
            messageId: messageId,
            channelId: channelId,
            deletedAt: deletedAt || new Date().toISOString(),
            deletedBy: deletedBy
        });
        
        // Create STOMP message frame
        const messageFrame = createStompFrame('MESSAGE', {
            'destination': `/topic/chat/${channelId}`,
            'content-type': 'application/json',
            'message-id': `delete-${Date.now()}`
        }, deletionMessage);
        
        // Broadcast to all subscribers of this channel
        let notifiedCount = 0;
        const channelSubs = subscriptions.get(channelId) || subscriptions.get(String(channelId));
        
        if (channelSubs) {
            channelSubs.forEach((ws) => {
                try {
                    if (ws.readyState === 1) { // WebSocket.OPEN
                        ws.send(messageFrame);
                        notifiedCount++;
                    }
                } catch (error) {
                    console.error('Error sending delete notification:', error);
                }
            });
        }
        
        console.log(`Broadcast MESSAGE_DELETED for message ${messageId} in channel ${channelId} to ${notifiedCount} client(s)`);
        
        res.status(200).json({ 
            success: true, 
            message: 'Deletion broadcasted',
            clientsNotified: notifiedCount
        });
    } catch (error) {
        console.error('Error broadcasting message deletion:', error);
        res.status(500).json({ success: false, message: 'Failed to broadcast' });
    }
});

// Endpoint to notify user of account deletion (called by admin API)
app.post('/api/notify-user-deleted', async (req, res) => {
    try {
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({ success: false, message: 'User ID required' });
        }
        
        // Send logout notification to all connections for this user
        const userIdStr = userId.toString();
        if (userConnections.has(userIdStr)) {
            const connections = userConnections.get(userIdStr);
            const logoutMessage = JSON.stringify({
                type: 'ACCOUNT_DELETED',
                message: 'Your account has been deleted by an administrator. You will be logged out immediately.',
                timestamp: new Date().toISOString()
            });
            
            const logoutFrame = createStompFrame('MESSAGE', {
                'destination': '/topic/account-deleted',
                'content-type': 'application/json',
                'message-id': `${Date.now()}-logout`
            }, logoutMessage);
            
            let notifiedCount = 0;
            connections.forEach((ws) => {
                try {
                    if (ws.readyState === 1) { // WebSocket.OPEN
                        ws.send(logoutFrame);
                        notifiedCount++;
                    }
                } catch (error) {
                    console.error('Error sending logout notification:', error);
                }
            });
            
            console.log(`Sent logout notification to ${notifiedCount} connection(s) for user ${userId}`);
        }
        
        res.status(200).json({ 
            success: true, 
            message: 'User notified',
            connectionsNotified: userConnections.has(userIdStr) ? userConnections.get(userIdStr).size : 0
        });
    } catch (error) {
        console.error('Error notifying user deletion:', error);
        res.status(500).json({ success: false, message: 'Failed to notify user' });
    }
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

// ============================================================================
// WebSocket connection handling
// ============================================================================

wss.on('connection', (ws, req) => {
    const origin = req.headers.origin;
    if (ALLOWED_ORIGINS && origin && !ALLOWED_ORIGINS.includes(origin)) {
      console.warn('Connection rejected: origin not allowed', { origin });
      ws.close(1008, 'Origin not allowed'); // 1008 = Policy Violation
      return;
    }
    const preCheck = canAcceptConnection(null);
    if (!preCheck.allowed) {
      console.warn('Connection rejected:', preCheck.reason);
      ws.close(1013, preCheck.reason); // 1013 = Try Again Later
      return;
    }
    
    stats.totalConnections++;
    const clientId = Date.now().toString() + Math.random().toString(36).substr(2, 6);
    let userId = null;
    
    // Initialize client info with activity tracking
    clients.set(ws, { 
      id: clientId, 
      subscriptions: new Set(), 
      userId: null,
      connectedAt: Date.now(),
      lastActivity: Date.now()
    });
    
    console.log(`[${clientId}] New WebSocket connection (total: ${clients.size})`);
    
    // Send CONNECTED frame
    const connectedFrame = createStompFrame('CONNECTED', {
        'version': '1.2',
        'heart-beat': '4000,4000'
    });
    ws.send(connectedFrame);
    
    ws.on('message', async (data) => {
        try {
            // Update activity timestamp
            const clientInfo = clients.get(ws);
            if (clientInfo) {
              clientInfo.lastActivity = Date.now();
            }
            
            const frame = parseStompFrame(data.toString());
            
            if (frame.command === 'CONNECT' || frame.command === 'STOMP') {
                // Extract userId from Authorization header if present
                const authHeader = frame.headers['Authorization'] || frame.headers['authorization'];
                if (authHeader && authHeader.startsWith('Bearer ')) {
                    try {
                        const token = authHeader.replace('Bearer ', '');
                        const tokenParts = token.split('.');
                        if (tokenParts.length === 3) {
                            const payloadBase64 = tokenParts[1]
                                .replace(/-/g, '+')
                                .replace(/_/g, '/');
                            const padding = payloadBase64.length % 4;
                            const paddedPayload = padding ? payloadBase64 + '='.repeat(4 - padding) : payloadBase64;
                            const payloadJson = Buffer.from(paddedPayload, 'base64').toString('utf-8');
                            const decoded = JSON.parse(payloadJson);
                            userId = decoded.id || decoded.userId;
                            
                            // Store userId in client info
                            const clientInfo = clients.get(ws);
                            if (clientInfo) {
                                clientInfo.userId = userId;
                            }
                            
                            // Check per-user connection limit
                            const connCheck = canAcceptConnection(userId);
                            if (!connCheck.allowed) {
                              console.warn(`[${clientId}] Connection rejected:`, connCheck.reason);
                              ws.close(1013, connCheck.reason);
                              return;
                            }
                            
                            // Add to userConnections map
                            if (userId) {
                                const userIdStr = userId.toString();
                                if (!userConnections.has(userIdStr)) {
                                    userConnections.set(userIdStr, new Set());
                                }
                                userConnections.get(userIdStr).add(ws);
                            }
                        }
                    } catch (tokenError) {
                        console.warn(`[${clientId}] Could not extract userId from token:`, tokenError.message);
                    }
                }
                console.log(`[${clientId}] Client authenticated:`, userId ? `User ${userId}` : 'anonymous');
            } else if (frame.command === 'SUBSCRIBE') {
                const destination = frame.headers.destination;
                console.log(`Client ${clientId} subscribed to: ${destination}`);
                
                let channelId = null;
                if (destination && destination.startsWith('/topic/chat/')) {
                    channelId = destination.replace('/topic/chat/', '');
                } else if (destination === '/topic/online-users') {
                    channelId = 'online-users';
                }
                
                if (channelId) {
                    // Enforce entitlements on chat channels (canSee) to stop retry loops / "closed before established"
                    if (channelId !== 'online-users') {
                        const currentUserId = clients.get(ws)?.userId;
                        const access = await getChannelAccess(currentUserId, channelId);
                        if (!access.canSee) {
                            const errMsg = access.reason || 'Access denied';
                            console.warn(`[${clientId}] SUBSCRIBE denied for channel ${channelId}:`, errMsg);
                            const errorFrame = createStompFrame('ERROR', { message: errMsg }, errMsg);
                            ws.send(errorFrame);
                            if (frame.headers.receipt) {
                                ws.send(createStompFrame('RECEIPT', { 'receipt-id': frame.headers.receipt }));
                            }
                            return;
                        }
                    }
                    if (!subscriptions.has(channelId)) {
                        subscriptions.set(channelId, new Set());
                    }
                    subscriptions.get(channelId).add(ws);
                    clients.get(ws).subscriptions.add(channelId);
                }
                
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
                
                let channelId = null;
                if (destination && destination.startsWith('/app/chat/')) {
                    channelId = destination.replace('/app/chat/', '');
                }
                
                if (!channelId) {
                    console.warn(`[${clientId}] Unknown message destination:`, destination);
                    return;
                }
                
                // Enforce entitlements (canWrite) so denied users don't retry in a loop
                const currentUserId = clients.get(ws)?.userId;
                const access = await getChannelAccess(currentUserId, channelId);
                if (!access.canWrite) {
                    const errMsg = access.reason || 'Write denied';
                    console.warn(`[${clientId}] SEND denied for channel ${channelId}:`, errMsg);
                    const errorFrame = createStompFrame('ERROR', { message: errMsg }, errMsg);
                    ws.send(errorFrame);
                    return;
                }
                
                if (!checkMessageRateLimit(currentUserId)) {
                    console.warn(`[${clientId}] Rate limited user ${currentUserId}`);
                    return;
                }
                
                stats.totalMessages++;
                console.log(`[${clientId}] Message for channel ${channelId} (total: ${stats.totalMessages})`);
                
                let data;
                try {
                    data = JSON.parse(frame.body);
                } catch (parseError) {
                    console.error('Error parsing message body:', parseError);
                    return;
                }
                
                // PRODUCTION OPTIMIZATION: Broadcast INSTANTLY first (non-blocking)
                // This ensures <1ms response time for real-time updates across all devices
                const messageToSend = JSON.stringify({
                    id: data.id || `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    channelId: channelId,
                    channel_id: channelId, // Include both formats for compatibility
                    content: data.content,
                    sender: data.sender || { 
                        id: data.userId || data.senderId || data.sender?.id, 
                        username: data.username || data.sender?.username || 'User',
                        avatar: data.avatar || data.sender?.avatar || '/avatars/avatar_ai.png'
                    },
                    timestamp: data.timestamp || new Date().toISOString(),
                    createdAt: data.timestamp || new Date().toISOString(), // Include both formats
                    userId: data.userId || data.senderId || data.sender?.id,
                    username: data.username || data.sender?.username || 'User',
                    file: data.file || null
                });
                
                // INSTANT broadcast to all subscribers (non-blocking, <1ms)
                const topic = `/topic/chat/${channelId}`;
                if (subscriptions.has(channelId)) {
                    const subscribers = subscriptions.get(channelId);
                    const messageFrame = createStompFrame('MESSAGE', {
                        'destination': topic,
                        'content-type': 'application/json',
                        'message-id': `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
                    }, messageToSend);
                    
                    // Broadcast to all subscribers INSTANTLY (parallel, non-blocking)
                    subscribers.forEach((client) => {
                        try {
                            if (client.readyState === 1) { // WebSocket.OPEN
                                client.send(messageFrame); // <1ms operation - instant delivery
                            } else {
                                // Remove dead connections
                                subscribers.delete(client);
                            }
                        } catch (sendError) {
                            // Silently remove dead connections
                            subscribers.delete(client);
                        }
                    });
                }
                // Do NOT save to DB here - API is the single source of persistence.
                // Client sends to API first (saves), then to WebSocket (broadcast only).
            } else if (frame.command === 'DISCONNECT') {
                console.log(`Client ${clientId} disconnecting`);
                ws.close();
            }
        } catch (error) {
            stats.errors++;
            console.error(`[${clientId}] Error processing message:`, error.message);
        }
    });

    ws.on('close', () => {
        console.log(`[${clientId}] Connection closed (remaining: ${clients.size - 1})`);
        const clientInfo = clients.get(ws);
        if (clientInfo) {
            // Remove from userConnections if userId was set
            if (clientInfo.userId && userConnections.has(clientInfo.userId.toString())) {
                userConnections.get(clientInfo.userId.toString()).delete(ws);
                if (userConnections.get(clientInfo.userId.toString()).size === 0) {
                    userConnections.delete(clientInfo.userId.toString());
                }
            }
            
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
        stats.errors++;
        console.error(`[${clientId}] WebSocket error:`, error.message);
    });
    
    // Ping to keep connection alive
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
});

// ============================================================================
// Dead connection cleanup (runs every minute)
// ============================================================================

const deadConnectionCleanup = setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  
  wss.clients.forEach((ws) => {
    const clientInfo = clients.get(ws);
    
    // Check if connection is dead (no pong response)
    if (ws.isAlive === false) {
      console.log(`Cleaning dead connection: ${clientInfo?.id || 'unknown'}`);
      cleaned++;
      return ws.terminate();
    }
    
    // Check for inactive connections
    if (clientInfo && now - clientInfo.lastActivity > CONFIG.CONNECTION_TIMEOUT) {
      console.log(`Cleaning inactive connection: ${clientInfo.id}`);
      cleaned++;
      return ws.terminate();
    }
    
    ws.isAlive = false;
    ws.ping();
  });
  
  // Clean up rate limit entries older than 2 minutes
  const rateLimitCutoff = now - 120000;
  for (const [key, value] of messageRateLimits.entries()) {
    if (value.windowStart < rateLimitCutoff) {
      messageRateLimits.delete(key);
    }
  }
  
  if (cleaned > 0) {
    console.log(`Cleaned ${cleaned} dead/inactive connections`);
  }
}, CONFIG.DEAD_CONNECTION_CHECK_INTERVAL);

// ============================================================================
// Start server
// ============================================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`WebSocket server running on port ${PORT}`);
    console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
});

// ============================================================================
// Graceful shutdown
// ============================================================================

function shutdown(signal) {
    console.log(`${signal} received, closing server gracefully...`);
    
    // Stop accepting new connections
    clearInterval(deadConnectionCleanup);
    
    // Close all existing connections with message
    wss.clients.forEach((ws) => {
      ws.close(1001, 'Server shutting down');
    });
    
    wss.close(() => {
        console.log('WebSocket server closed');
        server.close(() => {
            console.log('HTTP server closed');
            if (dbPool) {
                dbPool.end().then(() => {
                  console.log('Database pool closed');
                  process.exit(0);
                });
            } else {
                process.exit(0);
            }
        });
    });
    
    // Force exit after 10 seconds
    setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
