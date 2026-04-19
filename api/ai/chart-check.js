/**
 * POST /api/ai/chart-check
 * Premium multi-timeframe AI analysis engine.
 *
 * Optional env: PERPLEXITY_CHART_CHECK_MAX_TOKENS (vision output cap),
 * PERPLEXITY_CHART_REPAIR_MAX_TOKENS (text-only JSON repair cap).
 */
const { verifyToken } = require('../utils/auth');
const { executeQuery } = require('../db');
const { getPerplexityModelForVision, getPerplexityModelForChat } = require('./perplexity-config');
const { jsonrepair } = require('jsonrepair');
const {
  resolveInstrumentIntelligence,
  buildInstrumentPromptBlock,
  getInstrumentScoringModifiers,
  INDICATOR_AND_METHOD_RULES,
} = require('./chartCheckRegistry');
const { runWithRequestContext } = require('../utils/asyncRequestContext');
const { getOrCreateRequestId, attachRequestId } = require('../utils/requestCorrelation');
const { recordChartCheck } = require('../utils/systemMetrics');
const ERROR_CODES = require('../utils/errorCodes');

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_MODEL = getPerplexityModelForVision();
const PERPLEXITY_TEXT_MODEL = getPerplexityModelForChat();

/** Perplexity may return `content` as a string, array of {type,text}, or other shapes — normalize to plain text. */
function normalizeAssistantContent(content) {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          if (typeof part.text === 'string') return part.text;
          if (part.type === 'text' && typeof part.text === 'string') return part.text;
        }
        return '';
      })
      .join('');
  }
  if (typeof content === 'object' && typeof content.text === 'string') return content.text;
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

async function perplexityRequest(body, timeoutMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(text.slice(0, 800) || `HTTP ${res.status}`);
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Invalid JSON from Perplexity');
    }
    const choice = data.choices?.[0];
    const finishReason = choice?.finish_reason || '';
    const content = normalizeAssistantContent(choice?.message?.content);
    return { content, finishReason };
  } finally {
    clearTimeout(t);
  }
}

async function perplexityChatCompletion(body, timeoutMs) {
  const { content } = await perplexityRequest(body, timeoutMs);
  return content;
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGES = 4;
const MAX_BASE64_LEN = 14_000_000; // ~10MB binary
const CHECKLIST_TYPES = ['scalp', 'intraDay', 'swing'];
const DIRECTION_OPTIONS = ['buy', 'sell', 'unsure'];
const BIAS_OPTIONS = ['bullish', 'bearish', 'neutral', 'mixed', 'unclear'];
const CONDITION_OPTIONS = ['continuation', 'pullback', 'reversal', 'range', 'indecision'];
const ACTION_OPTIONS = ['avoid', 'watch', 'wait_for_confirmation', 'executable'];
const CONFIDENCE_OPTIONS = ['high', 'medium', 'low'];
const PROBABILITY_OPTIONS = ['low', 'moderate', 'high'];
const VERDICT_OPTIONS = ['strong', 'moderate', 'weak', 'unclear'];
const TRADE_STAGE_OPTIONS = ['early_stage', 'developing', 'extended', 'exhaustion'];
const ENTRY_TIMING_OPTIONS = ['early', 'optimal', 'late'];
const INDICATOR_VISIBILITY_OPTIONS = ['visible', 'unclear', 'not_visible'];

const CRITERION_POINTS = {
  pass: 20,
  partial: 10,
  unclear: 5,
  fail: 0,
};

const CHECKLIST_RUBRIC = {
  scalp: {
    label: 'Scalp',
    sections: [
      {
        name: 'Market Context',
        criteria: [
          'Session is active (London/NY/overlap)',
          'Spread conditions are acceptable for scalping',
          'No major high-impact news event nearby',
          'Market is moving cleanly (not choppy/ranging)',
          'Higher-timeframe bias is clear and readable',
        ],
      },
      {
        name: 'Entry Quality',
        criteria: [
          'A key level or zone is clearly identifiable on the chart',
          'Liquidity pool has been taken (stop hunt visible)',
          'Market structure shift (MSS/CHoCH/BOS) is confirmed',
          'Entry is not placed in the middle of a range',
          'Momentum candles confirm the entry direction',
        ],
      },
      {
        name: 'Risk & Execution',
        criteria: [
          'Stop loss placement is logically beyond invalidation',
          'A clear profit target is mappable from visible structure',
          'Risk-to-reward appears to meet minimum 1:2',
          'Position sizing seems proportional to risk',
          'No signs of emotional/impulsive entry',
        ],
      },
    ],
  },
  intraDay: {
    label: 'Intra Day',
    sections: [
      {
        name: 'Bias & Structure',
        criteria: [
          'Daily bias is clear (bullish or bearish)',
          'Higher-timeframe structure supports the direction',
          'Price is at or near a key decision zone',
          'Session direction is identifiable from price action',
          'Market is not in a choppy/consolidating state',
        ],
      },
      {
        name: 'Confirmation',
        criteria: [
          'Key level is being respected (reaction visible)',
          'Liquidity has been swept or engineered',
          'A confirmation pattern is formed (MSS, engulfing, rejection wick)',
          'Momentum supports the trade direction',
          'Entry timing aligns with session open or key time',
        ],
      },
      {
        name: 'Risk & Management',
        criteria: [
          'Stop loss is placed beyond the invalidation zone',
          'Target is realistic based on visible structure',
          'Risk-to-reward appears to meet minimum 1:2',
          'No conflicting correlated pairs visible',
          'Trade setup fits within a clear model/playbook',
        ],
      },
    ],
  },
  swing: {
    label: 'Swing',
    sections: [
      {
        name: 'Higher Timeframe',
        criteria: [
          'Weekly trend is visible and clear',
          'Daily trend aligns with the trade direction',
          'A major structural zone (POI/OB/FVG) is clearly marked or visible',
          'Market structure supports the directional bias',
          'There is clear room to move to the target',
        ],
      },
      {
        name: 'Setup Quality',
        criteria: [
          'Entry is within a value area (discount for buys, premium for sells)',
          'Rejection or reversal confirmation is visible',
          'Setup is not late (not chasing an extended move)',
          'Invalidation point is clear and logical',
          'Target is based on higher-timeframe structure',
        ],
      },
      {
        name: 'Position Logic',
        criteria: [
          'Thesis can survive short-term noise/pullbacks',
          'Risk sizing is appropriate for a wider stop',
          'No near-term high-impact news would break the thesis',
          'Setup requires patience — no forced execution visible',
          'Trade setup is rule-based and systematic',
        ],
      },
    ],
  },
};

function clampScore(value, fallback = 0) {
  const n = Number.isFinite(Number(value)) ? Math.round(Number(value)) : fallback;
  return Math.max(0, Math.min(100, n));
}

function safeString(value, fallback = '') {
  if (value == null) return fallback;
  return String(value).trim();
}

function safeArrayStrings(value, max = 6) {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => safeString(v))
    .filter(Boolean)
    .slice(0, max);
}

function sanitizeEnum(value, allowed, fallback) {
  const v = safeString(value).toLowerCase();
  return allowed.includes(v) ? v : fallback;
}

function timeframeRank(tfRaw) {
  const tf = safeString(tfRaw).toUpperCase();
  const map = {
    MONTHLY: 43200, MN: 43200, MTH: 43200, M: 1,
    WEEKLY: 10080, W: 10080, W1: 10080,
    DAILY: 1440, D: 1440, D1: 1440,
    H12: 720, '12H': 720,
    H8: 480, '8H': 480,
    H6: 360, '6H': 360,
    H4: 240, '4H': 240,
    H2: 120, '2H': 120,
    H1: 60, '1H': 60,
    M30: 30, '30M': 30,
    M15: 15, '15M': 15,
    M10: 10, '10M': 10,
    M5: 5, '5M': 5,
    M3: 3, '3M': 3,
    M1: 1, '1M': 1,
  };
  if (map[tf]) return map[tf];
  const hMatch = tf.match(/^(\d+)\s*H$/);
  if (hMatch) return Number(hMatch[1]) * 60;
  const mMatch = tf.match(/^(\d+)\s*M$/);
  if (mMatch) return Number(mMatch[1]);
  return 30;
}

function normalizeDirection(value) {
  const dir = safeString(value).toLowerCase();
  if (!dir) return 'unsure';
  if (dir === 'long') return 'buy';
  if (dir === 'short') return 'sell';
  return DIRECTION_OPTIONS.includes(dir) ? dir : 'unsure';
}

function buildTimeframeBuckets(images) {
  const sorted = [...images].sort((a, b) => b.rank - a.rank);
  if (!sorted.length) {
    return { higher: [], mid: [], lower: [] };
  }
  if (sorted.length === 1) {
    return { higher: sorted, mid: [], lower: [] };
  }
  if (sorted.length === 2) {
    return { higher: [sorted[0]], mid: [sorted[1]], lower: [] };
  }
  return {
    higher: [sorted[0]],
    mid: [sorted[1]],
    lower: sorted.slice(2),
  };
}

function rubricText(rubric) {
  return rubric.sections.map((section, i) => {
    const criteria = section.criteria.map((c, idx) => `- ${idx + 1}. ${c}`).join('\n');
    return `Section ${i + 1}: ${section.name}\n${criteria}`;
  }).join('\n\n');
}

/** Case-insensitive snippets that usually indicate unsupported generic fluff (deterministic post-penalty). */
const VAGUE_SNIPPET_HINTS = [
  'market looks bullish',
  'market looks bearish',
  'good setup',
  'great setup',
  'nice setup',
  'solid setup',
  'charts look good',
  'looks bullish overall',
  'looks bearish overall',
  'just be patient',
  'unclear chart',
  'hard to say',
];

