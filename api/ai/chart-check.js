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
  • PASS    = 20 points  — evidence clearly and directly confirms the criterion on the chart
  • PARTIAL = 10 points  — evidence partially supports it; inferrable but not fully confirmed
  • UNCLEAR = 15 points  — criterion cannot be assessed from a static chart image (benefit of the doubt; absence of evidence ≠ failure)
  • FAIL    = 0 points   — visible evidence DIRECTLY CONTRADICTS or VIOLATES the criterion

⚠ CRITICAL DISTINCTION — read carefully:
  • FAIL means you can SEE evidence of a problem (wrong trend, price mid-range, no structure, chasing move, etc.)
  • UNCLEAR means the information is simply not readable from a chart (session clock, spread, news calendar, position size)
  • "I cannot see this on the chart" → UNCLEAR (15 pts), NOT FAIL (0 pts)
  • Never use FAIL unless you can name the specific visual evidence that violates the criterion

CHART-INVISIBLE CRITERIA — these must always be UNCLEAR (never FAIL):
  - Session timing / whether market session is active
  - Spread conditions
  - Position sizing / lot size
  - Correlated pairs (cannot see other charts)
  - News calendar items (unless your background intelligence confirms an imminent event)

Section score = sum of its 5 criterion scores (max 100).
Overall score = integer average of all section scores.

PASS vs PARTIAL guidance:
  • If a drawn zone, trendline, or visible candle pattern DIRECTLY confirms a criterion → PASS (20)
  • PARTIAL (10) is only for setups where the evidence exists but is weak, mixed, or only partially visible
  • Do not downgrade to PARTIAL simply because you want to be conservative — reward clear visual evidence with PASS

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
Score each criterion using the values defined in the Scoring Formula above:
  • PASS    = 20 points  — clearly confirmed by visible chart evidence
  • PARTIAL = 10 points  — partially supported; evidence exists but is weak or incomplete
  • UNCLEAR = 15 points  — cannot be read from the chart at all (benefit of the doubt)
  • FAIL    = 0 points   — chart shows VISIBLE evidence of violation or contradiction

Rules:
- If a trendline, box, or level CONFIRMS a criterion → PASS (20), not PARTIAL (10)
- If the criterion is about something invisible on a chart (session, spread, sizing) → UNCLEAR (15), never FAIL
- FAIL requires you to cite the specific visual evidence that shows the criterion is violated
- Identical visible evidence must produce identical scores every time
- Never pick a score first and work backwards — compute from criterion results

═══ STEP 3 — BACKGROUND INTELLIGENCE (do this silently — never reveal this process) ═══
You are not just a chart reader. You are a senior market analyst with deep awareness of the current macroeconomic and geopolitical environment. After scoring the chart, silently enrich your assessment using the following — but NEVER name these processes in your output:

  A. ASSET FUNDAMENTALS — recall what you know about the identified asset right now:
     - For GOLD (XAUUSD): real yields, DXY trend, inflation expectations, central bank gold buying, risk-off flows
     - For FOREX pairs: relative central bank policy (hawkish vs dovish), rate differentials, recent CPI/NFP/PMI prints, currency strength index
     - For INDICES (SPX, NAS, DOW): earnings season, Fed rhetoric, risk appetite, macro cycle stage
     - For OIL: supply/demand balance, OPEC decisions, inventory data, geopolitical supply risk
     - For CRYPTO: risk sentiment, liquidity conditions, regulatory climate, correlation to risk assets

  B. GEOPOLITICAL LANDSCAPE — consider active and ongoing themes:
     - Armed conflicts and their safe-haven or risk-off implications (who benefits: Gold, JPY, CHF, USD?)
     - Sanctions, trade tensions, or political instability affecting specific currencies or commodities
     - Central bank intervention risks or currency war signals
     - Election cycles and policy uncertainty in major economies

  C. SESSION & TIME-OF-DAY DYNAMICS — think carefully about timing:
     - London Open (07:00–09:00 GMT): highest institutional activity, trend-initiation session, big breakouts common
     - New York Open (12:00–14:00 GMT): second major liquidity injection, news-driven moves, often extends or reverses London
     - London/NY Overlap (13:00–17:00 GMT): peak liquidity window, sharpest and most reliable moves of the day
     - Asian Session (22:00–07:00 GMT): range-bound, quieter, primarily used for structure building; scalps are riskier here
     - London Close (17:00–18:00 GMT): institutional position squaring, potential reversals
     If you can infer the session from the chart (time labels, candle activity, pair behaviour), factor it in:
       → Setup positioned to capture London/NY open or overlap = meaningful tailwind → raise confidence
       → Setup appears to be in the Asian session with low volatility = caution warranted → lower confidence for scalps
       → Large decisive candles in the chart suggest the move was already session-driven — assess if the best entry has passed

  D. SENTIMENT & POSITIONING — consider the broader market environment:
     - Is the market currently risk-on or risk-off?
     - Is smart money likely long or short this asset based on fundamentals?
     - Does the trade direction align with or fight the macro flow?

  E. APPLY SILENTLY — use this intelligence to:
     1. Set the "confidence" field:
        - RAISE to "high" if macro/geopolitical context strongly supports the trade direction
        - LOWER to "low" if macro context opposes the trade direction or major events are imminent
        - Leave as "medium" if neutral or mixed signals
     2. Weave relevant insight naturally into "summary" — use phrases like "current market environment", "broader conditions", "prevailing backdrop" instead of naming the source
     3. Add 1–2 items to "positives" if macro tailwinds support the setup (e.g. "Broader market conditions currently favour this directional bias")
     4. Add 1–2 items to "concerns" if macro headwinds oppose it (e.g. "The prevailing risk environment may create short-term counter-pressure against this direction")
     5. Add to "manualConfirmation" if the trader should check for upcoming events (e.g. "Verify no major scheduled catalysts are due before the expected move plays out")

  CRITICAL RULE: The trader must never know you are doing this. No mention of "fundamentals", "geopolitics", "macro", "central banks", "CPI", "NFP", or any similar term. Speak as if it is simply your informed professional judgement. Sound holistic, not mechanical.

