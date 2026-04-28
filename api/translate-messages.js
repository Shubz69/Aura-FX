/**
 * POST /api/translate-messages
 * Body: { targetLanguage: string, items: [{ messageId, text, sourceLanguage }] }
 * DB cache first; provider only for misses when configured (same rules as translate-message).
 */

const { executeQuery } = require('./db');
const { verifyToken } = require('./utils/auth');
const {
  ensureOriginalLanguageOnMessages,
  ensureMessageTranslationsTable,
} = require('./utils/ensure-community-message-translation-schema');
const { normalizeLang, translateMessageText } = require('./utils/communityTranslateEngine');
const { getEntitlements, getChannelPermissions } = require('./utils/entitlements');

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = Number(process.env.COMMUNITY_TRANSLATE_RATE_PER_MIN) || 60;
const rateBuckets = new Map();
const MAX_ITEMS = 20;

function checkRateLimit(userId, cost = 1) {
  const uid = Number(userId);
  if (!uid) return false;
  const now = Date.now();
  const key = String(uid);
  let arr = rateBuckets.get(key) || [];
  arr = arr.filter((t) => now - t < RATE_WINDOW_MS);
  const c = Math.max(1, Math.min(cost, MAX_ITEMS));
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

async function loadUserEntitlements(userId, decoded) {
  const [userRows] = await executeQuery(
    'SELECT id, email, role, subscription_plan, subscription_status, subscription_expiry, payment_failed, onboarding_accepted, onboarding_subscription_snapshot FROM users WHERE id = ?',
    [userId]
  );
  const u = userRows && userRows[0];
  if (!u) return null;
  let entitlements = getEntitlements(u);
  const jwtRole = (decoded.role || '').toString().toUpperCase();
  if (jwtRole === 'ADMIN' || jwtRole === 'SUPER_ADMIN') {
    entitlements = { ...entitlements, role: jwtRole, tier: 'ELITE', effectiveTier: 'ELITE' };
  }
  return { user: u, entitlements };
}

async function canReadMessage(entitlements, row) {
  const cid = row.channel_id;
  const [chRows] = await executeQuery(
    `SELECT id, name, access_level, permission_type FROM channels
     WHERE id = ? OR CAST(id AS CHAR) = ? OR LOWER(CAST(id AS CHAR)) = LOWER(?) LIMIT 1`,
    [cid, String(cid), String(cid)]
  );
  const channelRow = chRows && chRows[0];
  if (!channelRow) return false;
  const perm = getChannelPermissions(entitlements, {
    id: channelRow.id,
    name: channelRow.name,
    access_level: channelRow.access_level,
    accessLevel: channelRow.access_level,
    permission_type: channelRow.permission_type,
    permissionType: channelRow.permission_type,
  });
  return perm.canSee && perm.canRead;
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

  const body = req.body || {};
  const targetLanguage = normalizeLang(body.targetLanguage || 'en');
  const rawItems = Array.isArray(body.items) ? body.items : [];

  const byIdLast = new Map();
  for (const x of rawItems) {
    const id = Number(x.messageId);
    if (!Number.isFinite(id) || id <= 0) continue;
    byIdLast.set(id, x);
  }
  const items = Array.from(byIdLast.values())
    .slice(0, MAX_ITEMS)
    .map((it) => ({
      messageId: Number(it.messageId),
      text: it.text != null ? String(it.text) : '',
      sourceLanguage: normalizeLang(it.sourceLanguage || 'en'),
    }))
    .filter((it) => it.text.length > 0 && it.text.length <= 16000);

  if (items.length === 0) {
    return res.status(400).json({ success: false, message: 'items[] is required' });
  }

  if (!checkRateLimit(userId, items.length)) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ success: false, message: 'Too many translation requests. Try again shortly.' });
  }

  try {
    await ensureOriginalLanguageOnMessages();
    await ensureMessageTranslationsTable();
  } catch (e) {
    console.warn('translate-messages schema ensure:', e.message);
  }

  const ent = await loadUserEntitlements(userId, decoded);
  if (!ent) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  const { entitlements } = ent;

  const ids = items.map((i) => i.messageId);
  const placeholders = ids.map(() => '?').join(',');
  const [msgRows] = await executeQuery(
    `SELECT id, sender_id, channel_id, content, deleted_at, original_language FROM messages WHERE id IN (${placeholders})`,
    ids
  );
  const byMsg = new Map((msgRows || []).map((r) => [Number(r.id), r]));

  let cacheMap = new Map();
  try {
    const [cacheRows] = await executeQuery(
      `SELECT message_id, translated_text, source_language FROM message_translations WHERE target_language = ? AND message_id IN (${placeholders})`,
      [targetLanguage, ...ids]
    );
    cacheMap = new Map((cacheRows || []).map((r) => [Number(r.message_id), r]));
  } catch (e) {
    cacheMap = new Map();
  }

  const results = [];
  for (const it of items) {
    const src = it.sourceLanguage;
    const tgt = targetLanguage;
    if (src === tgt) {
      results.push({
        messageId: it.messageId,
        translatedText: it.text,
        sourceLanguage: src,
        targetLanguage: tgt,
        cached: false,
        translated: false,
      });
      continue;
    }

    const ch = cacheMap.get(it.messageId);
    if (ch && typeof ch.translated_text === 'string' && ch.translated_text.length > 0) {
      results.push({
        messageId: it.messageId,
        translatedText: ch.translated_text,
        sourceLanguage: normalizeLang(ch.source_language || src),
        targetLanguage: tgt,
        cached: true,
        translated: true,
      });
      continue;
    }

    const row = byMsg.get(it.messageId);
    if (!row) {
      results.push({
        messageId: it.messageId,
        translatedText: it.text,
        sourceLanguage: src,
        targetLanguage: tgt,
        cached: false,
        translated: false,
      });
      continue;
    }

    const isDeleted = !!row.deleted_at || row.content === '[deleted]';
    if (isDeleted) {
      results.push({
        messageId: it.messageId,
        translatedText: it.text,
        sourceLanguage: src,
        targetLanguage: tgt,
        cached: false,
        translated: false,
      });
      continue;
    }

    const stored = String(row.content || '');
    if (stored !== it.text) {
      results.push({
        messageId: it.messageId,
        translatedText: it.text,
        sourceLanguage: src,
        targetLanguage: tgt,
        cached: false,
        translated: false,
      });
      continue;
    }

    const okRead = await canReadMessage(entitlements, row);
    if (!okRead) {
      results.push({
        messageId: it.messageId,
        translatedText: it.text,
        sourceLanguage: src,
        targetLanguage: tgt,
        cached: false,
        translated: false,
      });
      continue;
    }

    const out = await translateMessageText({
      text: stored,
      sourceLanguage: src,
      targetLanguage: tgt,
    });

    if (!out.translated) {
      results.push({
        messageId: it.messageId,
        translatedText: it.text,
        sourceLanguage: src,
        targetLanguage: tgt,
        cached: false,
        translated: false,
      });
      continue;
    }

    try {
      await executeQuery(
        `INSERT INTO message_translations (message_id, target_language, source_language, translated_text)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE translated_text = VALUES(translated_text), source_language = VALUES(source_language), updated_at = NOW()`,
        [it.messageId, tgt, src, out.text]
      );
    } catch (insErr) {
      console.warn('message_translations batch insert:', insErr.message);
    }

    results.push({
      messageId: it.messageId,
      translatedText: out.text,
      sourceLanguage: src,
      targetLanguage: tgt,
      cached: false,
      translated: true,
    });
  }

  return res.status(200).json({
    success: true,
    targetLanguage,
    results,
  });
};
