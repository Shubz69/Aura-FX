/**
 * Trader Deck content API – date-scoped Market Outlook and Market Intelligence.
 * GET ?type=outlook-daily|outlook-weekly|intel-daily|intel-weekly&date=YYYY-MM-DD
 * PUT (admin) body: { type, date, payload } for outlook; intel briefs are managed via brief-upload + list.
 *
 * Intel GET: optional `autogen=1` may trigger background generation when rows are sparse (cron is primary).
 * Default is no autogen on read — avoids regenerating on every page load. When a weekend date has no rows yet, walks back
 * up to five UK weekdays for content; see `briefsSourceDate` and optional `weekendFallback`.
 */

require('../utils/suppress-warnings');

const { executeQuery, addColumnIfNotExists } = require('../db');
const { verifyToken } = require('../utils/auth');
const { DateTime } = require('luxon');
const {
  generateAndStoreInstitutionalBriefOnly,
  isTraderDeskAutomationConfigured,
} = require('./services/autoBriefGenerator');
const {
  isLondonWeekendYmd,
  priorLondonWeekdayYmd,
  getWeekEndingSundayUtcYmd,
} = require('./deskDates');
const { sanitizeTraderDeskPayloadDeep } = require('../../src/utils/sanitizeAiDeskOutput');
const {
  DESK_AUTOMATION_CATEGORY_KINDS,
  expectedIntelAutomationRowCount,
  INSTITUTIONAL_WEEKLY_WFA_KINDS,
  INSTITUTIONAL_DAILY_WFA_KINDS,
  isLegacyGeneralBriefKind,
  canonicalDeskCategoryKind,
  intelResponseBriefKindSlug,
} = require('./deskBriefKinds');

/** Detect category sleeve rows still on the pre–PDF-template body shape (Market Context sections, etc.). */
async function deskCategoryBriefsNeedPdfReshape(briefsDate, period) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(briefsDate || ''))) return false;
  if (period !== 'daily' && period !== 'weekly') return false;
  /** Legacy markdown-era bodies vs PDF-aligned plain-text — check institutional sleeves only */
  const marker =
    period === 'weekly'
      ? 'Early week (Mon–Tue)'
      : 'DAY NAME';
  const canonKinds =
    period === 'weekly' ? [...INSTITUTIONAL_WEEKLY_WFA_KINDS] : [...INSTITUTIONAL_DAILY_WFA_KINDS];
  const kindPlaceholders = canonKinds.map(() => '?').join(',');
  try {
    const [rows] = await executeQuery(
      `SELECT COUNT(*) AS n FROM trader_deck_briefs
       WHERE date = ? AND period = ?
         AND LOWER(brief_kind) IN (${kindPlaceholders})
         AND (
           file_data IS NULL
           OR INSTR(CONVERT(file_data USING utf8mb4), ?) > 0
           OR INSTR(CONVERT(file_data USING utf8mb4), ?) = 0
         )`,
      [
        briefsDate,
        period,
        ...canonKinds,
        marker,
        period === 'weekly' ? 'WHAT MATTERS THIS WEEK STRUCTURALLY' : 'MARKET THEMES DOMINATING TODAY',
      ]
    );
    return Number(rows?.[0]?.n || 0) > 0;
  } catch (_) {
    return false;
  }
}

/** In-memory throttle when the intel pack is complete (steady-state reads). */
const INTEL_GAP_FILL_COOLDOWN_MS = 3 * 60 * 1000;
/** While the pack is still missing sleeves, allow gap-fill triggers much more often so sequential generation can advance. */
const INTEL_GAP_FILL_COOLDOWN_INCOMPLETE_MS = 35 * 1000;
const intelGapFillCooldown = new Map();

/** Throttle intel GET logs while UI polls every few seconds for gap-fill (avoid noisy Runtime Logs). */
const intelContentReadLogLast = new Map();
const INTEL_CONTENT_READ_LOG_MIN_MS = 12000;

