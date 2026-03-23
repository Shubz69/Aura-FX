/**
 * POST /api/ai/chart-check
 * Premium multi-timeframe AI analysis engine.
 */
const { verifyToken } = require('../utils/auth');
const { executeQuery } = require('../db');
const { getOpenAIModelForVision } = require('./openai-config');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = getOpenAIModelForVision();

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

function buildSystemPrompt({ rubric, context, images, buckets }) {
  const imageSummary = images
    .map((img) => `- ${img.id}: timeframe=${img.timeframe}, rankMinutes=${img.rank}`)
    .join('\n');

  const bucketSummary = [
    `Higher timeframe charts: ${buckets.higher.map((i) => i.id).join(', ') || 'none'}`,
    `Mid timeframe charts: ${buckets.mid.map((i) => i.id).join(', ') || 'none'}`,
    `Lower timeframe charts: ${buckets.lower.map((i) => i.id).join(', ') || 'none'}`,
  ].join('\n');

  return `You are Aura Terminal's premium multi-timeframe chart analysis engine.

Your output must be deterministic, factual, and conservative when evidence is unclear.
Never overstate certainty. Never guarantee outcomes.

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

SCORE OUTPUT:
- chartClarityScore (0-100)
- checklistScore (0-100)
- biasConfidenceScore (0-100)
- overallSetupScore (0-100) weighted from above, with clarity and bias heavily considered.

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
  }
}

Critical:
- If chart quality is weak, lower confidence and action aggressiveness.
- Use probability language and uncertainty when evidence is mixed.
- Do not output markdown, comments, or extra keys.`;
}

function buildUserInstruction(images, buckets) {
  const order = [...buckets.higher, ...buckets.mid, ...buckets.lower].map((i) => `${i.id}:${i.timeframe}`).join(' | ');
  return `Use multi-timeframe order high->mid->low: ${order || 'single chart'}.
Read each uploaded chart, connect structure across timeframes, and fill every output field.
Be strict with contradictions and chart-quality penalties.`;
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
      },
      required: ['summary', 'scores', 'timeframeAnalysis', 'sections', 'forecast', 'traderAction', 'userExplanation', 'traderAnswers'],
    },
  };
}

async function callOpenAIVision(images, systemPrompt, userPrompt) {
  const imageContent = images.map((img) => ({
    type: 'image_url',
    image_url: {
      url: `data:${img.mimeType};base64,${img.base64}`,
      detail: 'high',
    },
  }));

  const baseBody = {
    model: OPENAI_MODEL,
    temperature: 0.05,
    seed: 7741,
    max_tokens: 3600,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: [...imageContent, { type: 'text', text: userPrompt }] },
    ],
  };

  const tryStrict = async () => {
    const body = {
      ...baseBody,
      response_format: {
        type: 'json_schema',
        json_schema: buildJsonSchema(),
      },
    };
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  };

  const tryJsonObject = async () => {
    const body = { ...baseBody, response_format: { type: 'json_object' } };
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  };

  try {
    return await tryStrict();
  } catch (_) {
    return tryJsonObject();
  }
}

function parseAIJson(raw) {
  const cleaned = safeString(raw).replace(/```json/gi, '').replace(/```/g, '').trim();
  if (!cleaned) throw new Error('Empty AI response');
  return JSON.parse(cleaned);
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

function computeOverallSetupScore({ chartClarityScore, checklistScore, biasConfidenceScore }) {
  // Weighted to avoid checklist-only dominance.
  return clampScore(Math.round((chartClarityScore * 0.32) + (checklistScore * 0.28) + (biasConfidenceScore * 0.40)));
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

function normalizeResult(raw, { rubric, checklistType, context }) {
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
  const overallSetupScore = computeOverallSetupScore({ chartClarityScore, checklistScore, biasConfidenceScore });

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
  };

  // Backward compatibility fields for existing UI paths.
  result.overallScore = result.scores.overallSetupScore;
  result.confidence = result.summary.confidenceLabel;
  result.statusLabel = result.summary.practicalAction === 'executable' ? 'Executable Setup' : 'Conditional Setup';
  result.statusEmoji = result.summary.practicalAction === 'executable' ? '🟢' : '🟡';
  result.checklistType = checklistType;
  result.checklistLabel = rubric.label;
  result.imageQuality = result.scores.chartClarityScore >= 75 ? 'good' : result.scores.chartClarityScore >= 45 ? 'acceptable' : 'poor';
  result.positives = result.sections.flatMap((s) => s.whatAiSees).slice(0, 4);
  result.concerns = [...result.timeframeAnalysis.contradictions, ...result.sections.flatMap((s) => s.issues)].slice(0, 4);
  result.manualConfirmation = result.traderAction.manualChecks.slice(0, 4);
  result.missing = result.sections
    .flatMap((s) => s.criteriaResults.filter((c) => c.result === 'unclear').map((c) => c.criterion))
    .slice(0, 4);
  return result;
}

function validateRequestBody(body) {
  const checklistType = safeString(body.checklistType);
  if (!CHECKLIST_TYPES.includes(checklistType)) {
    return { ok: false, message: 'checklistType must be scalp, intraDay, or swing' };
  }
  return { ok: true };
}

function normalizeChartMetadata(body) {
  const list = [];
  if (Array.isArray(body.images) && body.images.length) {
    body.images.slice(0, MAX_IMAGES).forEach((img, idx) => {
      if (!img || typeof img.base64 !== 'string') return;
      list.push({
        id: `chart_${idx + 1}`,
        base64: img.base64,
        mimeType: ALLOWED_MIME_TYPES.includes(img.mimeType) ? img.mimeType : 'image/jpeg',
        timeframe: safeString(img.timeframe, 'N/A'),
      });
    });
  } else if (typeof body.image === 'string' && body.image) {
    list.push({
      id: 'chart_1',
      base64: body.image,
      mimeType: ALLOWED_MIME_TYPES.includes(body.mimeType) ? body.mimeType : 'image/jpeg',
      timeframe: safeString(body.timeframe, 'N/A'),
    });
  }
  const images = list.map((img) => ({ ...img, rank: timeframeRank(img.timeframe) }));
  return {
    images,
    context: {
      checklistType: body.checklistType,
      pair: safeString(body.pair).slice(0, 32) || null,
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
  return parseAIJson(raw);
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
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  if (!OPENAI_API_KEY) {
    return res.status(500).json({ success: false, message: 'AI service not configured' });
  }

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded?.id) return res.status(401).json({ success: false, message: 'Authentication required' });
  const userId = decoded.id;

  try {
    const body = req.body || {};
    const requestValidation = validateRequestBody(body);
    if (!requestValidation.ok) return res.status(400).json({ success: false, message: requestValidation.message });

    const { images, context } = normalizeChartMetadata(body);
    const imageValidation = validateNormalizedImages(images);
    if (!imageValidation.ok) return res.status(400).json({ success: false, message: imageValidation.message });

    const rubric = CHECKLIST_RUBRIC[context.checklistType];
    const rawAnalysis = await runAiAnalysisPipeline({ rubric, context, images });
    const result = normalizeResult(rawAnalysis, { rubric, checklistType: context.checklistType, context });
    await persistAnalysis({ userId, context, images, result });

    return res.status(200).json({ success: true, result });
  } catch (err) {
    console.error('[chart-check] error:', err.message);
    return res.status(500).json({ success: false, message: 'Analysis failed. Please try again.' });
  }
};
