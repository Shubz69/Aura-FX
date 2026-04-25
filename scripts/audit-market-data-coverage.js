/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { toCanonical } = require('../api/ai/utils/symbol-registry');
const { getWatchlistPayload } = require('../api/market/defaultWatchlist');

const BASE_URL = (process.env.AUDIT_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const ROOT = path.resolve(__dirname, '..');

const CHART_TESTS = [
  { interval: '1', range: '1D' },
  { interval: '15', range: '1M' },
  { interval: '60', range: '3M' },
  { interval: '240', range: '1Y' },
  { interval: '1D', range: '1Y' },
];

const ALIASES = {
  EURUSD: ['EURUSD', 'OANDA:EURUSD', 'EUR/USD'],
  XAUUSD: ['XAUUSD', 'OANDA:XAUUSD', 'Gold'],
  BTCUSD: ['BTCUSD', 'BTC/USD', 'Bitcoin'],
  SPX: ['SPX', 'SPX500', 'OANDA:SPX500USD'],
  NDX: ['NAS100', 'NASDAQ100', 'OANDA:NAS100USD'],
  USOIL: ['USOIL', 'WTI', 'CL'],
};

function parseJsonSafe(txt) {
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

function walkFiles(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'build' || e.name === 'coverage') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, out);
    else if (/\.(js|jsx|ts|tsx|json)$/.test(e.name)) out.push(p);
  }
  return out;
}

function collectSymbolsFromText(content) {
  const out = new Set();
  const regexes = [
    /\b[A-Z]{3,6}\/[A-Z]{3,6}\b/g,
    /\b[A-Z]+:[A-Z0-9._-]{2,20}\b/g,
    /\b[A-Z0-9.-]{2,14}(?:USD|USDT|\.AX|\.L|\.BCXE|\.CXAC)?\b/g,
  ];
  for (const re of regexes) {
    const matches = content.match(re) || [];
    for (const m of matches) {
      const v = String(m).trim();
      if (!v) continue;
      if (v.length < 3 || v.length > 24) continue;
      if (['JSON', 'HTTP', 'HTTPS', 'TRUE', 'FALSE', 'NULL', 'CONST'].includes(v)) continue;
      out.add(v);
    }
  }
  return out;
}

function buildMasterInstrumentList() {
  const symbols = new Set();
  const watch = getWatchlistPayload();
  for (const group of Object.values(watch.groups || {})) {
    for (const row of group.symbols || []) {
      if (row?.symbol) symbols.add(String(row.symbol).toUpperCase());
    }
  }
  const files = walkFiles(path.join(ROOT, 'src')).concat(walkFiles(path.join(ROOT, 'api')));
  for (const f of files) {
    let txt = '';
    try {
      txt = fs.readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    const found = collectSymbolsFromText(txt);
    for (const raw of found) {
      const canonical = toCanonical(raw);
      if (canonical && /^[A-Z0-9.-]{2,24}$/.test(canonical)) symbols.add(canonical);
    }
  }
  for (const vals of Object.values(ALIASES)) {
    for (const s of vals) symbols.add(toCanonical(s));
  }
  return [...symbols].filter(Boolean).sort();
}

async function httpGetJson(url) {
  let lastErr = null;
  for (let i = 0; i < 3; i += 1) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const txt = await res.text();
      return { status: res.status, ok: res.ok, body: parseJsonSafe(txt), text: txt };
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    }
  }
  return { status: 599, ok: false, body: null, text: String(lastErr?.message || lastErr || 'fetch failed') };
}

async function testChart(symbol, interval, range) {
  const u = `${BASE_URL}/api/market/chart-history?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}`;
  const r = await httpGetJson(u);
  const d = r.body?.diagnostics || {};
  const bars = Array.isArray(r.body?.bars) ? r.body.bars.length : 0;
  return {
    endpoint: '/api/market/chart-history',
    status: r.status,
    success: Boolean(r.body?.success && bars >= 2),
    failingEndpoint: r.body?.success && bars >= 2 ? '' : u,
    provider: r.body?.source || d.selectedProvider || '',
    providerSymbol: d.selectedProvider === 'twelvedata' ? d.twelveDataSymbol : d.yahooSymbol,
    barCount: bars,
    firstBarTime: d.firstBarTime ?? null,
    lastBarTime: d.lastBarTime ?? null,
    fourHourAggregated: Boolean(d.fourHourAggregated),
    cacheHit: Boolean(d.cacheHit),
    cacheTtlMs: d.cacheTtlMs ?? null,
    inFlightDeduped: Boolean(d.inFlightDeduped),
    providerCallMade: Boolean(d.providerCallMade),
    providerCallCounts: d.providerCallCounts || {},
    error: d.error || r.body?.message || (!r.ok ? r.text : ''),
  };
}

async function testDecoder(symbol) {
  const u = `${BASE_URL}/api/trader-deck/market-decoder?symbol=${encodeURIComponent(symbol)}&refresh=1`;
  const r = await httpGetJson(u);
  const daily = r.body?.brief?.meta?.dataSufficiency?.dailyHistoryDiagnostics || {};
  const s = r.body?.brief?.meta?.dataSufficiency || {};
  return {
    endpoint: '/api/trader-deck/market-decoder',
    status: r.status,
    supported: r.status !== 400 || !String(r.body?.code || '').includes('UNKNOWN'),
    success: Boolean(r.body?.success),
    decoderDailyBarCount: s.dailyBarCount ?? null,
    provider: daily.provider || '',
    providerSymbol: daily.providerSymbol || '',
    providerError: daily.providerError || null,
    cacheHit: Boolean(r.body?.cacheHit),
    cacheTtlMs: r.body?.cacheTtlMs ?? null,
    inFlightDeduped: Boolean(r.body?.inFlightDeduped),
    providerCallMade: Boolean(r.body?.providerCallMade),
    error: r.body?.message || (!r.ok ? r.text : ''),
  };
}