function maybeLogIntelContentRead(payload, ctx) {
  try {
    if (payload?.categorySleevePack?.institutionalPresent) return;
    const key = `${ctx.type}:${ctx.briefsSourceDate || ''}:${ctx.autoGenerate ? 1 : 0}`;
    const now = Date.now();
    const prev = intelContentReadLogLast.get(key) || 0;
    if (now - prev < INTEL_CONTENT_READ_LOG_MIN_MS) return;
    intelContentReadLogLast.set(key, now);
    if (intelContentReadLogLast.size > 200) {
      const cutoff = now - 3600000;
      for (const [k, t] of intelContentReadLogLast) {
        if (t < cutoff) intelContentReadLogLast.delete(k);
      }
    }
  } catch (_) {
    /* ignore throttle bookkeeping */
  }
  console.log(
    '[trader-deck/content]',
    JSON.stringify({
      event: 'intel_get',
      type: ctx.type,
      storageDate: ctx.date,
      queryDateRaw: ctx.dateRaw,
      briefsSourceDate: ctx.briefsSourceDate,
      autogen: Boolean(ctx.autoGenerate),
      briefsReturned: payload.briefs?.length ?? 0,
      dbRowsRead: ctx.dbRowsRead,
      sleeveLoaded: payload.categorySleevePack?.loaded,
      sleeveExpected: payload.categorySleevePack?.expected,
      deskAutomationConfigured: payload.deskAutomationConfigured,
      weekendFallback: Boolean(ctx.weekendFallback),
    })
  );
}

function briefKindsSet(rows) {
  return new Set((rows || []).map((r) => canonicalDeskCategoryKind(String(r?.brief_kind || ''))));
}

/** Resolved `briefKind` slugs (including legacy DB rows mapped onto the eight WFA sleeves). */
function intelResolvedSlugSet(rows, period) {
  const out = new Set();
  for (const r of rows || []) {
    const slug = intelResponseBriefKindSlug(r?.brief_kind, period);
    if (slug) out.add(String(slug).toLowerCase());
  }
  return out;
}

/** True when all eight institutional PDF/WFA briefs exist for the period (daily or weekly). */
function isIntelAutomationPackComplete(rows, period) {
  const kinds = intelResolvedSlugSet(rows, period);
  const list = period === 'weekly' ? INSTITUTIONAL_WEEKLY_WFA_KINDS : INSTITUTIONAL_DAILY_WFA_KINDS;
  return list.every((k) => kinds.has(String(k).toLowerCase()));
}

/**
 * One row per resolved institutional slug; prefer rows whose DB `brief_kind` already matches the slug,
 * else highest `brief_version`.
 */
function pickIntelResponseRows(rows, period) {
  const slugFor = (r) => intelResponseBriefKindSlug(r?.brief_kind, period);
  const bySlug = new Map();
  for (const r of rows || []) {
    const s = slugFor(r);
    if (!s) continue;
    const key = String(s).toLowerCase();
    const existing = bySlug.get(key);
    if (!existing) {
      bySlug.set(key, r);
      continue;
    }
    const rawE = String(existing.brief_kind || '').toLowerCase();
    const rawR = String(r.brief_kind || '').toLowerCase();
    const eExact = rawE === key;
    const rExact = rawR === key;
    if (rExact && !eExact) {
      bySlug.set(key, r);
      continue;
    }
    if (!rExact && eExact) continue;
    if (Number(r.brief_version || 1) > Number(existing.brief_version || 1)) bySlug.set(key, r);
  }
  const list = period === 'weekly' ? INSTITUTIONAL_WEEKLY_WFA_KINDS : INSTITUTIONAL_DAILY_WFA_KINDS;
  const order = new Map(list.map((k, i) => [String(k).toLowerCase(), i]));
  return [...bySlug.values()].sort((a, b) => {
    const ka = slugFor(a);
    const kb = slugFor(b);
    return (order.get(String(ka || '').toLowerCase()) ?? 99) - (order.get(String(kb || '').toLowerCase()) ?? 99);
  });
}

function shouldTriggerIntelGapFill({ period, briefsDate, autoGenerate, packIncomplete }) {
  if (autoGenerate) return true;
  const key = `${period}:${briefsDate}`;
  const now = Date.now();
  const last = intelGapFillCooldown.get(key) || 0;
  const cooldownMs =
    packIncomplete === true ? INTEL_GAP_FILL_COOLDOWN_INCOMPLETE_MS : INTEL_GAP_FILL_COOLDOWN_MS;
  if (now - last < cooldownMs) return false;
  intelGapFillCooldown.set(key, now);
  return true;
}

