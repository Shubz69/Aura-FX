const axios = require('axios');
const { verifyToken } = require('../utils/auth');
const { loadReplayTradeByIdForUser, decodeReplayIdParam } = require('./tradeSources');

function setCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return {};
}

function heuristicAnalysis(trade) {
  const pnl = Number(trade.pnl || 0);
  const rr =
    Number.isFinite(Number(trade.entry)) && Number.isFinite(Number(trade.stopLoss)) && Number.isFinite(Number(trade.exit))
      ? Math.abs((Number(trade.exit) - Number(trade.entry)) / (Number(trade.entry) - Number(trade.stopLoss) || 1))
      : null;
  const directionWord = trade.direction === 'buy' ? 'long' : 'short';
  return {
    strengths: [
      trade.stopLoss ? 'Defined stop loss gives the trade a clear invalidation point.' : 'Execution appears simple and decisive.',
      pnl >= 0 ? 'Exit captured realized profit without over-holding.' : 'Position size stayed contained for a reviewable loss.',
    ],
    weaknesses: [
      trade.takeProfit ? null : 'No explicit take-profit was logged, which weakens pre-trade planning.',
      pnl < 0 ? 'Timing or confirmation likely needed one more trigger before entry.' : 'Consider whether partials could improve consistency.',
    ].filter(Boolean),
    betterApproach: [
      `Before the ${directionWord} entry, wait for one extra confirmation candle in line with the setup.`,
      'Pre-define exit logic (target/management) before clicking execute.',
    ],
    nextTimeChecklist: [
      'Map invalidation and target first.',
      'Confirm session volatility fits your setup.',
      'Track whether entry came from plan or impulse.',
    ],
    verdict: {
      entry: trade.entry ? 'Entry was measurable and reviewable.' : 'Entry data is missing; log exact trigger next time.',
      exit: trade.exit ? 'Exit is recorded and can be replayed against structure.' : 'Exit is missing; this limits post-trade learning.',
      risk: trade.stopLoss ? 'Risk controls were present.' : 'Risk controls were incomplete (missing SL).',
      timing: pnl >= 0 ? 'Timing was acceptable for this setup.' : 'Timing looked early or late relative to structure.',
      rr: rr != null ? `Approximate realized R context: ${rr.toFixed(2)}.` : 'R context unavailable due to missing levels.',
    },
  };
}

async function maybePerplexitySummary(trade) {
  const apiKey = String(process.env.PERPLEXITY_API_KEY || '').trim();
  if (!apiKey) return null;
  const prompt = `Review this trade practically for a retail trader:
Symbol: ${trade.symbol}
Direction: ${trade.direction}
Open: ${trade.openTime}
Close: ${trade.closeTime}
Entry: ${trade.entry}
Exit: ${trade.exit}
SL: ${trade.stopLoss}
TP: ${trade.takeProfit}
Lot Size: ${trade.lotSize}
PnL: ${trade.pnl}
Source: ${trade.source}

Return concise JSON with keys: strengths, weaknesses, betterApproach, nextTimeChecklist, verdict(entry,exit,risk,timing,rr).`;
  try {
    const { data } = await axios.post(
      'https://api.perplexity.ai/chat/completions',
      {
        model: 'sonar',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 12000,
      }
    );
    const text = data?.choices?.[0]?.message?.content || '';
    if (!text) return null;
    const parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, '').trim());
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const decoded = verifyToken(req.headers.authorization);
  const userId = Number(decoded?.id);
  if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });

  try {
    const body = parseBody(req);
    const tradeId = decodeReplayIdParam(body.tradeId);
    if (!tradeId) return res.status(400).json({ success: false, message: 'tradeId is required' });

    const trade = await loadReplayTradeByIdForUser(userId, tradeId);
    if (!trade) return res.status(404).json({ success: false, message: 'Trade not found' });

    const fallback = heuristicAnalysis(trade);
    const perplexity = await maybePerplexitySummary(trade);

    return res.status(200).json({
      success: true,
      tradeId,
      analysis: perplexity || fallback,
      provider: perplexity ? 'perplexity' : 'heuristic',
    });
  } catch (error) {
    console.error('[trader-replay/analysis]', error);
    return res.status(500).json({ success: false, message: 'Could not build trade analysis' });
  }
};
