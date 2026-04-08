/**
 * Server-side LRU map of computeAnalytics results keyed by auraAnalysisClosedDataKey fingerprint.
 * Supports fast Aura Analysis hydrate for common day-filter presets without duplicating the engine.
 */

const PRESET_VERSION = 1;
const MAX_ENTRIES = 20;

/**
 * Bump when computeAnalytics output shape/semantics change for the same fingerprint
 * (invalidates stored rows without matching engineVersion).
 */
const ANALYTICS_PRESET_ENGINE_VERSION = 2;

/** Day windows aligned with AuraAnalysisContext DATE_RANGE_OPTIONS + ALL. */
const PRESET_DAY_WINDOWS = [1, 7, 30, 90, 180, 365, 3650];

function emptyPresetBlob() {
  return { v: PRESET_VERSION, entries: {}, order: [] };
}

function safeParsePresetBlob(raw) {
  if (raw == null) return emptyPresetBlob();
  try {
    let s = raw;
    if (Buffer.isBuffer(s)) s = s.toString('utf8');
    const o = typeof s === 'string' ? JSON.parse(s) : s;
    if (!o || typeof o !== 'object') return emptyPresetBlob();
    if (!o.entries || typeof o.entries !== 'object') o.entries = {};
    if (!Array.isArray(o.order)) o.order = [];
    o.v = PRESET_VERSION;
    return o;
  } catch {
    return emptyPresetBlob();
  }
}

/**
 * @param {object} blob
 * @param {string} fingerprint
 * @param {number} [engineVersion=ANALYTICS_PRESET_ENGINE_VERSION]
 * @returns {object|null} analytics payload or null if missing/stale
 */
function getPresetEntry(blob, fingerprint, engineVersion = ANALYTICS_PRESET_ENGINE_VERSION) {
  if (!fingerprint || !blob?.entries) return null;
  const hit = blob.entries[fingerprint];
  if (!hit || typeof hit !== 'object' || hit.data == null) return null;
  const v = hit.engineVersion;
  if (v == null) return null;
  if (v !== engineVersion) return null;
  return hit.data;
}

function getPresetEntryMeta(blob, fingerprint) {
  if (!fingerprint || !blob?.entries) return null;
  return blob.entries[fingerprint] || null;
}

/**
 * Merge new { fingerprint, data, engineVersion? } pairs into blob; evicts LRU past MAX_ENTRIES.
 * @param {object|null} prevBlob
 * @param {{ fingerprint: string, data: object, engineVersion?: number }[]} inserts
 */
function putPresetEntries(prevBlob, inserts) {
  const blob = safeParsePresetBlob(prevBlob);
  if (!Array.isArray(inserts) || inserts.length === 0) return blob;

  for (const row of inserts) {
    const fp = row?.fingerprint;
    if (!fp || typeof fp !== 'string') continue;
    blob.entries[fp] = {
      data: row.data,
      savedAt: new Date().toISOString(),
      engineVersion: row.engineVersion ?? ANALYTICS_PRESET_ENGINE_VERSION,
    };
    blob.order = blob.order.filter((x) => x !== fp);
    blob.order.push(fp);
  }

  while (blob.order.length > MAX_ENTRIES) {
    const evict = blob.order.shift();
    if (evict && blob.entries[evict]) delete blob.entries[evict];
  }

  return blob;
}

function invalidatePresetBlob() {
  return emptyPresetBlob();
}

module.exports = {
  PRESET_DAY_WINDOWS,
  MAX_ENTRIES,
  PRESET_VERSION,
  ANALYTICS_PRESET_ENGINE_VERSION,
  emptyPresetBlob,
  safeParsePresetBlob,
  getPresetEntry,
  getPresetEntryMeta,
  putPresetEntries,
  invalidatePresetBlob,
};
