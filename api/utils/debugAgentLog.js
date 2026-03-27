/**
 * Debug NDJSON: workspace log file + optional local ingest (Cursor debug mode).
 */
const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, '..', '..', 'debug-8f4319.log');
const INGEST = 'http://127.0.0.1:7826/ingest/3ba0a834-6e5c-4fe0-bd70-25d6a5ebbb2f';

function debugAgentLog(partial) {
  const o = { sessionId: '8f4319', timestamp: Date.now(), ...partial };
  const line = `${JSON.stringify(o)}\n`;
  try {
    fs.appendFileSync(LOG_PATH, line);
  } catch (_) {
    /* ignore */
  }
  if (typeof fetch === 'function') {
    fetch(INGEST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '8f4319' },
      body: JSON.stringify(o),
    }).catch(() => {});
  }
}

module.exports = { debugAgentLog };
