const { recordOutboundRequest } = require('../utils/providerRequestMeter');

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';

function getPerplexityApiKey() {
  return String(process.env.PERPLEXITY_API_KEY || '').trim();
}

async function createChatCompletion(params, options = {}) {
  const apiKey = getPerplexityApiKey();
  if (!apiKey) {
    throw new Error('Perplexity API key not configured');
  }

  const controller = options.signal ? null : new AbortController();
  const signal = options.signal || controller.signal;

  try {
    recordOutboundRequest(PERPLEXITY_API_URL, 1);
  } catch (_) {}
  const res = await fetch(PERPLEXITY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(params),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const error = new Error(text || `Perplexity HTTP ${res.status}`);
    error.status = res.status;
    error.error = { message: text };
    throw error;
  }

  return res.json();
}

module.exports = {
  PERPLEXITY_API_URL,
  getPerplexityApiKey,
  createChatCompletion,
};
