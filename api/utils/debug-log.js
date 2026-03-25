const http = require('http');
const https = require('https');

function sendDebugLog(payload) {
  const endpoint = 'http://127.0.0.1:7826/ingest/3ba0a834-6e5c-4fe0-bd70-25d6a5ebbb2f';
  const body = JSON.stringify({
    sessionId: '8f4319',
    timestamp: Date.now(),
    ...payload
  });

  try {
    if (typeof fetch === 'function') {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '8f4319' },
        body
      }).catch(() => {});
      return;
    }
  } catch (_) {}

  try {
    const url = new URL(endpoint);
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + (url.search || ''),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': '8f4319',
          'Content-Length': Buffer.byteLength(body)
        }
      },
      () => {}
    );
    req.on('error', () => {});
    req.write(body);
    req.end();
  } catch (_) {}
}

module.exports = { sendDebugLog };

