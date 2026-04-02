const crypto = require('crypto');

/**
 * @param {import('http').IncomingMessage} req
 * @returns {string}
 */
function getOrCreateRequestId(req) {
  const h = req.headers['x-request-id'] || req.headers['x-correlation-id'];
  const s = h != null ? String(h).trim() : '';
  if (s.length > 0 && s.length <= 128) return s;
  return crypto.randomUUID();
}

/**
 * @param {import('http').ServerResponse} res
 * @param {string} id
 */
function attachRequestId(res, id) {
  try {
    res.setHeader('X-Request-ID', id);
  } catch (_) {
    /* headers may be sent */
  }
}

module.exports = { getOrCreateRequestId, attachRequestId };
