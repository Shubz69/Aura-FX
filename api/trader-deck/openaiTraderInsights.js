/**
 * OpenAI layer for Trader Desk: turns API-backed snapshot + headlines into a short desk brief.
 * Facts must come only from the payload; no invented prices or events.
 */

const { getOpenAIModelForChat } = require('../ai/openai-config');
const SOURCE_MARKER_RE = /(https?:\/\/|www\.|source\s*:|sources\s*:|according to|reuters|bloomberg|fmp|finnhub|forex factory|trading economics)/i;

function getAutomationModel() {
  return String(
    process.env.OPENAI_AUTOMATION_MODEL
    || process.env.OPENAI_CHAT_MODEL
    || process.env.OPENAI_MODEL
    || getOpenAIModelForChat()
  ).trim();
}

function stripStars(s) {
  if (s == null || typeof s !== 'string') return s;
  return s.replace(/\*/g, '');
}

function sanitizeLine(text) {
  return String(text || '')
    .replace(/\b(according to|reported by|via)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function assertNoSourceMarkers(text) {
  if (SOURCE_MARKER_RE.test(String(text || ''))) {
    throw new Error('AI enrichment contained source markers');
  }
}

/**
 * @param {object} payload — full object from marketIntelligenceEngine.buildPayload (includes headlineSample)
 * @returns {Promise<{ aiSessionBrief: string, aiTradingPriorities: string[] } | null>}
 */
async function enrichTraderDeckPayload(payload) {
  const key = process.env.OPENAI_API_KEY && String(process.env.OPENAI_API_KEY).trim();
  if (!key || !payload || typeof payload !== 'object') return null;

  const snapshot = {
    marketRegime: payload.marketRegime,
    marketPulse: payload.marketPulse,
    keyDrivers: (payload.keyDrivers || []).slice(0, 8),
    crossAssetSignals: (payload.crossAssetSignals || []).slice(0, 10),
    marketChangesToday: (payload.marketChangesToday || []).slice(0, 8),
    traderFocus: (payload.traderFocus || []).slice(0, 6),
    riskRadar: (payload.riskRadar || []).slice(0, 8).map((r) =>
      typeof r === 'string' ? r : r.title || r.event || ''
    ),
    headlines: (payload.headlineSample || []).slice(0, 14),
    updatedAt: payload.updatedAt,
  };

  const userMsg = `Desk snapshot (JSON). Interpret for active traders. Do not invent prices, times, or events not present.\n\n${JSON.stringify(snapshot)}`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 14000);

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: getAutomationModel(),
        temperature: 0.2,
        max_tokens: 900,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are an institutional trading desk analyst. Reply with valid JSON only: {"sessionBrief":"string (3-5 sentences)","tradingPriorities":["short string",...]} — 4 to 6 priorities. Cover cross-asset context from provided facts only. No markdown, no asterisks, no bullet symbols, no source attributions.',
          },
          { role: 'user', content: userMsg },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return null;
    let parsed;
    try {
      const cleaned = text.replace(/^```json\s*|\s*```$/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return {
        aiSessionBrief: stripStars(text).slice(0, 1200),
        aiTradingPriorities: [],
      };
    }
    const brief = sanitizeLine(stripStars(parsed.sessionBrief || parsed.session_brief || ''));
    const pri = Array.isArray(parsed.tradingPriorities)
      ? parsed.tradingPriorities
        .map((x) => sanitizeLine(stripStars(String(x || ''))))
        .filter(Boolean)
        .slice(0, 6)
      : [];
    if (!brief && pri.length === 0) return null;
    assertNoSourceMarkers(`${brief}\n${pri.join('\n')}`);
    return { aiSessionBrief: brief, aiTradingPriorities: pri };
  } catch (e) {
    clearTimeout(t);
    if (e.name !== 'AbortError') {
      console.warn('[trader-deck] OpenAI enrich error:', e.message || e);
    }
    return null;
  }
}

module.exports = { enrichTraderDeckPayload };