const STRICT_ANALYSIS_CONTRACT = `
STRICT ANALYSIS CONTRACT (NON-NEGOTIABLE):

1) NO GENERIC ASSERTIONS
- Forbid standalone judgments with no visual anchor (e.g. "market is bullish", "good setup", "wait for confirmation" without naming WHAT on the chart confirms or denies it).
- Every directional or quality statement MUST tie to observable evidence: candles, swings, levels, zones, patterns, gaps, sweeps, visible labels, or timeframe labels on the image.

2) EXPLICIT REASONING (use in section whatAiSees bullets and in traderAnswers)
Each substantive bullet MUST read as three linked clauses in ONE string, using this exact delimiter pattern so it is scannable:
"Observation: … | Meaning: … | Implication: …"
Example: "Observation: Two successive closes could not hold above the horizontal zone near the recent swing high; wicks extend above it. | Meaning: Rejection/liquidity delivery at that offer zone. | Implication: Long-bias continuation is weakened until a decisive close through that zone."
If something is not visible, use: "Observation: not clearly visible in the image | Meaning: … | Implication: …" and score that area as unclear/fail for relevant criteria.

3) INDICATORS — NO NUMERIC HALLUCINATION
- Never state RSI/MACD/Stochastic/Bollinger values unless the exact reading is legible on-chart (or in a data window readable in the screenshot).
- If an oscillator pane exists but values are unreadable: say "indicator type present; numeric value not confirmed from image".
- If unsure of indicator identity: "indicator not clearly visible".

4) MULTI-TIMEFRAME (when 2+ charts)
- State HTF directional lean vs execution TF behavior explicitly in alignmentSummary.
- Penalize (lower biasConfidenceScore, list in contradictions) when execution TF appears to buy into obvious HTF supply or sell into obvious HTF demand UNLESS the chart shows a clear invalidation-based probe with evidence.
- Reward alignment only when each timeframe’s structure is described with chart-tied evidence.

5) INSTRUMENT-AWARE SCORING (same rubric weights, different evidence bar)
- Apply category-specific caution from INSTRUMENT CONTEXT: e.g. crypto breakout reliability vs FX session noise vs metal volatility vs index gap context.
- Do NOT assign identical prose or identical criterion notes for different asset classes when the risk profile differs.

6) SCORING MUST BE JUSTIFIED
- chartClarityScore: tied to readability, cropping, symbol/tf legibility, and whether structure can be mapped without guessing.
- checklistScore: derived from criterion pass/partial/unclear/fail only (already enforced numerically).
- biasConfidenceScore: tied to TF alignment, contradiction count, and strength of visual bias evidence.
- overallSetupScore in JSON: provide your best-effort weighted estimate; Aura recomputes the final number using adaptive style/category weights, instrument penalties from the registry, and HTF/LTF conflict multipliers after automated consistency gates.

7) CONFIDENCE (confidenceLabel)
- high ONLY if: clarity is strong, contradictions are none or minor, and evidence for bias is chart-obvious.
- If image noisy, zoomed awkwardly, or indicators ambiguous → medium or low.
- If symbol not confirmed from chart text AND user did not provide pair → prefer medium or low.

8) WEAK / STRONG SETUPS
- weak / messy: practicalAction should be avoid or wait_for_confirmation with explicit chart reasons in traderAction.reason (not generic).
- executable: only when invalidation and trigger are mappable from VISIBLE structure AND risk context is coherent for the instrument class.

9) INTERNAL VALIDATION (silent, before you output JSON)
Ask yourself and fix before emitting:
A) Is every bold claim tied to something I can point to on the image?
B) Did I invent indicator numbers or patterns not seen?
C) Do scores honestly match the issues and contradictions I listed?
If not, revise downward (scores, confidence, action aggressiveness) until consistent.

10) EDGE CASES
- No clear entry: say so; executable is inappropriate.
- Messy chart: lower clarity; list what is missing (axes, scale, symbol).
- Conflicting TFs: list under contradictions; do not paper over.

11) completeness
Fill every JSON field; use specific chart-tied language even when scores are low.

12) TRADE LIFECYCLE & RISK FRAMING
- tradeStage: early_stage | developing | extended | exhaustion (chart-evidence only).
- entryTiming: early | optimal | late relative to visible impulse/pullback.
- tradeLifecycleExplanation: one concrete sentence tieing stage/timing to visible structure/extremes/momentum.
- conservativeView / aggressiveView: each with takeTrade boolean + explanation anchored to the same evidence; conservative must be stricter when extended or conflicting TFs.
- indicatorInsights[]: only for clearly identifiable tools (RSI, MACD, VWAP, Bollinger, EMA stack, etc.). Each item: indicator name, visibility (visible|unclear|not_visible), observation (what is seen), interpretation (what it implies IF visible). Never invent oscillator numbers.
`;

function shallowStringFieldsForAudit(obj, out = []) {
  if (obj == null) return out;
  if (typeof obj === 'string') {
    out.push(obj);
    return out;
  }
  if (Array.isArray(obj)) {
    for (const x of obj) shallowStringFieldsForAudit(x, out);
    return out;
  }
  if (typeof obj === 'object') {
    for (const k of Object.keys(obj)) shallowStringFieldsForAudit(obj[k], out);
  }
  return out;
}

function collectVagueSnippetHits(result) {
  const texts = shallowStringFieldsForAudit(result, []);
  const hits = [];
  const lowerBundles = texts.map((t) => String(t).toLowerCase());
  for (const snippet of VAGUE_SNIPPET_HINTS) {
    const s = snippet.toLowerCase();
    for (let i = 0; i < lowerBundles.length; i++) {
      if (lowerBundles[i].includes(s)) {
        hits.push(snippet);
        break;
      }
    }
  }
  return hits;
}

function countUnclearCriteria(result) {
  let n = 0;
  for (const sec of result.sections || []) {
    for (const c of sec.criteriaResults || []) {
      if (c.result === 'unclear') n++;
    }
  }
  return n;
}

function buildDecisionSupport(result) {
  const strengths = (result.sections || []).flatMap((s) => s.whatAiSees || []).filter(Boolean).slice(0, 12);
  const weaknesses = [
    ...(result.timeframeAnalysis?.contradictions || []),
    ...(result.sections || []).flatMap((s) => s.issues || []),
  ].filter(Boolean).slice(0, 12);
  const risks = [...(result.forecast?.cautionNotes || [])].filter(Boolean).slice(0, 10);
  const improvements = (result.sections || []).flatMap((s) => s.whatWouldImproveIt || []).filter(Boolean).slice(0, 12);
  return {
    strengths,
    weaknesses,
    risks,
    improvements,
  };
}

function roundWeight(x) {
  return Math.round(x * 10000) / 10000;
}

function inferHtfConflictSeverity({ contradictions, higherTimeframeBias, midTimeframeBias, lowerTimeframeBias }) {
  const contN = (contradictions || []).length;
  const h = sanitizeEnum(safeString(higherTimeframeBias).toLowerCase(), BIAS_OPTIONS, 'unclear');
  const m = sanitizeEnum(safeString(midTimeframeBias).toLowerCase(), BIAS_OPTIONS, 'unclear');
  const l = sanitizeEnum(safeString(lowerTimeframeBias).toLowerCase(), BIAS_OPTIONS, 'unclear');
  let opposing = false;
  if ((h === 'bullish' && l === 'bearish') || (h === 'bearish' && l === 'bullish')) opposing = true;
  if ((h === 'bullish' && m === 'bearish') || (h === 'bearish' && m === 'bullish')) opposing = true;
  if (contN >= 2 || opposing) return 'major';
  if (contN === 1) return 'minor';
  if (
    h !== 'unclear' &&
    l !== 'unclear' &&
    h !== l &&
    !(['neutral', 'mixed'].includes(h) && ['neutral', 'mixed'].includes(l))
  ) {
    return 'minor';
  }
  return 'none';
}

function resolveStyleBaseWeights(checklistType) {
  if (checklistType === 'scalp') return { chartClarity: 0.28, checklist: 0.38, biasConfidence: 0.34 };
  if (checklistType === 'swing') return { chartClarity: 0.26, checklist: 0.24, biasConfidence: 0.5 };
  return { chartClarity: 0.3, checklist: 0.3, biasConfidence: 0.4 };
}

function mergeAdaptiveWeights(checklistType, instrumentContext) {
  const base = resolveStyleBaseWeights(checklistType);
  const mod = getInstrumentScoringModifiers(instrumentContext || { category: 'unknown', normalizedSymbol: '' });
  let wC = base.chartClarity + (mod.weightDelta.clarity || 0);
  let wK = base.checklist + (mod.weightDelta.checklist || 0);
  let wB = base.biasConfidence + (mod.weightDelta.bias || 0);
  const s = wC + wK + wB;
  if (!(s > 0)) return { weights: base, mod };
  return {
    weights: {
      chartClarity: wC / s,
      checklist: wK / s,
      biasConfidence: wB / s,
    },
    mod,
  };
}

function applyInstrumentScorePenalties(chartClarity, checklistScore, biasScore, instrumentContext) {
  const mod = getInstrumentScoringModifiers(instrumentContext || { category: 'unknown', normalizedSymbol: '' });
  let c = clampScore(chartClarity);
  let k = clampScore(checklistScore);
  let b = clampScore(biasScore);
  const applied = [];
  for (const p of mod.scorePenalties || []) {
    const pts = clampScore(p.points || 0);
    if (pts <= 0) continue;
    const target = p.target === 'bias' ? 'bias' : p.target === 'clarity' ? 'clarity' : 'checklist';
    if (target === 'checklist') k = clampScore(k - pts);
    else if (target === 'bias') b = clampScore(b - pts);
    else c = clampScore(c - pts);
    applied.push({ reason: p.reason, points: pts, target });
  }
  return { chartClarity: c, checklist: k, bias: b, penaltiesApplied: applied, modifiers: mod };
}

