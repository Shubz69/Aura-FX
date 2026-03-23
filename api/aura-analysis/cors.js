function setAuraCorsHeaders(req, res, methods = 'GET, OPTIONS') {
  const origin = req.headers.origin || '';
  const allowedOrigins = new Set([
    'https://www.auraterminal.ai',
    'https://auraterminal.ai',
    'http://localhost:3000',
  ]);

  if (allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://www.auraterminal.ai');
  }

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Cache-Control', 'no-store');
}

function safeJsonParse(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

module.exports = {
  setAuraCorsHeaders,
  safeJsonParse,
};
