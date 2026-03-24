const { executeQuery } = require('../../db');

const DEFAULT_TEMPLATE_VERSION = 1;

const DEFAULT_DAILY_TEMPLATE = {
  period: 'daily',
  version: DEFAULT_TEMPLATE_VERSION,
  titlePattern: 'Daily Market Brief - {weekday} {dateLong}',
  sections: [
    { key: 'market_context', heading: 'Market Context' },
    { key: 'instrument_outlook', heading: 'Instrument Outlook' },
    { key: 'session_focus', heading: 'Session Focus' },
    { key: 'risk_radar', heading: 'Risk Radar' },
    { key: 'execution_notes', heading: 'Execution Notes' },
  ],
  instruments: ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'US500', 'NAS100', 'DXY'],
  style: {
    tone: 'institutional concise',
    maxParagraphLines: 4,
    noSources: true,
  },
};

const DEFAULT_WEEKLY_TEMPLATE = {
  period: 'weekly',
  version: DEFAULT_TEMPLATE_VERSION,
  titlePattern: 'Weekly Fundamental Analysis - {weekRange}',
  sections: [
    { key: 'weekly_macro_theme', heading: 'Weekly Macro Theme' },
    { key: 'instrument_outlook', heading: 'Instrument Outlook' },
    { key: 'event_map', heading: 'Event Map' },
    { key: 'risk_radar', heading: 'Risk Radar' },
    { key: 'playbook', heading: 'Playbook' },
  ],
  instruments: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'XAUUSD', 'US500', 'NAS100', 'DXY'],
  style: {
    tone: 'institutional concise',
    maxParagraphLines: 5,
    noSources: true,
  },
};

async function ensureTemplateTable() {
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS trader_deck_brief_templates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      period VARCHAR(20) NOT NULL,
      template_name VARCHAR(120) NOT NULL DEFAULT 'default',
      template_text LONGTEXT NULL,
      template_schema JSON NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_period_template (period, template_name)
    )
  `);
}

function safeJsonParse(raw, fallback = null) {
  try {
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function normalizePeriod(period) {
  return String(period || '').toLowerCase() === 'weekly' ? 'weekly' : 'daily';
}

function cleanLine(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function isLikelyHeading(line) {
  if (!line) return false;
  if (line.length < 3 || line.length > 80) return false;
  if (/^[0-9]/.test(line)) return false;
  const letters = line.replace(/[^a-zA-Z]/g, '');
  if (!letters) return false;
  const upperRatio = (letters.match(/[A-Z]/g) || []).length / letters.length;
  return upperRatio > 0.5 || /:$/i.test(line);
}

function extractInstruments(text) {
  const known = [
    'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF',
    'XAUUSD', 'XAGUSD', 'US500', 'NAS100', 'US30', 'DXY', 'BTCUSD', 'ETHUSD',
  ];
  const hay = String(text || '').toUpperCase();
  return known.filter((s) => hay.includes(s));
}

function parseTemplateFromText(templateText, period) {
  const normalizedPeriod = normalizePeriod(period);
  const fallback = normalizedPeriod === 'weekly' ? DEFAULT_WEEKLY_TEMPLATE : DEFAULT_DAILY_TEMPLATE;
  const text = String(templateText || '').trim();
  if (!text) return fallback;

  const lines = text
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean);

  const headings = lines
    .filter((line) => isLikelyHeading(line))
    .slice(0, 8)
    .map((heading, idx) => ({
      key: `section_${idx + 1}`,
      heading: heading.replace(/:$/, ''),
    }));

  const instruments = extractInstruments(text);
  return {
    ...fallback,
    sections: headings.length >= 3 ? headings : fallback.sections,
    instruments: instruments.length > 0 ? instruments : fallback.instruments,
  };
}

async function getTemplate(period) {
  await ensureTemplateTable();
  const normalizedPeriod = normalizePeriod(period);
  const [rows] = await executeQuery(
    `SELECT template_schema FROM trader_deck_brief_templates
     WHERE period = ? AND template_name = 'default'
     LIMIT 1`,
    [normalizedPeriod]
  );
  const parsed = safeJsonParse(rows?.[0]?.template_schema, null);
  if (parsed && typeof parsed === 'object') return parsed;
  return normalizedPeriod === 'weekly' ? DEFAULT_WEEKLY_TEMPLATE : DEFAULT_DAILY_TEMPLATE;
}

async function saveTemplate({ period, templateText }) {
  await ensureTemplateTable();
  const normalizedPeriod = normalizePeriod(period);
  const schema = parseTemplateFromText(templateText, normalizedPeriod);
  await executeQuery(
    `INSERT INTO trader_deck_brief_templates (period, template_name, template_text, template_schema)
     VALUES (?, 'default', ?, ?)
     ON DUPLICATE KEY UPDATE
       template_text = VALUES(template_text),
       template_schema = VALUES(template_schema),
       updated_at = CURRENT_TIMESTAMP`,
    [normalizedPeriod, String(templateText || ''), JSON.stringify(schema)]
  );
  return schema;
}

module.exports = {
  ensureTemplateTable,
  getTemplate,
  saveTemplate,
  parseTemplateFromText,
  normalizePeriod,
  _defaults: {
    DEFAULT_DAILY_TEMPLATE,
    DEFAULT_WEEKLY_TEMPLATE,
  },
};
