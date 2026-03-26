const { executeQuery, addColumnIfNotExists } = require('../../db');
const { runEngine } = require('../marketIntelligenceEngine');
const { getTemplate, normalizePeriod, parseTemplateFromText } = require('./briefTemplateService');
const { getOpenAIModelForChat } = require('../../ai/openai-config');
const { fetchWithTimeout } = require('./fetchWithTimeout');
const { enrichTraderDeckPayload } = require('../openaiTraderInsights');

const SOURCE_MARKER_RE = /(https?:\/\/|www\.|source\s*:|sources\s*:|according to|reuters|bloomberg|fmp|finnhub|forex factory|trading economics)/i;
const BRIEF_KIND_ORDER = ['general', 'stocks', 'indices', 'futures', 'forex', 'crypto', 'commodities', 'bonds', 'etfs'];
const BRIEF_KIND_LABELS = {
  general: 'General Market Brief',
  stocks: 'Stocks Brief',
  indices: 'Indices Brief',
  futures: 'Futures Brief',
  forex: 'Forex Brief',
  crypto: 'Crypto Brief',
  commodities: 'Commodities Brief',
  bonds: 'Bonds Brief',
  etfs: 'ETFs Brief',
};
const BRIEF_KIND_TOP5 = {
  general: ['EURUSD', 'XAUUSD', 'US500', 'BTCUSD', 'US10Y'],
  stocks: ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN'],
  indices: ['US500', 'NAS100', 'US30', 'GER40', 'UK100'],
  futures: ['ES1!', 'NQ1!', 'CL1!', 'GC1!', 'ZN1!'],
  forex: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCHF'],
  crypto: ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'BNBUSD'],
  commodities: ['XAUUSD', 'XAGUSD', 'WTI', 'BRENT', 'NATGAS'],
  bonds: ['US02Y', 'US05Y', 'US10Y', 'US30Y', 'DE10Y'],
  etfs: ['SPY', 'QQQ', 'IWM', 'GLD', 'TLT'],
};

function toYmdInTz(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getWeekEndingSunday(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return dateStr;
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const day = d.getUTCDay();
  const add = day === 0 ? 0 : (7 - day);
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
}

function normalizeOutlookDate(period, dateStr) {
  return period === 'weekly' ? getWeekEndingSunday(dateStr) : dateStr;
}

function weekdayName(date, timeZone) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone }).format(date);
}

function dateLong(date, timeZone) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone,
  }).format(date);
}

function weekRange(date, timeZone) {
  const nowYmd = toYmdInTz(date, timeZone);
  const base = new Date(`${nowYmd}T12:00:00Z`);
  const day = base.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(base);
  monday.setUTCDate(base.getUTCDate() + mondayOffset);
  const friday = new Date(monday);
  friday.setUTCDate(monday.getUTCDate() + 4);
  const fmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'long', year: 'numeric', timeZone });
  return `${fmt.format(monday)} to ${fmt.format(friday)}`;
}

function stripSources(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((line) => !SOURCE_MARKER_RE.test(line));
  return lines.join('\n');
}

function sanitizeSentence(text) {
  return String(text || '')
    .replace(/\b(according to|reported by|via)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeBriefKind(kind) {
  const k = String(kind || '').toLowerCase().trim();
  return BRIEF_KIND_ORDER.includes(k) ? k : 'general';
}

function top5ForBriefKind(kind) {
  const normalized = normalizeBriefKind(kind);
  return (BRIEF_KIND_TOP5[normalized] || BRIEF_KIND_TOP5.general).slice(0, 5);
}

function orderedBriefKinds() {
  return [...BRIEF_KIND_ORDER];
}

function assertNoSources(text) {
  if (SOURCE_MARKER_RE.test(String(text || ''))) {
    throw new Error('Brief contains source markers and was blocked');
  }
}

function sanitizeOutlookPayload(value) {
  if (value == null) return value;
  if (typeof value === 'string') {
    return sanitizeSentence(stripSources(value));
  }
  if (Array.isArray(value)) {
    return value
      .map((v) => sanitizeOutlookPayload(v))
      .filter((v) => v !== '' && v != null);
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = sanitizeOutlookPayload(v);
    }
    return out;
  }
  return value;
}

function validateOutlookPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Outlook payload is invalid');
  }
  if (!payload.marketRegime || !payload.marketPulse) {
    throw new Error('Outlook payload missing regime/pulse');
  }
  const requiredArrays = ['keyDrivers', 'crossAssetSignals', 'marketChangesToday', 'traderFocus', 'riskRadar'];
  for (const key of requiredArrays) {
    if (!Array.isArray(payload[key]) || payload[key].length === 0) {
      throw new Error(`Outlook payload missing ${key}`);
    }
  }
}

