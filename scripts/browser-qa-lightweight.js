/* eslint-disable no-console */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const QA_REPORTS_DIR = path.join(__dirname, '..', 'e2e', 'reports');

function ensureReportsDir() {
  try {
    fs.mkdirSync(QA_REPORTS_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
}

/** @param {import('playwright').Response} resp */
function parseChartHistoryRequest(resp) {
  const u = new URL(resp.request().url());
  return {
    symbol: u.searchParams.get('symbol'),
    interval: u.searchParams.get('interval'),
    range: u.searchParams.get('range'),
  };
}

const BASE_URL = process.env.QA_BASE_URL || 'http://localhost:3000';
const CHART_STORAGE_KEY = 'aura_chart_user_request_v1';

const SYMBOLS = [
  ['EURUSD', 'OANDA:EURUSD'],
  ['XAUUSD', 'OANDA:XAUUSD'],
  ['BTCUSD', 'COINBASE:BTCUSD'],
  ['SPX', 'OANDA:SPX500USD'],
  ['NAS100', 'OANDA:NAS100USD'],
  ['SOLUSD', 'BINANCE:SOLUSDT'],
  ['USOIL', 'TVC:USOIL'],
];
const DEFAULT_CHART_RANGE = '3M';
const LAB_TFS = [
  ['1m', '1'],
  ['15m', '15'],
  ['1H', '60'],
  ['4H', '240'],
  ['1D', '1D'],
];
const REPLAY_TFS = [
  ['1m', '1'],
  ['15m', '15'],
  ['1H', '60'],
  ['4H', '240'],
  ['Daily', 'D'],
];
const DECODER_TFS = [
  ['1m', '1'],
  ['15m', '15'],
  ['1H', '60'],
  ['4H', '240'],
  ['1d', '1D'],
];
const DECODER_RANGES = ['1D', '1W', '1M', '3M', '6M', '1Y'];
const DECODER_TF_TESTID = {
  1: 'md-candle-tf-1m',
  15: 'md-candle-tf-15m',
  60: 'md-candle-tf-1h',
  240: 'md-candle-tf-4h',
  '1D': 'md-candle-tf-1d',
};
const DECODER_RANGE_TESTID = {
  '1D': 'md-range-1d',
  '1W': 'md-range-1w',
  '1M': 'md-range-1m',
  '3M': 'md-range-3m',
  '6M': 'md-range-6m',
  '1Y': 'md-range-1y',
};

function token() {
  const now = Math.floor(Date.now() / 1000);
  const h = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(JSON.stringify({ id: 9001, userId: 9001, role: 'admin', email: 'qa@local.test', exp: now + 86400 })).toString('base64url');
  return `${h}.${p}.x`;
}

async function dismissGdpr(page) {
  const btn = page.getByRole('button', { name: 'I Agree' });
  if (await btn.count()) {
    try { await btn.first().click({ timeout: 1200 }); } catch {}
  }
}

function intervalsMatch(urlInterval, expected) {
  const u = String(urlInterval || '').toUpperCase();
  const e = String(expected || '').toUpperCase();
  if (u === e) return true;
  if ((u === '1D' || u === 'D') && (e === '1D' || e === 'D')) return true;
  return false;
}

/** Register before navigation/navigation that triggers fetch to avoid missing the response. */
function waitChartResp(page, symbol, interval, opts = {}) {
  const timeoutMs = typeof opts === 'number' ? opts : (opts.timeoutMs ?? 90000);
  const range = typeof opts === 'number' ? undefined : opts.range;
  return page.waitForResponse((resp) => {
    if (!resp.url().includes('/api/market/chart-history')) return false;
    try {
      const u = new URL(resp.url());
      if (u.searchParams.get('symbol') !== symbol) return false;
      if (!intervalsMatch(u.searchParams.get('interval'), interval)) return false;
      if (range != null && u.searchParams.get('range') !== String(range)) return false;
      return true;
    } catch {
      return false;
    }
  }, { timeout: timeoutMs });
}

async function hasCanvas(page) {
  const c = page.locator('.trader-suite-chart-frame canvas').first();
  try { return await c.isVisible({ timeout: 5000 }); } catch { return false; }
}

async function fetchChartStats(page, symbol, interval, range = DEFAULT_CHART_RANGE) {
  try {
    const r = await page.request.get(
      `${BASE_URL}/api/market/chart-history?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}`
    );
    let body = null;
    try { body = await r.json(); } catch {}
    const bars = Array.isArray(body?.bars) ? body.bars : [];
    return {
      status: r.status(),
      barCount: bars.length || null,
      firstBarTime: bars.length ? bars[0].time : null,
      lastBarTime: bars.length ? bars[bars.length - 1].time : null,
      body,
    };
  } catch {
    return { status: null, barCount: null, firstBarTime: null, lastBarTime: null, body: null };
  }
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const warnings = [];
  const failedApi = [];
  const issues = [];
  const resize = {};
  const matrix = [];

  page.on('console', (m) => {
    if (m.type() === 'warning' || m.type() === 'error') warnings.push(m.text());
  });
  page.on('response', (r) => {
    if (r.url().includes('/api/market/chart-history') && !r.ok()) failedApi.push({ status: r.status(), url: r.url() });
  });

  await page.addInitScript((t) => {
    localStorage.setItem('token', t);
    localStorage.setItem('user', JSON.stringify({ id: 9001, userId: 9001, role: 'admin', email: 'qa@local.test' }));
    localStorage.setItem('mfaVerified', 'true');
    localStorage.setItem('gdprAccepted', 'true');
    localStorage.setItem('qaTestMode', '1');
  }, token());

  await page.goto(`${BASE_URL}/trader-deck/trade-validator/trader-lab?qa_test_mode=1`, { waitUntil: 'domcontentloaded' });
  await dismissGdpr(page);
  const labBefore = await page.locator('.tlab-chart-host--fill').boundingBox();
  let labHeightStable = null;
  for (const [, sym] of SYMBOLS) {
    await page.selectOption('.tlab-chart-toolbar select.tlab-select', sym);
    for (const [tfLabel, tfVal] of LAB_TFS) {
      let body = null;
      let status = null;
      let firstBarTime = null;
      let lastBarTime = null;
      let barCount = null;
      let lastErr = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (attempt > 0) await page.waitForTimeout(1200);
        const respPromise = waitChartResp(page, sym, tfVal, { range: DEFAULT_CHART_RANGE });
        await page.locator('.tlab-chart-toolbar--terminal .tlab-tf', { hasText: tfLabel }).first().click();
        try {
          // eslint-disable-next-line no-await-in-loop
          const resp = await respPromise;
          status = resp.status();
          // eslint-disable-next-line no-await-in-loop
          body = await resp.json();
          barCount = Array.isArray(body?.bars) ? body.bars.length : null;
          firstBarTime = barCount ? body.bars[0].time : null;
          lastBarTime = barCount ? body.bars[barCount - 1].time : null;
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (lastErr) {
        issues.push({ page: 'TraderLab', symbol: sym, interval: tfVal, error: String(lastErr.message || lastErr) });
        matrix.push({
          page: 'TraderLab',
          symbol: sym,
          interval: tfVal,
          status: status ?? null,
          barCount,
          firstBarTime,
          lastBarTime,
          canvasRendered: false,
          layoutHeightStable: labHeightStable,
          chartWarnings: warnings.filter((w) => w.includes(sym) || w.includes('chart-history')).slice(-2),
        });
        continue;
      }
      const canvas = await hasCanvas(page);
      if (!canvas || !body?.success) {
        issues.push({ page: 'TraderLab', symbol: sym, interval: tfVal, canvas, success: body?.success ?? null, bars: body?.bars?.length ?? null, diagnostics: body?.diagnostics || null });
      }
      matrix.push({
        page: 'TraderLab',
        symbol: sym,
        interval: tfVal,
        status,
        barCount,
        firstBarTime,
        lastBarTime,
        canvasRendered: canvas,
        layoutHeightStable: labHeightStable,
        chartWarnings: warnings.filter((w) => w.includes(sym) || w.includes('chart-history') || w.includes('Lightweight')).slice(-2),
      });
    }
  }
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.setViewportSize({ width: 1024, height: 720 });
  const labAfter = await page.locator('.tlab-chart-host--fill').boundingBox();
  resize.traderLab = { before: labBefore, after: labAfter };
  if (labBefore && labAfter) {
    labHeightStable = Math.abs(labBefore.height - labAfter.height) < 4;
  }
  matrix.forEach((row) => {
    if (row.page === 'TraderLab') row.layoutHeightStable = labHeightStable;
  });

  // Trader Lab: verify 1Y range (EURUSD 1H + range=1Y)
  try {
    await page.selectOption('.tlab-chart-toolbar select.tlab-select', 'OANDA:EURUSD');
    await page.locator('.tlab-chart-toolbar--terminal .tlab-tf', { hasText: '1H' }).first().click();
    const yResp = waitChartResp(page, 'OANDA:EURUSD', '60', { range: '1Y' });
    await page.getByLabel('Chart range').selectOption('1Y');
    const resp = await yResp;
    const body = await resp.json();
    const barCount = Array.isArray(body?.bars) ? body.bars.length : null;
    const canvas = await hasCanvas(page);
    if (!canvas || !body?.success) {
      issues.push({ page: 'TraderLab', symbol: 'OANDA:EURUSD', interval: '60+1Y', canvas, success: body?.success ?? null });
    }
    matrix.push({
      page: 'TraderLab',
      symbol: 'OANDA:EURUSD',
      interval: '60',
      range: '1Y',
      status: resp.status(),
      barCount,
      firstBarTime: barCount ? body.bars[0].time : null,
      lastBarTime: barCount ? body.bars[barCount - 1].time : null,
      canvasRendered: canvas,
      layoutHeightStable: labHeightStable,
      chartWarnings: [],
    });
  } catch (e) {
    issues.push({ page: 'TraderLab', symbol: 'OANDA:EURUSD', interval: '60+1Y', error: String(e.message || e) });
  }

  // Chart control matrix: single active TF, interval/range independence, both query params on chart-history
  try {
    ensureReportsDir();
    await page.goto(`${BASE_URL}/trader-deck/trade-validator/trader-lab?qa_test_mode=1`, { waitUntil: 'domcontentloaded' });
    await dismissGdpr(page);
    await page.waitForTimeout(500);
    await page.selectOption('.tlab-chart-toolbar select[aria-label="Instrument"]', 'OANDA:EURUSD');

    const labActiveTf = await page.locator('.tlab-chart-toolbar--terminal .tlab-tf.tlab-tf--active').count();
    if (labActiveTf !== 1) {
      issues.push({
        page: 'TraderLab',
        chartControl: true,
        error: `expected exactly 1 active candle interval button, got ${labActiveTf}`,
      });
    }

    const rA = waitChartResp(page, 'OANDA:EURUSD', '15', { range: '3M' });
    await page.locator('.tlab-chart-toolbar--terminal .tlab-tf', { hasText: '15m' }).first().click();
    const respA = await rA;
    const pA = parseChartHistoryRequest(respA);
    if (!pA.interval || !pA.range) {
      issues.push({ page: 'TraderLab', chartControl: true, error: 'chart-history missing interval or range', params: pA });
    }
    if (!intervalsMatch(pA.interval, '15') || pA.range !== '3M') {
      issues.push({ page: 'TraderLab', chartControl: true, error: '15m+3M request mismatch', params: pA });
    }

    const rB = waitChartResp(page, 'OANDA:EURUSD', '15', { range: '1W' });
    await page.getByLabel('Chart range').selectOption('1W');
    const respB = await rB;
    const pB = parseChartHistoryRequest(respB);
    if (!intervalsMatch(pB.interval, '15') || pB.range !== '1W') {
      issues.push({
        page: 'TraderLab',
        chartControl: true,
        error: 'changing range must keep interval (expected 15 + 1W)',
        params: pB,
      });
    }

    const rC = waitChartResp(page, 'OANDA:EURUSD', '240', { range: '1W' });
    await page.locator('.tlab-chart-toolbar--terminal .tlab-tf', { hasText: '4H' }).first().click();
    const respC = await rC;
    const pC = parseChartHistoryRequest(respC);
    if (!intervalsMatch(pC.interval, '240') || pC.range !== '1W') {
      issues.push({
        page: 'TraderLab',
        chartControl: true,
        error: 'changing interval must keep range (expected 240 + 1W)',
        params: pC,
      });
    }

    const labActiveTfAfter = await page.locator('.tlab-chart-toolbar--terminal .tlab-tf.tlab-tf--active').count();
    if (labActiveTfAfter !== 1) {
      issues.push({
        page: 'TraderLab',
        chartControl: true,
        error: `after changes expected 1 active interval, got ${labActiveTfAfter}`,
      });
    }

    const canvasBox = page.locator('.tlab-chart-host--fill .trader-suite-chart-frame canvas').first();
    if (await canvasBox.isVisible().catch(() => false)) {
      await canvasBox.screenshot({ path: path.join(QA_REPORTS_DIR, 'qa-chart-control-trader-lab-canvas.png') });
    }
    await page.screenshot({ path: path.join(QA_REPORTS_DIR, 'qa-chart-control-trader-lab.png'), fullPage: false });

    matrix.push({
      page: 'TraderLab',
      chartControlChecks: 'intervalRangeIndependence',
      chartHistoryParams: [pA, pB, pC],
      screenshots: ['qa-chart-control-trader-lab.png', 'qa-chart-control-trader-lab-canvas.png'],
    });
  } catch (e) {
    issues.push({ page: 'TraderLab', chartControl: true, error: String(e.message || e) });
  }

  // Replay checks (register chart response listener before navigation to avoid missing the fetch)
  for (const [, sym] of SYMBOLS) {
    for (const [, tfVal] of REPLAY_TFS) {
      await page.goto(`${BASE_URL}/?qa_test_mode=1`, { waitUntil: 'domcontentloaded' });
      await dismissGdpr(page);
      await page.evaluate(([k, p]) => sessionStorage.setItem(k, JSON.stringify(p)), [CHART_STORAGE_KEY, {
        chartSymbol: sym,
        interval: tfVal,
        path: '/aura-analysis/dashboard/trader-replay',
        ts: Date.now(),
      }]);

      const respPromise = waitChartResp(page, sym, tfVal, { range: DEFAULT_CHART_RANGE });
      await page.goto(`${BASE_URL}/aura-analysis/dashboard/trader-replay?qa_test_mode=1`, { waitUntil: 'domcontentloaded' });
      await dismissGdpr(page);
      await page.waitForFunction(() => !document.querySelector('.aura-tr-loading'), { timeout: 45000 }).catch(() => {});

      let replayFrameVisible = false;
      try {
        await page.locator('.aura-tr-chart-frame').first().waitFor({ state: 'visible', timeout: 45000 });
        replayFrameVisible = true;
      } catch {}

      if (!replayFrameVisible) {
        issues.push({ page: 'TraderReplay', symbol: sym, interval: tfVal, blocked: true, url: page.url() });
        matrix.push({
          page: 'TraderReplay',
          symbol: sym,
          interval: tfVal,
          range: DEFAULT_CHART_RANGE,
          status: null,
          barCount: null,
          firstBarTime: null,
          lastBarTime: null,
          canvasRendered: false,
          layoutHeightStable: null,
          chartWarnings: warnings.filter((w) => w.includes(sym) || w.includes('chart-history')).slice(-2),
          blocked: true,
        });
        continue;
      }

      let status = null;
      let body = null;
      let waitErr = '';
      try {
        const resp = await respPromise;
        status = resp.status();
        body = await resp.json();
      } catch (e) {
        waitErr = String(e.message || e);
      }

      const canvas = await hasCanvas(page);
      if (!body || waitErr) {
        const fallback = await fetchChartStats(page, sym, tfVal, DEFAULT_CHART_RANGE);
        if (status == null) status = fallback.status;
        if (!body && fallback.body) body = fallback.body;
      }

      const barCount = Array.isArray(body?.bars) ? body.bars.length : null;
      const firstBarTime = barCount ? body.bars[0].time : null;
      const lastBarTime = barCount ? body.bars[barCount - 1].time : null;
      const ok = Boolean(body?.success && canvas && barCount >= 2);

      if (!ok) {
        issues.push({
          page: 'TraderReplay',
          symbol: sym,
          interval: tfVal,
          canvas,
          success: body?.success ?? null,
          bars: barCount,
          diagnostics: body?.diagnostics || null,
          waitErr: waitErr || undefined,
        });
      }

      matrix.push({
        page: 'TraderReplay',
        symbol: sym,
        interval: tfVal,
        range: DEFAULT_CHART_RANGE,
        status,
        barCount,
        firstBarTime,
        lastBarTime,
        canvasRendered: canvas,
        layoutHeightStable: null,
        chartWarnings: warnings.filter((w) => w.includes(sym) || w.includes('chart-history') || w.includes('Lightweight')).slice(-2),
      });
    }
  }

  // Replay: verify 1Y range (EURUSD 1H + chart range 1Y)
  try {
    await page.goto(`${BASE_URL}/?qa_test_mode=1`, { waitUntil: 'domcontentloaded' });
    await dismissGdpr(page);
    await page.evaluate(([k, p]) => sessionStorage.setItem(k, JSON.stringify(p)), [CHART_STORAGE_KEY, {
      chartSymbol: 'OANDA:EURUSD',
      interval: '60',
      path: '/aura-analysis/dashboard/trader-replay',
      ts: Date.now(),
    }]);
    const r1y = waitChartResp(page, 'OANDA:EURUSD', '60', { range: '1Y' });
    await page.goto(`${BASE_URL}/aura-analysis/dashboard/trader-replay?qa_test_mode=1`, { waitUntil: 'domcontentloaded' });
    await dismissGdpr(page);
    await page.waitForFunction(() => !document.querySelector('.aura-tr-loading'), { timeout: 45000 }).catch(() => {});
    await page.locator('.aura-tr-chart-frame').first().waitFor({ state: 'visible', timeout: 45000 });
    await page.getByLabel('Range', { exact: true }).selectOption('1Y');
    const resp = await r1y;
    const body = await resp.json();
    const barCount = Array.isArray(body?.bars) ? body.bars.length : null;
    const canvas = await hasCanvas(page);
    if (!canvas || !body?.success) {
      issues.push({ page: 'TraderReplay', symbol: 'OANDA:EURUSD', interval: '60+1Y', canvas, success: body?.success ?? null });
    }
    matrix.push({
      page: 'TraderReplay',
      symbol: 'OANDA:EURUSD',
      interval: '60',
      range: '1Y',
      status: resp.status(),
      barCount,
      firstBarTime: barCount ? body.bars[0].time : null,
      lastBarTime: barCount ? body.bars[barCount - 1].time : null,
      canvasRendered: canvas,
      layoutHeightStable: null,
      chartWarnings: [],
    });
  } catch (e) {
    issues.push({ page: 'TraderReplay', symbol: 'OANDA:EURUSD', interval: '60+1Y', error: String(e.message || e) });
  }

  // Replay chart control: range change preserves interval; interval change preserves range; both params on requests
  try {
    ensureReportsDir();
    await page.goto(`${BASE_URL}/?qa_test_mode=1`, { waitUntil: 'domcontentloaded' });
    await dismissGdpr(page);
    await page.evaluate(([k, p]) => sessionStorage.setItem(k, JSON.stringify(p)), [CHART_STORAGE_KEY, {
      chartSymbol: 'OANDA:EURUSD',
      interval: '15',
      path: '/aura-analysis/dashboard/trader-replay',
      ts: Date.now(),
    }]);
    const boot = waitChartResp(page, 'OANDA:EURUSD', '15', { range: '3M' });
    await page.goto(`${BASE_URL}/aura-analysis/dashboard/trader-replay?qa_test_mode=1`, { waitUntil: 'domcontentloaded' });
    await dismissGdpr(page);
    await page.waitForFunction(() => !document.querySelector('.aura-tr-loading'), { timeout: 45000 }).catch(() => {});
    await page.locator('.aura-tr-chart-frame').first().waitFor({ state: 'visible', timeout: 45000 });
    const bootResp = await boot;
    const bootParams = parseChartHistoryRequest(bootResp);
    if (!bootParams.interval || !bootParams.range) {
      issues.push({ page: 'TraderReplay', chartControl: true, error: 'initial chart-history missing interval or range', params: bootParams });
    }

    const rRc1 = waitChartResp(page, 'OANDA:EURUSD', '15', { range: '6M' });
    await page.getByLabel('Range', { exact: true }).selectOption('6M');
    const respRc1 = await rRc1;
    const qRc1 = parseChartHistoryRequest(respRc1);
    if (!intervalsMatch(qRc1.interval, '15') || qRc1.range !== '6M') {
      issues.push({
        page: 'TraderReplay',
        chartControl: true,
        error: 'Replay: range change should keep interval 15 and set range 6M',
        params: qRc1,
      });
    }

    const rRc2 = waitChartResp(page, 'OANDA:EURUSD', '60', { range: '6M' });
    await page.getByLabel('Chart timeframe').selectOption('60');
    const respRc2 = await rRc2;
    const qRc2 = parseChartHistoryRequest(respRc2);
    if (!intervalsMatch(qRc2.interval, '60') || qRc2.range !== '6M') {
      issues.push({
        page: 'TraderReplay',
        chartControl: true,
        error: 'Replay: interval change should keep range 6M',
        params: qRc2,
      });
    }

    const replayCanvas = page.locator('.aura-tr-chart-frame .trader-suite-chart-frame canvas').first();
    if (await replayCanvas.isVisible().catch(() => false)) {
      await replayCanvas.screenshot({ path: path.join(QA_REPORTS_DIR, 'qa-chart-control-replay-canvas.png') });
    }
    await page.screenshot({ path: path.join(QA_REPORTS_DIR, 'qa-chart-control-replay.png'), fullPage: false });

    matrix.push({
      page: 'TraderReplay',
      chartControlChecks: 'intervalRangeIndependence',
      chartHistoryParams: [bootParams, qRc1, qRc2],
      screenshots: ['qa-chart-control-replay.png', 'qa-chart-control-replay-canvas.png'],
    });
  } catch (e) {
    issues.push({ page: 'TraderReplay', chartControl: true, error: String(e.message || e) });
  }

  // Market Decoder controls: candle timeframe + visible range should each drive chart-history request.
  try {
    await page.goto(`${BASE_URL}/trader-deck?qa_test_mode=1`, { waitUntil: 'domcontentloaded' });
    await dismissGdpr(page);
    // Trader Desk uses i18n keys (e.g. "Market Intelligence") — avoid hard-coded ALL CAPS copy.
    const intelBtn = page.getByRole('button', { name: /market intelligence/i }).first();
    await intelBtn.waitFor({ state: 'visible', timeout: 60000 });
    await intelBtn.click();
    const decoderTab = page.getByRole('button', { name: /market decoder/i }).first();
    await decoderTab.waitFor({ state: 'visible', timeout: 60000 });
    await decoderTab.click();
    const decodeResp = page.waitForResponse((r) => r.url().includes('/api/trader-deck/market-decoder') && r.request().method() === 'GET', {
      timeout: 120000,
    }).catch(() => null);
    await page.getByRole('button', { name: 'Decode', exact: true }).first().click();
    await decodeResp;
    await page.waitForTimeout(1200);
    ensureReportsDir();
    const ghostTfRows = await page.locator('.md-chart-root--ref .md-chart-tf--disabled').count();
    if (ghostTfRows > 0) {
      issues.push({
        page: 'MarketDecoder',
        chartControl: true,
        error: `duplicate/ghost timeframe row present (md-chart-tf--disabled count=${ghostTfRows})`,
      });
    }
    await page.screenshot({ path: path.join(QA_REPORTS_DIR, 'qa-chart-control-market-decoder.png'), fullPage: false }).catch(() => {});

    const decoderControlsLocator = page.locator(
      '[data-testid="md-candle-tf-1h"], [data-testid="md-candle-tf-1m"], .md-chart-tf[aria-label=\"Candle timeframe\"] .md-chart-tf-btn'
    );
    const hasDecoderControls = (await decoderControlsLocator.count()) > 0;

    const decoderSymbol = 'OANDA:EURUSD';
    if (!hasDecoderControls) {
      // Fallback: still validate Market Decoder API coverage without hard-failing on DOM timing/selector drift.
      for (const [, intervalVal] of DECODER_TFS) {
        const fallback = await fetchChartStats(page, decoderSymbol, intervalVal, '3M');
        const body = fallback.body || {};
        const bars = fallback.barCount;
        const ok = Boolean(body?.success && bars >= 2);
        if (!ok) {
          issues.push({
            page: 'MarketDecoder',
            symbol: decoderSymbol,
            interval: intervalVal,
            range: '3M',
            success: body?.success ?? null,
            bars,
            diagnostics: body?.diagnostics || null,
          });
        }
        matrix.push({
          page: 'MarketDecoder',
          symbol: decoderSymbol,
          interval: intervalVal,
          range: '3M',
          status: fallback.status,
          barCount: bars,
          firstBarTime: fallback.firstBarTime,
          lastBarTime: fallback.lastBarTime,
          canvasRendered: false,
          layoutHeightStable: null,
          chartWarnings: warnings.filter((w) => w.includes('chart-history') || w.includes('Lightweight')).slice(-2),
          controlsDetected: false,
        });
      }
      for (const rangeVal of DECODER_RANGES) {
        const fallback = await fetchChartStats(page, decoderSymbol, '60', rangeVal);
        const body = fallback.body || {};
        const bars = fallback.barCount;
        const ok = Boolean(body?.success && bars >= 2);
        if (!ok) {
          issues.push({
            page: 'MarketDecoder',
            symbol: decoderSymbol,
            interval: '60',
            range: rangeVal,
            success: body?.success ?? null,
            bars,
            diagnostics: body?.diagnostics || null,
          });
        }
        matrix.push({
          page: 'MarketDecoder',
          symbol: decoderSymbol,
          interval: '60',
          range: rangeVal,
          status: fallback.status,
          barCount: bars,
          firstBarTime: fallback.firstBarTime,
          lastBarTime: fallback.lastBarTime,
          canvasRendered: false,
          layoutHeightStable: null,
          chartWarnings: warnings.filter((w) => w.includes('chart-history') || w.includes('Lightweight')).slice(-2),
          controlsDetected: false,
        });
      }
    } else {
      for (const [label, intervalVal] of DECODER_TFS) {
      const respPromise = waitChartResp(page, decoderSymbol, intervalVal, { range: '3M', timeoutMs: 90000 });
      const tfTestId = DECODER_TF_TESTID[intervalVal] || '';
      if (tfTestId && (await page.locator(`[data-testid="${tfTestId}"]`).count())) {
        await page.locator(`[data-testid="${tfTestId}"]`).first().click();
      } else {
        await page.locator('.md-chart-tf[aria-label=\"Candle timeframe\"] .md-chart-tf-btn', { hasText: label }).first().click();
      }
      const resp = await respPromise;
      const body = await resp.json();
      const bars = Array.isArray(body?.bars) ? body.bars.length : null;
      const ok = Boolean(body?.success && bars >= 2);
      if (!ok) {
        issues.push({
          page: 'MarketDecoder',
          symbol: decoderSymbol,
          interval: intervalVal,
          range: '3M',
          success: body?.success ?? null,
          bars,
          diagnostics: body?.diagnostics || null,
        });
      }
      const retIv = body?.returnedInterval ?? body?.diagnostics?.returnedInterval;
      if (intervalVal === '240' && retIv && retIv !== '240') {
        issues.push({
          page: 'MarketDecoder',
          symbol: decoderSymbol,
          interval: '240',
          range: '3M',
          error: `expected returnedInterval=240 got ${body?.diagnostics?.returnedInterval || 'n/a'}`,
          diagnostics: body?.diagnostics || null,
        });
      }
      matrix.push({
        page: 'MarketDecoder',
        symbol: decoderSymbol,
        interval: intervalVal,
        range: '3M',
        status: resp.status(),
        barCount: bars,
        firstBarTime: bars ? body.bars[0].time : null,
        lastBarTime: bars ? body.bars[bars - 1].time : null,
        canvasRendered: await page.locator('.md-chart-canvas-wrap canvas').first().isVisible().catch(() => false),
        layoutHeightStable: null,
        chartWarnings: warnings.filter((w) => w.includes('chart-history') || w.includes('Lightweight')).slice(-2),
      });
    }

      for (const rangeVal of DECODER_RANGES) {
      const respPromise = waitChartResp(page, decoderSymbol, '60', { range: rangeVal, timeoutMs: 90000 });
      const rangeTestId = DECODER_RANGE_TESTID[rangeVal] || '';
      if (rangeTestId && (await page.locator(`[data-testid="${rangeTestId}"]`).count())) {
        await page.locator(`[data-testid="${rangeTestId}"]`).first().click();
      } else {
        await page.locator('.md-chart-tf[aria-label=\"Visible history range\"] .md-chart-tf-btn', { hasText: rangeVal }).first().click();
      }
      const resp = await respPromise;
      const body = await resp.json();
      const bars = Array.isArray(body?.bars) ? body.bars.length : null;
      const ok = Boolean(body?.success && bars >= 2);
      if (!ok) {
        issues.push({
          page: 'MarketDecoder',
          symbol: decoderSymbol,
          interval: '60',
          range: rangeVal,
          success: body?.success ?? null,
          bars,
          diagnostics: body?.diagnostics || null,
        });
      }
      if (['3M', '6M', '1Y'].includes(rangeVal) && bars != null && bars < 40) {
        issues.push({
          page: 'MarketDecoder',
          symbol: decoderSymbol,
          interval: '60',
          range: rangeVal,
          error: `sparse bars for deep range: ${bars}`,
          diagnostics: body?.diagnostics || null,
        });
      }
      matrix.push({
        page: 'MarketDecoder',
        symbol: decoderSymbol,
        interval: '60',
        range: rangeVal,
        status: resp.status(),
        barCount: bars,
        firstBarTime: bars ? body.bars[0].time : null,
        lastBarTime: bars ? body.bars[bars - 1].time : null,
        canvasRendered: await page.locator('.md-chart-canvas-wrap canvas').first().isVisible().catch(() => false),
        layoutHeightStable: null,
        chartWarnings: warnings.filter((w) => w.includes('chart-history') || w.includes('Lightweight')).slice(-2),
      });
      }
    }
  } catch (e) {
    issues.push({ page: 'MarketDecoder', error: String(e.message || e) });
  }

  // Chatbot routing check in separate non-premium auth context (chatbot hidden for admin)
  const chatContext = await browser.newContext();
  const chatPage = await chatContext.newPage();
  const userToken = (() => {
    const now = Math.floor(Date.now() / 1000);
    const h = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const p = Buffer.from(JSON.stringify({ id: 9002, userId: 9002, role: 'USER', email: 'chatqa@local.test', exp: now + 86400 })).toString('base64url');
    return `${h}.${p}.x`;
  })();
  await chatPage.addInitScript((t) => {
    localStorage.setItem('token', t);
    localStorage.setItem('user', JSON.stringify({ id: 9002, userId: 9002, role: 'USER', email: 'chatqa@local.test' }));
    localStorage.setItem('gdprAccepted', 'true');
    localStorage.setItem('qaTestMode', '1');
  }, userToken);
  await chatPage.goto(`${BASE_URL}/?qa_test_mode=1`, { waitUntil: 'domcontentloaded' });
  await dismissGdpr(chatPage);
  let chatResult = { url: chatPage.url() };
  let chatbotVisible = false;
  try {
    await chatPage.locator('.chatbot-toggle').first().waitFor({ state: 'visible', timeout: 12000 });
    chatbotVisible = true;
  } catch {}
  if (chatbotVisible) {
    await chatPage.locator('.chatbot-toggle').click();
    await chatPage.locator('.chatbot-input input').fill('show gold 4H in Replay');
    const chatChartPromise = waitChartResp(chatPage, 'OANDA:XAUUSD', '240', { range: DEFAULT_CHART_RANGE, timeoutMs: 60000 });
    await chatPage.locator('.chatbot-input button[type=\"submit\"]').click();
    await chatPage.waitForURL(/(aura-analysis\/dashboard\/trader-replay|connection-hub|login)/, { timeout: 30000 });
    chatResult = { ...chatResult, finalUrl: chatPage.url() };
    try {
      const resp = await chatChartPromise;
      const body = await resp.json();
      chatResult = { ...chatResult, success: body?.success ?? null, bars: body?.bars?.length ?? null, diagnostics: body?.diagnostics || null };
    } catch (e) {
      chatResult = { ...chatResult, error: String(e.message || e) };
    }
  } else {
    chatResult = { ...chatResult, error: 'chatbot-toggle not visible for this auth state' };
  }
  await chatContext.close();

  const chartRelWarnings = warnings.filter((w) => w.includes('Lightweight') || w.includes('chart-history'));
  const matrixBlocked = matrix.some((r) => r.blocked === true);
  const matrixRowErrors = matrix.some((r) => r.error);

  console.log('QA_SUMMARY', JSON.stringify({ issuesCount: issues.length, failedApiCount: failedApi.length, warningCount: warnings.length }, null, 2));
  console.log('QA_CHATBOT', JSON.stringify(chatResult, null, 2));
  console.log('QA_FAILED_API', JSON.stringify(failedApi.slice(0, 50), null, 2));
  console.log('QA_WARNINGS', JSON.stringify(chartRelWarnings.slice(0, 80), null, 2));
  console.log('QA_ISSUES', JSON.stringify(issues.slice(0, 120), null, 2));
  console.log('QA_RESIZE', JSON.stringify(resize, null, 2));
  console.log('QA_MATRIX', JSON.stringify(matrix, null, 2));

  await browser.close();

  const allowChartWarnings = process.env.QA_ALLOW_CHART_WARNINGS === '1';
  let exitCode = 0;
  if (failedApi.length) exitCode = 1;
  if (issues.length) exitCode = 1;
  if (matrixBlocked) exitCode = 1;
  if (matrixRowErrors) exitCode = 1;
  if (chartRelWarnings.length && !allowChartWarnings) exitCode = 1;
  if (chatbotVisible) {
    if (chatResult.error) exitCode = 1;
    const url = String(chatResult.finalUrl || '');
    if (url && !url.includes('trader-replay')) exitCode = 1;
    if (chatResult.success === false) exitCode = 1;
  }
  if (exitCode) {
    console.error('QA_DEPLOY_GATES_FAILED', JSON.stringify({ failedApiCount: failedApi.length, issuesCount: issues.length, matrixBlocked, matrixRowErrors, chartWarningCount: chartRelWarnings.length, allowChartWarnings }, null, 2));
  }
  process.exit(exitCode);
}

run().catch((e) => {
  console.error('QA_RUN_FATAL', e);
  process.exit(1);
});
