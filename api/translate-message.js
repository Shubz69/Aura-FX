/**
 * POST /api/translate-message
 * Body: { text, sourceLanguage, targetLanguage, messageId }
 * Caches by (messageId, targetLanguage) in message_translations.
 */

const { executeQuery } = require('./db');
const { verifyToken } = require('./utils/auth');
const {
  ensureOriginalLanguageOnMessages,
  ensureMessageTranslationsTable,
} = require('./utils/ensure-community-message-translation-schema');
const {
  normalizeLang,
  translateMessageText,
} = require('./utils/communityTranslateEngine');
const { getEntitlements, getChannelPermissions } = require('./utils/entitlements');

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = Number(process.env.COMMUNITY_TRANSLATE_RATE_PER_MIN) || 45;
const rateBuckets = new Map();

function checkRateLimit(userId, cost = 1) {
  const uid = Number(userId);
  if (!uid) return false;
  const now = Date.now();
  const key = String(uid);
  let arr = rateBuckets.get(key) || [];
  arr = arr.filter((t) => now - t < RATE_WINDOW_MS);
  const c = Math.max(1, cost);
  if (arr.length + c > RATE_MAX) {
    rateBuckets.set(key, arr);
    return false;
  }
  for (let i = 0; i < c; i += 1) arr.push(now);
  rateBuckets.set(key, arr);
  if (rateBuckets.size > 20000) {
    const half = Array.from(rateBuckets.keys()).slice(0, 5000);
    half.forEach((k) => rateBuckets.delete(k));
  }
  return true;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded?.id) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  const userId = Number(decoded.id);
  if (!checkRateLimit(userId, 1)) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ success: false, message: 'Too many translation requests. Try again shortly.' });
  }

  const body = req.body || {};
  const text = body.text != null ? String(body.text) : '';
  const messageId = Number(body.messageId);
  const sourceLanguage = normalizeLang(body.sourceLanguage || 'en');
  const targetLanguage = normalizeLang(body.targetLanguage || 'en');

  if (!Number.isFinite(messageId) || messageId <= 0) {
    return res.status(400).json({ success: false, message: 'messageId is required' });
  }
  if (text.length > 16000) {
    return res.status(400).json({ success: false, message: 'Text too long' });
  }

  try {
    await ensureOriginalLanguageOnMessages();
    await ensureMessageTranslationsTable();
  } catch (e) {
    console.warn('translate-message schema ensure:', e.message);
  }

  if (sourceLanguage === targetLanguage) {
    return res.status(200).json({
      translatedText: text,
      sourceLanguage,
      targetLanguage,
      cached: false,
      translated: false,
    });
  }

  try {
    const [cachedRows] = await executeQuery(
      `SELECT translated_text, source_language FROM message_translations WHERE message_id = ? AND target_language = ? LIMIT 1`,
      [messageId, targetLanguage],
      { suppressErrorLog: true }
    );
    const hit = cachedRows && cachedRows[0];
    if (hit && typeof hit.translated_text === 'string' && hit.translated_text.length > 0) {
      return res.status(200).json({
        translatedText: hit.translated_text,
        sourceLanguage: normalizeLang(hit.source_language || sourceLanguage),
        targetLanguage,
        cached: true,
        translated: true,
      });
    }

    const [msgRows] = await executeQuery(
      `SELECT id, sender_id, channel_id, content, deleted_at, original_language FROM messages WHERE id = ? LIMIT 1`,
      [messageId]
    );
    const row = msgRows && msgRows[0];
    if (!row) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    const isDeleted = !!row.deleted_at || row.content === '[deleted]';
    if (isDeleted) {
      return res.status(400).json({ success: false, message: 'Message is not available for translation' });
    }

    const stored = String(row.content || '');
    if (stored !== text) {
      return res.status(400).json({ success: false, message: 'Text does not match stored message' });
    }

    const [userRows] = await executeQuery(
      'SELECT id, email, role, subscription_plan, subscription_status, subscription_expiry, payment_failed, onboarding_accepted, onboarding_subscription_snapshot FROM users WHERE id = ?',
      [userId]
    );
    const u = userRows && userRows[0];
    if (!u) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    let entitlements = getEntitlements(u);
    const jwtRole = (decoded.role || '').toString().toUpperCase();
    if (jwtRole === 'ADMIN' || jwtRole === 'SUPER_ADMIN') {
      entitlements = { ...entitlements, role: jwtRole, tier: 'ELITE', effectiveTier: 'ELITE' };
    }

    const cid = row.channel_id;
    const [chRows] = await executeQuery(
      `SELECT id, name, access_level, permission_type FROM channels
       WHERE id = ? OR CAST(id AS CHAR) = ? OR LOWER(CAST(id AS CHAR)) = LOWER(?) LIMIT 1`,
      [cid, String(cid), String(cid)]
    );
    const channelRow = chRows && chRows[0];
    if (!channelRow) {
      return res.status(403).json({ success: false, message: 'You cannot access this message' });
    }

    const perm = getChannelPermissions(entitlements, {
      id: channelRow.id,
      name: channelRow.name,
      access_level: channelRow.access_level,
      accessLevel: channelRow.access_level,
      permission_type: channelRow.permission_type,
      permissionType: channelRow.permission_type,
    });
    if (!perm.canSee || !perm.canRead) {
      return res.status(403).json({ success: false, message: 'You cannot access this message' });
    }

    let out;
    try {
      out = await translateMessageText({
        text: stored,
        sourceLanguage,
        targetLanguage,
      });
    } catch (trErr) {
      console.warn('translate-message provider:', trErr.message);
      return res.status(200).json({
        translatedText: text,
        sourceLanguage,
        targetLanguage,
        translated: false,
        fallbackOriginal: true,
      });
    }

    if (!out.translated) {
      return res.status(200).json({
        translatedText: text,
        sourceLanguage,
        targetLanguage,
        cached: false,
        translated: false,
      });
    }

    try {
      await executeQuery(
        `INSERT INTO message_translations (message_id, target_language, source_language, translated_text)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE translated_text = VALUES(translated_text), source_language = VALUES(source_language), updated_at = NOW()`,
        [messageId, targetLanguage, sourceLanguage, out.text]
      );
    } catch (insErr) {
      console.warn('message_translations insert:', insErr.message);
    }

    return res.status(200).json({
      translatedText: out.text,
      sourceLanguage,
      targetLanguage,
      cached: false,
      translated: true,
    });
  } catch (err) {
    console.error('translate-message:', err);
    return res.status(200).json({
      translatedText: text,
      sourceLanguage,
      targetLanguage,
      translated: false,
      fallbackOriginal: true,
    });
  }
};