function normaliseArray(v) {
  return Array.isArray(v) ? v.filter(Boolean).map((x) => String(x).trim()).filter(Boolean) : [];
}

function normalizeCalendarValue(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function getAutomationModel() {
  return String(
    process.env.OPENAI_AUTOMATION_MODEL
    || process.env.OPENAI_CHAT_MODEL
    || process.env.OPENAI_MODEL
    || getOpenAIModelForChat()
  ).trim();
}

function assertAutomationModelConfigured() {
  if (!String(process.env.OPENAI_AUTOMATION_MODEL || '').trim()) {
    throw new Error('OPENAI_AUTOMATION_MODEL is required for automated Trader Desk runs');
  }
}

async function fetchNewsSample() {
  const url = 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC,^DJI,GC=F,EURUSD=X&region=US&lang=en-US';
  try {
    const res = await fetchWithTimeout(url, {}, 8000);
    if (!res.ok) return [];
    const text = await res.text();
    const items = [];
    const re = /<title><!\[CDATA\[(.*?)\]\]><\/title>/g;
    let m;
    let idx = 0;
    while ((m = re.exec(text)) !== null) {
      if (idx++ === 0) continue;
      const headline = (m[1] || '').trim();
      if (headline) items.push(headline);
      if (items.length >= 8) break;
    }
    return items;
  } catch (_) {
    return [];
  }
}

async function fetchUnifiedNewsSample() {
  try {
    const newsHandler = require('../news');
    let payload = null;
    const req = {
      method: 'GET',
      headers: {},
      query: { refresh: '1' },
      url: 'http://localhost/api/trader-deck/news?refresh=1',
    };
    const res = {
      setHeader: () => {},
      status: () => res,
      json: (p) => { payload = p; return p; },
      end: () => {},
    };
    await newsHandler(req, res);
    const rows = Array.isArray(payload?.articles) ? payload.articles : [];
    const headlines = rows
      .map((r) => String(r?.headline || '').trim())
      .filter(Boolean)
      .slice(0, 20);
    if (headlines.length > 0) return headlines;
  } catch (_) {
    // fallback below
  }
  return fetchNewsSample();
}

function buildFactPack({ period, template, market, econ, news, briefKind = 'general', topInstruments = [] }) {
  const normalizedKind = normalizeBriefKind(briefKind);
  const selectedTop = Array.isArray(topInstruments) && topInstruments.length > 0
    ? topInstruments.slice(0, 5)
    : top5ForBriefKind(normalizedKind);
  return {
    period,
    briefKind: normalizedKind,
    briefKindLabel: BRIEF_KIND_LABELS[normalizedKind] || BRIEF_KIND_LABELS.general,
    topInstruments: selectedTop,
    instruments: selectedTop.length > 0 ? selectedTop : (template.instruments || []),
    sections: template.sections || [],
    marketRegime: market.marketRegime || null,
    marketPulse: market.marketPulse || null,
    keyDrivers: (market.keyDrivers || []).slice(0, 8),
    crossAssetSignals: (market.crossAssetSignals || []).slice(0, 8),
    traderFocus: (market.traderFocus || []).slice(0, 8),
    riskRadar: (market.riskRadar || []).slice(0, 8).map((r) => (typeof r === 'string' ? r : r.title || r.event || '')),
    calendar: (econ || []).slice(0, period === 'weekly' ? 16 : 8).map((e) => ({
      currency: e.currency || '',
      event: e.event || '',
      impact: e.impact || '',
      time: e.time || '',
      actual: normalizeCalendarValue(e.actual),
      forecast: normalizeCalendarValue(e.forecast),
      previous: normalizeCalendarValue(e.previous),
    })),
    headlines: (news || []).slice(0, 8),
    updatedAt: new Date().toISOString(),
  };
}

async function generateWithOpenAi(factPack, template) {
  const key = String(process.env.OPENAI_API_KEY || '').trim();
  if (!key) return null;
  const prompt = {
    template,
    factPack,
    requirements: {
      strictFactsOnly: true,
      noSourcesEver: true,
      noMarkdownBullets: false,
      tone: template?.style?.tone || 'institutional concise',
      minimumDepth: 'high-detail longform',
      mustCoverTopInstruments: factPack.topInstruments || [],
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: getAutomationModel(),
        temperature: 0.15,
        max_tokens: 1800,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You are an institutional multi-asset trading desk analyst. Return valid JSON only: {"title":"string","sections":[{"heading":"string","body":"string"}],"instrumentNotes":[{"instrument":"string","note":"string"}],"riskRadar":["string"],"playbook":["string"]}. Produce high-depth coverage with concrete market context and execution framing. You must include all provided top instruments in instrumentNotes, each with meaningful detail. Never include source names, references, URLs, or citation language. Never invent facts.',
          },
          { role: 'user', content: JSON.stringify(prompt) },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = await res.json();
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) return null;
    const cleaned = text.replace(/^```json\s*|\s*```$/g, '').trim();
    return JSON.parse(cleaned);
  } catch (_) {
    clearTimeout(timeout);
    return null;
  }
}