async function testReplayPath(symbol) {
  const now = Math.floor(Date.now() / 1000);
  const from = now - 45 * 86400;
  const u = `${BASE_URL}/api/market/chart-history?symbol=${encodeURIComponent(symbol)}&interval=60&from=${from}&to=${now}`;
  const r = await httpGetJson(u);
  const bars = Array.isArray(r.body?.bars) ? r.body.bars.length : 0;
  return {
    endpoint: '/api/market/chart-history(from/to)',
    status: r.status,
    success: Boolean(r.body?.success && bars >= 2),
    barCount: bars,
    provider: r.body?.source || r.body?.diagnostics?.selectedProvider || '',
    providerSymbol:
      r.body?.diagnostics?.selectedProvider === 'twelvedata'
        ? r.body?.diagnostics?.twelveDataSymbol
        : r.body?.diagnostics?.yahooSymbol,
    error: r.body?.diagnostics?.error || r.body?.message || (!r.ok ? r.text : ''),
  };
}

async function run() {
  const master = buildMasterInstrumentList();
  const finalRows = [];
  const providerCallTally = { yahoo: 0, twelvedata: 0 };

  for (const canonical of master) {
    const aliases = [...new Set([canonical, ...(ALIASES[canonical] || [])])];
    const aliasResults = [];
    for (const alias of aliases) {
      const chartResults = [];
      for (const t of CHART_TESTS) {
        // eslint-disable-next-line no-await-in-loop
        const res = await testChart(alias, t.interval, t.range);
        chartResults.push({ ...t, ...res });
        providerCallTally.yahoo += Number(res.providerCallCounts?.yahoo || 0);
        providerCallTally.twelvedata += Number(res.providerCallCounts?.twelvedata || 0);
      }
      // eslint-disable-next-line no-await-in-loop
      const decoder = await testDecoder(alias);
      // eslint-disable-next-line no-await-in-loop
      const replay = await testReplayPath(alias);
      aliasResults.push({ alias, chartResults, decoder, replay });
    }
    const chartPass = aliasResults.some((a) => a.chartResults.every((c) => c.success));
    const replayPass = aliasResults.some((a) => a.replay.success);
    const decoderSupported = aliasResults.some((a) => a.decoder.supported);
    const decoderPass = !decoderSupported || aliasResults.some((a) => a.decoder.success && Number(a.decoder.decoderDailyBarCount || 0) >= 2);
    const ok = chartPass && replayPass && decoderPass;
    const firstFail = aliasResults
      .flatMap((a) => a.chartResults.map((c) => ({ alias: a.alias, fail: !c.success, row: c })))
      .find((x) => x.fail);
    finalRows.push({
      canonical,
      aliases,
      ok,
      chartPass,
      replayPass,
      decoderPass,
      decoderSupported,
      failingEndpoint: firstFail?.row?.failingEndpoint || '',
      provider: firstFail?.row?.provider || '',
      providerSymbol: firstFail?.row?.providerSymbol || '',
      barCount: firstFail?.row?.barCount ?? null,
      firstBarTime: firstFail?.row?.firstBarTime ?? null,
      lastBarTime: firstFail?.row?.lastBarTime ?? null,
      decoderDailyBarCount: aliasResults[0]?.decoder?.decoderDailyBarCount ?? null,
      fourHourAggregated: Boolean(aliasResults[0]?.chartResults?.find((c) => c.interval === '240')?.fourHourAggregated),
      aliasResults,
    });
  }

  const passed = finalRows.filter((r) => r.ok);
  const failed = finalRows.filter((r) => !r.ok);
  const report = {
    baseUrl: BASE_URL,
    generatedAt: new Date().toISOString(),
    totalInstrumentsFound: finalRows.length,
    passedInstruments: passed.length,
    failedInstruments: failed.length,
    providerCallCountsObserved: providerCallTally,
    failed,
    rows: finalRows,
  };

  const outPath = path.join(ROOT, 'e2e', 'reports', 'MARKET_DATA_COVERAGE_AUDIT_REPORT.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(`AUDIT_BASE_URL=${BASE_URL}`);
  console.log(`total instruments found: ${report.totalInstrumentsFound}`);
  console.log(`passed instruments: ${report.passedInstruments}`);
  console.log(`failed instruments: ${report.failedInstruments}`);
  console.log(`provider calls observed: yahoo=${providerCallTally.yahoo} twelvedata=${providerCallTally.twelvedata}`);
  if (failed.length) {
    console.log('failed symbols:');
    for (const row of failed.slice(0, 80)) {
      console.log(
        `- ${row.canonical} fail endpoint=${row.failingEndpoint || 'n/a'} provider=${row.provider || 'n/a'} providerSymbol=${row.providerSymbol || 'n/a'} bars=${row.barCount ?? 'n/a'}`
      );
    }
  }
  process.exit(failed.length ? 1 : 0);
}

run().catch((err) => {
  console.error('AUDIT_FATAL', err);
  process.exit(1);
});

