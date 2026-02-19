/**
 * Journal Tasks API – per-user task journal (add tasks, tick done, calendar).
 * All endpoints require auth. Users can only access their own tasks.
 */

const { executeQuery } = require('../db');
const { verifyToken } = require('../utils/auth');
const crypto = require('crypto');

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

async function ensureTasksTable() {
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS journal_tasks (
      id CHAR(36) PRIMARY KEY,
      userId INT NOT NULL,
      date DATE NOT NULL,
      title VARCHAR(255) NOT NULL,
      completed TINYINT(1) DEFAULT 0,
      sortOrder INT DEFAULT 0,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_journal_tasks_userId (userId),
      INDEX idx_journal_tasks_userId_date (userId, date)
    )
  `);
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    date: row.date ? (row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10)) : null,
    title: row.title,
    completed: Boolean(row.completed),
    sortOrder: row.sortOrder != null ? Number(row.sortOrder) : 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
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
  if (!decoded || !decoded.id) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  const userId = Number(decoded.id);
  const pathname = getPathname(req);

  try {
    await ensureTasksTable();
  } catch (err) {
    console.error('Journal tasks ensureTasksTable error:', err);
    return res.status(500).json({ success: false, message: 'Database error' });
  }

  const idMatch = pathname.match(/\/api\/journal\/tasks\/([a-f0-9-]{36})/i);
  const taskId = idMatch ? idMatch[1] : null;

  if (req.method === 'GET' && !taskId) {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const dateFrom = url.searchParams.get('dateFrom') || null;
    const dateTo = url.searchParams.get('dateTo') || null;
    const date = url.searchParams.get('date') || null;

    let sql = 'SELECT * FROM journal_tasks WHERE userId = ?';
    const params = [userId];

    if (date) {
      sql += ' AND date = ?';
      params.push(date);
    } else if (dateFrom && dateTo) {
      sql += ' AND date >= ? AND date <= ?';
      params.push(dateFrom, dateTo);
    } else if (dateFrom) {
      sql += ' AND date >= ?';
      params.push(dateFrom);
    } else if (dateTo) {
      sql += ' AND date <= ?';
      params.push(dateTo);
    }

    sql += ' ORDER BY date ASC, sortOrder ASC, createdAt ASC';

    const [rows] = await executeQuery(sql, params);
    const tasks = rows.map(mapRow);
    return res.status(200).json({ success: true, tasks });
  }

  if (req.method === 'POST' && !taskId) {
    const body = parseBody(req);
    const date = body.date ? String(body.date).trim().slice(0, 10) : null;
    const title = body.title ? String(body.title).trim().slice(0, 255) : null;

    if (!date || !title) {
      return res.status(400).json({ success: false, message: 'date and title are required' });
    }

    const id = crypto.randomUUID();
    const sortOrder = body.sortOrder != null ? Number(body.sortOrder) : 0;

    await executeQuery(
      `INSERT INTO journal_tasks (id, userId, date, title, completed, sortOrder) VALUES (?, ?, ?, ?, 0, ?)`,
      [id, userId, date, title, sortOrder]
    );

    const [rows] = await executeQuery('SELECT * FROM journal_tasks WHERE id = ?', [id]);
    return res.status(201).json({ success: true, task: mapRow(rows[0]) });
  }

  if ((req.method === 'PUT' || req.method === 'DELETE') && taskId) {
    const [existing] = await executeQuery('SELECT id FROM journal_tasks WHERE id = ? AND userId = ?', [taskId, userId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    if (req.method === 'DELETE') {
      await executeQuery('DELETE FROM journal_tasks WHERE id = ? AND userId = ?', [taskId, userId]);
      return res.status(200).json({ success: true, deleted: true });
    }

    const body = parseBody(req);
    const updates = [];
    const params = [];

    if (typeof body.completed === 'boolean') {
      updates.push('completed = ?');
      params.push(body.completed ? 1 : 0);
    }
    if (body.title !== undefined) {
      updates.push('title = ?');
      params.push(body.title ? String(body.title).trim().slice(0, 255) : '');
    }
    if (body.date !== undefined) {
      updates.push('date = ?');
      params.push(String(body.date).trim().slice(0, 10));
    }
    if (body.sortOrder !== undefined) {
      updates.push('sortOrder = ?');
      params.push(Number(body.sortOrder));
    }

    if (updates.length === 0) {
      const [rows] = await executeQuery('SELECT * FROM journal_tasks WHERE id = ?', [taskId]);
      return res.status(200).json({ success: true, task: mapRow(rows[0]) });
    }

    params.push(taskId);
    await executeQuery(
      `UPDATE journal_tasks SET ${updates.join(', ')} WHERE id = ? AND userId = ?`,
      [...params, userId]
    );

    const [rows] = await executeQuery('SELECT * FROM journal_tasks WHERE id = ?', [taskId]);
    return res.status(200).json({ success: true, task: mapRow(rows[0]) });
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
};
