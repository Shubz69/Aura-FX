/**
 * GET /api/trader-deck/market-decoder?symbol=EURUSD
 * Institutional-style decision brief — rules engine + optional AI polish.
 * Cache: MARKET_DECODER_CACHE_SEC (default 600s).
 */

require('../utils/suppress-warnings');

const { runMarketDecoder } = require('./marketDecoderEngine');
const { polishMarketDecoderBrief } = require('./marketDecoderPolish');
const { getStoredDecoderState } = require('../market-data/pipeline-service');
const { toCanonical } = require('../ai/utils/symbol-registry');

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

/** @returns {{ ok: true, symbol: string } | { ok: false, code: string, message: string }} */
function normalizeDecoderQuerySymbol(raw) {
  const s0 = String(raw || '').trim();
  if (!s0) return { ok: false, code: 'SYMBOL_REQUIRED', message: 'symbol is required' };
  if (s0.length > 48) {
    return { ok: false, code: 'SYMBOL_TOO_LONG', message: 'Symbol is too long (maximum 48 characters).' };
  }
  if (/[\r\n\x00]/.test(s0)) {
    return { ok: false, code: 'INVALID_SYMBOL', message: 'Symbol contains invalid characters.' };
  }
  const s = s0.toUpperCase();
  if (!/^[\w.:\-]{2,48}$/.test(s)) {
    return {
      ok: false,
      code: 'INVALID_SYMBOL',
      message: 'Use letters, numbers, and . : - only (e.g. EURUSD, XAUUSD, SPY).',
    };
  }
  return { ok: true, symbol: s };
}

function getCached(key) {
  const e = cacheStore.get(key);
  if (e && Date.now() - e.at < CACHE_TTL_MS) return { payload: e.payload, storedAtMs: e.at };
  return null;
}

function setCached(key, payload) {
  cacheStore.set(key, { at: Date.now(), payload });
}

function setDecoderEngineHeader(res, brief) {
  const v = brief && brief.meta && brief.meta.decoderEngineVersion;
  if (v != null) res.setHeader('X-Market-Decoder-Engine', String(v));
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
  const rawSymbol = (q.symbol || q.q || '').toString();
  const normalized = normalizeDecoderQuerySymbol(rawSymbol);
  if (!normalized.ok) {
    return res.status(400).json({
      success: false,
      code: normalized.code,
      message: normalized.message,
    });
  }
  const symbol = toCanonical(normalized.symbol) || normalized.symbol;
  const refresh = q.refresh === '1' || q.refresh === 'true';
  const skipAi = q.noAi === '1' || q.noAi === 'true';

  const cacheKey = symbol;

  if (!refresh) {
    const hit = getCached(cacheKey);
    if (hit) {
      res.setHeader('Cache-Control', 'private, max-age=60');
      const briefOut = stripFeedDiagnosticsFromBrief(hit.payload.brief);
      setDecoderEngineHeader(res, briefOut);
      const ageSec = Math.max(0, Math.round((Date.now() - hit.storedAtMs) / 1000));
      return res.status(200).json({
        success: true,
        ...hit.payload,
        brief: briefOut,
        cached: true,
        cacheAgeSec: ageSec,
        cacheTtlSec: CACHE_SEC,
      });
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
        setDecoderEngineHeader(res, briefOut);
        let cacheAgeSec = null;
        if (stored.updatedAt) {
          const t = Date.parse(String(stored.updatedAt));
          if (!Number.isNaN(t)) {
            cacheAgeSec = Math.max(0, Math.round((Date.now() - t) / 1000));
          }
        }
        return res.status(200).json({
          success: true,
          ...payload,
          brief: briefOut,
          ...(cacheAgeSec != null ? { cacheAgeSec } : {}),
        });
      }
    } catch (error) {
      console.warn('[market-decoder] stored read failed:', error.message || error);
    }
  }

  try {
    console.info('[market-decoder] request', { symbol: symbol.toUpperCase(), refresh: Boolean(refresh), noAi: Boolean(skipAi) });
    const raw = await runMarketDecoder(symbol);
    if (!raw.success) {
      return res.status(400).json({
        success: false,
        code: raw.code || 'DECODE_FAILED',
        message: raw.message || 'Could not decode this symbol.',
      });
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
    setDecoderEngineHeader(res, briefOut);
    return res.status(200).json({ success: true, brief: briefOut, cached: false, cacheTtlSec: CACHE_SEC });
  } catch (err) {
    console.error('[market-decoder]', err);
    return res.status(500).json({ success: false, message: err.message || 'Market Decoder failed' });
  }
};
