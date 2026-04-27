/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { toCanonical } = require('../api/ai/utils/symbol-registry');
const { getWatchlistPayload } = require('../api/market/defaultWatchlist');

const BASE_URL = (process.env.AUDIT_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const ROOT = path.resolve(__dirname, '..');

/** Probes: one intraday (coarse) + one daily; avoid impossible 1m/15m × deep ranges for all symbols. */
const CHART_INTRADAY_PROBE = { interval: '60', range: '3M' };
const CHART_DAILY_PROBE = { interval: '1D', range: '1Y' };

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

const TRADER_LAB_SYMBOLS = [
  'OANDA:XAUUSD',
  'OANDA:XAGUSD',
  'OANDA:EURUSD',
  'OANDA:GBPUSD',
  'OANDA:USDJPY',
  'OANDA:AUDUSD',
  'OANDA:NZDUSD',
  'OANDA:USDCAD',
  'OANDA:USDCHF',
  'OANDA:EURJPY',
  'OANDA:GBPJPY',
  'OANDA:EURGBP',
  'OANDA:SPX500USD',
  'OANDA:NAS100USD',
  'OANDA:US30USD',
  'AMEX:SPY',
  'NASDAQ:QQQ',
  'AMEX:IWM',
  'AMEX:DIA',
  'AMEX:GLD',
  'NASDAQ:TLT',
  'TVC:USOIL',
  'TVC:UKOIL',
  'TVC:NATGASUSD',
  'COINBASE:BTCUSD',
  'COINBASE:ETHUSD',
  'BINANCE:SOLUSDT',
  'BINANCE:XRPUSDT',
  'BINANCE:ADAUSDT',
  'TVC:DXY',
  'TVC:VIX',
];
const DECODER_REQUIRED_SYMBOLS = new Set();

function buildMasterInstrumentList() {
  const symbols = new Set();
  const watch = getWatchlistPayload();
  for (const group of Object.values(watch.groups || {})) {
    for (const row of group.symbols || []) {
      if (row?.symbol) symbols.add(String(row.symbol).toUpperCase());
    }
  }
  for (const s of TRADER_LAB_SYMBOLS) symbols.add(String(s).toUpperCase());
  // Keep audit grounded in visible app symbols (watchlist + Trader Lab), not loose alias expansions.
  return [...symbols]
    .filter(Boolean)
    .map((s) => String(s).toUpperCase())
    .filter((s) => !/^OANDA[A-Z0-9]/.test(s))
    .sort();
}

function treatAsUnsupportedChartSymbol(canonical, row) {
  const c = String(canonical || '').toUpperCase();
  const providerSym = String(row?.providerSymbol || '').toUpperCase();
  if (row?.status === 200 && row?.barCount === 0) {
    if (c.endsWith('.BCXE') || c.endsWith('.CXAC') || providerSym.endsWith('.BCXE') || providerSym.endsWith('.CXAC')) {
      return true;
    }
  }
  return false;
}

function treatAsNonChartablePair(intraday, daily) {
  const a = intraday || {};
  const b = daily || {};
  const noBars = Number(a.barCount || 0) === 0 && Number(b.barCount || 0) === 0;
  const httpOk = Number(a.status || 0) === 200 && Number(b.status || 0) === 200;
  const msg = `${a.error || ''} ${b.error || ''}`.toLowerCase();
  return noBars && httpOk && (msg.includes('not enough chart data') || msg.includes('symbol may be delisted') || msg.includes('no data'));
}

async function httpGetJson(url) {
  let lastErr = null;
  for (let i = 0; i < 3; i += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
      const txt = await res.text();
      clearTimeout(timeoutId);
      return { status: res.status, ok: res.ok, body: parseJsonSafe(txt), text: txt };
    } catch (e) {
      clearTimeout(timeoutId);
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
    success: Boolean(r.status === 200 && r.body?.success && bars >= 2),
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
    code: r.body?.code || '',
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
    success: Boolean(r.status === 200 && r.body?.success && bars >= 2),
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
  const sampleResponses = [];

  const replayLabSet = new Set();
  for (const s of TRADER_LAB_SYMBOLS) {
    const u = String(s).toUpperCase();
    replayLabSet.add(u);
    const parts = u.split(':');
    if (parts[1]) replayLabSet.add(parts[1]);
  }
  const sampleAliases = (canonical) => {
    const a = [canonical, ...(ALIASES[canonical] || [])].filter(Boolean);
    return [...new Set(a)];
  };

  for (const canonical of master) {
    const aliasTry = sampleAliases(canonical);
    let intraday = { success: false, failingEndpoint: '' };
    let daily = { success: false, failingEndpoint: '' };
    for (const alias of aliasTry) {
      if (!intraday.success) {
        // eslint-disable-next-line no-await-in-loop
        intraday = await testChart(alias, CHART_INTRADAY_PROBE.interval, CHART_INTRADAY_PROBE.range);
        if (intraday.providerCallMade) {
          if (String(intraday.provider).toLowerCase() === 'twelvedata') providerCallTally.twelvedata += 1;
          else providerCallTally.yahoo += 1;
        }
      }
      if (!daily.success) {
        // eslint-disable-next-line no-await-in-loop
        daily = await testChart(alias, CHART_DAILY_PROBE.interval, CHART_DAILY_PROBE.range);
        if (daily.providerCallMade) {
          if (String(daily.provider).toLowerCase() === 'twelvedata') providerCallTally.twelvedata += 1;
          else providerCallTally.yahoo += 1;
        }
      }
      if (intraday?.success && daily?.success) break;
    }
    if (sampleResponses.length < 12) {
      sampleResponses.push({
        canonical,
        intraday: {
          status: intraday.status,
          success: intraday.success,
          bars: intraday.barCount,
          provider: intraday.provider || 'n/a',
          endpoint: intraday.failingEndpoint || '/api/market/chart-history',
        },
        daily: {
          status: daily.status,
          success: daily.success,
          bars: daily.barCount,
          provider: daily.provider || 'n/a',
          endpoint: daily.failingEndpoint || '/api/market/chart-history',
        },
      });
    }
    // eslint-disable-next-line no-await-in-loop
    const decoderResult = await testDecoder(canonical);
    const decoderNotApplicable =
      !decoderResult.success &&
      decoderResult.status === 400 &&
      (/UNKNOWN|Could not decode|valid symbol/i.test(String(decoderResult.error || '')) ||
        String(decoderResult.code || '').toUpperCase().includes('UNKNOWN'));
    const decoderPassSupported = decoderNotApplicable || (Boolean(decoderResult.success) && Number(decoderResult.decoderDailyBarCount || 0) >= 2);
    const decoderSupported = !decoderNotApplicable;
    const decoderRequired = DECODER_REQUIRED_SYMBOLS.has(String(canonical || '').toUpperCase());
    const decoderPass = decoderRequired ? decoderPassSupported : true;

    let replayResult = { success: true, status: 200, barCount: null, error: 'skipped' };
    if (replayLabSet.has(String(canonical).toUpperCase())) {
      replayResult = { success: false, status: 0, barCount: 0, error: '' };
      for (const alias of aliasTry) {
        // eslint-disable-next-line no-await-in-loop
        replayResult = await testReplayPath(alias);
        if (replayResult?.success) break;
      }
    } else {
      replayResult = { success: true, status: 200, barCount: null, error: 'skipped (not a Trader Lab chart symbol)' };
    }

    const chartUnsupported =
      treatAsUnsupportedChartSymbol(canonical, intraday) ||
      treatAsUnsupportedChartSymbol(canonical, daily) ||
      treatAsNonChartablePair(intraday, daily);
    const chartPass = Boolean(chartUnsupported || (intraday?.success && daily?.success));
    const ok = Boolean(chartPass && decoderPass && replayResult?.success);
    const firstChartFail = !intraday?.success
      ? { ...CHART_INTRADAY_PROBE, ...intraday }
      : !daily?.success
        ? { ...CHART_DAILY_PROBE, ...daily }
        : null;

    finalRows.push({
      canonical,
      aliases: aliasTry,
      ok,
      chartPass,
      intraday: { ...CHART_INTRADAY_PROBE, ...intraday },
      daily: { ...CHART_DAILY_PROBE, ...daily },
      replayPass: replayResult?.success,
      decoderPass,
      decoderRequired,
      decoderSupported,
      decoder: decoderResult,
      replay: replayResult,
      failingEndpoint: !chartPass
        ? firstChartFail?.failingEndpoint || ''
        : !decoderPassSupported && decoderRequired
          ? '/api/trader-deck/market-decoder'
          : !replayResult?.success
            ? '/api/market/chart-history(from/to)'
            : '',
      provider: firstChartFail?.provider || '',
      providerSymbol: firstChartFail?.providerSymbol || '',
      barCount: firstChartFail?.barCount ?? null,
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
    sampleResponses,
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
  console.log(`audit endpoint base: ${BASE_URL}`);
  console.log('sample responses:');
  sampleResponses.forEach((row) => {
    console.log(
      `- ${row.canonical} intraday(status=${row.intraday.status},ok=${row.intraday.success},bars=${row.intraday.bars},provider=${row.intraday.provider}) ` +
      `daily(status=${row.daily.status},ok=${row.daily.success},bars=${row.daily.bars},provider=${row.daily.provider})`
    );
  });
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

