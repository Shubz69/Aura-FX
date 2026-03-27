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

  const dashPrev = _test.normalizeEventShape({
    date: '2026-03-24',
    time: '10:00 AM',
    timestamp: Date.UTC(2026, 2, 24, 14, 0, 0),
    currency: 'USD',
    impact: 'high',
    event: 'NFP',
    previous: '—',
    forecast: '-',
  });
  assert(dashPrev.previous == null, 'placeholder dash previous should normalize to null');
  assert(dashPrev.forecast == null, 'placeholder hyphen forecast should normalize to null');

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

  // Naive ISO must be Eastern wall time for FMP-style rows (not UTC) — matches explicit -04:00 in EDT
  const naiveEt = _test.parseDateToTimestamp('2026-03-24T08:30:00', { defaultTimeZone: 'America/New_York' });
  const explicitEdt = _test.parseDateToTimestamp('2026-03-24T08:30:00-04:00');
  assert(
    naiveEt === explicitEdt,
    `naive ET 8:30 should match explicit offset, got ${naiveEt} vs ${explicitEdt}`
  );

  const naiveUtc = _test.parseDateToTimestamp('2026-03-24T12:30:00', { defaultTimeZone: 'UTC' });
  assert(naiveUtc === Date.UTC(2026, 2, 24, 12, 30, 0), 'naive UTC should be 12:30Z');

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

  // Range query parsing (historical browse API)
  assert(_test.isValidIsoDateOnly('2025-06-15') === true, 'valid ISO date');
  assert(_test.isValidIsoDateOnly('2025-13-01') === false, 'invalid month');
  assert(_test.isValidIsoDateOnly('25-06-01') === false, 'short year rejected');

  const rNull = _test.parseCalendarRangeQuery({});
  assert(rNull && rNull.from && rNull.to, 'empty query should resolve to default calendar range');

  const rDate = _test.parseCalendarRangeQuery({ date: '2026-03-10' });
  assert(rDate.from === '2026-03-10' && rDate.to === '2026-03-10', 'date= expands to from/to');

  const rSwap = _test.parseCalendarRangeQuery({ from: '2026-03-12', to: '2026-03-10' });
  assert(rSwap.from === '2026-03-10' && rSwap.to === '2026-03-12', 'from/to should be ordered');

  const days = _test.enumerateInclusiveDays('2026-03-10', '2026-03-12');
  assert(days.length === 3 && days[0] === '2026-03-10' && days[2] === '2026-03-12', 'enumerateInclusiveDays');

  const rErr = _test.parseCalendarRangeQuery({ from: '2026-01-01' });
  assert(rErr && rErr.error, 'partial range should error');

  const rSpanOk = _test.parseCalendarRangeQuery({ from: '2026-01-01', to: '2026-01-20' });
  assert(rSpanOk && rSpanOk.from && !rSpanOk.error, '20 day span should be allowed');

  const rTooLong = _test.parseCalendarRangeQuery({ from: '2025-01-01', to: '2026-06-01' });
  assert(rTooLong && rTooLong.error && rTooLong.error.includes('max'), 'span over max days should reject');

  // FRED mapping should emit calendar-shaped events with previous values.
  const fredRows = _test.mapFredSeriesToEvents(
    'UNRATE',
    [
      { date: '2026-02-01', value: '4.2' },
      { date: '2026-03-01', value: '4.1' },
    ],
    '2026-03-01',
    '2026-03-31'
  );
  assert(Array.isArray(fredRows) && fredRows.length === 1, 'FRED range should include in-window rows only');
  assert(fredRows[0].source === 'FRED', 'FRED events must mark source as FRED');
  assert(fredRows[0].event === 'US Unemployment Rate', 'UNRATE should map to unemployment label');
  assert(fredRows[0].actual === '4.10', 'FRED actual value should be normalized');
  assert(fredRows[0].previous === '4.20', 'FRED previous value should be carried from prior observation');

  console.log('OK economic-calendar-timezone tests');
}

run();

