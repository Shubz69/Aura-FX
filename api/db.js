const mysql = require('mysql2/promise');
// Suppress url.parse() deprecation warnings from dependencies
require('./utils/suppress-warnings');

let pool = null;
let poolStats = {
  created: null,
  totalQueries: 0,
  failedQueries: 0,
  avgQueryTime: 0,
  queryTimes: []
};

// Query time tracking (keep last 100)
const MAX_QUERY_TIMES = 100;

// Connection error codes/messages that warrant pool reset (e.g. Vercel serverless + MySQL)
const CONNECTION_ERROR_CODES = new Set(['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST', 'ER_CON_COUNT_ERROR']);
const CONNECTION_ERROR_MESSAGES = ['Connection lost', 'closed state', 'Connection closed', 'Cannot add new command', 'read ECONNRESET', 'connect ETIMEDOUT', 'Pool is closed', 'Too many connections', 'Queue limit reached'];

function isConnectionError(error) {
  if (!error) return false;
  const code = (error.code || '').toString();
  const msg = (error.message || '').toString();
  if (CONNECTION_ERROR_CODES.has(code)) return true;
  return CONNECTION_ERROR_MESSAGES.some(m => msg.includes(m));
}

/**
 * Get or create database connection pool
 * This should be used by ALL API endpoints instead of creating new connections
 */
const getDbPool = () => {
  if (pool) return pool;

  if (!process.env.MYSQL_HOST || !process.env.MYSQL_USER ||
      !process.env.MYSQL_PASSWORD || !process.env.MYSQL_DATABASE) {
    console.warn('Database credentials not found');
    return null;
  }

  // Pool size: per serverless instance. Total DB connections ≈ instances × connectionLimit.
  // Set MYSQL_POOL_SIZE / MYSQL_QUEUE_LIMIT in Vercel if you need more (Railway max_connections=200 supports this).
  const defaultLimit = process.env.VERCEL ? 8 : 100;
  const defaultQueue = process.env.VERCEL ? 16 : 500;
  const connectionLimit = Math.max(1, parseInt(process.env.MYSQL_POOL_SIZE, 10) || defaultLimit);
  const queueLimit = Math.max(1, parseInt(process.env.MYSQL_QUEUE_LIMIT, 10) || defaultQueue);

  pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    port: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT) : 3306,
    waitForConnections: true,
    connectionLimit,
    queueLimit,
    connectTimeout: 10000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: false } : false,
    multipleStatements: false,
    dateStrings: false,
    supportBigNumbers: true,
    bigNumberStrings: false,
    typeCast: true
  });

  poolStats.created = new Date().toISOString();
  console.log('Database connection pool created');
  return pool;
};

/**
 * Get a connection from the pool
 * IMPORTANT: Always call connection.release() when done!
 * 
 * Usage:
 * const connection = await getDbConnection();
 * try {
 *   const [rows] = await connection.execute('SELECT ...');
 * } finally {
 *   connection.release();
 * }
 */
const getDbConnection = async () => {
  try {
    let p = getDbPool();
    if (!p) return null;
    let connection = await p.getConnection();
    try {
      await connection.ping();
      return connection;
    } catch (pingErr) {
      try { connection.release(); } catch (_) {}
      if (!isConnectionError(pingErr)) {
        console.error('Error getting database connection:', pingErr.message);
        return null;
      }
      // Retry once with same pool (do NOT close pool - would break other in-flight requests)
      connection = await p.getConnection();
      await connection.ping();
      return connection;
    }
  } catch (error) {
    if (error && (error.message || '').includes('Pool is closed')) {
      pool = null;
    }
    console.error('Error getting database connection:', error.message);
    return null;
  }
};

/**
 * Execute a query using the pool (auto-releases connection)
 * This is a convenience method that handles connection release automatically
 * 
 * Features:
 * - Auto-releases connections
 * - Validates parameters (no undefined)
 * - Tracks query metrics
 * - Timeout protection
 * 
 * Usage:
 * const [rows] = await executeQuery('SELECT * FROM users WHERE id = ?', [userId]);
 */