function fallbackGenerated(factPack, template, now, timeZone) {
  const sec = template.sections || [];
  const mk = factPack.marketRegime || {};
  const pulse = factPack.marketPulse || {};
  const sectionBodies = {
    MarketContext: `Regime is ${mk.currentRegime || 'Mixed'} with ${mk.primaryDriver || 'macro data'} in focus. Pulse reads ${pulse.label || 'NEUTRAL'} (${pulse.score ?? 50}/100). Keep execution selective through headline risk windows.`,
    InstrumentOutlook: (factPack.topInstruments || template.instruments || []).map((i) => `${i}: Trend and liquidity alignment remain mandatory; define clear invalidation and map scenario pivots around macro catalysts before taking risk.`).join('\n'),
    SessionFocus: normaliseArray((factPack.traderFocus || []).map((x) => (typeof x === 'string' ? x : x.title || ''))).slice(0, 5).join('\n'),
    RiskRadar: normaliseArray(factPack.riskRadar).slice(0, 6).join('\n'),
    ExecutionNotes: 'Prioritize A-grade setups, respect invalidation quickly, and reduce size during event clustering.',
    WeeklyMacroTheme: `Weekly backdrop remains ${mk.currentRegime || 'mixed'} with ${mk.primaryDriver || 'macro drivers'} guiding directional conviction. Positioning should stay adaptive around key releases.`,
    EventMap: (factPack.calendar || []).map((e) => `${e.currency} ${e.event} (${e.impact})`).slice(0, 8).join('\n'),
    Playbook: 'Build scenarios for base-case and surprise outcomes, keep cross-asset confirmation mandatory, and protect capital around event spikes.',
  };

  const renderedSections = sec.map((s) => {
    const key = String(s.heading || '').replace(/\s+/g, '');
    return {
      heading: s.heading,
      body: sectionBodies[key] || 'Maintain process discipline and align risk to conviction.',
    };
  });

  const baseTitle = template.titlePattern
    .replace('{weekday}', weekdayName(now, timeZone))
    .replace('{dateLong}', dateLong(now, timeZone))
    .replace('{weekRange}', weekRange(now, timeZone));
  return {
    title: baseTitle,
    sections: renderedSections,
    instrumentNotes: (template.instruments || []).map((instrument) => ({
      instrument,
      note: `${instrument}: Base case and surprise case should both be pre-mapped, with entry quality, invalidation, and volatility-adjusted risk sizing defined before execution.`,
    })),
    riskRadar: normaliseArray(factPack.riskRadar).slice(0, 6),
    playbook: ['Protect downside first', 'Scale only on confirmation', 'Avoid overtrading into major releases'],
  };
}

