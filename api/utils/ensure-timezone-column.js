/**
 * Ensures users table has timezone column (IANA string, e.g. Europe/London).
 * Idempotent; safe to call on every request.
 */
const { addColumnIfNotExists } = require('../db');

let ensured = false;

async function ensureTimezoneColumn() {
  if (ensured) return true;
  try {
    await addColumnIfNotExists('users', 'timezone', 'VARCHAR(64) DEFAULT NULL');
    ensured = true;
    return true;
  } catch (e) {
    console.warn('ensureTimezoneColumn:', e.message);
    ensured = true;
    return false;
  }
}

module.exports = { ensureTimezoneColumn };
