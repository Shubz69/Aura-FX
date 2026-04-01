/**
 * Optional Perplexity layer for Trader DNA - interprets deterministic metrics only.
 */

const { getPerplexityModelForDna } = require('../ai/perplexity-config');

const DNA_AI_DISCLAIMER =
  'AI interpretation is for educational self-reflection on trading behaviour only. Not medical, mental-health, or financial advice. Harsh feedback targets process and habits, not your worth. For concrete monthly action steps, use Performance & DNA -> Monthly reports at /reports.';

function compactForAi(payload) {
  return {
    archetype: payload.archetype,
    archetypeTagline: payload.archetypeTagline,
    identityStatement: payload.identityStatement,
    scores: payload.scores,
    behaviouralMetrics: payload.behaviouralMetrics,
    executionMetrics: payload.executionMetrics,
    performanceMetrics: payload.performanceMetrics,
    psychologicalMetrics: payload.psychologicalMetrics,
    extendedSignals: payload.extendedSignals,
    weaknesses: payload.weaknesses,
    strengths: payload.strengths,
    alerts: payload.alerts,
    patternRecognition: payload.patternRecognition,
    psychologicalTendencies: payload.psychologicalTendencies,
    evolution: payload.evolution,
    improvementPriority: payload.improvementPriority,
  };
}

/**
 * @param {object} payload - full buildDnaPayload result
 * @returns {Promise<object>} payload with aiPsychologyLayer or unchanged on failure
 */
async function enrichDnaPayloadWithPerplexity(payload) {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return payload;

  const model = getPerplexityModelForDna();
  const bundle = compactForAi(payload);
  let bundleStr = JSON.stringify(bundle);
  if (bundleStr.length > 32000) {
    bundleStr = bundleStr.slice(0, 32000) + '...[truncated]';
  }

  const systemMessage = `You are a clinical trading psychologist. Your output is JSON only.
Rules:
- Do not invent numbers. Every behavioural claim must map to fields in the bundle (scores, rates, streaks, weaknesses, alerts).
- No compliments unless a metric objectively supports it (e.g. very low revenge rate).
- Be harsh on trading discipline, impulse, and risk - never insult the person's character or health.
- traderTypeAsPerson and psychologyDeepDive describe how they show up under pressure when trading.
- shadowTraits: at least 4 short labels (e.g. "Revenge sequencing", "Overconfidence after wins").
- coachingNote must state that DNA is the identity mirror and Monthly Reports (/reports) are the improvement playbook.`;

  const userMessage = `Interpret this Trader DNA bundle for the account owner.

BUNDLE:
${bundleStr}

Return strict JSON only:
{
  "traderTypeAsPerson": "<2-4 sentences>",
  "psychologyDeepDive": "<4-6 sentences, reference at least two numeric facts from bundle>",
  "shadowTraits": ["<trait>", "<trait>", "<trait>", "<trait>"],
  "harshTruthSummary": "<1-2 sentences, include one number>",
  "coachingNote": "<1-2 sentences: DNA = who you are; monthly report = what to change; path /reports>"
}`;

  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userMessage },
        ],
      }),
    });
    if (!res.ok) {
      console.warn('[dnaPerplexity] Perplexity HTTP', res.status);
      return payload;
    }
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || '';
    const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      console.warn('[dnaPerplexity] non-JSON response');
      return payload;
    }
    const shadowTraits = Array.isArray(parsed.shadowTraits) ? parsed.shadowTraits.filter(Boolean) : [];
    while (shadowTraits.length < 4) {
      shadowTraits.push('Unspecified pattern - log more trades to tighten DNA');
    }
    return {
      ...payload,
      aiPsychologyLayer: {
        traderTypeAsPerson: parsed.traderTypeAsPerson || '',
        psychologyDeepDive: parsed.psychologyDeepDive || '',
        shadowTraits: shadowTraits.slice(0, 12),
        harshTruthSummary: parsed.harshTruthSummary || '',
        coachingNote:
          parsed.coachingNote ||
          'Trader DNA shows who you are as a trader over ~90 days. Your Monthly Report at /reports is where you get ranked fixes and measurable checks.',
        disclaimer: DNA_AI_DISCLAIMER,
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (e) {
    console.warn('[dnaPerplexity]', e.message);
    return payload;
  }
}

module.exports = { enrichDnaPayloadWithPerplexity, DNA_AI_DISCLAIMER };