function renderBriefText({ title, period, date, generated, template, briefKind = 'general', topInstruments = [] }) {
  const normalizedKind = normalizeBriefKind(briefKind);
  const lines = [];
  lines.push(title);
  lines.push('');
  lines.push(`Period: ${period}`);
  lines.push(`Date: ${date}`);
  lines.push(`Category: ${BRIEF_KIND_LABELS[normalizedKind] || BRIEF_KIND_LABELS.general}`);
  lines.push('');

  const sections = Array.isArray(generated.sections) ? generated.sections : [];
  for (const sec of sections) {
    lines.push(sec.heading || 'Section');
    lines.push(stripSources(sec.body || ''));
    lines.push('');
  }

  const instrumentNotes = Array.isArray(generated.instrumentNotes) ? generated.instrumentNotes : [];
  if (instrumentNotes.length > 0) {
    lines.push('Top 5 Instruments');
    for (const row of instrumentNotes) {
      if (!row) continue;
      const instrument = String(row.instrument || '').trim();
      if (!instrument) continue;
      lines.push(`- ${instrument}: ${stripSources(row.note || '')}`);
    }
    lines.push('');
  }
  if (Array.isArray(topInstruments) && topInstruments.length > 0) {
    const listed = new Set(instrumentNotes.map((r) => String(r?.instrument || '').trim().toUpperCase()).filter(Boolean));
    const missing = topInstruments.filter((i) => !listed.has(String(i).toUpperCase()));
    if (missing.length > 0) {
      lines.push('Additional Coverage');
      missing.forEach((instrument) => {
        lines.push(`- ${instrument}: Monitor trend strength, key support/resistance, catalyst risk, and cross-asset confirmation before execution.`);
      });
      lines.push('');
    }
  }

  const riskRadar = normaliseArray(generated.riskRadar);
  if (riskRadar.length > 0) {
    lines.push('Risk Radar');
    riskRadar.slice(0, 8).forEach((r) => lines.push(`- ${stripSources(r)}`));
    lines.push('');
  }

  const playbook = normaliseArray(generated.playbook);
  if (playbook.length > 0) {
    lines.push('Playbook');
    playbook.slice(0, 8).forEach((p) => lines.push(`- ${stripSources(p)}`));
    lines.push('');
  }

  const body = stripSources(lines.join('\n').replace(/\n{3,}/g, '\n\n')).trim();
  assertNoSources(body);
  return body;
}

