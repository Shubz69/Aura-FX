/**
 * POST /api/ai/trade-outcome-verify
 * Vision verification of broker / platform screenshots for trade outcome (anti-fraud).
 * Body: { tradeId, image: base64, mimeType }
 * Requires PERPLEXITY_API_KEY. Updates trade when confidence is sufficient.
 */
const { verifyToken } = require('../utils/auth');
const { executeQuery } = require('../db');

async function ensureOutcomeColumns() {
  try {
    await executeQuery('ALTER TABLE aura_analysis_trades ADD COLUMN outcome_verification_status VARCHAR(24) DEFAULT \'none\'');
  } catch (_) {}
  try {
    await executeQuery('ALTER TABLE aura_analysis_trades ADD COLUMN outcome_verification_json LONGTEXT NULL');
  } catch (_) {}
}

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_MODEL = process.env.PERPLEXITY_TRADE_VERIFY_MODEL || 'sonar';

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

const SYSTEM = `You are a forensic trading assistant. The user uploads a screenshot from a trading platform (MT4/MT5/cTrader/broker web) showing a CLOSED or FILLED trade result.

Your job:
1. Determine if the image clearly shows a closed trade with a realised profit or loss (look for P/L, profit, loss, closed P&L, balance change, ticket history).
2. Extract: result "win" if profit > 0, "loss" if profit < 0, "breakeven" if effectively zero.
3. Extract numeric profit/loss in ACCOUNT CURRENCY as shown (pnl). Use negative for losses if the platform shows parentheses or minus.
4. Assign confidence: "high" only if ticket/symbol and P/L are clearly visible; "medium" if P/L visible but ambiguous; "low" if unclear or could be demo/unrelated.

Return STRICT JSON only:
{
  "result": "win" | "loss" | "breakeven" | "unclear",
  "pnl": <number or null if unclear>,
  "currency": "<3-letter or unknown>",
  "confidence": "high" | "medium" | "low",
  "reasoning": "<one short sentence>",
  "symbolSeen": "<string or null>"
}

Never invent numbers. If you cannot read P/L, set pnl null and result "unclear".`;

async function callVision(base64, mimeType) {
  const url = 'https://api.perplexity.ai/chat/completions';
  const body = {
    model: PERPLEXITY_MODEL,
    max_tokens: 500,
    temperature: 0.05,
    messages: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType || 'image/png'};base64,${base64}`, detail: 'high' },
          },
          {
            type: 'text',
            text: 'Analyse this screenshot for closed-trade P/L. Return JSON only.',
          },
        ],
      },
    ],
  };
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PERPLEXITY_API_KEY}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const t = await response.text();
    throw new Error(`Perplexity ${response.status}: ${t}`);
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  return JSON.parse(content);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  if (!PERPLEXITY_API_KEY) {
    return res.status(503).json({
      success: false,
      message: 'Outcome verification is not configured (missing PERPLEXITY_API_KEY).',
    });
  }

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded?.id) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  const userId = Number(decoded.id);
  const body = parseBody(req);
  const tradeId = Number(body.tradeId);
  const image = body.image ? String(body.image) : '';
  const mimeType = (body.mimeType || 'image/png').toString();

  if (!tradeId || !image) {
    return res.status(400).json({ success: false, message: 'tradeId and image (base64) are required' });
  }

  let analysis;
  try {
    analysis = await callVision(image.replace(/^data:image\/\w+;base64,/, ''), mimeType);
  } catch (e) {
    console.error('[trade-outcome-verify] Perplexity', e.message);
    return res.status(502).json({ success: false, message: 'Vision analysis failed', detail: e.message });
  }

  const confidence = (analysis.confidence || '').toLowerCase();
  const resultRaw = (analysis.result || '').toLowerCase();
  const pnl = analysis.pnl != null && Number.isFinite(Number(analysis.pnl)) ? Number(analysis.pnl) : null;

  let applied = false;
  let tradeRow = null;

  await ensureOutcomeColumns();

  if (['high', 'medium'].includes(confidence) && ['win', 'loss', 'breakeven'].includes(resultRaw) && pnl != null) {
    const [rows] = await executeQuery(
      'SELECT id FROM aura_analysis_trades WHERE id = ? AND user_id = ?',
      [tradeId, userId]
    );
    if (!rows?.length) {
      return res.status(404).json({ success: false, message: 'Trade not found' });
    }
    const result = resultRaw;
    const verificationJson = JSON.stringify({
      ...analysis,
      verifiedAt: new Date().toISOString(),
      source: 'ai_screenshot',
    });
    try {
      await executeQuery(
        `UPDATE aura_analysis_trades SET result = ?, pnl = ?, outcome_verification_status = 'verified', outcome_verification_json = ? WHERE id = ? AND user_id = ?`,
        [result, pnl, verificationJson, tradeId, userId]
      );
      const [updated] = await executeQuery('SELECT * FROM aura_analysis_trades WHERE id = ?', [tradeId]);
      tradeRow = updated?.[0] || null;
      applied = true;
    } catch (e) {
      console.error('[trade-outcome-verify] DB', e);
      return res.status(500).json({ success: false, message: 'Failed to save verification' });
    }
  } else {
    await executeQuery(
      `UPDATE aura_analysis_trades SET outcome_verification_status = 'failed', outcome_verification_json = ? WHERE id = ? AND user_id = ?`,
      [JSON.stringify({ ...analysis, checkedAt: new Date().toISOString() }), tradeId, userId]
    ).catch(() => {});
  }

  return res.status(200).json({
    success: true,
    analysis,
    applied,
    trade: tradeRow,
    message: applied
      ? 'Outcome verified and saved from screenshot.'
      : 'Could not verify with enough confidence — try a clearer screenshot of closed P/L.',
  });
};
