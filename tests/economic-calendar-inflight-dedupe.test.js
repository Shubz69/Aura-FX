/**
 * Documents the same coalescing pattern as Api.js `dedupeGet` used for economic-calendar GETs.
 * Run: node tests/economic-calendar-inflight-dedupe.test.js
 */
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function run() {
  const inflight = new Map();
  function dedupeGet(key, factory) {
    const existing = inflight.get(key);
    if (existing) return existing;
    const p = Promise.resolve()
      .then(() => factory())
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }
  let providerCalls = 0;
  const p1 = dedupeGet('calendar|7', () => {
    providerCalls += 1;
    return Promise.resolve({ ok: true });
  });
  const p2 = dedupeGet('calendar|7', () => {
    providerCalls += 1;
    return Promise.resolve({ ok: true });
  });
  return Promise.all([p1, p2]).then(() => {
    assert(providerCalls === 1, 'two concurrent identical keys should call provider once');
    console.log('OK economic-calendar-inflight-dedupe');
  });
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