function conflictMultiplier(severity) {
  if (severity === 'major') return 0.9;
  if (severity === 'minor') return 0.96;
  return 1;
}

function computeAdaptiveOverallScore(chartClarity, checklistScore, biasConfidence, weightsObj, mult) {
  const v =
    chartClarity * weightsObj.chartClarity +
    checklistScore * weightsObj.checklist +
    biasConfidence * weightsObj.biasConfidence;
  return clampScore(Math.round(v * mult));
}

/** Reference static blend (diagnostics only; final scores use adaptive engine). */
function computeOverallSetupScore({ chartClarityScore, checklistScore, biasConfidenceScore }) {
  return clampScore(Math.round(chartClarityScore * 0.32 + checklistScore * 0.28 + biasConfidenceScore * 0.4));
}

function semanticStrengthWeaknessClash(result) {
  const strengthBlob = (result.sections || [])
    .flatMap((s) => [...(s.whatAiSees || []), safeString(s.whyItMatters)])
    .join(' ')
    .toLowerCase();
  const weaknessBlob = [
    ...(result.timeframeAnalysis?.contradictions || []),
    ...(result.sections || []).flatMap((s) => s.issues || []),
  ]
    .join(' ')
    .toLowerCase();
  const strongTrend =
    /\b(strong uptrend|strong downtrend|clear uptrend|clear downtrend|powerful trend|strong bullish trend|strong bearish trend)\b/.test(
      strengthBlob
    );
  const rangingOrChop =
    /\b(range|chop|choppy|consolidation|ranging|sideways|indecision|unclear direction|no clear bias)\b/.test(weaknessBlob);
  return Boolean(strongTrend && rangingOrChop);
}

function claimsPremiumSetupWithoutEvidence(result, unclearN) {
  if (unclearN < 5) return false;
  const blob = shallowStringFieldsForAudit(result, []).join(' ').toLowerCase();
  return /\b(clear setup|high-quality setup|very clean setup|a\+\s*setup|exceptional setup)\b/.test(blob);
}

function collectIndicatorNumericFlags(result) {
  const texts = shallowStringFieldsForAudit(result, []);
  const flags = [];
  const re = /\b(RSI|MACD|stoch(?:astic)?|CCI|Williams)\b[^.]{0,120}?(\b\d{2,3}(?:\.\d+)?\b)/i;
  for (const t of texts) {
    const s = String(t);
    if (!re.test(s)) continue;
    if (/not clearly visible|unreadable|cannot confirm|not confirmed|not legible|approximate|unclear in image/i.test(s)) {
      continue;
    }
    if (/Observation:\s*not clearly visible/i.test(s)) continue;
    flags.push(s.slice(0, 220));
    if (flags.length >= 6) break;
  }
  return flags;
}

function normalizeIndicatorInsights(raw) {
  const arr = Array.isArray(raw.indicatorInsights) ? raw.indicatorInsights : [];
  return arr
    .map((row) => {
      if (row == null || typeof row !== 'object') return null;
      const indicator = safeString(row.indicator || row.name || row.type);
      const visibility = sanitizeEnum(safeString(row.visibility).toLowerCase(), INDICATOR_VISIBILITY_OPTIONS, 'unclear');
      const observation = safeString(row.observation);
      const interpretation = safeString(row.interpretation);
      if (!indicator && !observation && !interpretation) return null;
      return {
        indicator: indicator || 'unspecified',
        visibility,
        observation,
        interpretation,
      };
    })
    .filter(Boolean)
    .slice(0, 8);
}

function inferTradeLifecycleHeuristic(result) {
  const issues = (result.sections || [])
    .flatMap((s) => s.issues || [])
    .join(' ')
    .toLowerCase();
  const mc = result.summary?.marketCondition || 'indecision';
  const score = result.scores?.overallSetupScore ?? 50;
  let tradeStage = 'developing';
  let entryTiming = 'optimal';
  let tradeLifecycleExplanation =
    'Lifecycle maps between the last material swing and the current reaction; compare impulse length vs pullback depth on your execution TF.';
  if (/\b(extended|late|chasing|overextended|stretched|climactic)\b/.test(issues)) {
    tradeStage = 'extended';
    entryTiming = 'late';
    tradeLifecycleExplanation =
      'Price language suggests a late / crowded leg — continuation needs fresh acceptance; mean-reversion risk rises without it.';
  } else if (/\b(exhaustion|exhausted|blow-?off|parabolic|thrust)\b/.test(issues)) {
    tradeStage = 'exhaustion';
    entryTiming = 'late';
    tradeLifecycleExplanation =
      'Momentum looks exhausted/climactic relative to recent structure; prioritize defense and wait for reset or clear failure swing.';
  } else if (mc === 'pullback' && score >= 58) {
    tradeStage = 'developing';
    entryTiming = 'early';
    tradeLifecycleExplanation =
      'Pullback relative to the visible impulse appears early if the defending level holds — confirm with your trigger chart.';
  } else if (mc === 'continuation' && score < 42) {
    tradeStage = 'early_stage';
    entryTiming = 'early';
    tradeLifecycleExplanation =
      'Continuation thesis is early-stage: evidence is thin until price proves acceptance beyond the nearest internal swing.';
  }
  return { tradeStage, entryTiming, tradeLifecycleExplanation };
}

function normalizeTradeLifecycle(raw, result) {
  const rawStage = safeString(raw.tradeStage).toLowerCase().replace(/\s+/g, '_');
  const rawTiming = safeString(raw.entryTiming).toLowerCase();
  const rawExpl = safeString(raw.tradeLifecycleExplanation);
  let tradeStage = sanitizeEnum(rawStage, TRADE_STAGE_OPTIONS, '');
  let entryTiming = sanitizeEnum(rawTiming, ENTRY_TIMING_OPTIONS, '');
  const inferred = inferTradeLifecycleHeuristic(result);
  tradeStage = tradeStage || inferred.tradeStage;
  entryTiming = entryTiming || inferred.entryTiming;
  return {
    tradeStage,
    entryTiming,
    tradeLifecycleExplanation: safeString(rawExpl, inferred.tradeLifecycleExplanation),
  };
}

function normalizeRiskViews(raw, result) {
  const cRaw = raw.conservativeView && typeof raw.conservativeView === 'object' ? raw.conservativeView : {};
  const aRaw = raw.aggressiveView && typeof raw.aggressiveView === 'object' ? raw.aggressiveView : {};
  const score = result.scores?.overallSetupScore ?? 0;
  const contN = (result.timeframeAnalysis?.contradictions || []).length;
  const clarity = result.scores?.chartClarityScore ?? 0;

  let conservativeView = {
    takeTrade: Boolean(cRaw.takeTrade),
    explanation: safeString(cRaw.explanation, ''),
  };
  let aggressiveView = {
    takeTrade: Boolean(aRaw.takeTrade),
    explanation: safeString(aRaw.explanation, ''),
  };

  if (!conservativeView.explanation) {
    conservativeView.explanation =
      contN >= 2
        ? 'Conservative: skip — timeframe disagreement materially raises failure rate until structure reconciles.'
        : score < 48 || clarity < 45
          ? 'Conservative: stand aside; scores or chart readability do not justify meaningful risk.'
          : 'Conservative: only small, risk-capped trial size with explicit invalidation and live spread/session checks.';
  }
  if (!aggressiveView.explanation) {
    aggressiveView.explanation =
      score >= 62 && contN === 0
        ? 'Aggressive: momentum/structure may justify a tactical probe if you accept noise and size down.'
        : 'Aggressive: treat any entry as an experiment — minimal size, fast invalidation, no averaging into confusion.';
  }

  if (score < 42 || contN >= 2 || clarity < 40) conservativeView.takeTrade = false;
  else if (score >= 70 && contN === 0 && result.summary?.practicalAction === 'executable') conservativeView.takeTrade = true;

  if (score < 38) aggressiveView.takeTrade = false;
  else if (score >= 52 && contN <= 1) aggressiveView.takeTrade = true;

  return { conservativeView, aggressiveView };
}

/**
 * Deterministic quality gates + adaptive scoring + second-pass sanity.
 */
