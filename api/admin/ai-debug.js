// Admin Debug View for AI System
// Inspect tool calls, data fetches, errors, and system health

const { getDbConnection } = require('../db');

module.exports = async (req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Check admin access
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    // Decode token
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    const payloadBase64 = tokenParts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padding = payloadBase64.length % 4;
    const paddedPayload = padding ? payloadBase64 + '='.repeat(4 - padding) : payloadBase64;
    const payloadJson = Buffer.from(paddedPayload, 'base64').toString('utf-8');
    const decoded = JSON.parse(payloadJson);
    const userId = decoded.id || decoded.userId;

    // Verify user is admin
    const db = await getDbConnection();
    if (!db) {
      return res.status(500).json({ success: false, message: 'Database connection error' });
    }

    try {
      const [userRows] = await db.execute(
        'SELECT id, email, role FROM users WHERE id = ?',
        [userId]
      );

      if (userRows.length === 0) {
        if (db && typeof db.release === 'function') {
          db.release();
        }
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const user = userRows[0];
      const userRole = (user.role || '').toLowerCase();
      const isAdmin = userRole === 'admin' || userRole === 'super_admin' || user.email?.toLowerCase() === 'shubzfx@gmail.com';

      if (!isAdmin) {
        if (db && typeof db.release === 'function') {
          db.release();
        }
        return res.status(403).json({ success: false, message: 'Admin access required' });
      }

      // Get query parameters
      const { type, limit = 50, userId: filterUserId, startDate, endDate } = req.query;

      let results = {};

      // Tool calls log
      if (!type || type === 'tool_calls') {
        let toolCallsQuery = 'SELECT * FROM tool_calls_log WHERE 1=1';
        const toolCallsParams = [];

        if (filterUserId) {
          toolCallsQuery += ' AND user_id = ?';
          toolCallsParams.push(filterUserId);
        }

        if (startDate) {
          toolCallsQuery += ' AND timestamp >= ?';
          toolCallsParams.push(startDate);
        }

        if (endDate) {
          toolCallsQuery += ' AND timestamp <= ?';
          toolCallsParams.push(endDate);
        }

        toolCallsQuery += ' ORDER BY timestamp DESC LIMIT ?';
        toolCallsParams.push(parseInt(limit));

        const [toolCalls] = await db.execute(toolCallsQuery, toolCallsParams);
        results.toolCalls = toolCalls.map(row => ({
          id: row.id,
          userId: row.user_id,
          toolName: row.tool_name,
          parameters: row.parameters ? JSON.parse(row.parameters) : null,
          resultSummary: row.result_summary ? JSON.parse(row.result_summary) : null,
          durationMs: row.duration_ms,
          success: row.success,
          errorMessage: row.error_message,
          timestamp: row.timestamp
        }));
      }

      // Data fetches log
      if (!type || type === 'data_fetches') {
        let dataFetchesQuery = 'SELECT * FROM data_fetches_log WHERE 1=1';
        const dataFetchesParams = [];

        if (filterUserId) {
          dataFetchesQuery += ' AND user_id = ?';
          dataFetchesParams.push(filterUserId);
        }

        if (startDate) {
          dataFetchesQuery += ' AND fetch_timestamp >= ?';
          dataFetchesParams.push(startDate);
        }

        if (endDate) {
          dataFetchesQuery += ' AND fetch_timestamp <= ?';
          dataFetchesParams.push(endDate);
        }

        dataFetchesQuery += ' ORDER BY fetch_timestamp DESC LIMIT ?';
        dataFetchesParams.push(parseInt(limit));

        const [dataFetches] = await db.execute(dataFetchesQuery, dataFetchesParams);
        results.dataFetches = dataFetches.map(row => ({
          id: row.id,
          userId: row.user_id,
          dataType: row.data_type,
          symbol: row.symbol,
          source: row.source,
          dataTimestamp: row.data_timestamp,
          fetchTimestamp: row.fetch_timestamp,
          success: row.success
        }));
      }

      // Errors log
      if (!type || type === 'errors') {
        let errorsQuery = 'SELECT * FROM errors_log WHERE 1=1';
        const errorsParams = [];

        if (filterUserId) {
          errorsQuery += ' AND user_id = ?';
          errorsParams.push(filterUserId);
        }

        if (startDate) {
          errorsQuery += ' AND timestamp >= ?';
          errorsParams.push(startDate);
        }

        if (endDate) {
          errorsQuery += ' AND timestamp <= ?';
          errorsParams.push(endDate);
        }

        errorsQuery += ' ORDER BY timestamp DESC LIMIT ?';
        errorsParams.push(parseInt(limit));

        const [errors] = await db.execute(errorsQuery, errorsParams);
        results.errors = errors.map(row => ({
          id: row.id,
          userId: row.user_id,
          errorType: row.error_type,
          errorMessage: row.error_message,
          context: row.context ? JSON.parse(row.context) : null,
          timestamp: row.timestamp
        }));
      }

      // User actions log
      if (!type || type === 'user_actions') {
        let actionsQuery = 'SELECT * FROM user_actions_log WHERE 1=1';
        const actionsParams = [];

        if (filterUserId) {
          actionsQuery += ' AND user_id = ?';
          actionsParams.push(filterUserId);
        }

        if (startDate) {
          actionsQuery += ' AND timestamp >= ?';
          actionsParams.push(startDate);
        }

        if (endDate) {
          actionsQuery += ' AND timestamp <= ?';
          actionsParams.push(endDate);
        }

        actionsQuery += ' ORDER BY timestamp DESC LIMIT ?';
        actionsParams.push(parseInt(limit));

        const [actions] = await db.execute(actionsQuery, actionsParams);
        results.userActions = actions.map(row => ({
          id: row.id,
          userId: row.user_id,
          action: row.action,
          details: row.details ? JSON.parse(row.details) : null,
          timestamp: row.timestamp
        }));
      }

      // System statistics
      if (!type || type === 'stats') {
        const [toolCallsStats] = await db.execute(`
          SELECT 
            tool_name,
            COUNT(*) as total_calls,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_calls,
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_calls,
            AVG(duration_ms) as avg_duration_ms
          FROM tool_calls_log
          WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
          GROUP BY tool_name
        `);

        const [errorStats] = await db.execute(`
          SELECT 
            error_type,
            COUNT(*) as count
          FROM errors_log
          WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
          GROUP BY error_type
          ORDER BY count DESC
          LIMIT 10
        `);

        const [dataFetchStats] = await db.execute(`
          SELECT 
            source,
            COUNT(*) as total_fetches,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_fetches
          FROM data_fetches_log
          WHERE fetch_timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
          GROUP BY source
        `);

        results.stats = {
          toolCalls: toolCallsStats,
          errors: errorStats,
          dataFetches: dataFetchStats,
          timeRange: 'Last 24 hours'
        };
      }

      if (db && typeof db.release === 'function') {
        db.release();
      }

      return res.status(200).json({
        success: true,
        type: type || 'all',
        results,
        filters: {
          userId: filterUserId,
          startDate,
          endDate,
          limit
        }
      });

    } catch (dbError) {
      console.error('Database error in AI debug view:', dbError);
      if (db && typeof db.release === 'function') {
        db.release();
      }
      return res.status(500).json({
        success: false,
        message: 'Database error',
        error: dbError.message
      });
    }

  } catch (error) {
    console.error('Error in AI debug view:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};
