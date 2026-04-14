/**
 * Equities Twelve Data capability map smoke tests.
 * Run: node tests/market-data-equities.test.js
 */

const { summarizeCapabilitiesForAdmin, getDatasetDef, GLOBAL_CANONICAL } = require('../api/market-data/equities/twelveDataEquityCapabilities');

let passed = 0;
let failed = 0;
function it(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok ' + name);
  } catch (e) {
    failed++;
    console.log('  FAIL ' + name + ': ' + e.message);
  }
}
const expect = (a) => ({
  toBeGreaterThan: (n) => {
    if (!(a > n)) throw new Error(`Expected > ${n}, got ${a}`);
  },
  toBe: (b) => {
    if (a !== b) throw new Error(`Expected ${b}, got ${a}`);
  },
});

console.log('\ntwelveDataEquityCapabilities');
it('exports many datasets', () => {
  const s = summarizeCapabilitiesForAdmin();
  expect(s.length).toBeGreaterThan(15);
});
it('profile tier 1', () => {
  const d = getDatasetDef('profile');
  expect(d.ingestTier).toBe(1);
});
it('global canonical constant', () => {
  expect(GLOBAL_CANONICAL).toBe('__GLOBAL__');
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
