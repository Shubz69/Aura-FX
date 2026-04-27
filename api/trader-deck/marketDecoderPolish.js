/**
 * Optional Perplexity pass: tighten wording only. Does not change bias, scores, numbers, or posture enums.
 */

const { getPerplexityModelForChat } = require('../ai/perplexity-config');

function getModel() {
  return String(
    process.env.PERPLEXITY_AUTOMATION_MODEL || process.env.PERPLEXITY_CHAT_MODEL || process.env.PERPLEXITY_MODEL || getPerplexityModelForChat()
  ).trim();
}

/**
 * @param {object} brief — successful brief from runMarketDecoder
 * @returns {Promise<object>}
 */
async function polishMarketDecoderBrief(brief) {
  const key = process.env.PERPLEXITY_API_KEY && String(process.env.PERPLEXITY_API_KEY).trim();
  if (!key || !brief || typeof brief !== 'object') return brief;

  const payload = {
    header: brief.header,
    instantRead: brief.instantRead,
    whatMattersNow: brief.whatMattersNow,
    scenarioMap: brief.scenarioMap,
    technicalAnalysis: brief.technicalAnalysis,
    fundamentalAnalysis: brief.fundamentalAnalysis,
    keyDrivers: brief.keyDrivers,
    traderThesis: brief.traderThesis,
    riskSummary: brief.riskSummary,
    invalidation: brief.invalidation,
    confirmation: brief.confirmation,
    meta: brief.meta,
  };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: getModel(),
        temperature: 0.15,
        max_tokens: 700,
        messages: [
          {
            role: 'system',
            content:
              'You rewrite trading desk copy for clarity only. Input JSON includes rules-based bias and scores. You MUST preserve: bias (Bullish/Bearish/Neutral), conviction (High/Medium/Low), tradingCondition, final posture enum, all numeric fields, and meta scores. Return strict JSON with keys: technicalAnalysis, fundamentalAnalysis, keyDrivers (array of {title,impact,direction,explanation}), traderThesis ({whatToSee,whyValid,whatConfirmsEntry}), riskSummary ({newsRisk,volatilityRisk,eventRisk}), invalidation, confirmation, whatMattersNow (exactly 3 labels), instantRead.bestApproach, scenarioMap. Hard rule: fundamentalAnalysis must not use chart-pattern-only language (support/resistance, retest, breakout, pivots, RSI, MACD, moving averages, candlestick-only framing) unless explicitly tied to macro/policy/news context. keyDrivers must be market-moving causes, not entry instructions.',
          },
          {
            role: 'user',
            content: JSON.stringify(payload),
          },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!res.ok) return brief;
    const j = await res.json();
    const txt = j?.choices?.[0]?.message?.content;
    if (!txt) return brief;
    let parsed;
    try {
      parsed = JSON.parse(txt);
    } catch {
      return brief;
    }
    const next = { ...brief };
    if (Array.isArray(parsed.whatMattersNow) && parsed.whatMattersNow.length === 3) {
      next.whatMattersNow = parsed.whatMattersNow.map((x, i) => ({
        label: brief.whatMattersNow[i]?.label || x.label,
        text: typeof x.text === 'string' ? x.text : brief.whatMattersNow[i].text,
      }));
    }
    if (parsed.instantRead && typeof parsed.instantRead.bestApproach === 'string') {
      next.instantRead = { ...brief.instantRead, bestApproach: parsed.instantRead.bestApproach };
    }
    if (parsed.scenarioMap && typeof parsed.scenarioMap === 'object') {
      next.scenarioMap = {
        bullish: { ...brief.scenarioMap.bullish, ...parsed.scenarioMap.bullish },
        bearish: { ...brief.scenarioMap.bearish, ...parsed.scenarioMap.bearish },
        noTrade: { ...brief.scenarioMap.noTrade, ...parsed.scenarioMap.noTrade },
      };
    }
    if (typeof parsed.technicalAnalysis === 'string') next.technicalAnalysis = parsed.technicalAnalysis;
    if (typeof parsed.fundamentalAnalysis === 'string') next.fundamentalAnalysis = parsed.fundamentalAnalysis;
    if (Array.isArray(parsed.keyDrivers)) next.keyDrivers = parsed.keyDrivers;
    if (parsed.traderThesis && typeof parsed.traderThesis === 'object') {
      next.traderThesis = {
        ...brief.traderThesis,
        ...parsed.traderThesis,
      };
    }
    if (parsed.riskSummary && typeof parsed.riskSummary === 'object') {
      next.riskSummary = {
        ...brief.riskSummary,
        ...parsed.riskSummary,
      };
    }
    if (typeof parsed.invalidation === 'string') next.invalidation = parsed.invalidation;
    if (typeof parsed.confirmation === 'string') next.confirmation = parsed.confirmation;
    return next;
  } catch {
    clearTimeout(t);
    return brief;
  }
}

module.exports = { polishMarketDecoderBrief };
