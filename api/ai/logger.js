// Comprehensive Logging System
// Tracks all tool calls, data timestamps, user actions, alerts, and errors

const { getDbConnection } = require('../db');

// Log tool call
async function logToolCall(userId, toolName, parameters, result, duration, success = true, error = null) {
  const db = await getDbConnection();
  if (!db) return;

  try {
    // Create tool_calls_log table if it doesn't exist
    await db.execute(`
      CREATE TABLE IF NOT EXISTS tool_calls_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        tool_name VARCHAR(100) NOT NULL,
        parameters TEXT,
        result_summary TEXT,
        duration_ms INT,
        success BOOLEAN DEFAULT TRUE,
        error_message TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_tool_name (tool_name),
        INDEX idx_timestamp (timestamp)
      )
    `);

    await db.execute(`
      INSERT INTO tool_calls_log 
      (user_id, tool_name, parameters, result_summary, duration_ms, success, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      userId,
      toolName,
      JSON.stringify(parameters),
      result ? JSON.stringify(result).substring(0, 500) : null,
      duration,
      success,
      error ? error.message : null
    ]);

    if (db && typeof db.release === 'function') {
      db.release();
    }
  } catch (error) {
    console.error('Error logging tool call:', error);
    if (db && typeof db.release === 'function') {
      db.release();
    }
  }
}

// Log data fetch with timestamp
async function logDataFetch(userId, dataType, symbol, source, timestamp, success = true) {
  const db = await getDbConnection();
  if (!db) return;

  try {
    // Create data_fetches_log table if it doesn't exist
    await db.execute(`
      CREATE TABLE IF NOT EXISTS data_fetches_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        data_type VARCHAR(50) NOT NULL,
        symbol VARCHAR(50),
        source VARCHAR(100),
        data_timestamp TIMESTAMP,
        fetch_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        success BOOLEAN DEFAULT TRUE,
        INDEX idx_user_id (user_id),
        INDEX idx_data_type (data_type),
        INDEX idx_symbol (symbol),
        INDEX idx_data_timestamp (data_timestamp)
      )
    `);

    await db.execute(`
      INSERT INTO data_fetches_log 
      (user_id, data_type, symbol, source, data_timestamp, success)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      userId,
      dataType,
      symbol,
      source,
      timestamp ? new Date(timestamp) : new Date(),
      success
    ]);

    if (db && typeof db.release === 'function') {
      db.release();
    }
  } catch (error) {
    console.error('Error logging data fetch:', error);
    if (db && typeof db.release === 'function') {
      db.release();
    }
  }
}

// Log user action
async function logUserAction(userId, action, details = {}) {
  const db = await getDbConnection();
  if (!db) return;

  try {
    // Create user_actions_log table if it doesn't exist
    await db.execute(`
      CREATE TABLE IF NOT EXISTS user_actions_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        action VARCHAR(100) NOT NULL,
        details TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_action (action),
        INDEX idx_timestamp (timestamp)
      )
    `);

    await db.execute(`
      INSERT INTO user_actions_log (user_id, action, details)
      VALUES (?, ?, ?)
    `, [
      userId,
      action,
      JSON.stringify(details)
    ]);

    if (db && typeof db.release === 'function') {
      db.release();
    }
  } catch (error) {
    console.error('Error logging user action:', error);
    if (db && typeof db.release === 'function') {
      db.release();
    }
  }
}

// Log error
async function logError(userId, errorType, errorMessage, context = {}) {
  const db = await getDbConnection();
  if (!db) return;

  try {
    // Create errors_log table if it doesn't exist
    await db.execute(`
      CREATE TABLE IF NOT EXISTS errors_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        error_type VARCHAR(100) NOT NULL,
        error_message TEXT,
        context TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_error_type (error_type),
        INDEX idx_timestamp (timestamp)
      )
    `);

    await db.execute(`
      INSERT INTO errors_log (user_id, error_type, error_message, context)
      VALUES (?, ?, ?, ?)
    `, [
      userId,
      errorType,
      errorMessage,
      JSON.stringify(context)
    ]);

    if (db && typeof db.release === 'function') {
      db.release();
    }
  } catch (error) {
    console.error('Error logging error:', error);
    if (db && typeof db.release === 'function') {
      db.release();
    }
  }
}

// Check if data is stale
function isDataStale(dataTimestamp, maxAgeMinutes = 5) {
  if (!dataTimestamp) return true;
  
  const dataTime = new Date(dataTimestamp);
  const now = new Date();
  const ageMinutes = (now - dataTime) / (1000 * 60);
  
  return ageMinutes > maxAgeMinutes;
}

module.exports = {
  logToolCall,
  logDataFetch,
  logUserAction,
  logError,
  isDataStale
};
