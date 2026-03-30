/**
 * Optional OpenAI pass: tighten wording only. Does not change bias, scores, numbers, or posture enums.
 */

const { getOpenAIModelForChat } = require('../ai/openai-config');

function getModel() {
  return String(
    process.env.OPENAI_AUTOMATION_MODEL || process.env.OPENAI_CHAT_MODEL || process.env.OPENAI_MODEL || getOpenAIModelForChat()
  ).trim();
}

/**
 * @param {object} brief — successful brief from runMarketDecoder
 * @returns {Promise<object>}
 */
async function polishMarketDecoderBrief(brief) {
  const key = process.env.OPENAI_API_KEY && String(process.env.OPENAI_API_KEY).trim();
  if (!key || !brief || typeof brief !== 'object') return brief;

  const payload = {
    header: brief.header,
    instantRead: brief.instantRead,
    whatMattersNow: brief.whatMattersNow,
    scenarioMap: brief.scenarioMap,
    meta: brief.meta,
  };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: getModel(),
        temperature: 0.15,
        max_tokens: 700,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You rewrite trading desk copy for clarity only. Input JSON includes rules-based bias and scores. You MUST preserve: bias (Bullish/Bearish/Neutral), conviction (High/Medium/Low), tradingCondition, final posture enum, all numeric fields, and meta scores. Return JSON: {"whatMattersNow":[{"label":"Macro driver"|"Technical driver"|"Immediate risk/event","text":"one tight line"},... (exactly 3)],"instantRead":{"bestApproach":"one line"},"scenarioMap":{"bullish":{"condition":"...","outcome":"..."},"bearish":{"condition":"...","outcome":"..."},"noTrade":{"when":"..."}}}. Do not invent facts.',
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
    return next;
  } catch {
    clearTimeout(t);
    return brief;
  }
}

module.exports = { polishMarketDecoderBrief };
