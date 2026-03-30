/**
 * Shared MySQL pool for all serverless routes.
 *
 * Scaling: On Vercel, connectionLimit is 1 per warm instance; total DB sessions ≈ concurrent warm
 * functions. For many simultaneous users, use a managed pooler (e.g. PlanetScale, AWS RDS Proxy,
 * DigitalOcean pooled mode, or ProxySQL) and set MYSQL_HOST / MYSQL_PORT to the pooler endpoint.
 * Tune MYSQL_QUEUE_LIMIT only for burst queuing on a single instance — it does not add server connections.
 */
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

/** Idempotent ALTER failures — do not log as errors (expected on warm instances). */
const BENIGN_DUPLICATE_SCHEMA_CODES = new Set(['ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME']);
/** MySQL errno for duplicate column / duplicate key name (mysql2 sometimes omits error.code). */
const BENIGN_DUPLICATE_SCHEMA_ERRNOS = new Set([1060, 1061]);

function isBenignSchemaDuplicate(error) {
  if (!error) return false;
  if (BENIGN_DUPLICATE_SCHEMA_CODES.has(error.code)) return true;
  const errno = Number(error.errno);
  if (BENIGN_DUPLICATE_SCHEMA_ERRNOS.has(errno)) return true;
  const msg = (error.message || '').toString();
  const sqlMsg = (error.sqlMessage || '').toString();
  if (/duplicate column name/i.test(msg) || /duplicate key name/i.test(msg)) return true;
  if (/duplicate column name/i.test(sqlMsg) || /duplicate key name/i.test(sqlMsg)) return true;
  return false;
}

/** INSERT race on unique run_key — handled by caller; avoid noisy error logs. */
function isBriefRunsDuplicateInsert(error, query) {
  if (!error) return false;
  if (error.code !== 'ER_DUP_ENTRY' && Number(error.errno) !== 1062) return false;
  const q = String(query || '').toLowerCase();
  return q.includes('trader_deck_brief_runs') && q.includes('insert');
}

/**
 * Metadata reads (INFORMATION_SCHEMA / SHOW) can be blocked for restricted DB users.
 * Treat these as non-fatal for runtime schema helper paths.
 */
function isMetadataAccessDenied(error) {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '');
  const sqlMsg = String(error.sqlMessage || '');
  const text = `${msg} ${sqlMsg}`.toLowerCase();
  if (code === 'ER_DBACCESS_DENIED_ERROR' || code === 'ER_ACCESS_DENIED_ERROR') {
    if (text.includes('information_schema') || text.includes('show ') || text.includes('column')) return true;
  }
  return text.includes('information_schema') && text.includes('access denied');
}

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

function isTooManyConnectionsError(error) {
  if (!error) return false;
  if (error.code === 'ER_CON_COUNT_ERROR') return true;
  const msg = (error.message || '').toString();
  return /too many connections/i.test(msg);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function resetPoolAfterConnectionStorm() {
  try {
    if (pool) await pool.end();
  } catch (_) {}
  pool = null;
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

  // Pool size: per serverless instance. Total DB connections ≈ concurrent warm Lambdas × connectionLimit.
  // ER_CON_COUNT_ERROR (1040) = MySQL max_connections exhausted — raising per-instance limit makes it worse.
  // On Vercel: always 1 physical connection per pool (ignore MYSQL_POOL_SIZE). Use a DB pooler if you need more throughput per lambda.
  const defaultLimit = process.env.VERCEL ? 1 : 100;
  // Queue: absorb bursts on a single instance without opening extra server connections.
  const defaultQueue = process.env.VERCEL ? 40 : 500;
  let connectionLimit = Math.max(1, parseInt(process.env.MYSQL_POOL_SIZE, 10) || defaultLimit);
  let queueLimit = Math.max(1, parseInt(process.env.MYSQL_QUEUE_LIMIT, 10) || defaultQueue);
  if (process.env.VERCEL) {
    connectionLimit = 1;
    queueLimit = Math.min(Math.max(queueLimit, 16), 80);
  }

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
const getDbConnection = async (_retry = false) => {
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
      connection = await p.getConnection();
      await connection.ping();
      return connection;
    }
  } catch (error) {
    if (error && (error.message || '').includes('Pool is closed')) {
      pool = null;
    }
    if (isTooManyConnectionsError(error)) {
      // Retrying 1040 worsens storms (more lambdas pile up waiting). Fail fast; scale DB or add a pooler.
      console.warn('Database connection limit reached (ER_CON_COUNT_ERROR); skipping retry');
      return null;
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
  const connectionAttempt = Number(options._connectionAttempt || 0);
  const maxConnectionAttempts = 4;

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
    const benignDuplicate = isBenignSchemaDuplicate(error);
    const suppressDup = isBriefRunsDuplicateInsert(error, query);
    if (!benignDuplicate && !isMetadataAccessDenied(error) && !suppressDup) {
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
    }

    if (isTooManyConnectionsError(error)) {
      throw error;
    }
    if (connectionAttempt < maxConnectionAttempts && isConnectionError(error)) {
      if ((error.message || '').includes('Pool is closed')) {
        pool = null;
      }
      await sleep(200 + connectionAttempt * 200 + Math.floor(Math.random() * 300));
      return executeQuery(query, params, { ...options, _connectionAttempt: connectionAttempt + 1 });
    }
    // Idempotent DDL: duplicate column/index name — treat as success so handlers don't 500
    if (benignDuplicate) {
      return [[], []];
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
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [tableName, columnName]
    );
    return rows.length > 0;
  } catch (error) {
    if (isMetadataAccessDenied(error)) return false;
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
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
      [tableName, indexName]
    );
    return rows.length > 0;
  } catch (error) {
    if (isMetadataAccessDenied(error)) return false;
    console.error('Error checking index existence:', error);
    return false;
  }
};

/**
 * Add column if it doesn't exist (idempotent)
 */
const addColumnIfNotExists = async (tableName, columnName, columnDef) => {
  if (await columnExists(tableName, columnName)) return false;
  await executeQuery(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
  return await columnExists(tableName, columnName);
};

/**
 * Add index if it doesn't exist (idempotent)
 */
const addIndexIfNotExists = async (tableName, indexName, columns) => {
  if (await indexExists(tableName, indexName)) return false;
  const columnList = Array.isArray(columns) ? columns.join(', ') : columns;
  await executeQuery(`CREATE INDEX ${indexName} ON ${tableName} (${columnList})`);
  return await indexExists(tableName, indexName);
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
  resetPoolAfterConnectionStorm,
  executeQuery,
  executeQueryWithTimeout,
  executeTransaction,
  columnExists,
  indexExists,
  addColumnIfNotExists,
  addIndexIfNotExists,
  getPoolHealth,
  closePool,
  isBenignSchemaDuplicate,
  isMetadataAccessDenied
};
