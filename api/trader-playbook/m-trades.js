const crypto = require('crypto');
const { executeQuery } = require('../db');
const { verifyToken } = require('../utils/auth');
const { ensureMTradesTable } = require('./schema');

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

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return {};
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    playbookId: row.playbookId || null,
    asset: row.asset || '',
    timeframe: row.timeframe || '',
    session: row.session || '',
    direction: row.direction || '',
    occurredAt: row.occurredAt || null,
    setupSummary: row.setupSummary || '',
    qualificationReason: row.qualificationReason || '',
    missType: row.missType || '',
    missReason: row.missReason || '',
    whatShouldHaveHappened: row.whatShouldHaveHappened || '',
    lessonLearned: row.lessonLearned || '',
    severity: row.severity != null ? Number(row.severity) : null,
    screenshotUrl: row.screenshotUrl || '',
    reviewLink: row.reviewLink || '',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function slice(v, max) {
  if (v == null) return null;
  return String(v).slice(0, max);
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded?.id) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const userId = Number(decoded.id);
  const pathname = getPathname(req);
  const idMatch = pathname.match(/\/api\/trader-playbook\/m-trades\/([a-f0-9-]{36})/i);
  const rowId = idMatch ? idMatch[1] : null;

  try {
    await ensureMTradesTable();
  } catch (e) {
    console.error('m-trades ensureTable', e);
    return res.status(500).json({ success: false, message: 'Database error' });
  }

  if (req.method === 'GET' && rowId) {
    const [rows] = await executeQuery('SELECT * FROM trader_playbook_m_trades WHERE id = ? AND userId = ?', [
      rowId,
      userId,
    ]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    return res.status(200).json({ success: true, mTrade: mapRow(rows[0]) });
  }

  if (req.method === 'GET') {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const playbookId = url.searchParams.get('playbookId') || null;
    let sql = 'SELECT * FROM trader_playbook_m_trades WHERE userId = ?';
    const params = [userId];
    if (playbookId) {
      sql += ' AND playbookId = ?';
      params.push(playbookId);
    }
    sql += ' ORDER BY occurredAt DESC, createdAt DESC LIMIT 500';
    const [rows] = await executeQuery(sql, params);
    return res.status(200).json({ success: true, mTrades: rows.map(mapRow) });
  }

  if (req.method === 'POST' && !rowId) {
    const body = parseBody(req);
    const id = crypto.randomUUID();
    const playbookId = body.playbookId ? String(body.playbookId).trim().slice(0, 36) : null;
    if (playbookId) {
      const [pb] = await executeQuery('SELECT id FROM trader_playbook_setups WHERE id = ? AND userId = ?', [
        playbookId,
        userId,
      ]);
      if (!pb.length) {
        return res.status(400).json({ success: false, message: 'Invalid playbook' });
      }
    }
    const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date();
    const severity =
      body.severity != null && body.severity !== '' ? Math.min(5, Math.max(1, Number(body.severity))) : null;

    await executeQuery(
      `INSERT INTO trader_playbook_m_trades (
        id, userId, playbookId, asset, timeframe, session, direction, occurredAt,
        setupSummary, qualificationReason, missType, missReason, whatShouldHaveHappened, lessonLearned,
        severity, screenshotUrl, reviewLink
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        userId,
        playbookId,
        slice(body.asset, 64),
        slice(body.timeframe, 32),
        slice(body.session, 64),
        slice(body.direction, 16),
        Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
        body.setupSummary != null ? slice(body.setupSummary, 4000) : null,
        body.qualificationReason != null ? slice(body.qualificationReason, 4000) : null,
        body.missType != null ? slice(body.missType, 48) : null,
        body.missReason != null ? slice(body.missReason, 6000) : null,
        body.whatShouldHaveHappened != null ? slice(body.whatShouldHaveHappened, 4000) : null,
        body.lessonLearned != null ? slice(body.lessonLearned, 6000) : null,
        severity,
        body.screenshotUrl != null ? slice(body.screenshotUrl, 2048) : null,
        body.reviewLink != null ? slice(body.reviewLink, 2048) : null,
      ]
    );
    const [rows] = await executeQuery('SELECT * FROM trader_playbook_m_trades WHERE id = ?', [id]);
    return res.status(201).json({ success: true, mTrade: mapRow(rows[0]) });
  }

  if ((req.method === 'PUT' || req.method === 'DELETE') && rowId) {
    const [existingList] = await executeQuery('SELECT * FROM trader_playbook_m_trades WHERE id = ? AND userId = ?', [
      rowId,
      userId,
    ]);
    if (!existingList.length) return res.status(404).json({ success: false, message: 'Not found' });

    if (req.method === 'DELETE') {
      await executeQuery('DELETE FROM trader_playbook_m_trades WHERE id = ? AND userId = ?', [rowId, userId]);
      return res.status(200).json({ success: true, deleted: true });
    }

    const body = parseBody(req);
    const ex = existingList[0];
    const playbookId =
      body.playbookId !== undefined
        ? body.playbookId
          ? String(body.playbookId).trim().slice(0, 36)
          : null
        : ex.playbookId;
    if (playbookId) {
      const [pb] = await executeQuery('SELECT id FROM trader_playbook_setups WHERE id = ? AND userId = ?', [
        playbookId,
        userId,
      ]);
      if (!pb.length) {
        return res.status(400).json({ success: false, message: 'Invalid playbook' });
      }
    }

    const updates = [];
    const params = [];
    const set = (col, val) => {
      updates.push(`${col} = ?`);
      params.push(val);
    };

    if (body.playbookId !== undefined) set('playbookId', playbookId);
    if (body.asset !== undefined) set('asset', slice(body.asset, 64));
    if (body.timeframe !== undefined) set('timeframe', slice(body.timeframe, 32));
    if (body.session !== undefined) set('session', slice(body.session, 64));
    if (body.direction !== undefined) set('direction', slice(body.direction, 16));
    if (body.occurredAt !== undefined) {
      const d = new Date(body.occurredAt);
      set('occurredAt', Number.isNaN(d.getTime()) ? ex.occurredAt : d);
    }
    if (body.setupSummary !== undefined) set('setupSummary', body.setupSummary != null ? slice(body.setupSummary, 4000) : null);
    if (body.qualificationReason !== undefined) {
      set('qualificationReason', body.qualificationReason != null ? slice(body.qualificationReason, 4000) : null);
    }
    if (body.missType !== undefined) set('missType', body.missType != null ? slice(body.missType, 48) : null);
    if (body.missReason !== undefined) set('missReason', body.missReason != null ? slice(body.missReason, 6000) : null);
    if (body.whatShouldHaveHappened !== undefined) {
      set('whatShouldHaveHappened', body.whatShouldHaveHappened != null ? slice(body.whatShouldHaveHappened, 4000) : null);
    }
    if (body.lessonLearned !== undefined) set('lessonLearned', body.lessonLearned != null ? slice(body.lessonLearned, 6000) : null);
    if (body.severity !== undefined) {
      const s =
        body.severity != null && body.severity !== ''
          ? Math.min(5, Math.max(1, Number(body.severity)))
          : null;
      set('severity', s);
    }
    if (body.screenshotUrl !== undefined) {
      set('screenshotUrl', body.screenshotUrl != null ? slice(body.screenshotUrl, 2048) : null);
    }
    if (body.reviewLink !== undefined) set('reviewLink', body.reviewLink != null ? slice(body.reviewLink, 2048) : null);

    if (!updates.length) {
      return res.status(200).json({ success: true, mTrade: mapRow(ex) });
    }
    params.push(rowId, userId);
    await executeQuery(
      `UPDATE trader_playbook_m_trades SET ${updates.join(', ')} WHERE id = ? AND userId = ?`,
      params
    );
    const [rows] = await executeQuery('SELECT * FROM trader_playbook_m_trades WHERE id = ?', [rowId]);
    return res.status(200).json({ success: true, mTrade: mapRow(rows[0]) });
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
};
