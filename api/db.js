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

  pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    port: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT) : 3306,
    waitForConnections: true,
    connectionLimit: 100, // PRODUCTION: Increased for high traffic (500+ concurrent users)
    queueLimit: 500, // Limit queue to prevent memory issues under extreme load
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    // Removed acquireTimeout and timeout - these cause warnings in mysql2
    // Connection timeouts are handled by the pool's waitForConnections and queueLimit
    ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: false } : false,
    // PRODUCTION OPTIMIZATIONS:
    multipleStatements: false, // Security: prevent SQL injection
    dateStrings: false, // Use Date objects for better performance
    supportBigNumbers: true, // Support large numbers
    bigNumberStrings: false, // Use numbers, not strings
    typeCast: true // Enable type casting for performance
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
  const pool = getDbPool();
  if (!pool) return null;
  
  try {
    const connection = await pool.getConnection();
    return connection;
  } catch (error) {
    console.error('Error getting database connection:', error);
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
  const pool = getDbPool();
  if (!pool) return [[], []];

  const startTime = Date.now();
  const timeout = options.timeout || 30000; // 30 second default
  const requestId = options.requestId || 'unknown';

  // Validate parameters - replace undefined with null
  const safeParams = params.map(p => p === undefined ? null : p);

  try {
    // Execute with timeout protection
    const queryPromise = pool.execute(query, safeParams);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Query timeout')), timeout);
    });

    const [rows, fields] = await Promise.race([queryPromise, timeoutPromise]);
    
    // Track metrics
    const queryTime = Date.now() - startTime;
    poolStats.totalQueries++;
    poolStats.queryTimes.push(queryTime);
    if (poolStats.queryTimes.length > MAX_QUERY_TIMES) {
      poolStats.queryTimes.shift();
    }
    poolStats.avgQueryTime = poolStats.queryTimes.reduce((a, b) => a + b, 0) / poolStats.queryTimes.length;
    
    return [rows, fields];
  } catch (error) {
    poolStats.failedQueries++;
    
    // Enhanced error logging
    const errorInfo = {
      requestId,
      query: query.substring(0, 100),
      paramCount: safeParams.length,
      error: error.message,
      code: error.code,
      errno: error.errno
    };
    console.error('Database query error:', JSON.stringify(errorInfo));
    
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
  if (exists) {
    console.log(`Column ${tableName}.${columnName} already exists`);
    return false;
  }
  
  try {
    await executeQuery(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
    console.log(`Added column ${tableName}.${columnName}`);
    return true;
  } catch (error) {
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
