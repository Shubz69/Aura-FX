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
      return `Section ${i + 1}: "${s.name}"\nCriteria (5 total — each worth 20 pts):\n${items}`;
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

  return `You are a strict, objective trading coach and chart analyst. Your sole task is to score a chart image against the ${rubric.label} trade checklist using a FIXED, DETERMINISTIC scoring formula. You must not deviate from this formula.

CHECKLIST RUBRIC (${rubric.label}):
${sectionLines}

${contextLines ? `TRADER CONTEXT:\n${contextLines}\n` : ''}

═══ SCORING FORMULA (follow exactly — do not adjust scores subjectively) ═══
Each section has exactly 5 criteria. Each criterion scores:
  • PASS    = 20 points  (clearly and directly visible in the chart)
  • PARTIAL = 10 points  (partially visible, inferrable from context, or ambiguous)
  • FAIL    = 0 points   (not visible, violated, or contradicted by chart)
  • UNCLEAR = 5 points   (genuinely cannot be assessed from the image)

Section score = sum of its 5 criterion scores (max 100).
Overall score = integer average of all section scores.

You MUST compute scores mathematically from the criterion results. Never pick a score first and work backwards.

═══ STEP 1 — READ THE CHART FIRST (do this before scoring anything) ═══
Before evaluating any criterion, identify the following from the image:

  A. ASSET & TIMEFRAME: Read the symbol and timeframe label from the chart header/title.
  B. TREND STRUCTURE: Scan the full candle sequence left-to-right.
     - Lower highs + lower lows = BEARISH trend
     - Higher highs + higher lows = BULLISH trend
     - Mixed/equal = RANGING or transitional
  C. DRAWN ELEMENTS — read every annotation the trader placed on the chart:
     - Colored RECTANGLES/BOXES = key zones the trader identified
         • Red / dark-red / maroon box near current price = SUPPLY zone or ENTRY zone (bearish)
         • Blue / teal / green box near current price = DEMAND zone or ENTRY zone (bullish)
         • A LARGE box further away in the direction of the trade = TAKE-PROFIT / TARGET zone
     - DIAGONAL LINES / TRENDLINES = dynamic support or resistance; a break of this line = structural event
     - HORIZONTAL LINES = static support or resistance levels
     - ARROWS or LABELS = explicit trade direction markers
  D. IMPLIED TRADE DIRECTION: 
     - If the target box is BELOW current price → the trader intends a SHORT
     - If the target box is ABOVE current price → the trader intends a LONG
     - Confirm this against the trend structure identified in step B
  E. ENTRY ZONE: The box overlapping or closest to the most recent candles = entry area
  F. STRUCTURAL EVENTS: Identify any visible BOS (break of structure), CHoCH/MSS (market structure shift),
     liquidity sweeps (wick beyond a prior high/low then reversal), or rejection wicks at key levels.
  G. MOMENTUM: Are the candles in the trade direction large and decisive, or small and hesitant?

Use this pre-analysis as the factual foundation for every criterion score below.
If the drawn annotations clearly show a well-structured setup aligned with trend, score criteria accordingly — do not undercount what is visibly confirmed.

═══ STEP 2 — SCORE EACH CRITERION (using your Step 1 findings) ═══
Score each criterion strictly from the visual evidence you identified above:
  • PASS    = 20 points  (clearly and directly visible/confirmed in the chart)
  • PARTIAL = 10 points  (partially visible, inferrable from drawn elements, or ambiguous)
  • FAIL    = 0 points   (not visible, violated, or directly contradicted by chart)
  • UNCLEAR = 5 points   (genuinely cannot be assessed even with all visible elements)

Rules:
- If a trendline, box, or level CONFIRMS a criterion → PASS, not PARTIAL
- If information is not visible, mark UNCLEAR or FAIL — never invent information
- Identical visible evidence must produce identical scores every time
- Never pick a score first and work backwards — compute from criterion results

═══ RETURN FORMAT (strict JSON only — no markdown, no code fences) ═══
{
  "overallScore": <integer 0-100, computed from formula>,
  "confidence": <"high"|"medium"|"low">,
  "summary": "<2-3 sentence objective summary: what is visible, what the trend is, and how well the setup aligns with the checklist>",
  "sections": [
    {
      "name": "<section name>",
      "score": <integer 0-100, sum of criterion scores>,
      "status": <"pass" if score>=70 | "partial" if score>=40 | "fail" if score<40>,
      "reasoning": "<1-2 sentence explanation grounded in what is visible on the chart>",
      "criteriaResults": [
        { "criterion": "<criterion text>", "result": <"pass"|"partial"|"fail"|"unclear">, "note": "<specific observation from the chart>" }
      ]
    }
  ],
  "positives": ["<specific visible evidence supporting the setup (max 4)"],
  "concerns": ["<specific visible evidence weakening the setup (max 4)"],
  "missing": ["<information not visible or not determinable from the image (max 4)"],
  "manualConfirmation": ["<what the trader must verify before entry that cannot be seen here (max 4)"],
  "imageQuality": <"good"|"acceptable"|"poor">
}`;
}

async function callOpenAIVision(base64Image, mimeType, systemPrompt) {
  const url = 'https://api.openai.com/v1/chat/completions';

  const body = {
    model: OPENAI_MODEL,
    max_tokens: 2500,
    temperature: 0.1,       // Near-deterministic — same image → same analysis
    seed: 7741,             // Fixed seed for reproducibility across identical inputs
    response_format: { type: 'json_object' }, // Enforce JSON — no markdown wrapping
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
            text: 'Analyze this trading chart. Step 1: identify the asset, timeframe, trend direction (HH/HL or LH/LL), all drawn annotations (boxes, trendlines, horizontal levels), the implied trade direction from the annotations, and any structural events visible. Step 2: using those findings, score each criterion individually (PASS=20, PARTIAL=10, FAIL=0, UNCLEAR=5). Step 3: sum criterion scores for each section score, then average section scores for the overall score. Return only the JSON object.',
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
