const DEFAULT_TRUSTED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'https://www.auraterminal.ai',
  'https://auraterminal.ai',
];

function getTrustedOrigins() {
  const configured = String(process.env.CSRF_TRUSTED_ORIGINS || process.env.FRONTEND_URL || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  if (!configured.length) {
    return [...DEFAULT_TRUSTED_ORIGINS];
  }
  return Array.from(new Set([...DEFAULT_TRUSTED_ORIGINS, ...configured]));
}

/** Vercel preview deployments (*.vercel.app) — allowed only outside production unless explicitly enabled. */
function isTrustedVercelPreviewOrigin(origin) {
  const o = String(origin || '').trim();
  if (!/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(o)) return false;
  if (process.env.ALLOW_VERCEL_PREVIEW_CSRF === 'true') return true;
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') return true;
  return false;
}

function isTrustedOrigin(origin) {
  if (!origin) return true;
  const normalized = String(origin).trim().toLowerCase();
  if (isTrustedVercelPreviewOrigin(origin)) return true;
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