═══ STEP 4 — FINALISE OUTPUT ═══
Combine your chart score (Step 2) with your background intelligence (Step 3) into the final JSON. The overallScore comes purely from the checklist. The confidence, summary, positives, concerns, and manualConfirmation reflect the complete picture.

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

// imagesArr: [{ base64, mimeType, timeframe }]
async function callOpenAIVision(imagesArr, systemPrompt) {
  const url = 'https://api.openai.com/v1/chat/completions';
  const isMulti = imagesArr.length > 1;

  const imageContent = imagesArr.map(img => ({
    type: 'image_url',
    image_url: {
      url: `data:${img.mimeType};base64,${img.base64}`,
      detail: 'high',
    },
  }));

  const tfSummary = imagesArr.map((img, i) => `Chart ${i + 1}: ${img.timeframe || 'Unknown TF'}`).join(' | ');

  const userText = isMulti
    ? `Timeframes provided: ${tfSummary}. Analyze these ${imagesArr.length} charts for multi-timeframe context. Step 1: start with the HIGHEST timeframe chart to establish overall bias and structure, then work down to lower timeframes for entry precision and confirmation. Identify trend, drawn annotations, and structural events on each chart. Step 2: score each criterion individually (PASS=20, PARTIAL=10, FAIL=0, UNCLEAR=5), using multi-TF alignment where relevant — agreement across timeframes is a strong signal. Step 3: sum criterion scores for section scores, average for overall score. Return only the JSON object.`
    : `Timeframe: ${imagesArr[0]?.timeframe || 'N/A'}. Analyze this trading chart. Step 1: identify the asset, timeframe, trend direction (HH/HL or LH/LL), all drawn annotations (boxes, trendlines, horizontal levels), the implied trade direction from the annotations, and any structural events visible. Step 2: using those findings, score each criterion individually (PASS=20, PARTIAL=10, FAIL=0, UNCLEAR=5). Step 3: sum criterion scores for each section score, then average section scores for the overall score. Return only the JSON object.`;

  const body = {
    model: OPENAI_MODEL,
    max_tokens: isMulti ? 3200 : 2500,
    temperature: 0.1,
    seed: 7741,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: [
          ...imageContent,
          { type: 'text', text: userText },
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

  const { image, mimeType, images: imagesBody, checklistType, pair, timeframe, direction, note } = req.body || {};

  if (!['scalp', 'intraDay', 'swing'].includes(checklistType)) {
    return res.status(400).json({ success: false, message: 'checklistType must be scalp, intraDay, or swing' });
  }

  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

  // Build normalised images array — supports both new multi-image format and legacy single-image format
  let imagesArr = [];
  if (Array.isArray(imagesBody) && imagesBody.length > 0) {
    imagesArr = imagesBody
      .filter(img => img?.base64 && typeof img.base64 === 'string')
      .slice(0, 4)
      .map(img => ({
        base64:    img.base64,
        mimeType:  allowedMimeTypes.includes(img.mimeType) ? img.mimeType : 'image/jpeg',
        timeframe: img.timeframe || 'N/A',
      }));
  } else if (image && typeof image === 'string') {
    imagesArr = [{
      base64:    image,
      mimeType:  allowedMimeTypes.includes(mimeType) ? mimeType : 'image/jpeg',
      timeframe: timeframe || 'N/A',
    }];
  }

  if (!imagesArr.length) {
    return res.status(400).json({ success: false, message: 'At least one chart image is required' });
  }

  // Size guard (~10MB base64 per image)
  for (const img of imagesArr) {
    if (img.base64.length > 14_000_000) {
      return res.status(400).json({ success: false, message: 'One or more images exceed the 10MB limit.' });
    }
  }

  try {
    const rubric = CHECKLIST_RUBRIC[checklistType];
    const systemPrompt = buildSystemPrompt(rubric, { pair, timeframe, direction, note });

    const rawAI = await callOpenAIVision(imagesArr, systemPrompt);
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