const VALID_TYPES = ['outlook-daily', 'outlook-weekly', 'intel-daily', 'intel-weekly'];
const VALID_PERIODS = ['daily', 'weekly'];

/** Normalize date to YYYY-MM-DD (accepts YYYYMMDD or YYYY-MM-DD). */
function normalizeDate(str) {
  if (!str || typeof str !== 'string') return '';
  const s = str.trim().replace(/\D/g, '');
  if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return str.trim().slice(0, 10);
}

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
    CREATE TABLE IF NOT EXISTS trader_deck_outlook (
      id INT AUTO_INCREMENT PRIMARY KEY,
      date DATE NOT NULL,
      period VARCHAR(20) NOT NULL,
      payload JSON NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_date_period (date, period),
      INDEX idx_tdo_date (date)
    )
  `);
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS trader_deck_briefs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      date DATE NOT NULL,
      period VARCHAR(20) NOT NULL,
      title VARCHAR(255) NOT NULL,
      file_url VARCHAR(512) DEFAULT NULL,
      mime_type VARCHAR(128) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tdb_date_period (date, period)
    )
  `);
  await addColumnIfNotExists('trader_deck_briefs', 'file_data', 'LONGBLOB DEFAULT NULL');
  await addColumnIfNotExists('trader_deck_briefs', 'brief_kind', "VARCHAR(40) NOT NULL DEFAULT 'general'");
  await addColumnIfNotExists('trader_deck_briefs', 'brief_version', 'INT NOT NULL DEFAULT 1');
  try {
    await executeQuery('CREATE INDEX idx_tdb_date_period_kind_created ON trader_deck_briefs (date, period, brief_kind, created_at)');
  } catch (_) {
    // ignore duplicate-index errors across deployments
  }
}

let ensureTablesPromise = null;
async function ensureTablesOnce() {
  if (!ensureTablesPromise) {
    ensureTablesPromise = ensureTables().catch((err) => {
      ensureTablesPromise = null;
      throw err;
    });
  }
  return ensureTablesPromise;
}

function typeToPeriod(type) {
  if (type === 'outlook-daily' || type === 'intel-daily') return 'daily';
  if (type === 'outlook-weekly' || type === 'intel-weekly') return 'weekly';
  return null;
}

function normalizeStorageDateByType(type, date) {
  const period = typeToPeriod(type);
  if (period === 'weekly') return getWeekEndingSundayUtcYmd(date);
  return date;
}

function periodDateToRunDate(period, dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return new Date();
  const zone = 'Europe/London';
  if (period === 'weekly') {
    return DateTime.fromISO(`${dateStr}T00:30:00`, { zone }).toJSDate();
  }
  return DateTime.fromISO(`${dateStr}T06:30:00`, { zone }).toJSDate();
}

async function ensureAutoGeneratedBriefsIfMissing({ date, period, autoGenerate = true }) {
  if (!autoGenerate) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return;
  if (period !== 'daily' && period !== 'weekly') return;
  if (!isTraderDeskAutomationConfigured()) {
    console.warn("[trader-deck/content] intel autogen skipped: PERPLEXITY_API_KEY is not set (institutional brief)");
    return;
  }
  try {
    if (period === 'weekly') {
      const ph = INSTITUTIONAL_WEEKLY_WFA_KINDS.map(() => '?').join(',');
      const [rows] = await executeQuery(
        `SELECT COUNT(DISTINCT brief_kind) AS c FROM trader_deck_briefs
         WHERE date = ? AND period = 'weekly' AND brief_kind IN (${ph})`,
        [date, ...INSTITUTIONAL_WEEKLY_WFA_KINDS]
      );
      if (Number(rows?.[0]?.c || 0) >= INSTITUTIONAL_WEEKLY_WFA_KINDS.length) return;
    } else {
      const ph = INSTITUTIONAL_DAILY_WFA_KINDS.map(() => '?').join(',');
      const [rows] = await executeQuery(
        `SELECT COUNT(DISTINCT brief_kind) AS c FROM trader_deck_briefs
         WHERE date = ? AND period = 'daily' AND brief_kind IN (${ph})`,
        [date, ...INSTITUTIONAL_DAILY_WFA_KINDS]
      );
      if (Number(rows?.[0]?.c || 0) >= INSTITUTIONAL_DAILY_WFA_KINDS.length) return;
    }
  } catch (_) {
    /* fall through to generation attempt */
  }
  const runDate = periodDateToRunDate(period, date);
  try {
    await generateAndStoreInstitutionalBriefOnly({
      period,
      runDate,
      timeZone: 'Europe/London',
    });
  } catch (_) {
    // Keep content endpoint resilient even if generation fails.
  }
}

