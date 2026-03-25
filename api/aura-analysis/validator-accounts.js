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

const ALLOWED_ACCOUNT_CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'AUD', 'NZD', 'CAD', 'CHF', 'JPY']);

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

  await addColumnIfNotExists('trade_validator_accounts', 'account_currency', "VARCHAR(3) NOT NULL DEFAULT 'USD'");

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
    'SELECT id, name, account_currency FROM trade_validator_accounts WHERE user_id = ? ORDER BY sort_order ASC, id ASC',
    [userId]
  );
  if (rows?.length) {
    const [full] = await executeQuery(
      'SELECT id, name, sort_order, account_currency, created_at FROM trade_validator_accounts WHERE user_id = ? ORDER BY sort_order ASC, id ASC',
      [userId]
    );
    return full || rows;
  }

  await executeQuery(
    'INSERT INTO trade_validator_accounts (user_id, name, sort_order, account_currency) VALUES (?, ?, 0, ?)',
    [userId, 'Primary', 'USD']
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
    'SELECT id, name, sort_order, account_currency, created_at FROM trade_validator_accounts WHERE user_id = ? ORDER BY sort_order ASC, id ASC',
    [userId]
  );
  return full || [];
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
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
      const mapped = (accounts || []).map((a) => ({
        id: a.id,
        name: a.name,
        sort_order: a.sort_order,
        accountCurrency: (a.account_currency || 'USD').toString().toUpperCase(),
        created_at: a.created_at,
      }));
      return res.status(200).json({ success: true, accounts: mapped });
    } catch (e) {
      console.error('[validator-accounts] GET', e);
      return res.status(500).json({ success: false, message: 'Failed to load accounts' });
    }
  }

  if (req.method === 'POST') {
    const body = parseBody(req);
    const name = (body.name || '').toString().trim().slice(0, 120);
    const rawCcy = (body.accountCurrency || body.account_currency || 'USD').toString().trim().toUpperCase();
    if (!name) {
      return res.status(400).json({ success: false, message: 'name is required' });
    }
    if (!ALLOWED_ACCOUNT_CURRENCIES.has(rawCcy)) {
      return res.status(400).json({ success: false, message: 'Invalid accountCurrency' });
    }
    try {
      const [maxRow] = await executeQuery(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM trade_validator_accounts WHERE user_id = ?',
        [userId]
      );
      const sortOrder = maxRow?.[0]?.n ?? 0;
      await executeQuery(
        'INSERT INTO trade_validator_accounts (user_id, name, sort_order, account_currency) VALUES (?, ?, ?, ?)',
        [userId, name, sortOrder, rawCcy]
      );
      const [list] = await executeQuery(
        'SELECT id, name, sort_order, account_currency, created_at FROM trade_validator_accounts WHERE user_id = ? ORDER BY sort_order ASC, id ASC',
        [userId]
      );
      const mapped = (list || []).map((a) => ({
        id: a.id,
        name: a.name,
        sort_order: a.sort_order,
        accountCurrency: (a.account_currency || 'USD').toString().toUpperCase(),
        created_at: a.created_at,
      }));
      return res.status(201).json({ success: true, accounts: mapped });
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ success: false, message: 'An account with this name already exists' });
      }
      console.error('[validator-accounts] POST', e);
      return res.status(500).json({ success: false, message: 'Failed to create account' });
    }
  }

  if (req.method === 'PATCH') {
    const body = parseBody(req);
    const accountId = Number(body.id ?? body.accountId);
    const rawCcy = (body.accountCurrency || body.account_currency || '').toString().trim().toUpperCase();
    if (!accountId || !Number.isFinite(accountId)) {
      return res.status(400).json({ success: false, message: 'id is required' });
    }
    if (!rawCcy || !ALLOWED_ACCOUNT_CURRENCIES.has(rawCcy)) {
      return res.status(400).json({ success: false, message: 'Invalid accountCurrency' });
    }
    try {
      const [own] = await executeQuery('SELECT id FROM trade_validator_accounts WHERE id = ? AND user_id = ?', [
        accountId,
        userId,
      ]);
      if (!own?.length) {
        return res.status(404).json({ success: false, message: 'Account not found' });
      }
      await executeQuery('UPDATE trade_validator_accounts SET account_currency = ? WHERE id = ? AND user_id = ?', [
        rawCcy,
        accountId,
        userId,
      ]);
      const [list] = await executeQuery(
        'SELECT id, name, sort_order, account_currency, created_at FROM trade_validator_accounts WHERE user_id = ? ORDER BY sort_order ASC, id ASC',
        [userId]
      );
      const mapped = (list || []).map((a) => ({
        id: a.id,
        name: a.name,
        sort_order: a.sort_order,
        accountCurrency: (a.account_currency || 'USD').toString().toUpperCase(),
        created_at: a.created_at,
      }));
      return res.status(200).json({ success: true, accounts: mapped });
    } catch (e) {
      console.error('[validator-accounts] PATCH', e);
      return res.status(500).json({ success: false, message: 'Failed to update account' });
    }
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
};
