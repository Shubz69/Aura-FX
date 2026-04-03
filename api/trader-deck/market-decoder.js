/**
 * GET /api/trader-deck/market-decoder?symbol=EURUSD
 * Institutional-style decision brief — rules engine + optional AI polish.
 * Cache: MARKET_DECODER_CACHE_SEC (default 600s).
 */

require('../utils/suppress-warnings');

const { runMarketDecoder } = require('./marketDecoderEngine');
const { polishMarketDecoderBrief } = require('./marketDecoderPolish');
const { getStoredDecoderState } = require('../market-data/pipeline-service');

/** Never expose feed/provider diagnostics on the public Market Decoder API (admin uses /api/admin/market-decoder-diagnostics). */
function stripFeedDiagnosticsFromBrief(brief) {
  if (!brief || typeof brief !== 'object') return brief;
  const next = { ...brief };
  if (next.meta && typeof next.meta === 'object') {
    const meta = { ...next.meta };
    delete meta.dataHealth;
    delete meta.finnhubSymbol;
    next.meta = meta;
  }
  return next;
}

const CACHE_SEC = Math.min(900, Math.max(120, parseInt(process.env.MARKET_DECODER_CACHE_SEC, 10) || 600));
const CACHE_TTL_MS = CACHE_SEC * 1000;
const cacheStore = new Map();

function getCached(key) {
  const e = cacheStore.get(key);
  if (e && Date.now() - e.at < CACHE_TTL_MS) return e.payload;
  return null;
}

function setCached(key, payload) {
  cacheStore.set(key, { at: Date.now(), payload });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const q = req.query || {};
  const symbol = (q.symbol || q.q || '').toString().trim();
  const refresh = q.refresh === '1' || q.refresh === 'true';
  const skipAi = q.noAi === '1' || q.noAi === 'true';

  if (!symbol) {
    return res.status(400).json({ success: false, message: 'symbol is required' });
  }

  const cacheKey = symbol.toUpperCase();

  if (!refresh) {
    const hit = getCached(cacheKey);
    if (hit) {
      res.setHeader('Cache-Control', 'private, max-age=60');
      const briefOut = stripFeedDiagnosticsFromBrief(hit.brief);
      return res.status(200).json({ success: true, ...hit, brief: briefOut, cached: true });
    }
  }

  if (!refresh) {
    try {
      const stored = await getStoredDecoderState(cacheKey, 'daily');
      if (stored && stored.payload && stored.freshnessStatus !== 'expired') {
        const payload = {
          brief: stored.payload,
          cached: true,
          cacheTtlSec: CACHE_SEC,
          sourceOfTruth: 'mysql-pipeline',
          storedSource: stored.source,
          storedUpdatedAt: stored.updatedAt,
          storageFreshness: stored.freshnessStatus,
        };
        setCached(cacheKey, payload);
        res.setHeader('Cache-Control', 'private, max-age=60');
        const briefOut = stripFeedDiagnosticsFromBrief(payload.brief);
        return res.status(200).json({ success: true, ...payload, brief: briefOut });
      }
    } catch (error) {
      console.warn('[market-decoder] stored read failed:', error.message || error);
    }
  }

  try {
    console.info('[market-decoder] request', { symbol: symbol.toUpperCase(), refresh: Boolean(refresh), noAi: Boolean(skipAi) });
    const raw = await runMarketDecoder(symbol);
    if (!raw.success) {
      return res.status(400).json(raw);
    }

    let brief = raw.brief;
    if (!skipAi) {
      try {
        brief = await polishMarketDecoderBrief(brief);
      } catch (e) {
        console.warn('[market-decoder] polish:', e.message || e);
      }
    }

    const payload = { brief, cached: false, cacheTtlSec: CACHE_SEC };
    setCached(cacheKey, payload);
    res.setHeader('Cache-Control', 'private, max-age=60');
    const briefOut = stripFeedDiagnosticsFromBrief(brief);
    return res.status(200).json({ success: true, brief: briefOut, cached: false, cacheTtlSec: CACHE_SEC });
  } catch (err) {
    console.error('[market-decoder]', err);
    return res.status(500).json({ success: false, message: err.message || 'Market Decoder failed' });
  }
};