async function ensureAutomationTables() {
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS trader_deck_brief_runs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      run_key VARCHAR(120) NOT NULL,
      period VARCHAR(20) NOT NULL,
      brief_date DATE NOT NULL,
      status VARCHAR(20) NOT NULL,
      brief_id INT NULL,
      error_message VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_run_key (run_key),
      KEY idx_period_date (period, brief_date)
    )
  `);
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

async function fetchEconomicCalendar() {
  try {
    const [mod] = await Promise.all([require('../economic-calendar')]);
    const req = {
      method: 'GET',
      headers: { 'x-vercel-ip-timezone': 'Europe/London' },
      query: { refresh: '1' },
      url: 'http://localhost/api/trader-deck/economic-calendar?refresh=1',
    };
    let response = null;
    const res = {
      setHeader: () => {},
      status: () => res,
      json: (payload) => { response = payload; return payload; },
      end: () => {},
    };
    await mod(req, res);
    return Array.isArray(response?.events) ? response.events : [];
  } catch (_) {
    return [];
  }
}

async function reserveRun(runKey, period, date) {
  try {
    await executeQuery(
      `INSERT INTO trader_deck_brief_runs (run_key, period, brief_date, status)
       VALUES (?, ?, ?, 'started')`,
      [runKey, period, date]
    );
    return true;
  } catch (err) {
    // If already exists, allow retry only when previous run failed.
    try {
      const [rows] = await executeQuery(
        'SELECT status FROM trader_deck_brief_runs WHERE run_key = ? LIMIT 1',
        [runKey]
      );
      const status = String(rows?.[0]?.status || '').toLowerCase();
      if (status === 'failed') {
        await executeQuery(
          `UPDATE trader_deck_brief_runs
           SET status = 'started', error_message = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE run_key = ?`,
          [runKey]
        );
        return true;
      }
    } catch (_) {
      // fall through
    }
    return false;
  }
}

async function finalizeRun(runKey, status, briefId, errorMessage) {
  await executeQuery(
    `UPDATE trader_deck_brief_runs
     SET status = ?, brief_id = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
     WHERE run_key = ?`,
    [status, briefId || null, errorMessage || null, runKey]
  );
}

async function saveOutlookSnapshot({ period, date, payload }) {
  const [rows] = await executeQuery(
    'SELECT payload FROM trader_deck_outlook WHERE date = ? AND period = ? LIMIT 1',
    [date, period]
  );
  const existingRaw = rows && rows[0] ? rows[0].payload : null;
  let existing = null;
  if (typeof existingRaw === 'string') {
    try { existing = JSON.parse(existingRaw); } catch { existing = null; }
  } else if (existingRaw && typeof existingRaw === 'object') {
    existing = existingRaw;
  }
  const manualOverrides = existing && typeof existing.manualOverrides === 'object' ? existing.manualOverrides : null;
  const manualOverrideKeys = Array.isArray(existing?.manualOverrideKeys) ? existing.manualOverrideKeys : [];
  const nextPayload = manualOverrides
    ? {
        botPayload: payload,
        manualOverrides,
        manualOverrideKeys,
        updatedAt: new Date().toISOString(),
      }
    : payload;
  await executeQuery(
    `INSERT INTO trader_deck_outlook (date, period, payload)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       payload = VALUES(payload),
       updated_at = CURRENT_TIMESTAMP`,
    [date, period, JSON.stringify(nextPayload)]
  );
}

async function getNextBriefVersion({ period, date, briefKind }) {
  const normalizedKind = normalizeBriefKind(briefKind);
  const [rows] = await executeQuery(
    `SELECT COALESCE(MAX(brief_version), 0) AS maxVersion
     FROM trader_deck_briefs
     WHERE date = ? AND period = ? AND brief_kind = ?`,
    [date, period, normalizedKind]
  );
  const maxVersion = Number(rows?.[0]?.maxVersion || 0);
  return maxVersion + 1;
}

async function publishAutoBrief({ period, date, title, body, briefKind = 'general' }) {
  const safeTitle = String(title || 'Market Brief').slice(0, 255);
  const normalizedKind = normalizeBriefKind(briefKind);
  const briefVersion = await getNextBriefVersion({ period, date, briefKind: normalizedKind });
  const [result] = await executeQuery(
    `INSERT INTO trader_deck_briefs (date, period, title, file_url, mime_type, file_data, brief_kind, brief_version)
     VALUES (?, ?, ?, NULL, 'text/plain; charset=utf-8', ?, ?, ?)`,
    [date, period, safeTitle, Buffer.from(body, 'utf8'), normalizedKind, briefVersion]
  );
  return { insertId: result.insertId, briefVersion };
}

async function publishManualBrief({ period, date, title, body }) {
  await ensureAutomationTables();
  const normalizedPeriod = normalizePeriod(period);
  const safeDate = String(date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safeDate)) {
    throw new Error('Valid date (YYYY-MM-DD) is required');
  }
  const safeTitle = String(title || 'Market Brief').slice(0, 255);
  assertNoSources(safeTitle);
  assertNoSources(body);
  const briefVersion = await getNextBriefVersion({ period: normalizedPeriod, date: safeDate, briefKind: 'general' });
  const [result] = await executeQuery(
    `INSERT INTO trader_deck_briefs (date, period, title, file_url, mime_type, file_data, brief_kind, brief_version)
     VALUES (?, ?, ?, NULL, 'text/plain; charset=utf-8', ?, 'general', ?)`,
    [safeDate, normalizedPeriod, safeTitle, Buffer.from(String(body || ''), 'utf8'), briefVersion]
  );
  return result.insertId;
}

function computeTitle(template, now, timeZone) {
  const pattern = String(template?.titlePattern || '').trim() || 'Market Brief - {dateLong}';
  return pattern
    .replace('{weekday}', weekdayName(now, timeZone))
    .replace('{dateLong}', dateLong(now, timeZone))
    .replace('{weekRange}', weekRange(now, timeZone));
}

async function generateAndStoreBrief({ period, briefKind = 'general', timeZone = 'Europe/London', runDate = new Date() }) {
  assertAutomationModelConfigured();
  await ensureAutomationTables();
  const normalizedPeriod = normalizePeriod(period);
  const normalizedKind = normalizeBriefKind(briefKind);
  const selectedTop5 = top5ForBriefKind(normalizedKind);
  const date = normalizeOutlookDate(normalizedPeriod, toYmdInTz(runDate, timeZone));
  const runKey = `auto-brief:${normalizedPeriod}:${date}:${normalizedKind}`;

  const reserved = await reserveRun(runKey, normalizedPeriod, date);
  if (!reserved) {
    return { success: true, skipped: true, reason: 'already-generated', runKey, period: normalizedPeriod, date, briefKind: normalizedKind };
  }

  try {
    const [template, market, econ, news] = await Promise.all([
      getTemplate(normalizedPeriod),
      runEngine(),
      fetchEconomicCalendar(),
      fetchUnifiedNewsSample(),
    ]);
    const factPack = buildFactPack({
      period: normalizedPeriod,
      template,
      market,
      econ,
      news,
      briefKind: normalizedKind,
      topInstruments: selectedTop5,
    });
    let generated = await generateWithOpenAi(factPack, template);
    if (!generated) {
      generated = fallbackGenerated(factPack, template, runDate, timeZone);
    }
    const titleBase = stripSources(computeTitle(template, runDate, timeZone));
    const title = normalizedKind === 'general'
      ? titleBase
      : `${BRIEF_KIND_LABELS[normalizedKind]} - ${titleBase}`;
    const body = renderBriefText({
      title,
      period: normalizedPeriod,
      date,
      generated,
      template,
      briefKind: normalizedKind,
      topInstruments: selectedTop5,
    });
    const saved = await publishAutoBrief({ period: normalizedPeriod, date, title, body, briefKind: normalizedKind });
    const briefId = saved.insertId;
    await finalizeRun(runKey, 'success', briefId, null);
    return { success: true, briefId, runKey, date, period: normalizedPeriod, briefKind: normalizedKind, briefVersion: saved.briefVersion, topInstruments: selectedTop5 };
  } catch (err) {
    await finalizeRun(runKey, 'failed', null, (err.message || 'generation failed').slice(0, 255));
    return { success: false, runKey, date, period: normalizedPeriod, briefKind: normalizedKind, error: err.message || 'generation failed' };
  }
}

async function generateAndStoreBriefSet({ period, timeZone = 'Europe/London', runDate = new Date() }) {
  const results = [];
  for (const briefKind of orderedBriefKinds()) {
    // Keep category generations isolated so one failure does not block all.
    // eslint-disable-next-line no-await-in-loop
    const row = await generateAndStoreBrief({ period, briefKind, timeZone, runDate });
    results.push(row);
  }
  return { success: results.some((r) => r && r.success), period: normalizePeriod(period), results };
}

async function generateAndStoreOutlook({ period, timeZone = 'Europe/London', runDate = new Date() }) {
  assertAutomationModelConfigured();
  await ensureAutomationTables();
  const normalizedPeriod = normalizePeriod(period);
  const date = toYmdInTz(runDate, timeZone);
  const runKey = `auto-outlook:${normalizedPeriod}:${date}`;

  const reserved = await reserveRun(runKey, normalizedPeriod, date);
  if (!reserved) {
    return { success: true, skipped: true, reason: 'already-generated', runKey, period: normalizedPeriod, date };
  }

  try {
    const raw = await runEngine({ timeframe: normalizedPeriod, date });
    let enriched = null;
    try {
      enriched = await enrichTraderDeckPayload(raw);
    } catch (_) {
      enriched = null;
    }
    const full = {
      ...raw,
      ...(enriched || {}),
    };
    const sanitized = sanitizeOutlookPayload(full);
    validateOutlookPayload(sanitized);
    assertNoSources(JSON.stringify(sanitized));
    await saveOutlookSnapshot({
      period: normalizedPeriod,
      date,
      payload: {
        ...sanitized,
        updatedAt: new Date().toISOString(),
      },
    });
    await finalizeRun(runKey, 'success', null, null);
    return { success: true, runKey, date, period: normalizedPeriod };
  } catch (err) {
    await finalizeRun(runKey, 'failed', null, (err.message || 'outlook generation failed').slice(0, 255));
    return { success: false, runKey, date, period: normalizedPeriod, error: err.message || 'outlook generation failed' };
  }
}

async function generatePreviewBrief({
  period,
  timeZone = 'Europe/London',
  runDate = new Date(),
  templateText = '',
}) {
  const normalizedPeriod = normalizePeriod(period);
  const template = templateText
    ? parseTemplateFromText(templateText, normalizedPeriod)
    : await getTemplate(normalizedPeriod);
  const [market, econ, news] = await Promise.all([
    runEngine(),
    fetchEconomicCalendar(),
    fetchUnifiedNewsSample(),
  ]);
  const factPack = buildFactPack({
    period: normalizedPeriod,
    template,
    market,
    econ,
    news,
  });
  let generated = await generateWithOpenAi(factPack, template);
  if (!generated) {
    generated = fallbackGenerated(factPack, template, runDate, timeZone);
  }
  const date = toYmdInTz(runDate, timeZone);
  const title = stripSources(computeTitle(template, runDate, timeZone));
  const body = renderBriefText({
    title,
    period: normalizedPeriod,
    date,
    generated,
    template,
  });
  return {
    success: true,
    period: normalizedPeriod,
    date,
    title,
    body,
    template,
  };
}

function shouldRunWindow({ now = new Date(), period, timeZone = 'Europe/London' }) {
  const normalizedPeriod = normalizePeriod(period);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const hh = Number(map.hour);
  const mm = Number(map.minute);
  const wd = String(map.weekday || '').toLowerCase();
  if (normalizedPeriod === 'daily') return hh === 6 && mm < 15;
  return wd.startsWith('sun') && hh === 18 && mm < 15;
}

module.exports = {
  generateAndStoreOutlook,
  generateAndStoreBrief,
  generateAndStoreBriefSet,
  generatePreviewBrief,
  publishManualBrief,
  shouldRunWindow,
  stripSources,
  assertNoSources,
  _test: {
    shouldRunWindow,
    stripSources,
    assertNoSources,
    sanitizeOutlookPayload,
    validateOutlookPayload,
    normalizeBriefKind,
    top5ForBriefKind,
    orderedBriefKinds,
    BRIEF_KIND_ORDER,
  },
};
