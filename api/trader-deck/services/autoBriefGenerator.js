const { executeQuery, addColumnIfNotExists } = require('../../db');
const { runEngine } = require('../marketIntelligenceEngine');
const { getTemplate, normalizePeriod, parseTemplateFromText } = require('./briefTemplateService');
const { getOpenAIModelForChat } = require('../../ai/openai-config');
const { fetchWithTimeout } = require('./fetchWithTimeout');

const SOURCE_MARKER_RE = /(https?:\/\/|www\.|source\s*:|sources\s*:|according to|reuters|bloomberg|fmp|finnhub|forex factory|trading economics)/i;

function toYmdInTz(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
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

function assertNoSources(text) {
  if (SOURCE_MARKER_RE.test(String(text || ''))) {
    throw new Error('Brief contains source markers and was blocked');
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

function buildFactPack({ period, template, market, econ, news }) {
  return {
    period,
    instruments: template.instruments || [],
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
        model: getOpenAIModelForChat(),
        temperature: 0.2,
        max_tokens: 1200,
        messages: [
          {
            role: 'system',
            content: 'You are a market brief writer. Return valid JSON only: {"title":"string","sections":[{"heading":"string","body":"string"}],"instrumentNotes":[{"instrument":"string","note":"string"}],"riskRadar":["string"],"playbook":["string"]}. Never include source names, references, URLs, or citation language.',
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
    InstrumentOutlook: (template.instruments || []).map((i) => `${i}: Maintain a bias only when momentum aligns with session flow; avoid forcing entries into high-impact data windows.`).join('\n'),
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
      note: `${instrument}: Bias follows macro direction and intraday confirmation.`,
    })),
    riskRadar: normaliseArray(factPack.riskRadar).slice(0, 6),
    playbook: ['Protect downside first', 'Scale only on confirmation', 'Avoid overtrading into major releases'],
  };
}

function renderBriefText({ title, period, date, generated, template }) {
  const lines = [];
  lines.push(title);
  lines.push('');
  lines.push(`Period: ${period}`);
  lines.push(`Date: ${date}`);
  lines.push('');

  const sections = Array.isArray(generated.sections) ? generated.sections : [];
  for (const sec of sections) {
    lines.push(sec.heading || 'Section');
    lines.push(stripSources(sec.body || ''));
    lines.push('');
  }

  const instrumentNotes = Array.isArray(generated.instrumentNotes) ? generated.instrumentNotes : [];
  if (instrumentNotes.length > 0) {
    lines.push('Instruments');
    for (const row of instrumentNotes) {
      if (!row) continue;
      const instrument = String(row.instrument || '').trim();
      if (!instrument) continue;
      lines.push(`- ${instrument}: ${stripSources(row.note || '')}`);
    }
    lines.push('');
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
  } catch (_) {
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

async function publishAutoBrief({ period, date, title, body }) {
  const safeTitle = String(title || 'Market Brief').slice(0, 255);
  const [result] = await executeQuery(
    `INSERT INTO trader_deck_briefs (date, period, title, file_url, mime_type, file_data)
     VALUES (?, ?, ?, NULL, 'text/plain; charset=utf-8', ?)`,
    [date, period, `[AUTO] ${safeTitle}`, Buffer.from(body, 'utf8')]
  );
  return result.insertId;
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
  const [result] = await executeQuery(
    `INSERT INTO trader_deck_briefs (date, period, title, file_url, mime_type, file_data)
     VALUES (?, ?, ?, NULL, 'text/plain; charset=utf-8', ?)`,
    [safeDate, normalizedPeriod, `[AUTO] ${safeTitle}`, Buffer.from(String(body || ''), 'utf8')]
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

async function generateAndStoreBrief({ period, timeZone = 'Europe/London', runDate = new Date() }) {
  await ensureAutomationTables();
  const normalizedPeriod = normalizePeriod(period);
  const date = toYmdInTz(runDate, timeZone);
  const runKey = `auto-brief:${normalizedPeriod}:${date}`;

  const reserved = await reserveRun(runKey, normalizedPeriod, date);
  if (!reserved) {
    return { success: true, skipped: true, reason: 'already-generated', runKey, period: normalizedPeriod, date };
  }

  try {
    const [template, market, econ, news] = await Promise.all([
      getTemplate(normalizedPeriod),
      runEngine(),
      fetchEconomicCalendar(),
      fetchNewsSample(),
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
    const title = stripSources(computeTitle(template, runDate, timeZone));
    const body = renderBriefText({
      title,
      period: normalizedPeriod,
      date,
      generated,
      template,
    });
    const briefId = await publishAutoBrief({ period: normalizedPeriod, date, title, body });
    await finalizeRun(runKey, 'success', briefId, null);
    return { success: true, briefId, runKey, date, period: normalizedPeriod };
  } catch (err) {
    await finalizeRun(runKey, 'failed', null, (err.message || 'generation failed').slice(0, 255));
    return { success: false, runKey, date, period: normalizedPeriod, error: err.message || 'generation failed' };
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
    fetchNewsSample(),
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
  generateAndStoreBrief,
  generatePreviewBrief,
  publishManualBrief,
  shouldRunWindow,
  stripSources,
  assertNoSources,
  _test: {
    shouldRunWindow,
    stripSources,
    assertNoSources,
  },
};
