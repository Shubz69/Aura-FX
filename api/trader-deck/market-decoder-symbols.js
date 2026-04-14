/**
 * GET /api/trader-deck/market-decoder-symbols?q=eur&limit=12&preset=quick
 * Partial symbol / label search for Market Decoder (canonical registry-backed index).
 */

'use strict';

const { searchDecoderSymbols } = require('./decoderSymbolSearch');
const { getDecoderSymbolPopularity } = require('./decoderSymbolMetrics');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const q = req.query || {};
  const rawQ = String(q.q || q.query || '').trim();
  const preset = String(q.preset || '').toLowerCase() === 'quick' ? 'quick' : '';
  const limit = q.limit != null ? Number(q.limit) : preset ? 6 : 8;

  try {
    const suggestions = searchDecoderSymbols(rawQ, { limit: Number.isFinite(limit) ? limit : 12, preset });
    return res.status(200).json({
      success: true,
      query: rawQ,
      preset: preset || null,
      suggestions,
    });
  } catch (e) {
    console.error('[market-decoder-symbols]', e);
    return res.status(500).json({ success: false, message: e.message || 'search failed' });
  }
};
