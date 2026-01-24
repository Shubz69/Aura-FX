/**
 * Message Locate API - Find message position for deep-linking
 * 
 * GET /api/messages/locate?channelId=&messageId=
 * 
 * Returns the anchor cursor (created_at timestamp) for the page containing
 * the target message, enabling efficient jump-to-message functionality.
 */

const { executeQuery } = require('../db');

// Generate unique request ID
function generateRequestId() {
  return `locate_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
}

// Decode JWT token
function decodeToken(token) {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padding = payload.length % 4;
    const paddedPayload = padding ? payload + '='.repeat(4 - padding) : payload;
    return JSON.parse(Buffer.from(paddedPayload, 'base64').toString('utf-8'));
  } catch (e) {
    return null;
  }
}

// Get rows helper
function getRows(result) {
  if (!result) return [];
  if (Array.isArray(result)) {
    if (result.length > 0 && Array.isArray(result[0])) return result[0];
    return result;
  }
  return [];
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const requestId = generateRequestId();
  
  // Auth check
  const token = req.headers.authorization?.replace('Bearer ', '');
  const decoded = decodeToken(token);
  
  if (!decoded || !decoded.id) {
    return res.status(401).json({ 
      success: false, 
      errorCode: 'UNAUTHORIZED',
      message: 'Authentication required',
      requestId 
    });
  }

  // Parse query params
  const url = req.url || '';
  const queryString = url.split('?')[1] || '';
  const query = {};
  queryString.split('&').forEach(pair => {
    const [key, value] = pair.split('=');
    if (key) query[key] = decodeURIComponent(value || '');
  });

  const channelId = parseInt(query.channelId);
  const messageId = parseInt(query.messageId);

  if (!channelId || isNaN(channelId)) {
    return res.status(400).json({
      success: false,
      errorCode: 'MISSING_CHANNEL_ID',
      message: 'channelId is required',
      requestId
    });
  }

  if (!messageId || isNaN(messageId)) {
    return res.status(400).json({
      success: false,
      errorCode: 'MISSING_MESSAGE_ID',
      message: 'messageId is required',
      requestId
    });
  }

  try {
    // Find the target message
    const messageResult = await executeQuery(
      'SELECT id, channel_id, created_at FROM messages WHERE id = ? AND channel_id = ?',
      [messageId, channelId]
    );
    
    const message = getRows(messageResult)[0];
    
    if (!message) {
      return res.status(404).json({
        success: false,
        errorCode: 'MESSAGE_NOT_FOUND',
        message: 'Message not found or deleted',
        requestId
      });
    }

    // The anchor cursor is the message's created_at timestamp
    // Client can use this to fetch messages around this point
    const anchorCursor = message.created_at;
    
    // Count how many messages are after this one (to calculate offset)
    const countResult = await executeQuery(
      'SELECT COUNT(*) as count FROM messages WHERE channel_id = ? AND created_at > ?',
      [channelId, anchorCursor]
    );
    const messagesAfter = getRows(countResult)[0]?.count || 0;

    // Calculate page info (assuming 50 messages per page)
    const pageSize = 50;
    const offsetFromEnd = messagesAfter;
    
    return res.status(200).json({
      success: true,
      messageId,
      channelId,
      anchorCursor: anchorCursor instanceof Date ? anchorCursor.toISOString() : anchorCursor,
      offsetFromEnd,
      pageSize,
      // Client should fetch with: ?before=<anchorCursor + small buffer>&limit=50
      // Or use the anchorCursor directly to position the scroll
      fetchStrategy: 'CURSOR_AROUND',
      requestId
    });

  } catch (error) {
    console.error(`[${requestId}] Message locate error:`, error);
    return res.status(500).json({
      success: false,
      errorCode: 'SERVER_ERROR',
      message: 'Internal server error',
      requestId
    });
  }
};
