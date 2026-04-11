const DEFAULT_UA =
  'AuraTerminal-SurveillanceIngest/1.0 (public official pages only; respectful rate limits)';

const DEFAULT_CACHE_MAX = 220;
const DEFAULT_CACHE_TTL_MS = 90000;

/** LRU-ish GET cache for listing pages (bounded, process-local). */
const listingCache = new Map();

function cacheGet(key) {
  const row = listingCache.get(key);
  if (!row) return null;
  if (Date.now() > row.exp) {
    listingCache.delete(key);
    return null;
  }
  listingCache.delete(key);
  listingCache.set(key, row);
  return row.val;
}

function cacheSet(key, val, ttlMs) {
  if (listingCache.size >= DEFAULT_CACHE_MAX) {
    const firstKey = listingCache.keys().next().value;
    if (firstKey != null) listingCache.delete(firstKey);
  }
  listingCache.set(key, { val, exp: Date.now() + ttlMs });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url, opts = {}) {
  const {
    maxAttempts = 3,
    timeoutMs = 20000,
    headers = {},
    allowHosts = [],
    cacheListing = false,
    cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  } = opts;

  const cacheKey = cacheListing ? `GET:${url}` : null;
  if (cacheKey) {
    const hit = cacheGet(cacheKey);
    if (hit) return hit;
  }

  let u;
  try {
    u = new URL(url);
  } catch {
    throw new Error('invalid_url');
  }
  if (allowHosts.length && !allowHosts.includes(u.hostname)) {
    throw new Error('host_not_allowlisted');
  }

  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': process.env.SURVEILLANCE_FETCH_UA || DEFAULT_UA,
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          ...headers,
        },
      });
      clearTimeout(t);
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`http_${res.status}`);
        await sleep(400 * 2 ** attempt + Math.random() * 200);
        continue;
      }
      if (res.status >= 400) {
        lastErr = new Error(`http_${res.status}`);
        if (res.status === 404) break;
        await sleep(300 * attempt);
        continue;
      }
      const text = await res.text();
      const out = { ok: true, status: res.status, text, finalUrl: res.url || url };
      if (cacheKey) cacheSet(cacheKey, out, cacheTtlMs);
      return out;
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      await sleep(400 * 2 ** attempt + Math.random() * 200);
    }
  }
  throw lastErr || new Error('fetch_failed');
}

module.exports = { fetchWithRetry, sleep };