const executeQuery = async (query, params = [], options = {}) => {
  const timeout = options.timeout || 30000;
  const requestId = options.requestId || 'unknown';
  const isRetry = options._connectionRetry === true;

  const safeParams = params.map(p => p === undefined ? null : p);

  const run = async () => {
    const p = getDbPool();
    if (!p) return [[], []];
    const startTime = Date.now();
    const queryPromise = p.execute(query, safeParams);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Query timeout')), timeout);
    });
    const [rows, fields] = await Promise.race([queryPromise, timeoutPromise]);
    const queryTime = Date.now() - startTime;
    poolStats.totalQueries++;
    poolStats.queryTimes.push(queryTime);
    if (poolStats.queryTimes.length > MAX_QUERY_TIMES) poolStats.queryTimes.shift();
    poolStats.avgQueryTime = poolStats.queryTimes.reduce((a, b) => a + b, 0) / poolStats.queryTimes.length;
    return [rows, fields];
  };

  try {
    return await run();
  } catch (error) {
    poolStats.failedQueries++;
    const errorInfo = {
      requestId,
      query: query.substring(0, 100),
      paramCount: safeParams.length,
      error: error.message,
      code: error.code,
      errno: error.errno
    };
    console.error('Database query error:', JSON.stringify(errorInfo));

    if (!isRetry && isConnectionError(error)) {
      if ((error.message || '').includes('Pool is closed')) {
        pool = null;
      }
      return executeQuery(query, params, { ...options, _connectionRetry: true });
    }
    throw error;
  }
};

/**
 * Execute a query with explicit timeout
 */
const executeQueryWithTimeout = async (query, params = [], timeoutMs = 5000, requestId = 'unknown') => {
  return executeQuery(query, params, { timeout: timeoutMs, requestId });
};

/**
 * Execute multiple queries in a transaction
 * Automatically commits on success, rolls back on error
 */
const executeTransaction = async (queries, requestId = 'unknown') => {
  const pool = getDbPool();
  if (!pool) throw new Error('Database pool not available');

  const connection = await pool.getConnection();
  const results = [];

  try {
    await connection.beginTransaction();

    for (const { query, params = [] } of queries) {
      const safeParams = params.map(p => p === undefined ? null : p);
      const [rows] = await connection.execute(query, safeParams);
      results.push(rows);
    }

    await connection.commit();
    return results;
  } catch (error) {
    await connection.rollback();
    console.error(`[${requestId}] Transaction error:`, error.message);
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * Check if a column exists in a table (for idempotent migrations)
 */
const columnExists = async (tableName, columnName) => {
  try {
    const [rows] = await executeQuery(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [process.env.MYSQL_DATABASE, tableName, columnName]
    );
    return rows.length > 0;
  } catch (error) {
    console.error('Error checking column existence:', error);
    return false;
  }
};

/**
 * Check if an index exists on a table
 */
const indexExists = async (tableName, indexName) => {
  try {
    const [rows] = await executeQuery(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
      [process.env.MYSQL_DATABASE, tableName, indexName]
    );
    return rows.length > 0;
  } catch (error) {
    console.error('Error checking index existence:', error);
    return false;
  }
};

/**
 * Add column if it doesn't exist (idempotent)
 */
const addColumnIfNotExists = async (tableName, columnName, columnDef) => {
  const exists = await columnExists(tableName, columnName);
  if (exists) return false;

  try {
    await executeQuery(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
    console.log(`Added column ${tableName}.${columnName}`);
    return true;
  } catch (error) {
    const msg = (error.message || '').toString();
    if (/duplicate column|already exists/i.test(msg)) return false;
    console.error(`Error adding column ${tableName}.${columnName}:`, error.message);
    return false;
  }
};

/**
 * Add index if it doesn't exist (idempotent)
 */
const addIndexIfNotExists = async (tableName, indexName, columns) => {
  const exists = await indexExists(tableName, indexName);
  if (exists) {
    console.log(`Index ${indexName} already exists on ${tableName}`);
    return false;
  }
  
  try {
    const columnList = Array.isArray(columns) ? columns.join(', ') : columns;
    await executeQuery(`CREATE INDEX ${indexName} ON ${tableName} (${columnList})`);
    console.log(`Added index ${indexName} on ${tableName}`);
    return true;
  } catch (error) {
    console.error(`Error adding index ${indexName}:`, error.message);
    return false;
  }
};

/**
 * Get pool health status
 */
const getPoolHealth = () => {
  const p = getDbPool();
  if (!p) {
    return { status: 'unavailable', message: 'Pool not initialized' };
  }

  // mysql2 pool doesn't expose these directly in all versions
  // but we can track our own stats
  return {
    status: 'healthy',
    created: poolStats.created,
    totalQueries: poolStats.totalQueries,
    failedQueries: poolStats.failedQueries,
    avgQueryTimeMs: Math.round(poolStats.avgQueryTime),
    connectionLimit: 100
  };
};

/**
 * Close the connection pool (for cleanup/testing)
 */
const closePool = async () => {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('Database connection pool closed');
  }
};

module.exports = { 
  getDbPool, 
  getDbConnection, 
  executeQuery,
  executeQueryWithTimeout,
  executeTransaction,
  columnExists,
  indexExists,
  addColumnIfNotExists,
  addIndexIfNotExists,
  getPoolHealth,
  closePool 
};
