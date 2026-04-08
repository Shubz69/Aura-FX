/**
 * @jest-environment node
 */
const {
  putPresetEntries,
  getPresetEntry,
  safeParsePresetBlob,
  MAX_ENTRIES,
  ANALYTICS_PRESET_ENGINE_VERSION,
} = require('../api/aura-analysis/auraAnalyticsPresets');

describe('auraAnalyticsPresets', () => {
  test('putPresetEntries stores and retrieves by fingerprint', () => {
    const blob = putPresetEntries(null, [
      { fingerprint: 'fp_a', data: { winRate: 50 } },
      { fingerprint: 'fp_b', data: { winRate: 60 } },
    ]);
    expect(getPresetEntry(blob, 'fp_a')).toEqual({ winRate: 50 });
    expect(getPresetEntry(blob, 'fp_b')).toEqual({ winRate: 60 });
  });

  test('getPresetEntry rejects stale engine version', () => {
    const blob = putPresetEntries(null, [
      { fingerprint: 'fp_old', data: { x: 1 }, engineVersion: 0 },
    ]);
    expect(getPresetEntry(blob, 'fp_old', ANALYTICS_PRESET_ENGINE_VERSION)).toBeNull();
  });

  test('getPresetEntry accepts matching engine version', () => {
    const blob = putPresetEntries(null, [
      { fingerprint: 'fp_ok', data: { x: 2 }, engineVersion: ANALYTICS_PRESET_ENGINE_VERSION },
    ]);
    expect(getPresetEntry(blob, 'fp_ok', ANALYTICS_PRESET_ENGINE_VERSION)).toEqual({ x: 2 });
  });

  test('evicts LRU past MAX_ENTRIES', () => {
    let blob = safeParsePresetBlob(null);
    const inserts = [];
    for (let i = 0; i < MAX_ENTRIES + 5; i++) {
      inserts.push({ fingerprint: `fp_${i}`, data: { n: i } });
    }
    blob = putPresetEntries(blob, inserts);
    expect(blob.order.length).toBeLessThanOrEqual(MAX_ENTRIES);
    expect(Object.keys(blob.entries).length).toBeLessThanOrEqual(MAX_ENTRIES);
    expect(getPresetEntry(blob, 'fp_0')).toBeNull();
    expect(getPresetEntry(blob, `fp_${MAX_ENTRIES + 4}`)).toEqual({ n: MAX_ENTRIES + 4 });
  });
});