function applyStrictQualityGates(result, gateCtx) {
  const instrumentContext = gateCtx.instrumentContext;
  const checklistType = gateCtx.checklistType || 'intraDay';
  const htfConflictSeverity = gateCtx.htfConflictSeverity || 'none';
  const imageCount = typeof gateCtx.imageCount === 'number' ? gateCtx.imageCount : 0;

  const adjustments = [];
  const gates = [];
  const sanityChecks = {
    semanticContradiction: false,
    clearSetupVersusUnclearChecklist: false,
    indicatorNumericFlags: [],
  };

  const contN = (result.timeframeAnalysis?.contradictions || []).length;
  const unclearN = countUnclearCriteria(result);
  let chartClarity = clampScore(result.scores.chartClarityScore);
  let checklist = clampScore(result.scores.checklistScore);
  let biasConf = clampScore(result.scores.biasConfidenceScore);

  const inst0 = applyInstrumentScorePenalties(chartClarity, checklist, biasConf, instrumentContext);
  chartClarity = inst0.chartClarity;
  checklist = inst0.checklist;
  biasConf = inst0.bias;
  if (inst0.penaltiesApplied.length) {
    for (const p of inst0.penaltiesApplied) {
      adjustments.push(`registry penalty: ${p.target} -${p.points} (${p.reason})`);
    }
  }

  if (contN >= 2) {
    const d = 14;
    biasConf = clampScore(biasConf - d);
    adjustments.push(`contradictions>=2: biasConfidence -${d}`);
    gates.push('Multiple timeframe/signal contradictions — bias confidence reduced.');
  } else if (contN === 1) {
    const d = 6;
    biasConf = clampScore(biasConf - d);
    adjustments.push(`contradictions==1: biasConfidence -${d}`);
  }

  if (unclearN >= 8) {
    const d = 10;
    checklist = clampScore(checklist - d);
    adjustments.push(`unclearCriteria>=8: checklist -${d}`);
    gates.push('Many checklist items unclear from imagery — checklist quality reduced.');
  } else if (unclearN >= 4) {
    const d = 5;
    checklist = clampScore(checklist - d);
    adjustments.push(`unclearCriteria>=4: checklist -${d}`);
  }

  if (chartClarity < 42) {
    const d = 8;
    biasConf = clampScore(biasConf - d);
    adjustments.push(`chartClarity<42: biasConfidence -${d}`);
    gates.push('Low chart clarity — down-weighting directional confidence.');
  }

  if (instrumentContext && !instrumentContext.confirmedOnAura && !instrumentContext.normalizedSymbol) {
    const d = 5;
    biasConf = clampScore(biasConf - d);
    adjustments.push('symbol unresolved: biasConfidence -5');
  } else if (instrumentContext && !instrumentContext.confirmedOnAura) {
    biasConf = clampScore(Math.min(biasConf, 72));
    adjustments.push('symbol not on Aura list: biasConfidence cap 72');
    gates.push('Symbol/category not fully confirmed in Aura registry — conservative bias scoring.');
  }

  const vagueHits = collectVagueSnippetHits(result);
  if (vagueHits.length) {
    const pen = Math.min(3 * vagueHits.length, 15);
    biasConf = clampScore(biasConf - pen);
    adjustments.push(`vagueSnippetHints (${vagueHits.length}): biasConfidence -${pen}`);
    gates.push(`Automated text review flagged generic phrasing (${vagueHits.slice(0, 3).join('; ')}) — tighten chart-observable wording in a future run.`);
  }

  if (semanticStrengthWeaknessClash(result)) {
    sanityChecks.semanticContradiction = true;
    const d = 10;
    biasConf = clampScore(biasConf - d);
    adjustments.push(`sanity: trend vs range/chop language clash, biasConfidence -${d}`);
    gates.push('Sanity check: strong trend language conflicts with range/unclear-direction notes — scores and confidence reduced.');
  }

  if (claimsPremiumSetupWithoutEvidence(result, unclearN)) {
    sanityChecks.clearSetupVersusUnclearChecklist = true;
    checklist = clampScore(checklist - 8);
    biasConf = clampScore(biasConf - 5);
    adjustments.push('sanity: premium "clear setup" phrasing vs many unclear checklist rows');
    gates.push('Sanity check: setup described as premium while checklist is largely unclear — verdict softened.');
  }

  const indFlags = collectIndicatorNumericFlags(result);
  if (indFlags.length) {
    sanityChecks.indicatorNumericFlags = indFlags;
    const pen = Math.min(6 * indFlags.length, 14);
    checklist = clampScore(checklist - pen);
    adjustments.push(`sanity: indicator numeric snippets flagged (${indFlags.length}), checklist -${pen}`);
    gates.push('Sanity check: oscillator/study numbers cited — confirm legibility on image or treat as unconfirmed.');
  }

  const merged = mergeAdaptiveWeights(checklistType, instrumentContext);
  const mult = conflictMultiplier(htfConflictSeverity);
  const overall = computeAdaptiveOverallScore(chartClarity, checklist, biasConf, merged.weights, mult);

  result.scores.chartClarityScore = chartClarity;
  result.scores.checklistScore = checklist;
  result.scores.biasConfidenceScore = biasConf;
  result.scores.overallSetupScore = overall;

  result.adaptiveScoringMeta = {
    engine: 'adaptive_v2',
    checklistType,
    imageCount,
    htfConflictSeverity,
    weightsEffective: {
      chartClarity: roundWeight(merged.weights.chartClarity),
      checklist: roundWeight(merged.weights.checklist),
      biasConfidence: roundWeight(merged.weights.biasConfidence),
    },
    styleBaseWeights: resolveStyleBaseWeights(checklistType),
    categoryWeightDelta: merged.mod.weightDelta,
    registryLabels: merged.mod.labels || [],
    instrumentPenaltiesApplied: inst0.penaltiesApplied,
    conflictMultiplier: mult,
    retiredStaticBlend: '0.32 chart + 0.28 checklist + 0.40 bias (superseded)',
  };

  let label = result.summary.confidenceLabel;
  if (chartClarity < 38 || contN >= 2 || sanityChecks.semanticContradiction) {
    label = 'low';
    gates.push('Confidence forced to low: clarity very weak, major contradictions, or internal reasoning clash.');
  } else if (chartClarity < 52 || contN >= 1 || biasConf < 48 || sanityChecks.indicatorNumericFlags.length) {
    if (label === 'high') label = 'medium';
    gates.push('Confidence capped: clarity, contradiction, bias score, or indicator-sanity triggers medium-at-most.');
  }
  if (instrumentContext && !instrumentContext.confirmedOnAura && label === 'high') {
    label = 'medium';
    gates.push('Confidence capped to medium: instrument not on confirmed Aura list.');
  }
  result.summary.confidenceLabel = sanitizeEnum(label, CONFIDENCE_OPTIONS, 'medium');

  if (
    result.summary.practicalAction === 'executable' &&
    (chartClarity < 48 ||
      contN >= 2 ||
      biasConf < 52 ||
      unclearN >= 6 ||
      sanityChecks.semanticContradiction ||
      sanityChecks.clearSetupVersusUnclearChecklist)
  ) {
    result.summary.practicalAction = 'wait_for_confirmation';
    result.traderAction.actionNow = 'wait_for_confirmation';
    adjustments.push('executable downgraded to wait_for_confirmation (quality gates)');
    gates.push('Executable action downgraded: clarity, contradictions, bias, checklist gaps, or sanity checks insufficient.');
  }

  if (gates.length) {
    const cn = result.forecast.cautionNotes || [];
    for (const g of gates) {
      if (!cn.some((x) => String(x) === g)) cn.push(g);
    }
    result.forecast.cautionNotes = cn.slice(0, 12);
  }

  result.strictQualityAudit = {
    vagueSnippetHits: vagueHits,
    contradictionCount: contN,
    unclearCriteriaCount: unclearN,
    scoreAdjustments: adjustments,
    gatesApplied: gates,
    sanityChecks,
    passedSecondaryValidation:
      gates.length === 0 &&
      vagueHits.length === 0 &&
      contN === 0 &&
      unclearN <= 3 &&
      !sanityChecks.semanticContradiction &&
      !sanityChecks.clearSetupVersusUnclearChecklist &&
      sanityChecks.indicatorNumericFlags.length === 0,
    instrumentPenaltiesApplied: inst0.penaltiesApplied,
  };

  result.decisionSupport = buildDecisionSupport(result);

  result.overallScore = result.scores.overallSetupScore;
  result.confidenceScore = confidenceScoreNumericFromLabel(result.summary.confidenceLabel);
  result.verdictTier = verdictTierFromScore(result.scores.overallSetupScore);
}

