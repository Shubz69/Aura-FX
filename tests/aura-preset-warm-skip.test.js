/** @jest-environment node */
const {
  safeParsePresetBlob,
  getPresetEntryMeta,
  getPresetEntry,
  putPresetEntries,
  ANALYTICS_PRESET_ENGINE_VERSION,
} = require('../api/aura-analysis/auraAnalyticsPresets');

describe('preset warm skip (meta)', () => {
  test('treats valid meta as warm', () => {
    const blob = putPresetEntries(null, [
      {
        fingerprint: 'inst_abc',
        data: { winRate: 55 },
        engineVersion: ANALYTICS_PRESET_ENGINE_VERSION,
      },
    ]);
    const meta = getPresetEntryMeta(blob, 'inst_abc');
    expect(meta.data).toEqual({ winRate: 55 });
    expect(meta.engineVersion).toBe(ANALYTICS_PRESET_ENGINE_VERSION);
  });

  test('legacy row without engineVersion is not warm', () => {
    const b = safeParsePresetBlob(null);
    b.entries.legacy = { data: { ok: true }, savedAt: new Date().toISOString() };
    const meta = getPresetEntryMeta(b, 'legacy');
    expect(meta.engineVersion).toBeUndefined();
    expect(getPresetEntry(b, 'legacy', ANALYTICS_PRESET_ENGINE_VERSION)).toBeNull();
  });
});
