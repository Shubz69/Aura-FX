/**
 * Aura Analysis / Trader Deck Leaderboard
 * Returns all users who have at least one trade in aura_analysis_trades,
 * with aggregated metrics: trades, win rate, avg R, PnL, profit factor, consistency.
 */

const { executeQuery } = require('../db');
const { verifyToken } = require('../utils/auth');

function getPathname(req) {
  if (!req.url) return '';
  const path = req.url.split('?')[0];
  if (path.startsWith('http')) {
    try {
      return new URL(path).pathname;
    } catch {
      return path;
    }
  }
  return path;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded || !decoded.id) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  try {
    const [rows] = await executeQuery(
      `SELECT
        t.user_id AS userId,
        u.username,
        u.email,
        COUNT(*) AS trades,
        COALESCE(SUM(t.pnl), 0) AS pnl,
        AVG(COALESCE(NULLIF(t.r_multiple, 0), t.rr)) AS avgR,
        SUM(CASE WHEN t.result IN ('win','loss','breakeven') AND (t.result = 'win' OR (t.pnl IS NOT NULL AND t.pnl > 0)) THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN t.result IN ('win','loss','breakeven') THEN 1 ELSE 0 END) AS closed,
        COALESCE(SUM(CASE WHEN t.pnl > 0 THEN t.pnl ELSE 0 END), 0) AS grossProfit,
        ABS(COALESCE(SUM(CASE WHEN t.pnl < 0 THEN t.pnl ELSE 0 END), 0)) AS grossLoss
       FROM aura_analysis_trades t
       LEFT JOIN users u ON u.id = t.user_id
       GROUP BY t.user_id, u.username, u.email`
    );

    if (!rows || rows.length === 0) {
      return res.status(200).json({ success: true, leaderboard: [] });
    }

    const leaderboard = rows.map((r) => {
      const userId = r.userId ?? r.user_id;
      const closed = Number(r.closed) || 0;
      const wins = Number(r.wins) || 0;
      const winRate = closed > 0 ? (wins / closed) * 100 : 0;
      const grossProfit = Number(r.grossProfit ?? r.gross_profit) || 0;
      const grossLoss = Number(r.grossLoss ?? r.gross_loss) || 0;
      const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
      const consistency = Math.round(Math.min(100, Math.max(0, 50 + (winRate - 50) * 0.4)));
      const trader = (r.username && String(r.username).trim()) || (r.email && String(r.email).trim()) || `User ${userId}`;
      const avgR = Number(r.avgR ?? r.avg_r);
      const pnl = Number(r.pnl);
      return {
        userId,
        trader,
        trades: Number(r.trades) || 0,
        winRate,
        avgR: Number.isFinite(avgR) ? avgR : 0,
        pnl: Number.isFinite(pnl) ? pnl : 0,
        profitFactor,
        consistency,
      };
    });

    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const sortBy = url.searchParams.get('sortBy') || 'pnl';
    const order = (url.searchParams.get('order') || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

    const key = sortBy === 'winRate' ? 'winRate' : sortBy === 'avgR' ? 'avgR' : sortBy === 'profitFactor' ? 'profitFactor' : sortBy === 'consistency' ? 'consistency' : sortBy === 'trades' ? 'trades' : 'pnl';
    leaderboard.sort((a, b) => {
      const va = a[key];
      const vb = b[key];
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return order === 'asc' ? cmp : -cmp;
    });

    const withRank = leaderboard.map((row, index) => ({ ...row, rank: index + 1 }));

    return res.status(200).json({ success: true, leaderboard: withRank });
  } catch (err) {
    console.error('aura-analysis leaderboard error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
