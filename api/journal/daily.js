/**
 * Journal Daily Notes API – per-user daily notes and mood for the task journal.
 * GET ?date=YYYY-MM-DD, PUT body { date, notes?, mood?, dayImages? }
 */

const { executeQuery } = require('../db');
const { verifyToken } = require('../utils/auth');
const { XP, awardOnce } = require('./xp-helper');
const { getJournalContext, assertJournalWritableDate } = require('../utils/journalWriteGuard');

const DAY_IMAGES_MAX = 8;
const DAY_IMAGE_MAX_LEN = 10485760;

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return {};
}

/** Same rules as task proof images (api/journal/tasks.js). */
function validateDayImageDataUrl(proof) {
  if (!proof || typeof proof !== 'string') {
    return { valid: false, message: 'Invalid image.' };
  }
  const s = proof.trim();
  if (!s) return { valid: false, message: 'Image is empty.' };
  if (!/^data:image\/(jpeg|jpg|png|gif|webp);base64,/i.test(s)) {
    return { valid: false, message: 'Image must be JPEG, PNG, GIF, or WebP.' };
  }
  const base64 = s.replace(/^data:image\/[^;]+;base64,/, '');
  if (base64.length < 500) {
    return { valid: false, message: 'Image is too small or empty.' };
  }
  try {
    const buf = Buffer.from(base64, 'base64');
    if (buf.length < 400) {
      return { valid: false, message: 'Image file is too small.' };
    }
  } catch {
    return { valid: false, message: 'Invalid image data.' };
  }
  return { valid: true };
}

function parseDayImagesColumn(raw) {
  if (raw == null) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => typeof x === 'string' && x.trim());
  } catch {
    return [];
  }
}

async function ensureDayImagesColumn() {
  try {
    await executeQuery(`
      ALTER TABLE journal_daily
      ADD COLUMN day_images MEDIUMTEXT NULL COMMENT 'JSON array of data-URL screenshots for the day'
    `);
  } catch (e) {
    const msg = e.message || String(e);
    if (!/Duplicate column name/i.test(msg)) {
      console.warn('journal_daily day_images column:', msg);
    }
  }
}

async function ensureDailyTable() {
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS journal_daily (
      userId INT NOT NULL,
      date DATE NOT NULL,
      notes TEXT DEFAULT NULL,
      mood VARCHAR(20) DEFAULT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (userId, date),
      INDEX idx_journal_daily_userId (userId)
    )
  `);
  await ensureDayImagesColumn();
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
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

  try {
    await ensureDailyTable();
  } catch (err) {
    console.error('Journal daily ensureDailyTable error:', err);
    return res.status(500).json({ success: false, message: 'Database error' });
  }

  if (req.method === 'GET') {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const date = url.searchParams.get('date') || null;
    if (!date) {
      return res.status(400).json({ success: false, message: 'date query required' });
    }
    const [rows] = await executeQuery(
      'SELECT date, notes, mood, day_images, updatedAt FROM journal_daily WHERE userId = ? AND date = ?',
      [userId, date.slice(0, 10)]
    );
    const row = rows[0];
    const dayImages = row ? parseDayImagesColumn(row.day_images) : [];
    const note = row
      ? {
          date: row.date ? String(row.date).slice(0, 10) : date.slice(0, 10),
          notes: row.notes ?? '',
          mood: row.mood ?? null,
          dayImages,
          updatedAt: row.updatedAt,
        }
      : { date: date.slice(0, 10), notes: '', mood: null, dayImages: [], updatedAt: null };
    return res.status(200).json({ success: true, note });
  }

  if (req.method === 'PUT') {
    const body = parseBody(req);
    const date = body.date ? String(body.date).trim().slice(0, 10) : null;
    if (!date) {
      return res.status(400).json({ success: false, message: 'date is required' });
    }
    const jctx = await getJournalContext(userId);
    if (!assertJournalWritableDate(res, jctx, date)) return;

    const notes = body.notes != null ? String(body.notes).slice(0, 8192) : null;
    const mood = body.mood != null ? String(body.mood).trim().slice(0, 20) : null;

    const dayImagesTouched = Object.prototype.hasOwnProperty.call(body, 'dayImages');
    let dayImagesJson = null;
    if (dayImagesTouched) {
      if (!Array.isArray(body.dayImages)) {
        return res.status(400).json({ success: false, message: 'dayImages must be an array' });
      }
      if (body.dayImages.length > DAY_IMAGES_MAX) {
        return res.status(400).json({ success: false, message: `At most ${DAY_IMAGES_MAX} images per day` });
      }
      const sanitized = [];
      for (let i = 0; i < body.dayImages.length; i += 1) {
        const item = body.dayImages[i];
        if (typeof item !== 'string' || !item.trim()) {
          return res.status(400).json({ success: false, message: 'Each image must be a non-empty data URL string' });
        }
        const trimmed = item.trim().slice(0, DAY_IMAGE_MAX_LEN);
        const v = validateDayImageDataUrl(trimmed);
        if (!v.valid) {
          return res.status(400).json({ success: false, message: v.message || 'Invalid image' });
        }
        sanitized.push(trimmed);
      }
      dayImagesJson = JSON.stringify(sanitized);
    }

    let dupSql = 'notes = COALESCE(?, notes), mood = COALESCE(?, mood)';
    const dupArgs = [notes, mood];
    if (dayImagesTouched) {
      dupSql += ', day_images = ?';
      dupArgs.push(dayImagesJson);
    }
    await executeQuery(
      `INSERT INTO journal_daily (userId, date, notes, mood, day_images) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE ${dupSql}`,
      [userId, date, notes || '', mood, dayImagesTouched ? dayImagesJson : null, ...dupArgs]
    );

    const xpResult = await awardOnce(userId, 'journal_note_saved', XP.SAVE_NOTE, null, date);

    const [rows] = await executeQuery(
      'SELECT date, notes, mood, day_images, updatedAt FROM journal_daily WHERE userId = ? AND date = ?',
      [userId, date]
    );
    const row = rows[0];
    const noteDayImages = row ? parseDayImagesColumn(row.day_images) : dayImagesTouched ? parseDayImagesColumn(dayImagesJson) : [];
    const note = row
      ? {
          date: String(row.date).slice(0, 10),
          notes: row.notes ?? '',
          mood: row.mood ?? null,
          dayImages: noteDayImages,
          updatedAt: row.updatedAt,
        }
      : {
          date,
          notes: notes || '',
          mood,
          dayImages: dayImagesTouched ? parseDayImagesColumn(dayImagesJson) : [],
          updatedAt: null,
        };
    return res.status(200).json({
      success: true,
      note,
      xpAwarded: xpResult.awarded ? xpResult.xpAdded : null,
    });
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
};
