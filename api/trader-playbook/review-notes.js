const crypto = require('crypto');
const { executeQuery } = require('../db');
const { verifyToken } = require('../utils/auth');
const { ensureReviewNotesTable, touchReviewNotesCount, migratePlaybookColumns } = require('./schema');

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

const NOTE_TYPES = new Set(['rule_refinement', 'lesson', 'performance', 'psychology']);

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    playbookId: row.playbookId,
    noteType: row.noteType,
    periodLabel: row.periodLabel || '',
    title: row.title || '',
    body: row.body || '',
    confidenceRating: row.confidenceRating != null ? Number(row.confidenceRating) : null,
    versionNote: row.versionNote || '',
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
  const idMatch = pathname.match(/\/api\/trader-playbook\/review-notes\/([a-f0-9-]{36})/i);
  const noteId = idMatch ? idMatch[1] : null;

  try {
    await migratePlaybookColumns();
    await ensureReviewNotesTable();
  } catch (e) {
    console.error('review-notes ensureTable', e);
    return res.status(500).json({ success: false, message: 'Database error' });
  }

  if (req.method === 'GET' && noteId) {
    const [rows] = await executeQuery('SELECT * FROM trader_playbook_review_notes WHERE id = ? AND userId = ?', [
      noteId,
      userId,
    ]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    return res.status(200).json({ success: true, note: mapRow(rows[0]) });
  }

  if (req.method === 'GET') {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const playbookId = url.searchParams.get('playbookId') || null;
    if (!playbookId) {
      return res.status(400).json({ success: false, message: 'playbookId query required' });
    }
    const [pb] = await executeQuery('SELECT id FROM trader_playbook_setups WHERE id = ? AND userId = ?', [
      playbookId,
      userId,
    ]);
    if (!pb.length) return res.status(404).json({ success: false, message: 'Playbook not found' });
    const [rows] = await executeQuery(
      'SELECT * FROM trader_playbook_review_notes WHERE userId = ? AND playbookId = ? ORDER BY createdAt DESC LIMIT 200',
      [userId, playbookId]
    );
    return res.status(200).json({ success: true, notes: rows.map(mapRow) });
  }

  if (req.method === 'POST' && !noteId) {
    const body = parseBody(req);
    const playbookId = body.playbookId ? String(body.playbookId).trim() : '';
    if (!playbookId) return res.status(400).json({ success: false, message: 'playbookId required' });
    const [pb] = await executeQuery('SELECT id FROM trader_playbook_setups WHERE id = ? AND userId = ?', [
      playbookId,
      userId,
    ]);
    if (!pb.length) return res.status(404).json({ success: false, message: 'Playbook not found' });

    const noteType = String(body.noteType || 'performance').toLowerCase();
    const normalizedType = NOTE_TYPES.has(noteType) ? noteType : 'performance';
    const id = crypto.randomUUID();
    const conf =
      body.confidenceRating != null && body.confidenceRating !== ''
        ? Math.min(100, Math.max(1, Number(body.confidenceRating)))
        : null;

    await executeQuery(
      `INSERT INTO trader_playbook_review_notes (
        id, userId, playbookId, noteType, periodLabel, title, body, confidenceRating, versionNote
      ) VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        id,
        userId,
        playbookId,
        normalizedType,
        body.periodLabel != null ? slice(body.periodLabel, 80) : null,
        body.title != null ? slice(body.title, 200) : null,
        body.body != null ? slice(body.body, 16000) : null,
        conf,
        body.versionNote != null ? slice(body.versionNote, 500) : null,
      ]
    );
    await touchReviewNotesCount(userId, playbookId, 1);
    const [rows] = await executeQuery('SELECT * FROM trader_playbook_review_notes WHERE id = ?', [id]);
    return res.status(201).json({ success: true, note: mapRow(rows[0]) });
  }

  if ((req.method === 'PUT' || req.method === 'DELETE') && noteId) {
    const [existingList] = await executeQuery('SELECT * FROM trader_playbook_review_notes WHERE id = ? AND userId = ?', [
      noteId,
      userId,
    ]);
    if (!existingList.length) return res.status(404).json({ success: false, message: 'Not found' });
    const ex = existingList[0];

    if (req.method === 'DELETE') {
      await executeQuery('DELETE FROM trader_playbook_review_notes WHERE id = ? AND userId = ?', [noteId, userId]);
      await touchReviewNotesCount(userId, ex.playbookId, -1);
      return res.status(200).json({ success: true, deleted: true });
    }

    const body = parseBody(req);
    const updates = [];
    const params = [];
    const set = (col, val) => {
      updates.push(`${col} = ?`);
      params.push(val);
    };

    if (body.noteType !== undefined) {
      const noteType = String(body.noteType || '').toLowerCase();
      set('noteType', NOTE_TYPES.has(noteType) ? noteType : ex.noteType);
    }
    if (body.periodLabel !== undefined) set('periodLabel', body.periodLabel != null ? slice(body.periodLabel, 80) : null);
    if (body.title !== undefined) set('title', body.title != null ? slice(body.title, 200) : null);
    if (body.body !== undefined) set('body', body.body != null ? slice(body.body, 16000) : null);
    if (body.confidenceRating !== undefined) {
      const conf =
        body.confidenceRating != null && body.confidenceRating !== ''
          ? Math.min(100, Math.max(1, Number(body.confidenceRating)))
          : null;
      set('confidenceRating', conf);
    }
    if (body.versionNote !== undefined) set('versionNote', body.versionNote != null ? slice(body.versionNote, 500) : null);

    if (!updates.length) {
      return res.status(200).json({ success: true, note: mapRow(ex) });
    }
    params.push(noteId, userId);
    await executeQuery(
      `UPDATE trader_playbook_review_notes SET ${updates.join(', ')} WHERE id = ? AND userId = ?`,
      params
    );
    const [rows] = await executeQuery('SELECT * FROM trader_playbook_review_notes WHERE id = ?', [noteId]);
    return res.status(200).json({ success: true, note: mapRow(rows[0]) });
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
};
