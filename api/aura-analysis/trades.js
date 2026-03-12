/**
 * Trade Validator – save/list trades and PnL (daily, weekly, monthly).
 * Table: aura_analysis_trades. All users (including Free) can use.
 */

const { getDbConnection } = require('../db');
const { verifyToken } = require('../utils/auth');

function parseBody(req) {
  if (req.body == null) return {};
  if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  try {
    const raw = typeof req.body === 'string' ? req.body : req.body.toString();
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

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

async function ensureTradesTable(db) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS aura_analysis_trades (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      pair VARCHAR(50) NOT NULL,
      asset_class VARCHAR(50) NOT NULL DEFAULT 'forex',
      direction ENUM('buy','sell') NOT NULL,
      session VARCHAR(50) DEFAULT NULL,
      account_balance DECIMAL(15,2) NOT NULL,
      risk_percent DECIMAL(8,4) NOT NULL,
      risk_amount DECIMAL(15,2) NOT NULL,
      entry_price DECIMAL(20,8) NOT NULL,
      stop_loss DECIMAL(20,8) NOT NULL,
      take_profit DECIMAL(20,8) NOT NULL,
      stop_loss_pips DECIMAL(20,4) NOT NULL DEFAULT 0,
      take_profit_pips DECIMAL(20,4) NOT NULL DEFAULT 0,
      rr DECIMAL(12,4) NOT NULL DEFAULT 0,
      position_size DECIMAL(20,8) NOT NULL,
      potential_profit DECIMAL(15,2) NOT NULL DEFAULT 0,
      potential_loss DECIMAL(15,2) NOT NULL DEFAULT 0,
      result ENUM('win','loss','breakeven','open') DEFAULT 'open',
      pnl DECIMAL(15,2) DEFAULT 0,
      r_multiple DECIMAL(12,4) DEFAULT 0,
      checklist_score INT DEFAULT 0,
      checklist_total INT DEFAULT 0,
      checklist_percent DECIMAL(8,2) DEFAULT 0,
      trade_grade VARCHAR(80) DEFAULT NULL,
      notes TEXT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_aa_trades_user_id (user_id),
      INDEX idx_aa_trades_created_at (created_at),
      INDEX idx_aa_trades_user_created (user_id, created_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  try {
    await db.execute(`ALTER TABLE aura_analysis_trades MODIFY COLUMN trade_grade VARCHAR(80) DEFAULT NULL`);
  } catch (_) {
    /* column may already be 80 or table just created */
  }
}

function mapRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    userId: r.user_id,
    pair: r.pair,
    assetClass: r.asset_class,
    direction: r.direction,
    session: r.session ?? null,
    accountBalance: Number(r.account_balance),
    riskPercent: Number(r.risk_percent),
    riskAmount: Number(r.risk_amount),
    entryPrice: Number(r.entry_price),
    stopLoss: Number(r.stop_loss),
    takeProfit: Number(r.take_profit),
    stopLossPips: Number(r.stop_loss_pips),
    takeProfitPips: Number(r.take_profit_pips),
    rr: Number(r.rr),
    positionSize: Number(r.position_size),
    potentialProfit: Number(r.potential_profit),
    potentialLoss: Number(r.potential_loss),
    result: r.result,
    pnl: r.pnl != null ? Number(r.pnl) : null,
    rMultiple: r.r_multiple != null ? Number(r.r_multiple) : null,
    checklistScore: r.checklist_score ?? 0,
    checklistTotal: r.checklist_total ?? 0,
    checklistPercent: r.checklist_percent != null ? Number(r.checklist_percent) : null,
    tradeGrade: r.trade_grade ?? null,
    notes: r.notes ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded || !decoded.id) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  const userId = Number(decoded.id);
  const pathname = getPathname(req).replace(/\/+$/, '');
  const idMatch = pathname.match(/\/api\/aura-analysis\/trades\/(\d+)$/i);
  const tradeId = idMatch ? Number(idMatch[1]) : null;

  let db = null;
  try {
    db = await getDbConnection();
    if (!db) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    await ensureTradesTable(db);

    // PUT /api/aura-analysis/trades/:id – update result / pnl
    if (req.method === 'PUT' && tradeId) {
      const [existing] = await db.execute('SELECT id FROM aura_analysis_trades WHERE id = ? AND user_id = ?', [tradeId, userId]);
      if (!existing || existing.length === 0) {
        if (db.release) db.release();
        return res.status(404).json({ success: false, message: 'Trade not found' });
      }
      const body = parseBody(req);
      const result = ['win', 'loss', 'breakeven', 'open'].includes((body.result || '').toLowerCase())
        ? body.result.toLowerCase()
        : null;
      const pnl = body.pnl != null ? Number(body.pnl) : null;
      const updates = [];
      const params = [];
      if (result !== null) {
        updates.push('result = ?');
        params.push(result);
      }
      if (pnl !== null) {
        updates.push('pnl = ?');
        params.push(pnl);
      }
      if (updates.length === 0) {
        const [rows] = await db.execute('SELECT * FROM aura_analysis_trades WHERE id = ?', [tradeId]);
        db.release && db.release();
        return res.status(200).json({ success: true, trade: mapRow(rows[0]) });
      }
      params.push(tradeId);
      await db.execute(`UPDATE aura_analysis_trades SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`, [...params, userId]);
      const [rows] = await db.execute('SELECT * FROM aura_analysis_trades WHERE id = ?', [tradeId]);
      db.release && db.release();
      return res.status(200).json({ success: true, trade: mapRow(rows[0]) });
    }

    // GET /api/aura-analysis/trades – list my trades; optional dateFrom, dateTo, and pnl=1 for daily/weekly/monthly summary
    if (req.method === 'GET') {
      const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      const dateFrom = url.searchParams.get('dateFrom') || null;
      const dateTo = url.searchParams.get('dateTo') || null;
      const pnlSummary = url.searchParams.get('pnl') === '1';

      if (pnlSummary) {
        const [rows] = await db.execute(
          `SELECT
            SUM(CASE WHEN DATE(created_at) = CURDATE() THEN pnl ELSE 0 END) as daily_pnl,
            SUM(CASE WHEN created_at >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE())+1 DAY) AND created_at < DATE_ADD(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE())+1 DAY), INTERVAL 7 DAY) THEN pnl ELSE 0 END) as weekly_pnl,
            SUM(CASE WHEN YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE()) THEN pnl ELSE 0 END) as monthly_pnl
           FROM aura_analysis_trades WHERE user_id = ? AND result IN ('win','loss','breakeven')`,
          [userId]
        );
        const r = rows[0];
        db.release && db.release();
        return res.status(200).json({
          success: true,
          dailyPnl: r?.daily_pnl != null ? Number(r.daily_pnl) : 0,
          weeklyPnl: r?.weekly_pnl != null ? Number(r.weekly_pnl) : 0,
          monthlyPnl: r?.monthly_pnl != null ? Number(r.monthly_pnl) : 0,
        });
      }

      let sql = 'SELECT * FROM aura_analysis_trades WHERE user_id = ?';
      const params = [userId];
      if (dateFrom) {
        sql += ' AND DATE(created_at) >= ?';
        params.push(dateFrom);
      }
      if (dateTo) {
        sql += ' AND DATE(created_at) <= ?';
        params.push(dateTo);
      }
      sql += ' ORDER BY created_at DESC LIMIT 500';
      const [rows] = await db.execute(sql, params);
      db.release && db.release();
      return res.status(200).json({ success: true, trades: rows.map(mapRow) });
    }

    // POST /api/aura-analysis/trades – create trade
    if (req.method === 'POST') {
      const body = parseBody(req);
      const pair = (body.pair || body.symbol || 'EURUSD').toString().trim().slice(0, 50);
      const direction = (body.direction || 'buy').toLowerCase() === 'sell' ? 'sell' : 'buy';
      const accountBalance = Number(body.accountBalance ?? body.account_balance ?? 0);
      const riskPercent = Number(body.riskPercent ?? body.risk_percent ?? 0);
      const riskAmount = Number(body.riskAmount ?? body.risk_amount ?? 0);
      const entryPrice = Number(body.entryPrice ?? body.entry_price ?? 0);
      const stopLoss = Number(body.stopLoss ?? body.stop_loss ?? 0);
      const takeProfit = Number(body.takeProfit ?? body.take_profit ?? 0);
      const stopLossPips = Number(body.stopLossPips ?? body.stop_loss_pips ?? 0);
      const takeProfitPips = Number(body.takeProfitPips ?? body.take_profit_pips ?? 0);
      const rr = Number(body.rr ?? body.riskReward ?? 0);
      const positionSize = Number(body.positionSize ?? body.position_size ?? 0);
      const potentialProfit = Number(body.potentialProfit ?? body.potential_profit ?? 0);
      const potentialLoss = Number(body.potentialLoss ?? body.potential_loss ?? 0);
      const result = ['win', 'loss', 'breakeven', 'open'].includes((body.result || 'open').toLowerCase())
        ? (body.result || 'open').toLowerCase()
        : 'open';
      const pnl = body.pnl != null ? Number(body.pnl) : 0;
      const rMultiple = body.rMultiple != null || body.r_multiple != null ? Number(body.rMultiple ?? body.r_multiple) : 0;
      const checklistScore = Number(body.checklistScore ?? body.checklist_score ?? 0);
      const checklistTotal = Number(body.checklistTotal ?? body.checklist_total ?? 0);
      const checklistPercent = body.checklistPercent != null || body.checklist_percent != null ? Number(body.checklistPercent ?? body.checklist_percent) : 0;
      const tradeGrade = (body.tradeGrade ?? body.trade_grade ?? null) != null ? String(body.tradeGrade ?? body.trade_grade).trim().slice(0, 80) : null;
      const notes = body.notes != null ? String(body.notes).slice(0, 4096) : null;
      const session = body.session != null ? String(body.session).trim().slice(0, 50) : null;
      const assetClass = (body.assetClass ?? body.asset_class ?? 'forex').toString().slice(0, 50);

      if (!pair || accountBalance <= 0 || entryPrice <= 0) {
        if (db.release) db.release();
        return res.status(400).json({ success: false, message: 'pair, accountBalance, and entryPrice are required' });
      }

      const [insertResult] = await db.execute(
        `INSERT INTO aura_analysis_trades (
          user_id, pair, asset_class, direction, session, account_balance, risk_percent, risk_amount,
          entry_price, stop_loss, take_profit, stop_loss_pips, take_profit_pips, rr, position_size,
          potential_profit, potential_loss, result, pnl, r_multiple, checklist_score, checklist_total,
          checklist_percent, trade_grade, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId, pair, assetClass, direction, session, accountBalance, riskPercent, riskAmount,
          entryPrice, stopLoss, takeProfit, stopLossPips, takeProfitPips, rr, positionSize,
          potentialProfit, potentialLoss, result, pnl, rMultiple, checklistScore, checklistTotal,
          checklistPercent, tradeGrade, notes,
        ]
      );
      const insertId = insertResult.insertId;
      const [rows] = await db.execute('SELECT * FROM aura_analysis_trades WHERE id = ?', [insertId]);
      db.release && db.release();
      return res.status(201).json({ success: true, trade: mapRow(rows[0]) });
    }

    if (db.release) db.release();
    return res.status(404).json({ success: false, message: 'Not found' });
  } catch (err) {
    console.error('aura-analysis trades error:', err);
    if (db && db.release) db.release();
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
