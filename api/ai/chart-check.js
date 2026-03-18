/**
 * POST /api/ai/chart-check
 * Analyzes an uploaded chart image against the Trade Validator checklist.
 * Requires: auth token (any authenticated user).
 * Body: { image: base64String, mimeType: string, checklistType: 'scalp'|'intraDay'|'swing',
 *         pair?: string, timeframe?: string, direction?: string, note?: string }
 */

const { verifyToken } = require('../utils/auth');
const { executeQuery } = require('../db');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = 'gpt-4o';

// ── Checklist rubric (mirrors src/lib/aura-analysis/validator/checklistTabsData.js) ──────
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

const STATUS_LABELS = [
  { min: 80, label: 'Strong Setup', emoji: '🟢' },
  { min: 60, label: 'Good Setup', emoji: '🟡' },
  { min: 40, label: 'Developing Setup', emoji: '🟠' },
  { min: 0,  label: 'Weak Setup', emoji: '🔴' },
];

function getStatusLabel(score) {
  return STATUS_LABELS.find(s => score >= s.min) || STATUS_LABELS[STATUS_LABELS.length - 1];
}

function buildSystemPrompt(rubric, context) {
  const { pair, timeframe, direction, note } = context;

  const sectionLines = rubric.sections
    .map((s, i) => {
      const items = s.criteria.map((c, j) => `  ${j + 1}. ${c}`).join('\n');
      return `Section ${i + 1}: "${s.name}"\nCriteria:\n${items}`;
    })
    .join('\n\n');

  const contextLines = [
    pair       ? `Symbol/Pair: ${pair}` : null,
    timeframe  ? `Timeframe: ${timeframe}` : null,
    direction  ? `Trader's direction idea: ${direction}` : null,
    note       ? `Trader's note: ${note}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return `You are a professional trading coach and chart analyst. Your role is to assess a trader's chart image against a structured ${rubric.label} trade checklist and return a JSON-formatted analysis.

CHECKLIST RUBRIC (${rubric.label}):
${sectionLines}

${contextLines ? `TRADER CONTEXT:\n${contextLines}\n` : ''}

INSTRUCTIONS:
1. Analyze the chart image carefully for visible price action, structure, zones, momentum, and context.
2. Score EACH SECTION from 0–100 based on how well the visible chart satisfies the criteria.
3. For each criterion, determine: PASS (clearly visible/satisfied), PARTIAL (partially visible or inferrable), FAIL (not visible or violated), or UNCLEAR (not enough visual information).
4. Calculate an overall score as the simple average of section scores.
5. Be honest — if the image is unclear or low resolution, say so and reduce confidence.
6. Avoid making up information not visible in the chart.
7. DO NOT promise trade success. Use language like "checklist alignment", "setup quality", "visible confluence".

RETURN FORMAT (strict JSON, no markdown, no code blocks):
{
  "overallScore": <0-100 integer>,
  "confidence": <"high"|"medium"|"low">,
  "summary": "<2-3 sentence plain-English summary of what the AI sees and how the setup aligns>",
  "sections": [
    {
      "name": "<section name>",
      "score": <0-100>,
      "status": <"pass"|"partial"|"fail">,
      "reasoning": "<1-2 sentence trader-friendly explanation>",
      "criteriaResults": [
        { "criterion": "<text>", "result": <"pass"|"partial"|"fail"|"unclear">, "note": "<short note if needed>" }
      ]
    }
  ],
  "positives": ["<what supports the trade idea (max 4 items)>"],
  "concerns": ["<what weakens the trade idea (max 4 items)>"],
  "missing": ["<what cannot be confirmed from the image or is absent (max 4 items)>"],
  "manualConfirmation": ["<what the trader must still confirm manually before entering (max 4 items)>"],
  "imageQuality": <"good"|"acceptable"|"poor">
}`;
}

async function callOpenAIVision(base64Image, mimeType, systemPrompt) {
  const url = 'https://api.openai.com/v1/chat/completions';

  const body = {
    model: OPENAI_MODEL,
    max_tokens: 2000,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
              detail: 'high',
            },
          },
          {
            type: 'text',
            text: 'Please analyze this trading chart image and return the structured JSON assessment as described in your instructions.',
          },
        ],
      },
    ],
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  return content;
}

function parseAIResponse(raw) {
  try {
    const jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(jsonStr);
  } catch {
    throw new Error('Failed to parse AI response as JSON');
  }
}

async function ensureTableExists() {
  try {
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS ai_chart_checks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        checklist_type VARCHAR(20) NOT NULL,
        pair VARCHAR(20),
        timeframe VARCHAR(20),
        direction VARCHAR(20),
        overall_score INT,
        status_label VARCHAR(40),
        result_json MEDIUMTEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_created_at (created_at)
      )
    `);
  } catch {
    /* table already exists or non-critical — continue */
  }
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

  // Auth
  const decoded = verifyToken(req.headers.authorization);
  if (!decoded?.id) return res.status(401).json({ success: false, message: 'Authentication required' });
  const userId = decoded.id;

  const { image, mimeType, checklistType, pair, timeframe, direction, note } = req.body || {};

  // Validate
  if (!image || typeof image !== 'string') {
    return res.status(400).json({ success: false, message: 'image (base64) is required' });
  }
  if (!['scalp', 'intraDay', 'swing'].includes(checklistType)) {
    return res.status(400).json({ success: false, message: 'checklistType must be scalp, intraDay, or swing' });
  }

  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
  const resolvedMime = allowedMimeTypes.includes(mimeType) ? mimeType : 'image/jpeg';

  // Size guard (~10MB base64)
  if (image.length > 14_000_000) {
    return res.status(400).json({ success: false, message: 'Image too large. Maximum size is 10MB.' });
  }

  try {
    const rubric = CHECKLIST_RUBRIC[checklistType];
    const systemPrompt = buildSystemPrompt(rubric, { pair, timeframe, direction, note });

    const rawAI = await callOpenAIVision(image, resolvedMime, systemPrompt);
    const result = parseAIResponse(rawAI);

    const overallScore = typeof result.overallScore === 'number' ? result.overallScore : 0;
    const statusMeta = getStatusLabel(overallScore);
    result.statusLabel = statusMeta.label;
    result.statusEmoji = statusMeta.emoji;
    result.checklistType = checklistType;
    result.checklistLabel = rubric.label;

    // Persist result
    await ensureTableExists();
    await executeQuery(
      `INSERT INTO ai_chart_checks (user_id, checklist_type, pair, timeframe, direction, overall_score, status_label, result_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        checklistType,
        pair || null,
        timeframe || null,
        direction || null,
        overallScore,
        statusMeta.label,
        JSON.stringify(result),
      ]
    );

    return res.status(200).json({ success: true, result });
  } catch (err) {
    console.error('[chart-check] error:', err.message);
    return res.status(500).json({ success: false, message: 'Analysis failed. Please try again.' });
  }
};