function buildSystemPrompt({ rubric, context, images, buckets }) {
  const imageSummary = images
    .map((img) => `- ${img.id}: timeframe=${img.timeframe}, rankMinutes=${img.rank}`)
    .join('\n');

  const bucketSummary = [
    `Higher timeframe charts: ${buckets.higher.map((i) => i.id).join(', ') || 'none'}`,
    `Mid timeframe charts: ${buckets.mid.map((i) => i.id).join(', ') || 'none'}`,
    `Lower timeframe charts: ${buckets.lower.map((i) => i.id).join(', ') || 'none'}`,
  ].join('\n');

  const instrumentBlock = buildInstrumentPromptBlock(context.pair);
  const methodRules = INDICATOR_AND_METHOD_RULES;

  return `You are Aura Terminal's premium multi-timeframe chart analysis engine.

Your output must be deterministic, factual, and conservative when evidence is unclear.
Never overstate certainty. Never guarantee outcomes.

${instrumentBlock}

${methodRules}

${STRICT_ANALYSIS_CONTRACT}

SCORING CONSTANTS (mandatory):
- pass = 20
- partial = 10
- unclear = 5
- fail = 0
Use these exact values everywhere.

TRADER INPUT:
- checklistType: ${context.checklistType}
- checklistLabel: ${rubric.label}
- userDirection: ${context.direction}
- pair: ${context.pair || 'not provided'}
- note: ${context.note || 'not provided'}

CHARTS PROVIDED (${images.length}):
${imageSummary}

MULTI-TF BUCKETS:
${bucketSummary}

CHECKLIST RUBRIC:
${rubricText(rubric)}

ANALYSIS LAYERS:
1) VISUAL EXTRACTION (facts only):
   - Trend, structure, swings, S/R, supply/demand, BOS, CHoCH, liquidity sweeps, FVG/imbalance, momentum, candle rejection/continuation.
   - Note timeframe conflicts and chart clarity issues.
   - No trade call here.

2) BIAS ENGINE:
   - Determine primaryBias: bullish | bearish | neutral | mixed.
   - Determine higher/mid/lower timeframe bias separately.
   - Determine biasMatchWithUser based on userDirection.
   - Include contradiction list when evidence conflicts.
   - Derive biasConfidenceScore from alignment + clarity + structure quality.

3) SCENARIO ENGINE:
   - mostLikelyNextMove, secondaryScenario
   - bullCase, bearCase
   - invalidation condition
   - confirmationNeeded
   - practicalAction: avoid | watch | wait_for_confirmation | executable

CHECKLIST SCORING RULES:
- For each checklist criterion, assign pass/partial/unclear/fail.
- Build sections with:
  name, score (0-100), verdict (strong/moderate/weak/unclear), whatAiSees[], whyItMatters, issues[], whatWouldImproveIt[]
- checklistScore is average of section scores.

SCORE OUTPUT (subscores — Aura recomputes final overall using adaptive style/category weights + conflict multiplier):
- chartClarityScore (0-100): image readability, symbol/timeframe clarity, how cleanly structure reads
- checklistScore (0-100): rubric criteria strength (from section scores)
- biasConfidenceScore (0-100): HTF/MTF/LTF alignment and contradiction penalty
- overallSetupScore (0-100): your interim estimate; must be coherent with the three subscores above.
- Penalize: ambiguous structure, HTF vs LTF conflict, unreadable or cropped chart, unclear indicator identity
- Reward: aligned TFs, visible invalidation, sensible R:R sketch from visible swings, indicator confluence ONLY if observed

INDICATOR INSIGHTS (only if visible):
Populate indicatorInsights[] when you can name the tool from the chart (RSI, MACD, VWAP, Bollinger, EMA stack, stoch, etc.).
For each row: indicator, visibility (visible|unclear|not_visible), observation (what the chart shows), interpretation (meaning ONLY if visible).
Patterns to mention when genuinely seen: RSI swing divergence vs price, MACD histogram/momentum flip, VWAP reclaim/reject, Bollinger squeeze vs expansion, EMA bullish/bearish stacking or compression.
If unsure, set visibility unclear/not_visible and avoid numbers.

SETUP STYLE (internal reasoning — reflect in marketCondition / whatAiSees text when applicable):
Consider: breakout, reversal, continuation, pullback, range, momentum impulse, discrete liquidity sweep, discretionary multi-factor confluence.

OUTPUT SHAPE:
Return valid JSON only matching this contract:
{
  "summary": {
    "primaryBias": "bullish|bearish|neutral|mixed",
    "biasMatchWithUser": true|false|null,
    "marketCondition": "continuation|pullback|reversal|range|indecision",
    "mostLikelyNextMove": "string",
    "confidenceLabel": "high|medium|low",
    "practicalAction": "avoid|watch|wait_for_confirmation|executable"
  },
  "scores": {
    "chartClarityScore": 0,
    "checklistScore": 0,
    "biasConfidenceScore": 0,
    "overallSetupScore": 0
  },
  "timeframeAnalysis": {
    "higherTimeframeBias": "bullish|bearish|neutral|mixed|unclear",
    "midTimeframeBias": "bullish|bearish|neutral|mixed|unclear",
    "lowerTimeframeBias": "bullish|bearish|neutral|mixed|unclear",
    "alignmentSummary": "string",
    "contradictions": ["string"]
  },
  "sections": [{
    "name": "string",
    "score": 0,
    "verdict": "strong|moderate|weak|unclear",
    "whatAiSees": ["string"],
    "whyItMatters": "string",
    "issues": ["string"],
    "whatWouldImproveIt": ["string"],
    "criteriaResults": [{
      "criterion": "string",
      "result": "pass|partial|unclear|fail",
      "note": "string"
    }]
  }],
  "forecast": {
    "mostLikelyNextMove": "string",
    "secondaryScenario": "string",
    "bullCase": "string",
    "bearCase": "string",
    "invalidation": "string",
    "confirmationNeeded": ["string"],
    "probabilityBand": "low|moderate|high",
    "cautionNotes": ["string"]
  },
  "traderAction": {
    "actionNow": "avoid|watch|wait_for_confirmation|executable",
    "reason": "string",
    "whatToWaitFor": ["string"],
    "whatInvalidatesTheSetup": "string",
    "manualChecks": ["string"]
  },
  "userExplanation": {
    "headline": "string",
    "summaryParagraph": "string",
    "biasExplanation": "string",
    "nextMoveExplanation": "string",
    "actionExplanation": "string"
  },
  "traderAnswers": {
    "whatIsChartShowing": "string",
    "isMyBiasCorrect": "string",
    "whatLikelyNext": "string",
    "whatInvalidatesView": "string",
    "shouldIActNow": "string"
  },
  "tradeStage": "early_stage|developing|extended|exhaustion",
  "entryTiming": "early|optimal|late",
  "tradeLifecycleExplanation": "string",
  "indicatorInsights": [{
    "indicator": "string",
    "visibility": "visible|unclear|not_visible",
    "observation": "string",
    "interpretation": "string"
  }],
  "conservativeView": { "takeTrade": true|false, "explanation": "string" },
  "aggressiveView": { "takeTrade": true|false, "explanation": "string" }
}

Critical:
- If chart quality is weak, lower confidence and action aggressiveness.
- Use probability language when evidence is mixed, but still anchor claims to chart observations (never empty hedging).
- Do not output markdown, comments, or extra keys.
- JSON string values must not contain raw line breaks; use \\n inside strings instead.
- every whatAiSees[] entry MUST use "Observation: … | Meaning: … | Implication: …" format.`;
}

function buildUserInstruction(images, buckets) {
  const order = [...buckets.higher, ...buckets.mid, ...buckets.lower].map((i) => `${i.id}:${i.timeframe}`).join(' | ');
  return `Use multi-timeframe order high->mid->low: ${order || 'single chart'}.
Read each uploaded chart, connect structure across timeframes, and fill every output field.
Be strict with contradictions and chart-quality penalties.
Include tradeStage, entryTiming, tradeLifecycleExplanation, indicatorInsights (use [] if nothing is confident), conservativeView, aggressiveView.
Before returning JSON, re-read STRICT ANALYSIS CONTRACT: scores must match listed issues/contradictions; no generic filler; Observation|Meaning|Implication on each whatAiSees bullet;
internal validation: visible evidence only, no invented indicator values, conservativeView stricter than aggressiveView when structure is extended or TFs conflict.`;
}

function buildJsonSchema() {
  return {
    name: 'premium_chart_analysis',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        summary: {
          type: 'object',
          additionalProperties: false,
          properties: {
            primaryBias: { type: 'string' },
            biasMatchWithUser: { type: ['boolean', 'null'] },
            marketCondition: { type: 'string' },
            mostLikelyNextMove: { type: 'string' },
            confidenceLabel: { type: 'string' },
            practicalAction: { type: 'string' },
          },
          required: ['primaryBias', 'biasMatchWithUser', 'marketCondition', 'mostLikelyNextMove', 'confidenceLabel', 'practicalAction'],
        },
        scores: {
          type: 'object',
          additionalProperties: false,
          properties: {
            chartClarityScore: { type: 'number' },
            checklistScore: { type: 'number' },
            biasConfidenceScore: { type: 'number' },
            overallSetupScore: { type: 'number' },
          },
          required: ['chartClarityScore', 'checklistScore', 'biasConfidenceScore', 'overallSetupScore'],
        },
        timeframeAnalysis: {
          type: 'object',
          additionalProperties: false,
          properties: {
            higherTimeframeBias: { type: 'string' },
            midTimeframeBias: { type: 'string' },
            lowerTimeframeBias: { type: 'string' },
            alignmentSummary: { type: 'string' },
            contradictions: { type: 'array', items: { type: 'string' } },
          },
          required: ['higherTimeframeBias', 'midTimeframeBias', 'lowerTimeframeBias', 'alignmentSummary', 'contradictions'],
        },
        sections: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: { type: 'string' },
              score: { type: 'number' },
              verdict: { type: 'string' },
              whatAiSees: { type: 'array', items: { type: 'string' } },
              whyItMatters: { type: 'string' },
              issues: { type: 'array', items: { type: 'string' } },
              whatWouldImproveIt: { type: 'array', items: { type: 'string' } },
              criteriaResults: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    criterion: { type: 'string' },
                    result: { type: 'string' },
                    note: { type: 'string' },
                  },
                  required: ['criterion', 'result', 'note'],
                },
              },
            },
            required: ['name', 'score', 'verdict', 'whatAiSees', 'whyItMatters', 'issues', 'whatWouldImproveIt', 'criteriaResults'],
          },
        },
        forecast: {
          type: 'object',
          additionalProperties: false,
          properties: {
            mostLikelyNextMove: { type: 'string' },
            secondaryScenario: { type: 'string' },
            bullCase: { type: 'string' },
            bearCase: { type: 'string' },
            invalidation: { type: 'string' },
            confirmationNeeded: { type: 'array', items: { type: 'string' } },
            probabilityBand: { type: 'string' },
            cautionNotes: { type: 'array', items: { type: 'string' } },
          },
          required: ['mostLikelyNextMove', 'secondaryScenario', 'bullCase', 'bearCase', 'invalidation', 'confirmationNeeded', 'probabilityBand', 'cautionNotes'],
        },
        traderAction: {
          type: 'object',
          additionalProperties: false,
          properties: {
            actionNow: { type: 'string' },
            reason: { type: 'string' },
            whatToWaitFor: { type: 'array', items: { type: 'string' } },
            whatInvalidatesTheSetup: { type: 'string' },
            manualChecks: { type: 'array', items: { type: 'string' } },
          },
          required: ['actionNow', 'reason', 'whatToWaitFor', 'whatInvalidatesTheSetup', 'manualChecks'],
        },
        userExplanation: {
          type: 'object',
          additionalProperties: false,
          properties: {
            headline: { type: 'string' },
            summaryParagraph: { type: 'string' },
            biasExplanation: { type: 'string' },
            nextMoveExplanation: { type: 'string' },
            actionExplanation: { type: 'string' },
          },
          required: ['headline', 'summaryParagraph', 'biasExplanation', 'nextMoveExplanation', 'actionExplanation'],
        },
        traderAnswers: {
          type: 'object',
          additionalProperties: false,
          properties: {
            whatIsChartShowing: { type: 'string' },
            isMyBiasCorrect: { type: 'string' },
            whatLikelyNext: { type: 'string' },
            whatInvalidatesView: { type: 'string' },
            shouldIActNow: { type: 'string' },
          },
          required: ['whatIsChartShowing', 'isMyBiasCorrect', 'whatLikelyNext', 'whatInvalidatesView', 'shouldIActNow'],
        },
        tradeStage: { type: 'string' },
        entryTiming: { type: 'string' },
        tradeLifecycleExplanation: { type: 'string' },
        indicatorInsights: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              indicator: { type: 'string' },
              visibility: { type: 'string' },
              observation: { type: 'string' },
              interpretation: { type: 'string' },
            },
            required: ['indicator', 'visibility', 'observation', 'interpretation'],
          },
        },
        conservativeView: {
          type: 'object',
          additionalProperties: false,
          properties: {
            takeTrade: { type: 'boolean' },
            explanation: { type: 'string' },
          },
          required: ['takeTrade', 'explanation'],
        },
        aggressiveView: {
          type: 'object',
          additionalProperties: false,
          properties: {
            takeTrade: { type: 'boolean' },
            explanation: { type: 'string' },
          },
          required: ['takeTrade', 'explanation'],
        },
      },
      required: [
        'summary',
        'scores',
        'timeframeAnalysis',
        'sections',
        'forecast',
        'traderAction',
        'userExplanation',
        'traderAnswers',
        'tradeStage',
        'entryTiming',
        'tradeLifecycleExplanation',
        'indicatorInsights',
        'conservativeView',
        'aggressiveView',
      ],
    },
  };
}

