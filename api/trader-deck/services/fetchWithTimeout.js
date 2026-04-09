/**
 * Fetch with timeout and no key leakage in logs.
 */

const { recordOutboundRequest } = require('../../utils/providerRequestMeter');

const DEFAULT_TIMEOUT_MS = 12000;

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    try {
      recordOutboundRequest(url, 1);
    } catch (_) {
      /* meter must never break fetch */
    }
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    if (err.name === 'AbortError') {
      const safeUrl = url.replace(/[?&](?:token|apikey|api_key)=[^&]+/gi, (m) => m.split('=')[0] + '=***');
      throw new Error(`Request timeout: ${safeUrl}`);
    }
    throw err;
  }
}

module.exports = { fetchWithTimeout, DEFAULT_TIMEOUT_MS };
