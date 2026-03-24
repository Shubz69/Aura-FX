/**
 * Economic calendar timezone + actual-value regression tests.
 * Run: node tests/economic-calendar-timezone.test.js
 */
const { _test } = require('../api/trader-deck/economic-calendar');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function run() {
  // actual value correctness through backend normalization
  const zeroActual = _test.normalizeEventShape({
    date: '2026-03-24',
    time: '10:00 AM',
    timestamp: Date.UTC(2026, 2, 24, 14, 0, 0),
    currency: 'USD',
    impact: 'high',
    event: 'NFP',
    actual: 0,
  });
  const emptyActual = _test.normalizeEventShape({
    date: '2026-03-24',
    time: '10:00 AM',
    timestamp: Date.UTC(2026, 2, 24, 14, 0, 0),
    currency: 'USD',
    impact: 'high',
    event: 'NFP',
    actual: '',
  });
  assert(zeroActual.actual === '0', 'actual=0 should be preserved as "0"');
  assert(emptyActual.actual == null, 'empty actual should normalize to null');

  const utcMs = Date.UTC(2026, 2, 24, 14, 0, 0);
  const withNumericTs = _test.normalizeEventShape({
    date: '2026-03-24',
    time: '10:00 AM',
    timestamp: utcMs,
    currency: 'USD',
    impact: 'high',
    event: 'NFP',
  });
  assert(withNumericTs.timestamp === utcMs, 'numeric timestamp ms must survive normalizeEventShape');

  // X-Client-Timezone wins over IP; IP fallback when no client header
  const tzClientWins = _test.resolveViewerTimeZone({
    headers: {
      'x-client-timezone': 'Australia/Sydney',
      'x-vercel-ip-timezone': 'Europe/London',
    },
  });
  assert(tzClientWins === 'Australia/Sydney', `client tz should win, got ${tzClientWins}`);
  const tzFromHeader = _test.resolveViewerTimeZone({ headers: { 'x-vercel-ip-timezone': 'Europe/London' } });
  assert(tzFromHeader === 'Europe/London', `expected Europe/London, got ${tzFromHeader}`);
  const tzBad = _test.resolveViewerTimeZone({ headers: { 'x-vercel-ip-timezone': 'Not/AZone' } });
  assert(tzBad === 'UTC', `invalid timezone should fallback UTC, got ${tzBad}`);
  const tzQuery = _test.resolveViewerTimeZone({ headers: {}, query: { tz: 'Europe/London' } });
  assert(tzQuery === 'Europe/London', `query tz= should work, got ${tzQuery}`);

  // timezone conversion should differ for different regions on same UTC timestamp
  const ts = Date.UTC(2026, 2, 24, 14, 0, 0); // 2026-03-24 14:00:00Z
  const ny = new Date(ts).toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const tk = new Date(ts).toLocaleTimeString('en-US', {
    timeZone: 'Asia/Tokyo',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  assert(typeof ny === 'string' && ny.length > 0, 'NY time should format');
  assert(typeof tk === 'string' && tk.length > 0, 'Tokyo time should format');
  assert(ny !== tk, 'NY and Tokyo formatted times should differ');

  const nyDate = new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const tkDate = new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
  assert(/^\d{4}-\d{2}-\d{2}$/.test(nyDate), 'NY date key must be YYYY-MM-DD');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(tkDate), 'Tokyo date key must be YYYY-MM-DD');

  const tsMatch = Date.UTC(2026, 2, 24, 14, 0, 0);
  const merged = _test.mergeSupplementActuals(
    [
      {
        date: '2026-03-24',
        time: '10:00 AM',
        timestamp: tsMatch,
        currency: 'USD',
        impact: 'high',
        event: 'ISM Manufacturing PMI',
        actual: null,
        forecast: '49',
        previous: '48',
      },
    ],
    [
      {
        date: '2026-03-24',
        time: '10:00 AM',
        timestamp: tsMatch + 45000,
        currency: 'USD',
        impact: 'high',
        event: 'ISM Manufacturing PMI',
        actual: '50.1',
        forecast: '49',
        previous: '48',
      },
    ]
  );
  assert(merged[0].actual === '50.1', 'mergeSupplementActuals should fill actual from FMP row');

  console.log('OK economic-calendar-timezone tests');
}

run();

