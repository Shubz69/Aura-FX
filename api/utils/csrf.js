function getTrustedOrigins() {
  const configured = String(process.env.CSRF_TRUSTED_ORIGINS || process.env.FRONTEND_URL || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  if (!configured.length) {
    return ['http://localhost:3000', 'http://localhost:5173', 'https://www.auraterminal.ai'];
  }
  return configured;
}

function isTrustedOrigin(origin) {
  if (!origin) return true;
  const normalized = String(origin).trim().toLowerCase();
  return getTrustedOrigins().some((allowed) => allowed.toLowerCase() === normalized);
}

function enforceTrustedOrigin(req, res) {
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  const refererOrigin = referer ? (() => {
    try {
      return new URL(referer).origin;
    } catch {
      return '';
    }
  })() : '';

  if (!isTrustedOrigin(origin) || !isTrustedOrigin(refererOrigin)) {
    res.status(403).json({
      success: false,
      message: 'Origin not allowed'
    });
    return false;
  }
  return true;
}

module.exports = {
  enforceTrustedOrigin,
  isTrustedOrigin,
  getTrustedOrigins
};