const BRIEF_KIND_ORDER_SQL =
  "CASE COALESCE(LOWER(brief_kind), '') " +
  "WHEN 'aura_sunday_market_open' THEN 0 " +
  "WHEN 'aura_institutional_daily_forex' THEN 0 " +
  "WHEN 'aura_institutional_daily_crypto' THEN 0 " +
  "WHEN 'aura_institutional_daily_commodities' THEN 0 " +
  "WHEN 'aura_institutional_daily_etfs' THEN 0 " +
  "WHEN 'aura_institutional_daily_stocks' THEN 0 " +
  "WHEN 'aura_institutional_daily_indices' THEN 0 " +
  "WHEN 'aura_institutional_daily_bonds' THEN 0 " +
  "WHEN 'aura_institutional_daily_futures' THEN 0 " +
  "WHEN 'aura_institutional_daily' THEN 0 " +
  "WHEN 'aura_institutional_weekly_forex' THEN 1 " +
  "WHEN 'aura_institutional_weekly_crypto' THEN 1 " +
  "WHEN 'aura_institutional_weekly_commodities' THEN 1 " +
  "WHEN 'aura_institutional_weekly_etfs' THEN 1 " +
  "WHEN 'aura_institutional_weekly_stocks' THEN 1 " +
  "WHEN 'aura_institutional_weekly_indices' THEN 1 " +
  "WHEN 'aura_institutional_weekly_bonds' THEN 1 " +
  "WHEN 'aura_institutional_weekly_futures' THEN 1 " +
  "WHEN 'aura_institutional_weekly' THEN 1 " +
  "WHEN 'global_macro' THEN 2 " +
  "WHEN 'indices' THEN 2 " +
  "WHEN 'equities' THEN 3 " +
  "WHEN 'stocks' THEN 3 " +
  "WHEN 'forex' THEN 4 " +
  "WHEN 'commodities' THEN 5 " +
  "WHEN 'futures' THEN 5 " +
  "WHEN 'fixed_income' THEN 6 " +
  "WHEN 'bonds' THEN 6 " +
  "WHEN 'crypto' THEN 7 " +
  "WHEN 'geopolitics' THEN 8 " +
  "WHEN 'market_sentiment' THEN 9 " +
  "WHEN 'etfs' THEN 9 " +
  "WHEN 'general' THEN 10 " +
  "ELSE 99 END";

