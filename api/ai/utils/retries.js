/**
 * Retry with exponential backoff for API calls. Used by data-layer adapters.
 * 1 retry on failure, then fallback to next provider.
 */

const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_INITIAL_MS = 300;

/**
 * Execute async fn with retries. On failure retries once after a short delay.
 * @param {() => Promise<T>} fn
 * @param {{ maxAttempts?: number, initialDelayMs?: number }} opts
 * @returns {Promise<{ ok: true, data: T } | { ok: false, error: Error }>}
 */
async function withRetry(fn, opts = {}) {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const initialDelayMs = opts.initialDelayMs ?? DEFAULT_INITIAL_MS;
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const data = await fn();
      return { ok: true, data };
    } catch (e) {
      lastError = e;
      if (attempt < maxAttempts) {
        const delay = initialDelayMs * Math.pow(2, attempt - 1);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  return { ok: false, error: lastError };
}

module.exports = { withRetry, DEFAULT_MAX_ATTEMPTS };
