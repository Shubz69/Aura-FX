/**
 * GET /api/admin/market-decoder-diagnostics?symbol=EURUSD
 * Admin / super_admin only — full Market Decoder feed diagnostics (internal tooling).
 * Not exposed on the public Market Decoder route.
 */

require('../utils/suppress-warnings');

const { getDbConnection } = require('../db');
const { verifyToken } = require('../utils/auth');
const { isSuperAdminEmail } = require('../utils/entitlements');
const { runMarketDecoder } = require('../trader-deck/marketDecoderEngine');

async function assertAdminDb(db, authHeader) {
  const decoded = verifyToken(authHeader);
  if (!decoded?.id) {
    return { ok: false, status: 401, message: 'Unauthorized' };
  }
  const [rows] = await db.execute('SELECT email, role FROM users WHERE id = ? LIMIT 1', [decoded.id]);
  if (!rows?.length) {
    return { ok: false, status: 401, message: 'Unauthorized' };
  }
  const row = rows[0];
  const r = (row.role || '').toString().trim().toLowerCase();
  if (r === 'admin' || r === 'super_admin' || isSuperAdminEmail(row)) {
    return { ok: true };
  }
  return { ok: false, status: 403, message: 'Admin access required' };
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const db = await getDbConnection();
  if (!db) {
    return res.status(500).json({ success: false, message: 'Database unavailable' });
  }

  try {
    const gate = await assertAdminDb(db, req.headers.authorization);
    if (!gate.ok) {
      return res.status(gate.status).json({ success: false, message: gate.message });
    }
  } finally {
    if (db && typeof db.release === 'function') {
      try {
        db.release();
      } catch (_) {}
    }
  }

  try {
    const q = req.query || {};
    const symbol = (q.symbol || q.q || 'EURUSD').toString().trim() || 'EURUSD';

    const raw = await runMarketDecoder(symbol);
    if (!raw.success) {
      return res.status(400).json(raw);
    }

    const meta = raw.brief?.meta && typeof raw.brief.meta === 'object' ? raw.brief.meta : {};
    return res.status(200).json({
      success: true,
      symbol: symbol.toUpperCase(),
      generatedAt: meta.generatedAt || null,
      rulesEngine: {
        bullScore: meta.bullScore,
        bearScore: meta.bearScore,
        netScore: meta.netScore,
      },
      dataHealth: meta.dataHealth || null,
      internalSymbolKey: meta.finnhubSymbol ?? null,
      canonicalSymbol: meta.canonicalSymbol ?? null,
    });
  } catch (err) {
    console.error('[admin/market-decoder-diagnostics]', err);
    return res.status(500).json({ success: false, message: err.message || 'Diagnostics failed' });
  }
};
