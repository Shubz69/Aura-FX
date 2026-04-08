/**
 * Client-side overlay for TradeZella-style per-trade metadata (rating, notes, setup tag).
 * Keyed by stable trade id + platform; merges into analytics trades in AuraAnalysisContext.
 */

const META_VERSION = 1;

function storageKey(userId, platformId) {
  const u = userId != null ? String(userId) : 'anon';
  const p = String(platformId || 'default');
  return `aura_analysis_trade_meta_v${META_VERSION}_${u}_${p}`;
}

export function readTradeMetadataMap(userId, platformId) {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(storageKey(userId, platformId));
    if (!raw) return {};
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

export function writeTradeMetadataMap(userId, platformId, map) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(storageKey(userId, platformId), JSON.stringify(map));
  } catch {
    /* quota */
  }
}

export function getTradeMetadata(userId, platformId, tradeId) {
  if (tradeId == null || tradeId === '') return null;
  const m = readTradeMetadataMap(userId, platformId);
  return m[String(tradeId)] || null;
}

export function upsertTradeMetadata(userId, platformId, tradeId, patch) {
  if (tradeId == null || tradeId === '') return;
  const m = readTradeMetadataMap(userId, platformId);
  const id = String(tradeId);
  const prev = m[id] || {};
  const next = { ...prev, updatedAt: new Date().toISOString() };
  if ('rating' in patch) {
    if (patch.rating == null || patch.rating === '') delete next.rating;
    else next.rating = Math.max(1, Math.min(5, Number(patch.rating) || 3));
  }
  if ('setupKey' in patch) {
    if (patch.setupKey == null || patch.setupKey === '') delete next.setupKey;
    else next.setupKey = String(patch.setupKey).trim();
  }
  if ('note' in patch) {
    if (patch.note == null || patch.note === '') delete next.note;
    else next.note = String(patch.note).trim();
  }
  if ('scaleIn' in patch) next.scaleIn = patch.scaleIn === true;
  const dataKeys = Object.keys(next).filter((k) => k !== 'updatedAt');
  if (dataKeys.length === 0) delete m[id];
  else m[id] = next;
  writeTradeMetadataMap(userId, platformId, m);
}

export function mergeTradeMetadataRow(userId, platformId, trade) {
  const meta = getTradeMetadata(userId, platformId, trade.id);
  if (!meta) return trade;
  return {
    ...trade,
    userRating: meta.rating ?? trade.userRating ?? null,
    userNote: meta.note ?? trade.userNote ?? '',
    userSetupKey: meta.setupKey ?? trade.userSetupKey ?? '',
    scaleInFlag: meta.scaleIn === true,
  };
}
