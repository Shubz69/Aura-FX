const mysql = require('mysql2/promise');

let pool = null;

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
    queueLimit: 0, // Unlimited queue
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    acquireTimeout: 10000, // PRODUCTION: Reduced to 10s for faster failure detection
    timeout: 5000, // PRODUCTION: Reduced to 5s query timeout for instant responses
    ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: false } : false,
    // PRODUCTION OPTIMIZATIONS:
    multipleStatements: false, // Security: prevent SQL injection
    dateStrings: false, // Use Date objects for better performance
    supportBigNumbers: true, // Support large numbers
    bigNumberStrings: false, // Use numbers, not strings
    typeCast: true // Enable type casting for performance
  });

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
 * Usage:
 * const [rows] = await executeQuery('SELECT * FROM users WHERE id = ?', [userId]);
 */
const executeQuery = async (query, params = []) => {
  const pool = getDbPool();
  if (!pool) return [[], []];

  try {
    const [rows, fields] = await pool.execute(query, params);
    return [rows, fields];
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
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
  closePool 
};
