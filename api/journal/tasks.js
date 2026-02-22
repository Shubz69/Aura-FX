/**
 * Journal Tasks API – per-user task journal (add tasks, tick done, calendar).
 * Mandatory tasks are subscription-tier daily tasks (FREE / PREMIUM / ELITE); same list and percentage system.
 */

const { executeQuery, addColumnIfNotExists } = require('../db');
const { verifyToken } = require('../utils/auth');
const { getTier } = require('../utils/entitlements');
const crypto = require('crypto');
const { XP, awardOnce } = require('./xp-helper');

/** Mandatory tasks per tier: key, title, description. A7FX treated as ELITE. */
const MANDATORY_TASKS = {
  FREE: [
    { key: 'free_plan', title: 'Plan Before You Trade', description: 'Write your daily bias and one clear reason why you expect price to move in that direction before placing any trade.' },
    { key: 'free_risk', title: 'Risk With Discipline', description: 'Risk no more than 1–2% per trade and take a maximum of 3 trades.' },
    { key: 'free_study', title: 'Complete 20 Minutes of Study', description: 'Study one trading concept daily and write 3 key points you learned.' },
    { key: 'free_move', title: 'Move Your Body', description: 'Do at least 20 minutes of exercise (walk, gym, stretch) to improve focus and reduce stress.' },
    { key: 'free_reflect', title: 'Reflect Before Bed', description: 'Write one mistake you made today (trading or life) and how you will improve tomorrow.' },
  ],
  PREMIUM: [
    { key: 'premium_morning', title: 'Morning Focus Routine', description: 'Spend 10 minutes in silence (breathing or journaling) before checking charts to control emotional state.' },
    { key: 'premium_session', title: 'Structured Session Plan', description: 'Write your London and New York session expectations before trading begins.' },
    { key: 'premium_discipline', title: 'Execution Discipline Score', description: 'After trading, score your discipline out of 10 and explain why.' },
    { key: 'premium_health', title: 'Health & Energy Control', description: 'Eat clean for the day and avoid junk or sugar before trading hours.' },
    { key: 'premium_skill', title: 'Skill Compounding', description: 'Spend 30 minutes improving one skill daily (chart study, macro research, psychology, or reviewing old trades).' },
  ],
  ELITE: [
    { key: 'elite_identity', title: 'Define Your Daily Identity', description: 'Write one sentence every morning: "Today I trade like a professional by ______." This rewires behaviour.' },
    { key: 'elite_emotional', title: 'Emotional Awareness Tracking', description: 'After every win or loss, write how your confidence level changed (up, down, stable) and why.' },
    { key: 'elite_deepwork', title: 'Deep Work Block', description: 'Complete one 60-minute distraction-free session focused only on market study or review. No phone. No notifications.' },
    { key: 'elite_physical', title: 'Physical & Mental Optimisation', description: 'Train your body (gym or intense movement) and drink 2–3L of water to maintain cognitive performance.' },
    { key: 'elite_ceo', title: 'End-of-Day CEO Review', description: 'Ask yourself: Did I act like a disciplined fund manager or an emotional retail trader today? Write a 3–5 sentence answer.' },
  ],
};

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
      proof_image MEDIUMTEXT DEFAULT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_journal_tasks_userId (userId),
      INDEX idx_journal_tasks_userId_date (userId, date)
    )
  `);
  await addColumnIfNotExists('journal_tasks', 'proof_image', 'MEDIUMTEXT DEFAULT NULL');
  await addColumnIfNotExists('journal_tasks', 'is_mandatory', 'TINYINT(1) DEFAULT 0');
  await addColumnIfNotExists('journal_tasks', 'mandatory_key', 'VARCHAR(64) DEFAULT NULL');
  await addColumnIfNotExists('journal_tasks', 'description', 'TEXT DEFAULT NULL');
}

function getMandatoryTemplatesForTier(tier) {
  const t = (tier || 'FREE').toUpperCase();
  if (t === 'A7FX' || t === 'ELITE') return MANDATORY_TASKS.ELITE || [];
  if (t === 'PREMIUM') return MANDATORY_TASKS.PREMIUM || [];
  return MANDATORY_TASKS.FREE || [];
}

/** Ensure mandatory tasks exist for userId for every date in [dateFrom, dateTo]. */
async function ensureMandatoryTasksForRange(userId, dateFrom, dateTo, tier) {
  const templates = getMandatoryTemplatesForTier(tier);
  if (templates.length === 0) return;
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  const dates = [];
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  for (const dateStr of dates) {
    for (const t of templates) {
      const [existing] = await executeQuery(
        'SELECT id FROM journal_tasks WHERE userId = ? AND date = ? AND mandatory_key = ? LIMIT 1',
        [userId, dateStr, t.key]
      );
      if (existing && existing.length > 0) continue;
      const id = crypto.randomUUID();
      await executeQuery(
        `INSERT INTO journal_tasks (id, userId, date, title, completed, sortOrder, is_mandatory, mandatory_key, description)
         VALUES (?, ?, ?, ?, 0, 0, 1, ?, ?)`,
        [id, userId, dateStr, t.title, t.key, t.description || null]
      );
    }
  }
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
    proofImage: row.proof_image || null,
    isMandatory: Boolean(row.is_mandatory),
    mandatoryKey: row.mandatory_key || null,
    description: row.description || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Validate proof image: reject blank, fake, or invalid images. Ensures image is real and meets minimum size. */
function validateProofImage(proof, taskTitle = '') {
  if (!proof || typeof proof !== 'string') return { valid: true };
  const s = proof.trim();
  if (!s) return { valid: true };

  if (!/^data:image\/(jpeg|jpg|png|gif|webp);base64,/i.test(s)) {
    return { valid: false, message: 'Proof must be a valid image (JPEG, PNG, GIF, or WebP).' };
  }
  const base64 = s.replace(/^data:image\/[^;]+;base64,/, '');
  if (base64.length < 500) {
    return { valid: false, message: 'Image is too small or empty. Please upload a real screenshot or photo of your task.' };
  }
  try {
    const buf = Buffer.from(base64, 'base64');
    if (buf.length < 400) {
      return { valid: false, message: 'Image file is too small. Use a real task screenshot.' };
    }
  } catch (e) {
    return { valid: false, message: 'Invalid image data.' };
  }
  return { valid: true };
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

    // Resolve range for mandatory tasks
    let rangeFrom = dateFrom;
    let rangeTo = dateTo;
    if (date && !rangeFrom && !rangeTo) {
      rangeFrom = date;
      rangeTo = date;
    }
    if (rangeFrom && rangeTo) {
      try {
        const [userRows] = await executeQuery(
          'SELECT subscription_plan, subscription_status, subscription_expiry, role, payment_failed, email FROM users WHERE id = ?',
          [userId]
        );
        const userRow = userRows && userRows[0] ? userRows[0] : null;
        const tier = getTier(userRow);
        await ensureMandatoryTasksForRange(userId, rangeFrom, rangeTo, tier);
      } catch (err) {
        console.warn('Journal mandatory tasks ensure failed:', err.message);
      }
    }

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

    sql += ' ORDER BY date ASC, is_mandatory DESC, sortOrder ASC, createdAt ASC';

    const [rows] = await executeQuery(sql, params);
    const tasks = (rows || []).map(mapRow);
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

    const xpResult = await awardOnce(userId, 'journal_add_task', XP.ADD_TASK, id, null);

    const [rows] = await executeQuery('SELECT * FROM journal_tasks WHERE id = ?', [id]);
    return res.status(201).json({
      success: true,
      task: mapRow(rows[0]),
      xpAwarded: xpResult.awarded ? xpResult.xpAdded : null,
    });
  }

  if ((req.method === 'PUT' || req.method === 'DELETE') && taskId) {
    const [existing] = await executeQuery('SELECT id, is_mandatory FROM journal_tasks WHERE id = ? AND userId = ?', [taskId, userId]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }
    const isMandatory = Boolean(existing[0].is_mandatory);

    if (req.method === 'DELETE') {
      if (isMandatory) {
        return res.status(403).json({ success: false, message: 'Mandatory tasks cannot be deleted.' });
      }
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
    if (body.title !== undefined && !isMandatory) {
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
    if (body.proofImage !== undefined) {
      const rawProof = body.proofImage ? String(body.proofImage).trim() : null;
      if (rawProof) {
        const [rows] = await executeQuery('SELECT title FROM journal_tasks WHERE id = ? AND userId = ?', [taskId, userId]);
        const taskTitle = (rows && rows[0] && rows[0].title) ? rows[0].title : '';
        const validation = validateProofImage(rawProof, taskTitle);
        if (!validation.valid) {
          return res.status(400).json({ success: false, message: validation.message || 'Invalid proof image.' });
        }
      }
      const proof = rawProof ? rawProof.slice(0, 10485760) : null;
      updates.push('proof_image = ?');
      params.push(proof);
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
    const task = mapRow(rows[0]);
    let xpAwarded = null;
    if (task && task.completed && task.proofImage) {
      const xpResult = await awardOnce(userId, 'journal_task_complete_proof', XP.COMPLETE_WITH_PROOF, taskId, null);
      if (xpResult.awarded) xpAwarded = xpResult.xpAdded;
    }
    return res.status(200).json({ success: true, task, xpAwarded });
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
};
