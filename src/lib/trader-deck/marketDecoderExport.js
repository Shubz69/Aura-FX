const TECHNICAL_TERMS = [
  'support',
  'resistance',
  'pivot',
  'breakout',
  'retest',
  'candle',
  'candlestick',
  'rsi',
  'macd',
  'moving average',
  'ema',
  'sma',
  'fibonacci',
  'price action',
  'trendline',
];

const FUNDAMENTAL_TERMS = [
  'inflation',
  'cpi',
  'pce',
  'gdp',
  'nfp',
  'payroll',
  'central bank',
  'fed',
  'ecb',
  'boe',
  'boj',
  'policy',
  'rates',
  'yield',
  'risk sentiment',
  'geopolitical',
  'headline',
  'macro',
];

function asText(value) {
  return value == null ? '' : String(value).trim();
}

function listFromText(value) {
  return asText(value)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function containsAny(text, terms) {
  const source = asText(text).toLowerCase();
  if (!source) return false;
  return terms.some((term) => source.includes(term));
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeJoin(lines) {
  return lines.filter(Boolean).join('\n').trim();
}

function normalizeKeyDrivers(rawDrivers = [], fallbackText = '') {
  const explicit = Array.isArray(rawDrivers) ? rawDrivers : [];
  const cleanedExplicit = explicit
    .map((driver) => ({
      title: asText(driver?.title || driver?.label || 'Driver'),
      impact: asText(driver?.impact || 'Medium') || 'Medium',
      direction: asText(driver?.direction || 'Two-way') || 'Two-way',
      explanation: asText(driver?.explanation || driver?.text || ''),
    }))
    .filter((driver) => driver.explanation);
  if (cleanedExplicit.length) return cleanedExplicit;

  const fromLines = listFromText(fallbackText)
    .filter((line) => !containsAny(line, ['entry', 'stop', 'target', 'buy', 'sell']))
    .map((line) => ({
      title: 'Macro / News Driver',
      impact: 'Medium',
      direction: 'Two-way',
      explanation: line,
    }));
  return fromLines.slice(0, 6);
}

export function validateMarketDecoderSections(output = {}) {
  const normalized = { ...output };
  const fundamentals = { ...(normalized.fundamentals || {}) };
  const technical = { ...(normalized.technical || {}) };
  const risks = { ...(normalized.risks || {}) };
  const thesis = { ...(normalized.traderThesis || {}) };

  const fallbackFundamental = safeJoin([
    fundamentals.macroBackdrop,
    fundamentals.centralBankPolicy,
    fundamentals.economicData,
    fundamentals.geopoliticalContext,
    fundamentals.crossAssetContext,
  ]);

  const fundamentalBacking = asText(fundamentals.fundamentalBacking);
  if (!fundamentalBacking || containsAny(fundamentalBacking, TECHNICAL_TERMS)) {
    fundamentals.fundamentalBacking =
      fallbackFundamental || 'No fundamental analysis saved for this older decoder run';
  }

  if (!asText(technical.confirmation)) {
    technical.confirmation = asText(normalized.confirmation) || asText(thesis.whatConfirmsEntry);
  }
  if (!asText(risks.invalidation)) {
    risks.invalidation = asText(normalized.invalidation) || asText(thesis.whatConfirmsEntry);
  }

  if (!asText(thesis.whatToSee)) thesis.whatToSee = asText(normalized.thesis);
  if (!asText(thesis.whyValid)) thesis.whyValid = asText(thesis.whatToSee) || asText(fundamentals.fundamentalBacking);
  if (!asText(thesis.whatConfirmsEntry)) thesis.whatConfirmsEntry = asText(technical.confirmation) || asText(risks.invalidation);

  normalized.fundamentals = fundamentals;
  normalized.technical = technical;
  normalized.risks = risks;
  normalized.traderThesis = thesis;
  normalized.keyDrivers = normalizeKeyDrivers(normalized.keyDrivers, fallbackFundamental || normalized.fundamentalAnalysis);

  return normalized;
}

export function buildMarketDecoderExport(brief = {}, context = {}) {
  const levels = brief?.keyLevels || {};
  const insightSummary = brief?.insights?.stateSummary || '';
  const technicalAnalysis = asText(brief?.technicalAnalysis)
    || safeJoin([
      brief?.executionGuidance?.entryCondition,
      brief?.scenarioMap?.bullish?.condition,
      brief?.scenarioMap?.bearish?.condition,
      insightSummary,
    ]);
  const fundamentalAnalysis = asText(brief?.fundamentalAnalysis)
    || safeJoin([
      brief?.whatMattersNow?.[0]?.text,
      brief?.whatMattersNow?.[2]?.text,
      Array.isArray(brief?.crossAssetContext) ? brief.crossAssetContext.join(' ') : '',
    ]);
  const keyDriversRaw = Array.isArray(brief?.keyDrivers) ? brief.keyDrivers : [];
  const output = {
    symbol: asText(context.symbol || brief?.instrument?.canonical || brief?.header?.asset).toUpperCase(),
    generatedAt: brief?.meta?.generatedAt || null,
    bias: asText(brief?.instantRead?.bias),
    tradeLevels: {
      entry: numberOrNull(levels?.pivot) ?? numberOrNull(brief?.header?.price),
      stopLoss: numberOrNull(levels?.support1),
      target: numberOrNull(levels?.resistance1),
      riskReward: null,
    },
    technical: {
      trend: asText(brief?.insights?.momentum || brief?.instantRead?.tradingCondition),
      structure: asText(brief?.insights?.structureState),
      levels: safeJoin([
        asText(levels?.keyLevelsDisplay?.resistance1),
        asText(levels?.keyLevelsDisplay?.support1),
      ]),
      momentum: asText(brief?.insights?.momentum),
      confirmation: asText(brief?.confirmation),
    },
    fundamentals: {
      macroBackdrop: asText(brief?.fundamentals?.macroBackdrop || brief?.whatMattersNow?.[0]?.text),
      centralBankPolicy: asText(brief?.fundamentals?.centralBankPolicy),
      economicData: asText(brief?.fundamentals?.economicData || brief?.eventRiskSummary?.state),
      geopoliticalContext: asText(brief?.fundamentals?.geopoliticalContext),
      crossAssetContext: asText(
        brief?.fundamentals?.crossAssetContext
        || (Array.isArray(brief?.crossAssetContext) ? brief.crossAssetContext.join('\n') : '')
      ),
      fundamentalBacking: asText(brief?.fundamentals?.fundamentalBacking || fundamentalAnalysis),
    },
    keyDrivers: keyDriversRaw,
    risks: {
      newsRisk: asText(brief?.riskSummary?.newsRisk),
      volatilityRisk: asText(brief?.riskSummary?.volatilityRisk || brief?.insights?.volatilityRegime),
      eventRisk: asText(brief?.riskSummary?.eventRisk || brief?.eventRiskSummary?.state),
      invalidation: asText(brief?.invalidation || brief?.executionGuidance?.invalidation),
    },
    traderThesis: {
      whatToSee: asText(brief?.traderThesis?.whatToSee || brief?.finalOutput?.reason),
      whyValid: asText(brief?.traderThesis?.whyValid || brief?.finalOutput?.postureSubtitle),
      whatConfirmsEntry: asText(brief?.traderThesis?.whatConfirmsEntry || brief?.executionGuidance?.entryCondition),
    },
    technicalAnalysis,
    fundamentalAnalysis,
    confirmation: asText(brief?.confirmation || brief?.executionGuidance?.entryCondition),
    invalidation: asText(brief?.invalidation || brief?.executionGuidance?.invalidation),
    marketDecoderLogLine: safeJoin([brief?.marketPulse?.signalBrief, brief?.finalOutput?.whatWouldChangeThis]),
    playbookSetup: asText(context.playbookSetup || 'Market Decoder'),
    sessionFocus: asText(context.sessionFocus || brief?.instantRead?.bestApproach),
  };
  return validateMarketDecoderSections(output);
}