async function callOpenAIVision(images, systemPrompt, userPrompt) {
  const imageContent = images.map((img) => ({
    type: 'image_url',
    image_url: {
      url: `data:${img.mimeType};base64,${img.base64}`,
      detail: 'low',
    },
  }));

  const jsonOnlyReminder =
    '\n\nRespond with a single valid JSON object exactly matching the OUTPUT SHAPE contract. ' +
    'No markdown code fences, no commentary before or after the JSON. Use double quotes for all keys and strings. ' +
    'No trailing commas. Escape any double quotes inside string values as \\". ' +
    'Never put raw line breaks inside a JSON string — use \\n for newlines inside strings. ' +
    'Do not use single quotes for JSON.';

  const envTok = Number(process.env.PERPLEXITY_CHART_CHECK_MAX_TOKENS);
  const fromEnv = Number.isFinite(envTok) && envTok >= 512 ? envTok : 10000;
  const maxOut = Math.min(16384, Math.max(4096, fromEnv));

  const baseBody = {
    model: PERPLEXITY_MODEL,
    temperature: 0.05,
    max_tokens: maxOut,
    messages: [
      { role: 'system', content: systemPrompt + jsonOnlyReminder },
      { role: 'user', content: [...imageContent, { type: 'text', text: userPrompt }] },
    ],
  };

  // Perplexity rejects response_format json_schema / json_object when the request includes images.
  const { content, finishReason } = await perplexityRequest({ ...baseBody }, 240000);
  if (finishReason === 'length') {
    console.warn('[chart-check] vision completion truncated (finish_reason=length); JSON repair may run');
  }
  return content;
}

/**
 * Text-only follow-up when vision output is not valid JSON (malformed, truncated, or prose).
 * Tries response_format json_object first (supported for text-only); falls back to plain completion.
 */
async function callTextOnlyJsonRepair(brokenRaw) {
  const snippet = safeString(brokenRaw).slice(0, 100000);
  const envRepair = Number(process.env.PERPLEXITY_CHART_REPAIR_MAX_TOKENS);
  const repairMax = Math.min(
    16384,
    Math.max(4096, Number.isFinite(envRepair) && envRepair >= 512 ? envRepair : 12000)
  );
  const baseBody = {
    model: PERPLEXITY_TEXT_MODEL,
    temperature: 0,
    max_tokens: repairMax,
    messages: [
      {
        role: 'system',
        content:
          'You repair JSON. Output exactly one valid JSON object. ' +
          'No markdown fences, no commentary. Use double quotes only. ' +
          'If the input is truncated, close all open strings, arrays, and objects with minimal content so the result parses.',
      },
      {
        role: 'user',
        content:
          'The following was meant to be one JSON object from a chart analysis API. Fix syntax only; keep fields and meaning where possible.\n\n' +
          snippet,
      },
    ],
  };
  try {
    const { content, finishReason } = await perplexityRequest(
      { ...baseBody, response_format: { type: 'json_object' } },
      120000
    );
    if (finishReason === 'length') {
      console.warn('[chart-check] repair (json_object) truncated (finish_reason=length)');
    }
    if (safeString(content).trim()) return content;
  } catch (e) {
    console.warn('[chart-check] repair json_object mode failed, using plain:', e.message?.slice(0, 240) || e);
  }
  const { content, finishReason } = await perplexityRequest(baseBody, 120000);
  if (finishReason === 'length') {
    console.warn('[chart-check] repair (plain) truncated (finish_reason=length)');
  }
  return content;
}

/** First complete top-level `{ ... }` using brace depth, respecting strings (not naive lastIndexOf `}`). */
function extractBalancedJsonObject(str) {
  const start = str.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < str.length; i += 1) {
    const c = str[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === '\\') escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return str.slice(start, i + 1);
    }
  }
  return null;
}

function stripJsonTrailingCommas(s) {
  let out = s;
  let prev;
  do {
    prev = out;
    out = out.replace(/,\s*([}\]])/g, '$1');
  } while (out !== prev);
  return out;
}

