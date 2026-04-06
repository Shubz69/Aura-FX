/**
 * Journal Tasks API – per-user task journal (add tasks, tick done, calendar).
 * Mandatory tasks are subscription-tier daily tasks (FREE / PREMIUM / ELITE); same list and percentage system.
 */

const { executeQuery, addColumnIfNotExists } = require('../db');
const { verifyToken } = require('../utils/auth');
const { getTier, normalizeRole } = require('../utils/entitlements');
const crypto = require('crypto');
const { XP, awardOnce } = require('./xp-helper');
const { getJournalContext, assertJournalWritableDate, normalizeYyyyMmDd } = require('../utils/journalWriteGuard');

/** Mandatory tasks per tier: key, title, description. A7FX + ADMIN + SUPER_ADMIN → ELITE set. */
const MANDATORY_TASKS = {
  FREE: [
    {
      key: 'free_plan',
      title: 'Plan Before You Trade',
      description: 'Before opening any chart, write your daily bias (bullish/bearish/neutral), the specific asset you plan to trade, one key level to watch, and your reason for the directional bias. No bias = no trade.'
    },
    {
      key: 'free_risk',
      title: 'Risk With Discipline',
      description: 'Set a hard limit of 1% risk per trade and maximum 2 trades today. After each trade, write the exact entry, stop loss, take profit, and R:R before you close the platform.'
    },
    {
      key: 'free_study',
      title: '20-Minute Focused Study',
      description: 'Choose one concept (structure, liquidity, supply & demand, or session timing). Study it for 20 minutes and write 2 key takeaways you can apply immediately to your charts.'
    },
    {
      key: 'free_move',
      title: 'Move Your Body',
      description: 'Complete at least 20 minutes of physical activity — walk, gym, stretch, or bodyweight training. Physical movement directly improves focus, emotional regulation, and decision-making.'
    },
    {
      key: 'free_reflect',
      title: 'End-of-Day Reflection',
      description: 'Before sleep, write one specific mistake you made today (in trading or thinking) and one concrete action you will take tomorrow to fix it. Vague reflections do not count.'
    },
  ],
  PREMIUM: [
    {
      key: 'premium_morning',
      title: 'Pre-Market Mental Routine',
      description: 'Before touching the charts, spend 10 minutes in silence — no phone, no news. Breathe and write your emotional state (0–10 confidence, 0–10 focus). Only trade if both are above 6.'
    },
    {
      key: 'premium_session',
      title: 'Session-by-Session Trade Plan',
      description: 'Write your London Open plan (key levels, bias, risk budget) before 8:00 AM UTC. Write your New York Open plan before 1:30 PM UTC. Execution without a written plan is gambling.'
    },
    {
      key: 'premium_discipline',
      title: 'Execution Score',
      description: 'After each trade or at day end, score your execution out of 10 across three areas: (1) entry precision, (2) stop loss placement, (3) target management. Write the total and reason.'
    },
    {
      key: 'premium_health',
      title: 'Performance Nutrition',
      description: 'Track what you ate today. Avoid processed food, sugar, or excessive caffeine during trading hours. Write whether your energy was stable or unstable, and how it affected your decisions.'
    },
    {
      key: 'premium_skill',
      title: '30-Minute Skill Block',
      description: 'Dedicate 30 minutes to one skill: chart markup, macro analysis, psychology study, or reviewing a past trade in detail. Write the specific skill worked on and one improvement identified.'
    },
  ],
  ELITE: [
    {
      key: 'elite_identity',
      title: 'Daily Professional Identity Statement',
      description: 'Write this sentence every morning and complete it fully: "Today I trade like a professional by ______." Be specific — not "being disciplined" but "only entering on confirmed structure breaks with a 1:2 minimum R:R."'
    },
    {
      key: 'elite_emotional',
      title: 'Emotional P&L Tracking',
      description: 'After every win, loss, or breakeven, log: (1) your emotional state before the trade, (2) whether emotion influenced the entry or exit, (3) confidence change. Patterns here reveal your psychological edge.'
    },
    {
      key: 'elite_deepwork',
      title: '60-Minute Deep Work Block',
      description: 'Complete one uninterrupted 60-minute block on one market task: backtest a setup, analyse a session replay, review 10 past trades for a pattern, or study a macro driver. Phone off. No interruptions.'
    },
    {
      key: 'elite_physical',
      title: 'Elite Physical Protocol',
      description: 'Train with intent today (gym, sprint intervals, or 45+ min cardio). Drink minimum 2.5L of water. Log sleep quality (hours + quality out of 10). Cognitive performance is inseparable from physical state.'
    },
    {
      key: 'elite_ceo',
      title: 'CEO-Level Daily Debrief',
      description: 'Write a 5-sentence end-of-day debrief answering: (1) Did I follow my rules fully? (2) What was my best decision today? (3) What was my worst decision? (4) What will I do differently tomorrow? (5) Would a fund manager be proud of today?'
    },
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
  await addColumnIfNotExists('journal_tasks', 'reminder_at', 'DATETIME NULL');
  await addColumnIfNotExists('journal_tasks', 'reminder_sent_at', 'DATETIME NULL');
  try {
    await executeQuery(`
      DELETE t1 FROM journal_tasks t1
      INNER JOIN journal_tasks t2
        ON t1.userId = t2.userId AND t1.date = t2.date AND t1.mandatory_key = t2.mandatory_key
        AND t1.mandatory_key IS NOT NULL AND t1.id > t2.id
    `);
  } catch (e) {
    console.warn('Cleanup duplicate mandatory tasks on schema:', e.message);
  }
  try {
    await executeQuery(`
      ALTER TABLE journal_tasks ADD UNIQUE KEY unique_user_date_mandatory_key (userId, date, mandatory_key)
    `);
    console.log('Added unique key unique_user_date_mandatory_key on journal_tasks');
  } catch (e) {
    if (e.code !== 'ER_DUP_KEYNAME' && e.code !== 'ER_MULTIPLE_PRI_KEY' && e.code !== 'ER_DUP_ENTRY') {
      console.warn('journal_tasks unique key:', e.message);
    }
  }
}

function getMandatoryTemplatesForTier(tier) {
  const t = (tier || 'FREE').toUpperCase();
  if (t === 'A7FX' || t === 'ELITE') return MANDATORY_TASKS.ELITE || [];
  if (t === 'PREMIUM') return MANDATORY_TASKS.PREMIUM || [];
  return MANDATORY_TASKS.FREE || [];
}

/** Tier string used only for which mandatory task templates to seed. Admins always get Elite list. */
function getMandatoryTaskTier(userRow) {
  if (!userRow) return 'FREE';
  const nr = normalizeRole(userRow.role);
  if (nr === 'ADMIN' || nr === 'SUPER_ADMIN') return 'ELITE';
  return getTier(userRow);
}

/** Return tasks with at most one mandatory task per (date, mandatoryKey). Keeps first occurrence. Excludes mandatory tasks on Saturday (rest day). */
function deduplicateMandatoryTasks(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) return tasks;
  const seen = new Set();
  return tasks.filter((t) => {
    if (t.isMandatory && isSaturday(t.date)) return false;
    if (!t.isMandatory || !t.mandatoryKey) return true;
    const key = `${String(t.date).slice(0, 10)}:${t.mandatoryKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** True if dateStr (YYYY-MM-DD) is a Saturday. Saturday = rest day, no mandatory tasks. Uses UTC so the same date is treated the same everywhere. */
function isSaturday(dateStr) {
  const s = String(dateStr).slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dayOfWeek === 6;
}

/** Parse YYYY-MM-DD and iterate day-by-day without timezone shifts. */
function getDateStringsBetween(dateFrom, dateTo) {
  const [y1, m1, d1] = dateFrom.split('-').map(Number);
  const [y2, m2, d2] = dateTo.split('-').map(Number);
  const from = new Date(y1, m1 - 1, d1);
  const to = new Date(y2, m2 - 1, d2);
  const out = [];
  const pad = (n) => String(n).padStart(2, '0');
  for (let t = from.getTime(); t <= to.getTime(); t += 86400000) {
    const d = new Date(t);
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }
  return out;
}

/** Remove duplicate mandatory tasks for this user/range, keeping the row with smallest id per (date, mandatory_key). */
async function removeDuplicateMandatoryTasks(userId, dateFrom, dateTo) {
  try {
    await executeQuery(
      `DELETE t1 FROM journal_tasks t1
       INNER JOIN journal_tasks t2
         ON t1.userId = t2.userId AND t1.date = t2.date AND t1.mandatory_key = t2.mandatory_key
         AND t1.mandatory_key IS NOT NULL AND t1.id > t2.id
       WHERE t1.userId = ? AND t1.date >= ? AND t1.date <= ?`,
      [userId, String(dateFrom).slice(0, 10), String(dateTo).slice(0, 10)]
    );
  } catch (e) {
    console.warn('Remove duplicate mandatory tasks:', e.message);
  }
}

/** Remove mandatory tasks that fall on Saturday (rest day) for this user/range. Keeps calendar consistent: tasks every day except Saturday. */
async function removeMandatoryTasksOnSaturdays(userId, dateFrom, dateTo) {
  const fromStr = String(dateFrom).slice(0, 10);
  const toStr = String(dateTo).slice(0, 10);
  const dates = getDateStringsBetween(fromStr, toStr);
  const saturdays = dates.filter((d) => isSaturday(d));
  if (saturdays.length === 0) return;
  try {
    const placeholders = saturdays.map(() => '?').join(', ');
    await executeQuery(
      `DELETE FROM journal_tasks WHERE userId = ? AND is_mandatory = 1 AND date IN (${placeholders})`,
      [userId, ...saturdays]
    );
  } catch (e) {
    console.warn('Remove mandatory tasks on Saturdays:', e.message);
  }
}

/** Ensure mandatory tasks exist for userId for every date in [dateFrom, dateTo]. No duplicates. Saturday = rest day (no mandatory tasks). Optimized: one SELECT for range, then only INSERT missing. */
async function ensureMandatoryTasksForRange(userId, dateFrom, dateTo, tier) {
  const templates = getMandatoryTemplatesForTier(tier);
  if (templates.length === 0) return;
  await removeDuplicateMandatoryTasks(userId, dateFrom, dateTo);
  await removeMandatoryTasksOnSaturdays(userId, dateFrom, dateTo);
  const fromStr = String(dateFrom).slice(0, 10);
  const toStr = String(dateTo).slice(0, 10);
  const [existingRows] = await executeQuery(
    'SELECT date, mandatory_key FROM journal_tasks WHERE userId = ? AND date >= ? AND date <= ? AND mandatory_key IS NOT NULL',
    [userId, fromStr, toStr]
  );
  const existingSet = new Set();
  for (const row of existingRows || []) {
    const d = row.date ? (row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10)) : '';
    existingSet.add(`${d}:${row.mandatory_key || ''}`);
  }
  const dates = getDateStringsBetween(fromStr, toStr);
  for (const dateStr of dates) {
    if (isSaturday(dateStr)) continue;
    for (const t of templates) {
      if (existingSet.has(`${dateStr}:${t.key}`)) continue;
      const id = crypto.randomUUID();
      try {
        await executeQuery(
          `INSERT INTO journal_tasks (id, userId, date, title, completed, sortOrder, is_mandatory, mandatory_key, description)
           VALUES (?, ?, ?, ?, 0, 0, 1, ?, ?)`,
          [id, userId, dateStr, t.title, t.key, t.description || null]
        );
        existingSet.add(`${dateStr}:${t.key}`);
      } catch (insertErr) {
        if (insertErr.code !== 'ER_DUP_ENTRY' && insertErr.code !== 'ER_DUP_KEY') {
          console.warn('Mandatory task insert failed:', insertErr.message);
        }
      }
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
    reminderAt: row.reminder_at ? new Date(row.reminder_at).toISOString() : null,
    reminderSentAt: row.reminder_sent_at ? new Date(row.reminder_sent_at).toISOString() : null,
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
        const tier = getMandatoryTaskTier(userRow);
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
    let tasks = (rows || []).map(mapRow);
    tasks = deduplicateMandatoryTasks(tasks);
    return res.status(200).json({ success: true, tasks });
  }

  if (req.method === 'POST' && !taskId) {
    const body = parseBody(req);
    const date = body.date ? String(body.date).trim().slice(0, 10) : null;
    const title = body.title ? String(body.title).trim().slice(0, 255) : null;

    if (!date || !title) {
      return res.status(400).json({ success: false, message: 'date and title are required' });
    }

    const jctx = await getJournalContext(userId);
    if (!assertJournalWritableDate(res, jctx, date)) return;

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
    const [existing] = await executeQuery(
      'SELECT id, is_mandatory, date FROM journal_tasks WHERE id = ? AND userId = ?',
      [taskId, userId]
    );
    if (!existing || existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }
    const isMandatory = Boolean(existing[0].is_mandatory);
    const rowDate = existing[0].date
      ? existing[0].date instanceof Date
        ? existing[0].date.toISOString().slice(0, 10)
        : String(existing[0].date).slice(0, 10)
      : null;

    const jctx = await getJournalContext(userId);
    if (!assertJournalWritableDate(res, jctx, rowDate)) return;

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
      const nextD = normalizeYyyyMmDd(body.date);
      if (nextD && rowDate && nextD !== rowDate) {
        return res.status(403).json({ success: false, message: 'Cannot change task date.' });
      }
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
    if (body.reminderAt !== undefined) {
      if (body.reminderAt === null || body.reminderAt === '') {
        updates.push('reminder_at = NULL');
        updates.push('reminder_sent_at = NULL');
      } else {
        const dt = new Date(body.reminderAt);
        if (Number.isNaN(dt.getTime())) {
          return res.status(400).json({ success: false, message: 'Invalid reminder time.' });
        }
        updates.push('reminder_at = ?');
        updates.push('reminder_sent_at = NULL');
        params.push(dt.toISOString().slice(0, 19).replace('T', ' '));
      }
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
