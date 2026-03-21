/**
 * Trade Validator — multiple named accounts per user.
 * GET  /api/aura-analysis/validator-accounts — list (creates Primary + backfills trades if needed)
 * POST /api/aura-analysis/validator-accounts — body { name }
 */
const { executeQuery, indexExists, addColumnIfNotExists } = require('../db');
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

async function ensureTables() {
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS trade_validator_accounts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      name VARCHAR(120) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tv_acc_user (user_id)
    )
  `).catch(() => {});

  const tradesTable = 'aura_analysis_trades';
  await addColumnIfNotExists(tradesTable, 'validator_account_id', 'INT NULL');
  if (!(await indexExists(tradesTable, 'idx_aa_trades_validator_account'))) {
    try {
      await executeQuery(
        `ALTER TABLE ${tradesTable} ADD INDEX idx_aa_trades_validator_account (user_id, validator_account_id)`
      );
    } catch (_) {
      /* duplicate index name — benign */
    }
  }
}

async function ensureDefaultAccount(userId) {
  const [rows] = await executeQuery(
    'SELECT id, name FROM trade_validator_accounts WHERE user_id = ? ORDER BY sort_order ASC, id ASC',
    [userId]
  );
  if (rows?.length) {
    const [full] = await executeQuery(
      'SELECT id, name, sort_order, created_at FROM trade_validator_accounts WHERE user_id = ? ORDER BY sort_order ASC, id ASC',
      [userId]
    );
    return full || rows;
  }

  await executeQuery(
    'INSERT INTO trade_validator_accounts (user_id, name, sort_order) VALUES (?, ?, 0)',
    [userId, 'Primary']
  );
  const [created] = await executeQuery(
    'SELECT id FROM trade_validator_accounts WHERE user_id = ? ORDER BY id ASC LIMIT 1',
    [userId]
  );
  const primaryId = created[0]?.id;
  if (primaryId) {
    await executeQuery(
      'UPDATE aura_analysis_trades SET validator_account_id = ? WHERE user_id = ? AND validator_account_id IS NULL',
      [primaryId, userId]
    ).catch(() => {});
  }
  const [full] = await executeQuery(
    'SELECT id, name, sort_order, created_at FROM trade_validator_accounts WHERE user_id = ? ORDER BY sort_order ASC, id ASC',
    [userId]
  );
  return full || [];
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded?.id) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  const userId = Number(decoded.id);

  try {
    await ensureTables();
  } catch (e) {
    console.error('[validator-accounts] schema', e);
    return res.status(500).json({ success: false, message: 'Database error' });
  }

  if (req.method === 'GET') {
    try {
      const accounts = await ensureDefaultAccount(userId);
      return res.status(200).json({ success: true, accounts });
    } catch (e) {
      console.error('[validator-accounts] GET', e);
      return res.status(500).json({ success: false, message: 'Failed to load accounts' });
    }
  }

  if (req.method === 'POST') {
    const body = parseBody(req);
    const name = (body.name || '').toString().trim().slice(0, 120);
    if (!name) {
      return res.status(400).json({ success: false, message: 'name is required' });
    }
    try {
      const [maxRow] = await executeQuery(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM trade_validator_accounts WHERE user_id = ?',
        [userId]
      );
      const sortOrder = maxRow?.[0]?.n ?? 0;
      await executeQuery(
        'INSERT INTO trade_validator_accounts (user_id, name, sort_order) VALUES (?, ?, ?)',
        [userId, name, sortOrder]
      );
      const [list] = await executeQuery(
        'SELECT id, name, sort_order, created_at FROM trade_validator_accounts WHERE user_id = ? ORDER BY sort_order ASC, id ASC',
        [userId]
      );
      return res.status(201).json({ success: true, accounts: list });
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ success: false, message: 'An account with this name already exists' });
      }
      console.error('[validator-accounts] POST', e);
      return res.status(500).json({ success: false, message: 'Failed to create account' });
    }
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
};