function normalizeAiJsonText(raw) {
  let t = safeString(raw).replace(/^\uFEFF/, '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  else t = t.replace(/```json/gi, '').replace(/```/g, '').trim();
  // Curly/smart double quotes break JSON.parse — normalize to ASCII "
  t = t.replace(/\u201C/g, '"').replace(/\u201D/g, '"');
  return stripJsonTrailingCommas(t);
}

function tryJsonParseWithRepair(s) {
  if (!s || typeof s !== 'string') return null;
  const cleaned = stripJsonTrailingCommas(s);
  try {
    const v = JSON.parse(cleaned);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    try {
      const v = JSON.parse(jsonrepair(cleaned));
      return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
    } catch {
      return null;
    }
  }
}

/** Returns parsed object or null (never throws). */
function tryParseChartCheckJson(raw) {
  const normalized = normalizeAiJsonText(raw);
  if (!normalized) return null;

  const candidates = [normalized];
  const balanced = extractBalancedJsonObject(normalized);
  if (balanced) candidates.push(balanced);
  const start = normalized.indexOf('{');
  const end = normalized.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(normalized.slice(start, end + 1));

  for (const cand of candidates) {
    const parsed = tryJsonParseWithRepair(cand);
    if (parsed) return parsed;
  }
  return null;
}

function normalizeCriteriaResults(criteriaResults, fallbackCriteria) {
  return fallbackCriteria.map((criterion, idx) => {
    const row = Array.isArray(criteriaResults) ? criteriaResults[idx] || {} : {};
    const result = sanitizeEnum(row.result, ['pass', 'partial', 'unclear', 'fail'], 'unclear');
    return {
      criterion,
      result,
      note: safeString(row.note, result === 'unclear' ? 'Not clearly visible on the chart image.' : 'Visible chart evidence supports this criterion.'),
    };
  });
}

function scoreFromCriteria(criteriaResults) {
  const total = criteriaResults.reduce((sum, item) => sum + (CRITERION_POINTS[item.result] ?? CRITERION_POINTS.unclear), 0);
  return clampScore(total);
}

function verdictFromScore(score) {
  if (score >= 75) return 'strong';
  if (score >= 50) return 'moderate';
  if (score >= 25) return 'weak';
  return 'unclear';
}

function confidenceLabelFromScore(score) {
  if (score >= 75) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}

function computeChecklistScore(sections) {
  if (!sections.length) return 0;
  const total = sections.reduce((sum, s) => sum + clampScore(s.score), 0);
  return clampScore(Math.round(total / sections.length));
}

function normalizeSections(rawSections, rubricSections) {
  return rubricSections.map((rs, idx) => {
    const incoming = Array.isArray(rawSections) ? rawSections[idx] || {} : {};
    const criteriaResults = normalizeCriteriaResults(incoming.criteriaResults, rs.criteria);
    const computedScore = scoreFromCriteria(criteriaResults);
    return {
      name: safeString(incoming.name, rs.name),
      score: computedScore,
      verdict: sanitizeEnum(incoming.verdict, VERDICT_OPTIONS, verdictFromScore(computedScore)),
      whatAiSees: safeArrayStrings(incoming.whatAiSees, 8),
      whyItMatters: safeString(incoming.whyItMatters, 'This section influences setup quality and execution odds.'),
      issues: safeArrayStrings(incoming.issues, 8),
      whatWouldImproveIt: safeArrayStrings(incoming.whatWouldImproveIt, 8),
      criteriaResults,
    };
  });
}

function normalizeContradictions(raw) {
  return safeArrayStrings(raw, 10);
}

function verdictTierFromScore(score) {
  const s = clampScore(score);
  if (s >= 82) return 'strong';
  if (s >= 68) return 'favorable';
  if (s >= 48) return 'moderate';
  if (s >= 28) return 'weak';
  return 'unclear';
}

function confidenceScoreNumericFromLabel(label) {
  const l = safeString(label).toLowerCase();
  if (l === 'high') return 78;
  if (l === 'medium') return 55;
  return 32;
}

function buildEducationalNote(result) {
  const inv = safeString(result.forecast?.invalidation, '');
  const conf = safeArrayStrings(result.forecast?.confirmationNeeded, 3).join('; ');
  const cat = result.instrumentContext?.category || 'this market';
  const lines = [
    `Treat your ${cat} chart as conditional: wait for confirmation when scores are mixed.`,
    conf ? `Need: ${conf}` : 'Define what would prove the idea wrong before sizing up.',
    inv ? `Invalidation sketch: ${inv.slice(0, 220)}` : 'Mark invalidation from the chart’s last swing or zone.',
    'Journal the plan and align with your The Operator checklist before execution.',
  ];
  return lines.join(' ');
}

function normalizeResult(raw, { rubric, checklistType, context, imageCount = 0 }) {
  const summaryRaw = raw.summary || {};
  const timeframeRaw = raw.timeframeAnalysis || {};
  const forecastRaw = raw.forecast || {};
  const actionRaw = raw.traderAction || {};
  const explanationRaw = raw.userExplanation || {};
  const answersRaw = raw.traderAnswers || {};
  const sections = normalizeSections(raw.sections, rubric.sections);
  const contradictions = normalizeContradictions(timeframeRaw.contradictions);

  const chartClarityScore = clampScore(raw?.scores?.chartClarityScore, 55);
  const checklistScore = computeChecklistScore(sections);
  const biasConfidenceScore = clampScore(raw?.scores?.biasConfidenceScore, 50);

  const instrumentContext = resolveInstrumentIntelligence(context.pair);
  const htfConflictSeverity = inferHtfConflictSeverity({
    contradictions,
    higherTimeframeBias: timeframeRaw.higherTimeframeBias,
    midTimeframeBias: timeframeRaw.midTimeframeBias,
    lowerTimeframeBias: timeframeRaw.lowerTimeframeBias,
  });
  const mergedPreview = mergeAdaptiveWeights(checklistType, instrumentContext);
  const overallSetupScore = computeAdaptiveOverallScore(
    chartClarityScore,
    checklistScore,
    biasConfidenceScore,
    mergedPreview.weights,
    conflictMultiplier(htfConflictSeverity)
  );

  const practicalAction = sanitizeEnum(summaryRaw.practicalAction || actionRaw.actionNow, ACTION_OPTIONS, 'watch');
  const confidenceLabel = sanitizeEnum(summaryRaw.confidenceLabel, CONFIDENCE_OPTIONS, confidenceLabelFromScore(biasConfidenceScore));
  const primaryBias = sanitizeEnum(summaryRaw.primaryBias, ['bullish', 'bearish', 'neutral', 'mixed'], 'mixed');
  const marketCondition = sanitizeEnum(summaryRaw.marketCondition, CONDITION_OPTIONS, 'indecision');

  let biasMatchWithUser = null;
  if (context.direction === 'buy' && ['bullish'].includes(primaryBias)) biasMatchWithUser = true;
  if (context.direction === 'sell' && ['bearish'].includes(primaryBias)) biasMatchWithUser = true;
  if (context.direction === 'unsure') biasMatchWithUser = null;
  if (biasMatchWithUser !== true && context.direction !== 'unsure' && ['bullish', 'bearish', 'neutral', 'mixed'].includes(primaryBias)) {
    biasMatchWithUser = context.direction === 'buy' ? primaryBias !== 'bearish' : primaryBias !== 'bullish';
  }
  if (typeof summaryRaw.biasMatchWithUser === 'boolean') biasMatchWithUser = summaryRaw.biasMatchWithUser;

  const result = {
    summary: {
      primaryBias,
      biasMatchWithUser,
      marketCondition,
      mostLikelyNextMove: safeString(summaryRaw.mostLikelyNextMove, safeString(forecastRaw.mostLikelyNextMove, 'Price likely remains reactive at current structure until confirmation appears.')),
      confidenceLabel,
      practicalAction,
    },
    scores: {
      chartClarityScore,
      checklistScore,
      biasConfidenceScore,
      overallSetupScore,
    },
    timeframeAnalysis: {
      higherTimeframeBias: sanitizeEnum(timeframeRaw.higherTimeframeBias, BIAS_OPTIONS, 'unclear'),
      midTimeframeBias: sanitizeEnum(timeframeRaw.midTimeframeBias, BIAS_OPTIONS, 'unclear'),
      lowerTimeframeBias: sanitizeEnum(timeframeRaw.lowerTimeframeBias, BIAS_OPTIONS, 'unclear'),
      alignmentSummary: safeString(timeframeRaw.alignmentSummary, 'Timeframes show mixed structure and need confirmation alignment.'),
      contradictions,
    },
    sections,
    forecast: {
      mostLikelyNextMove: safeString(forecastRaw.mostLikelyNextMove, safeString(summaryRaw.mostLikelyNextMove, 'Continuation attempt from current structure if confirmation appears.')),
      secondaryScenario: safeString(forecastRaw.secondaryScenario, 'Failed continuation and rotation into nearby opposing liquidity.'),
      bullCase: safeString(forecastRaw.bullCase, 'Bull case requires reclaimed structure with follow-through momentum.'),
      bearCase: safeString(forecastRaw.bearCase, 'Bear case requires rejection at resistance and lower-high continuation.'),
      invalidation: safeString(forecastRaw.invalidation, 'Setup invalidates on decisive break beyond the mapped invalidation zone.'),
      confirmationNeeded: safeArrayStrings(forecastRaw.confirmationNeeded, 8),
      probabilityBand: sanitizeEnum(forecastRaw.probabilityBand, PROBABILITY_OPTIONS, 'moderate'),
      cautionNotes: safeArrayStrings(forecastRaw.cautionNotes, 8),
    },
    traderAction: {
      actionNow: sanitizeEnum(actionRaw.actionNow, ACTION_OPTIONS, practicalAction),
      reason: safeString(actionRaw.reason, 'Action depends on structure confirmation and risk-defined execution.'),
      whatToWaitFor: safeArrayStrings(actionRaw.whatToWaitFor, 8),
      whatInvalidatesTheSetup: safeString(actionRaw.whatInvalidatesTheSetup, safeString(forecastRaw.invalidation, 'Invalidates on clear structural break against thesis.')),
      manualChecks: safeArrayStrings(actionRaw.manualChecks, 8),
    },
    userExplanation: {
      headline: safeString(explanationRaw.headline, 'Multi-timeframe chart analysis complete'),
      summaryParagraph: safeString(explanationRaw.summaryParagraph, 'The chart shows a developing structure with actionable context but requires disciplined confirmation.'),
      biasExplanation: safeString(explanationRaw.biasExplanation, 'Bias is derived from higher-timeframe structure first, then refined on lower timeframe behavior.'),
      nextMoveExplanation: safeString(explanationRaw.nextMoveExplanation, 'The next move depends on whether price confirms continuation at current structure.'),
      actionExplanation: safeString(explanationRaw.actionExplanation, 'Wait for confirmation if alignment is mixed; execute only when invalidation and trigger are clear.'),
    },
    traderAnswers: {
      whatIsChartShowing: safeString(
        answersRaw.whatIsChartShowing,
        `${safeString(summaryRaw.marketCondition, 'Mixed')} structure with ${safeString(summaryRaw.primaryBias, 'mixed')} directional pressure.`
      ),
      isMyBiasCorrect: safeString(
        answersRaw.isMyBiasCorrect,
        context.direction === 'unsure'
          ? 'You did not provide a fixed bias. The chart currently suggests a conditional directional read.'
          : (biasMatchWithUser ? 'Your stated bias is broadly supported by the visible chart evidence.' : 'Your stated bias is not fully supported by the visible chart evidence right now.')
      ),
      whatLikelyNext: safeString(
        answersRaw.whatLikelyNext,
        safeString(forecastRaw.mostLikelyNextMove, 'The next move remains conditional on confirmation at the current structure.')
      ),
      whatInvalidatesView: safeString(
        answersRaw.whatInvalidatesView,
        safeString(forecastRaw.invalidation, 'A clear structural break through invalidation levels would invalidate this view.')
      ),
      shouldIActNow: safeString(
        answersRaw.shouldIActNow,
        `Current action: ${sanitizeEnum(actionRaw.actionNow || summaryRaw.practicalAction, ACTION_OPTIONS, 'watch')}.`
      ),
    },
    indicatorInsights: normalizeIndicatorInsights(raw),
  };

  // Backward compatibility fields for existing UI paths.
  result.overallScore = result.scores.overallSetupScore;
  result.confidence = result.summary.confidenceLabel;
  result.confidenceScore = confidenceScoreNumericFromLabel(result.summary.confidenceLabel);
  result.verdictTier = verdictTierFromScore(result.scores.overallSetupScore);
  result.instrumentContext = instrumentContext;
  result.statusLabel = result.summary.practicalAction === 'executable' ? 'Executable Setup' : 'Conditional Setup';
  result.statusEmoji = result.summary.practicalAction === 'executable' ? '🟢' : '🟡';
  result.checklistType = checklistType;
  result.checklistLabel = rubric.label;
  result.imageQuality = result.scores.chartClarityScore >= 75 ? 'good' : result.scores.chartClarityScore >= 45 ? 'acceptable' : 'poor';
  result.manualConfirmation = result.traderAction.manualChecks.slice(0, 4);
  result.missing = result.sections
    .flatMap((s) => s.criteriaResults.filter((c) => c.result === 'unclear').map((c) => c.criterion))
    .slice(0, 4);

  applyStrictQualityGates(result, { instrumentContext, checklistType, htfConflictSeverity, imageCount });

  const life = normalizeTradeLifecycle(raw, result);
  result.tradeStage = life.tradeStage;
  result.entryTiming = life.entryTiming;
  result.tradeLifecycleExplanation = life.tradeLifecycleExplanation;

  const riskViews = normalizeRiskViews(raw, result);
  result.conservativeView = riskViews.conservativeView;
  result.aggressiveView = riskViews.aggressiveView;

  result.educationalTraderNote = buildEducationalNote(result);
  if (result.strictQualityAudit?.scoreAdjustments?.length) {
    result.educationalTraderNote = `${result.educationalTraderNote} [Review] ${result.strictQualityAudit.scoreAdjustments.join('; ')}.`;
  }

  result.positives = result.decisionSupport?.strengths?.slice(0, 4) || result.sections.flatMap((s) => s.whatAiSees).slice(0, 4);
  result.concerns = [
    ...(result.decisionSupport?.weaknesses || []),
    ...(result.timeframeAnalysis.contradictions || []),
  ]
    .filter(Boolean)
    .slice(0, 6);

  result.scoringMeta = {
    adaptiveEngine: result.adaptiveScoringMeta || null,
    overallWeighting:
      'overallSetupScore = adaptive blend: style base (scalp vs intraDay vs swing) + registry category weight deltas + HTF/LTF conflict multiplier; registry score penalties applied before blend',
    instrumentAware: true,
    instrumentConfirmedOnAura: Boolean(instrumentContext.confirmedOnAura),
    preGateConflictSeverity: htfConflictSeverity,
    strictQuality: {
      passedSecondaryValidation: Boolean(result.strictQualityAudit?.passedSecondaryValidation),
      vagueHits: result.strictQualityAudit?.vagueSnippetHits?.length || 0,
      gates: (result.strictQualityAudit?.gatesApplied || []).length,
      sanityChecks: result.strictQualityAudit?.sanityChecks || null,
    },
  };
  return result;
}

function validateRequestBody(body) {
  const checklistType = safeString(body.checklistType);
  if (!CHECKLIST_TYPES.includes(checklistType)) {
    return { ok: false, message: 'checklistType must be scalp, intraDay, or swing' };
  }
  return { ok: true };
}

function stripBase64Payload(raw) {
  const s = String(raw || '').trim();
  if (s.startsWith('data:')) {
    const comma = s.indexOf(',');
    if (comma !== -1) return s.slice(comma + 1);
  }
  return s;
}

function normalizeChartMetadata(body) {
  const list = [];
  if (Array.isArray(body.images) && body.images.length) {
    body.images.slice(0, MAX_IMAGES).forEach((img, idx) => {
      if (!img || typeof img.base64 !== 'string') return;
      list.push({
        id: `chart_${idx + 1}`,
        base64: stripBase64Payload(img.base64),
        mimeType: ALLOWED_MIME_TYPES.includes(img.mimeType) ? img.mimeType : 'image/jpeg',
        timeframe: safeString(img.timeframe, 'N/A'),
      });
    });
  } else if (typeof body.image === 'string' && body.image) {
    list.push({
      id: 'chart_1',
      base64: stripBase64Payload(body.image),
      mimeType: ALLOWED_MIME_TYPES.includes(body.mimeType) ? body.mimeType : 'image/jpeg',
      timeframe: safeString(body.timeframe, 'N/A'),
    });
  }
  const images = list.map((img) => ({ ...img, rank: timeframeRank(img.timeframe) }));
  return {
    images,
    context: {
      checklistType: body.checklistType,
      pair: safeString(body.pair).slice(0, 64) || null,
      direction: normalizeDirection(body.direction),
      note: safeString(body.note).slice(0, 700) || null,
    },
  };
}

function validateNormalizedImages(images) {
  if (!images.length) return { ok: false, message: 'At least one chart image is required' };
  if (images.length > MAX_IMAGES) return { ok: false, message: `Maximum ${MAX_IMAGES} images allowed` };
  for (const img of images) {
    if (!ALLOWED_MIME_TYPES.includes(img.mimeType)) {
      return { ok: false, message: `Unsupported image type: ${img.mimeType}` };
    }
    if (img.base64.length > MAX_BASE64_LEN) {
      return { ok: false, message: 'One or more images exceed the 10MB limit.' };
    }
  }
  return { ok: true };
}

async function runAiAnalysisPipeline({ rubric, context, images }) {
  const buckets = buildTimeframeBuckets(images);
  const systemPrompt = buildSystemPrompt({ rubric, context, images, buckets });
  const userPrompt = buildUserInstruction(images, buckets);
  const raw = await callOpenAIVision(images, systemPrompt, userPrompt);
  if (!safeString(raw).trim()) {
    throw new Error('Empty response from vision model');
  }
  let parsed = tryParseChartCheckJson(raw);
  if (parsed) return parsed;
  console.warn('[chart-check] vision JSON parse failed; running text-only repair pass');
  let repaired = '';
  try {
    repaired = await callTextOnlyJsonRepair(raw);
    parsed = tryParseChartCheckJson(repaired);
  } catch (e) {
    console.warn('[chart-check] JSON repair request failed:', e.message);
  }
  if (parsed) return parsed;
  if (safeString(repaired).trim()) {
    try {
      console.warn('[chart-check] second JSON repair pass (re-parsing repair output)');
      const repaired2 = await callTextOnlyJsonRepair(repaired);
      parsed = tryParseChartCheckJson(repaired2);
    } catch (e2) {
      console.warn('[chart-check] second JSON repair failed:', e2.message);
    }
  }
  if (parsed) return parsed;
  throw new Error('AI returned non-JSON response');
}

async function ensureTableReady() {
  try {
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS ai_chart_checks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        checklist_type VARCHAR(20) NOT NULL,
        pair VARCHAR(20),
        timeframe VARCHAR(255),
        direction VARCHAR(20),
        overall_score INT,
        status_label VARCHAR(40),
        chart_clarity_score INT NULL,
        checklist_score INT NULL,
        bias_confidence_score INT NULL,
        overall_setup_score INT NULL,
        primary_bias VARCHAR(16) NULL,
        practical_action VARCHAR(40) NULL,
        result_json MEDIUMTEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_created_at (created_at),
        INDEX idx_primary_bias (primary_bias),
        INDEX idx_practical_action (practical_action)
      )
    `);
  } catch (_) {
    // continue
  }

  const alterStatements = [
    'ALTER TABLE ai_chart_checks ADD COLUMN chart_clarity_score INT NULL',
    'ALTER TABLE ai_chart_checks ADD COLUMN checklist_score INT NULL',
    'ALTER TABLE ai_chart_checks ADD COLUMN bias_confidence_score INT NULL',
    'ALTER TABLE ai_chart_checks ADD COLUMN overall_setup_score INT NULL',
    'ALTER TABLE ai_chart_checks ADD COLUMN primary_bias VARCHAR(16) NULL',
    'ALTER TABLE ai_chart_checks ADD COLUMN practical_action VARCHAR(40) NULL',
    'ALTER TABLE ai_chart_checks MODIFY timeframe VARCHAR(255)',
  ];
  for (const sql of alterStatements) {
    try {
      await executeQuery(sql);
    } catch (_) {
      // already exists / non-critical
    }
  }
}

async function persistAnalysis({ userId, context, images, result }) {
  await ensureTableReady();
  const tfSummary = images.map((i) => i.timeframe).join(',');
  await executeQuery(
    `INSERT INTO ai_chart_checks (
      user_id, checklist_type, pair, timeframe, direction, overall_score, status_label,
      chart_clarity_score, checklist_score, bias_confidence_score, overall_setup_score,
      primary_bias, practical_action, result_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      context.checklistType,
      context.pair,
      tfSummary || null,
      context.direction,
      result.scores.overallSetupScore,
      result.statusLabel,
      result.scores.chartClarityScore,
      result.scores.checklistScore,
      result.scores.biasConfidenceScore,
      result.scores.overallSetupScore,
      result.summary.primaryBias,
      result.traderAction.actionNow,
      JSON.stringify(result),
    ]
  );
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const requestId = getOrCreateRequestId(req);
  attachRequestId(res, requestId);

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed',
      errorCode: ERROR_CODES.SYSTEM_ERROR,
      requestId,
    });
  }

  if (!PERPLEXITY_API_KEY) {
    return res.status(500).json({
      success: false,
      message: 'AI service not configured',
      errorCode: ERROR_CODES.SYSTEM_ERROR,
      requestId,
    });
  }

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded?.id) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
      errorCode: ERROR_CODES.SYSTEM_ERROR,
      requestId,
    });
  }
  const userId = decoded.id;

  return runWithRequestContext(requestId, async () => {
    try {
      const body = req.body || {};
      const requestValidation = validateRequestBody(body);
      if (!requestValidation.ok) {
        return res.status(400).json({
          success: false,
          message: requestValidation.message,
          errorCode: ERROR_CODES.SYSTEM_ERROR,
          requestId,
        });
      }

      const { images, context } = normalizeChartMetadata(body);
      const imageValidation = validateNormalizedImages(images);
      if (!imageValidation.ok) {
        return res.status(400).json({
          success: false,
          message: imageValidation.message,
          errorCode: ERROR_CODES.SYSTEM_ERROR,
          requestId,
        });
      }

      const rubric = CHECKLIST_RUBRIC[context.checklistType];
      const rawAnalysis = await runAiAnalysisPipeline({ rubric, context, images });
      const result = normalizeResult(rawAnalysis, {
        rubric,
        checklistType: context.checklistType,
        context,
        imageCount: images.length,
      });
      try {
        await persistAnalysis({ userId, context, images, result });
      } catch (persistErr) {
        console.error('[chart-check] persist warning:', persistErr.message);
      }

      recordChartCheck();
      return res.status(200).json({ success: true, result, requestId });
    } catch (err) {
      const isDev = process.env.NODE_ENV !== 'production' || String(process.env.AURA_DIAGNOSTICS || '').trim() === '1';
      console.error('[chart-check] error:', err.message, err.stack || '');
      return res.status(500).json({
        success: false,
        message: isDev && err.message ? `Analysis failed: ${err.message.slice(0, 240)}` : 'Analysis failed. Please try again.',
        code: err.name === 'AbortError' ? 'UPSTREAM_TIMEOUT' : 'CHART_CHECK_ERROR',
        errorCode: ERROR_CODES.SYSTEM_ERROR,
        requestId,
      });
    }
  });
};