async function requireAdmin(req) {
  const decoded = verifyToken(req.headers.authorization);
  if (!decoded || !decoded.id) return { ok: false, status: 401, message: 'Authentication required' };
  const [rows] = await executeQuery(
    'SELECT role FROM users WHERE id = ? LIMIT 1',
    [Number(decoded.id)]
  );
  const role = (rows[0]?.role || '').toString().toLowerCase();
  if (role !== 'admin' && role !== 'super_admin') {
    return { ok: false, status: 403, message: 'Admin access required' };
  }
  return { ok: true, decoded };
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await ensureTablesOnce();
  } catch (err) {
    console.error('Trader deck content ensureTables:', err.message);
    return res.status(500).json({ success: false, message: 'Database error' });
  }

  let url;
  try {
    url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
  } catch (urlErr) {
    return res.status(400).json({ success: false, message: 'Invalid request URL' });
  }
  const queryType = (url.searchParams.get('type') || '').toLowerCase();
  const queryDate = normalizeDate(url.searchParams.get('date') || '');
  /** Explicit opt-in only — cron / admin tools should drive generation; normal UI reads must not stampede the model. */
  const autoGenerate = (url.searchParams.get('autogen') || '0') === '1';

  if (req.method === 'PUT') {
    const body = parseBody(req);
    const putType = (body.type || queryType || '').toLowerCase();
    const putDateRaw = normalizeDate(body.date || queryDate || '');
    if (!VALID_TYPES.includes(putType) || !/^\d{4}-\d{2}-\d{2}$/.test(putDateRaw)) {
      return res.status(400).json({ success: false, message: 'Invalid type or date. Use type=outlook-daily|outlook-weekly|intel-daily|intel-weekly and date=YYYY-MM-DD' });
    }
    const putDate = normalizeStorageDateByType(putType, putDateRaw);
    let admin;
    try {
      admin = await requireAdmin(req);
    } catch (authErr) {
      console.error('Trader deck content requireAdmin:', authErr.message);
      return res.status(500).json({ success: false, message: 'Authentication error' });
    }
    if (!admin.ok) return res.status(admin.status).json({ success: false, message: admin.message });

    if (putType.startsWith('outlook')) {
      const payload = body.payload;
      if (payload === undefined || payload === null) {
        return res.status(400).json({ success: false, message: 'payload required' });
      }
      try {
        const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
        const putPeriod = typeToPeriod(putType);
        await executeQuery(
          `INSERT INTO trader_deck_outlook (date, period, payload) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = CURRENT_TIMESTAMP`,
          [putDate, putPeriod, payloadStr]
        );
        return res.status(200).json({ success: true, date: putDate, type: putType });
      } catch (err) {
        console.error('Trader deck content PUT error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to save outlook' });
      }
    }

    if (putType.startsWith('intel')) {
      return res.status(400).json({ success: false, message: 'Use POST /api/trader-deck/brief-upload to add briefs; DELETE /api/trader-deck/brief to remove.' });
    }
    return res.status(400).json({ success: false, message: 'Invalid type' });
  }

  const type = queryType;
  const dateRaw = queryDate;
  if (!VALID_TYPES.includes(type) || !/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
    return res.status(400).json({ success: false, message: 'Invalid type or date. Use type=outlook-daily|outlook-weekly|intel-daily|intel-weekly and date=YYYY-MM-DD' });
  }
  const date = normalizeStorageDateByType(type, dateRaw);

  const period = typeToPeriod(type);
  const isOutlook = type.startsWith('outlook');
  const isIntel = type.startsWith('intel');

  if (req.method === 'GET') {
    // JSON must not be edge-cached: 304 responses skip the function and look like "no logs"
    // while the UI can appear stuck on an empty or stale briefs payload.
    res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Vary', 'Authorization');

    if (isOutlook) {
      const [rows] = await executeQuery(
        'SELECT payload, updated_at FROM trader_deck_outlook WHERE date = ? AND period = ? LIMIT 1',
        [date, period]
      );
      const row = rows[0];
      if (!row) return res.status(200).json({ success: true, payload: null, date, type });
      let payload = row.payload;
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch { payload = null; }
      }
      const safePayload =
        payload && typeof payload === 'object' ? sanitizeTraderDeskPayloadDeep(payload) : payload;
      return res.status(200).json({
        success: true,
        payload: safePayload,
        updatedAt: row.updated_at,
        date,
        type,
      });
    }
    if (isIntel) {
      const readBriefRowsFor = async (day) => {
        const [rowList] = await executeQuery(
          `SELECT id, title, file_url, mime_type, created_at,
                  COALESCE(brief_kind, '') AS brief_kind,
                  COALESCE(brief_version, 1) AS brief_version
           FROM trader_deck_briefs
           WHERE date = ? AND period = ?
           ORDER BY ${BRIEF_KIND_ORDER_SQL}, brief_version DESC, created_at DESC`,
          [day, period]
        );
        return Array.isArray(rowList) ? rowList : [];
      };
      let briefsDate = date;
      let rows = await readBriefRowsFor(briefsDate);
      let weekendFallback = false;
      if (period === 'daily' && isLondonWeekendYmd(date) && rows.length === 0) {
        weekendFallback = true;
        let probe = priorLondonWeekdayYmd(date);
        let found = null;
        for (let step = 0; step < 5; step++) {
          const tryRows = await readBriefRowsFor(probe);
          if (tryRows.length > 0) {
            found = { day: probe, rows: tryRows };
            break;
          }
          probe = priorLondonWeekdayYmd(probe);
        }
        if (found) {
          briefsDate = found.day;
          rows = found.rows;
        } else {
          briefsDate = priorLondonWeekdayYmd(date);
          rows = await readBriefRowsFor(briefsDate);
        }
      }

      const autogenAnchor = briefsDate;
      const expectedRows = expectedIntelAutomationRowCount(period);
      const rowsForIntelResponse = pickIntelResponseRows(rows, period);
      const packIncomplete =
        rowsForIntelResponse.length < expectedRows || !isIntelAutomationPackComplete(rows, period);
      const needsPdfReshape = await deskCategoryBriefsNeedPdfReshape(autogenAnchor, period);
      const packNeedsWork = packIncomplete || needsPdfReshape;
      /**
       * Partial DB rows (e.g. only `stocks`) used to leave users stuck: list reads used `autogen=0`, so
       * gap-fill never ran. Trigger the same background jobs as explicit autogen when the pack is
       * incomplete, with a cooldown unless `autogen=1`.
       * Also backfill when all rows exist but bodies are legacy (Market Context-era) — `reserveRun`
       * then replaces stored blobs with PDF-aligned markdown on the next category generation pass.
       */
      if (
        packNeedsWork &&
        isTraderDeskAutomationConfigured() &&
        shouldTriggerIntelGapFill({
          period,
          briefsDate: autogenAnchor,
          autoGenerate,
          packIncomplete: packNeedsWork,
        })
      ) {
        Promise.resolve()
          .then(() => ensureAutoGeneratedBriefsIfMissing({ date: autogenAnchor, period, autoGenerate: true }))
          .catch(() => {});
      }
      const briefs = rowsForIntelResponse.map((r) => ({
        id: r.id,
        title: r.title || 'Brief',
        briefKind: intelResponseBriefKindSlug(r.brief_kind, period),
        briefVersion: Number(r.brief_version || 1),
        previewUrl: r.file_url ? null : `/api/trader-deck/brief-preview?id=${r.id}`,
        fileUrl: r.file_url || null,
        mimeType: r.mime_type || null,
        createdAt: r.created_at,
      }));
      const resolvedSlugSet = intelResolvedSlugSet(rows, period);
      const expectedInstKinds = period === 'weekly' ? INSTITUTIONAL_WEEKLY_WFA_KINDS : INSTITUTIONAL_DAILY_WFA_KINDS;
      const institutionalPdfComplete = expectedInstKinds.every((k) =>
        resolvedSlugSet.has(String(k).toLowerCase())
      );
      const payload = {
        success: true,
        briefs,
        date,
        type,
        briefsSourceDate: briefsDate,
        /** Institutional (+ Sunday open) rows returned in `briefs`; legacy desk rows are omitted. */
        briefsRowCount: briefs.length,
        /** Whether automated desk brief generation can run on this deployment (requires hosted API keys). */
        deskAutomationConfigured: Boolean(isTraderDeskAutomationConfigured()),
        /** Eight canonical PDF/WFA brief kinds for this period. */
        categorySleevePack: {
          expected: expectedInstKinds.length,
          loaded: expectedInstKinds.filter((k) => resolvedSlugSet.has(String(k).toLowerCase())).length,
          missingKinds: expectedInstKinds.filter((k) => !resolvedSlugSet.has(String(k).toLowerCase())),
          institutionalPresent: institutionalPdfComplete,
        },
      };
      if (weekendFallback) payload.weekendFallback = true;
      maybeLogIntelContentRead(payload, {
        type,
        date,
        dateRaw,
        briefsSourceDate: briefsDate,
        autoGenerate,
        dbRowsRead: Array.isArray(rows) ? rows.length : 0,
        weekendFallback,
      });
      return res.status(200).json(payload);
    }
    return res.status(400).json({ success: false, message: 'Invalid type' });
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
};
