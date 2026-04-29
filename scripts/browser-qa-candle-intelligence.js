/* eslint-disable no-console */
const { chromium } = require('playwright');

const BASE_URL = process.env.CANDLE_QA_BASE_URL || 'http://localhost:3000';

function makeFakeJwt() {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      id: 9001,
      email: 'qa@local.test',
      role: 'admin',
      exp: Math.floor(Date.now() / 1000) + 86400,
    })
  ).toString('base64url');
  return `${header}.${payload}.sig`;
}

async function waitForChartCanvas(page, selector) {
  await page.waitForSelector(selector, { timeout: 90000 });
  const canvas = page.locator(`${selector} canvas`).first();
  try {
    await canvas.waitFor({ state: 'visible', timeout: 90000 });
  } catch (err) {
    const loginVisible = await page.getByRole('heading', { name: /sign in/i }).first().isVisible().catch(() => false);
    const chartErr = await page.locator('.oi-chart-error').first().innerText().catch(() => '');
    const url = page.url();
    const shape = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      return {
        width: el.clientWidth,
        height: el.clientHeight,
        childCount: el.childElementCount,
        htmlSample: String(el.innerHTML || '').slice(0, 200),
      };
    }, selector);
    const loadingVisible = await page.locator('.oi-chart-loading').first().isVisible().catch(() => false);
    await page.screenshot({ path: 'e2e/artifacts/candle-intel-operator-fail.png', fullPage: true });
    throw new Error(`Chart canvas not visible (url=${url}, loginVisible=${loginVisible}, loadingVisible=${loadingVisible}, chartErr=${chartErr || 'n/a'}, mount=${JSON.stringify(shape)})`);
  }
  return canvas;
}

function makeCounters() {
  return {
    hoverContextCalls: 0,
    clickContextCalls: 0,
    totalContextCalls: 0,
    chartHistoryCalls: 0,
    cacheHits: 0,
    payloads: [],
  };
}

async function runOperatorChecks(page, counters) {
  const result = {
    ok: false,
    tooltipVisible: false,
    panelVisible: false,
    selectedParamsValid: false,
    repeatedClickCacheObserved: false,
    errors: [],
  };

  await page.goto(`${BASE_URL}/operator-intelligence`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('h1.oi-title', { timeout: 90000 });
  const chartCanvas = await waitForChartCanvas(page, '[data-testid="oi-chart-mount"]');
  const chartBox = await chartCanvas.boundingBox();
  if (!chartBox) throw new Error('Operator chart canvas has no bounding box');

  const hoverBefore = counters.totalContextCalls;
  await page.mouse.move(chartBox.x + chartBox.width * 0.55, chartBox.y + chartBox.height * 0.22);
  await page.waitForTimeout(900);
  const hoverAfter = counters.totalContextCalls;
  counters.hoverContextCalls += Math.max(0, hoverAfter - hoverBefore);

  result.tooltipVisible = await page.locator('.oi-chart-stage .oi-chart-hint').first().isVisible().catch(() => false);
  if (!result.tooltipVisible) result.errors.push('Operator hover tooltip did not appear');

  const clickBefore = counters.totalContextCalls;
  await page.mouse.click(chartBox.x + chartBox.width * 0.55, chartBox.y + chartBox.height * 0.18);
  await page.waitForSelector('.oi-drawer', { state: 'visible', timeout: 15000 });
  const clickAfter = counters.totalContextCalls;
  counters.clickContextCalls += Math.max(0, clickAfter - clickBefore);
  result.panelVisible = true;

  const panelText = await page.locator('.oi-drawer').innerText();
  if (!/No major catalyst found|calendar event|headline flow/i.test(panelText)) {
    result.errors.push('Operator panel missing catalyst summary');
  }
  if (!/O\s|H\s|L\s|C\s|Body|Range/i.test(panelText)) {
    result.errors.push('Operator panel missing candle metrics');
  }

  const select = page.getByTestId('oi-symbol-select');
  await select.selectOption('XAUUSD');
  await page.getByRole('button', { name: '1D', exact: true }).click();
  await page.waitForTimeout(1200);

  const clickBefore2 = counters.totalContextCalls;
  await page.mouse.click(chartBox.x + chartBox.width * 0.52, chartBox.y + chartBox.height * 0.2);
  await page.waitForTimeout(1300);
  const clickAfter2 = counters.totalContextCalls;
  counters.clickContextCalls += Math.max(0, clickAfter2 - clickBefore2);

  const lastPayload = counters.payloads[counters.payloads.length - 1] || null;
  if (lastPayload && String(lastPayload.symbol || '').toUpperCase() === 'XAUUSD' && String(lastPayload.interval || '') === '1D') {
    result.selectedParamsValid = true;
  } else {
    result.errors.push('Operator click context did not use selected symbol/interval');
  }

  const repeatedBefore = counters.totalContextCalls;
  await page.mouse.click(chartBox.x + chartBox.width * 0.52, chartBox.y + chartBox.height * 0.2);
  await page.waitForTimeout(300);
  await page.mouse.click(chartBox.x + chartBox.width * 0.52, chartBox.y + chartBox.height * 0.2);
  await page.waitForTimeout(1300);
  const repeatedAfter = counters.totalContextCalls;
  counters.clickContextCalls += Math.max(0, repeatedAfter - repeatedBefore);
  result.repeatedClickCacheObserved = counters.cacheHits > 0;
  if (!result.repeatedClickCacheObserved) {
    result.errors.push('Operator repeated click did not show cacheHit response');
  }

  result.ok = result.errors.length === 0;
  return result;
}

async function runReplayChecks(page, counters) {
  const result = {
    ok: false,
    tooltipVisible: false,
    panelVisible: false,
    selectedParamsValid: false,
    errors: [],
  };

  await page.goto(`${BASE_URL}/trader-replay`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('text=Trader Replay', { timeout: 90000 });
  await page.waitForTimeout(1200);

  const replayButton = page.getByRole('button', { name: /Replay/i }).first();
  const hasReplay = await replayButton.isVisible().catch(() => false);
  if (!hasReplay) {
    result.errors.push('Replay page has no replayable trade in current environment');
    return result;
  }
  await replayButton.click();

  const chartCanvas = await waitForChartCanvas(page, 'div[style*="height: 420px"]');
  const chartBox = await chartCanvas.boundingBox();
  if (!chartBox) {
    result.errors.push('Replay chart canvas has no bounding box');
    return result;
  }

  const hoverBefore = counters.totalContextCalls;
  await page.mouse.move(chartBox.x + chartBox.width * 0.55, chartBox.y + chartBox.height * 0.25);
  await page.waitForTimeout(900);
  const hoverAfter = counters.totalContextCalls;
  counters.hoverContextCalls += Math.max(0, hoverAfter - hoverBefore);

  result.tooltipVisible = await page.locator('text=/Δ.*R:/').first().isVisible().catch(() => false);
  if (!result.tooltipVisible) result.errors.push('Replay hover tooltip did not appear');

  const clickBefore = counters.totalContextCalls;
  await page.mouse.click(chartBox.x + chartBox.width * 0.55, chartBox.y + chartBox.height * 0.2);
  await page.waitForSelector('.oi-drawer', { state: 'visible', timeout: 15000 });
  await page.waitForTimeout(800);
  const clickAfter = counters.totalContextCalls;
  counters.clickContextCalls += Math.max(0, clickAfter - clickBefore);
  result.panelVisible = true;

  const panelText = await page.locator('.oi-drawer').innerText();
  if (!/No major catalyst found|calendar event|headline flow/i.test(panelText)) {
    result.errors.push('Replay panel missing catalyst summary');
  }

  await page.locator('label:has-text("Timeframe") select').selectOption('1D');
  await page.waitForTimeout(1200);
  const clickBefore2 = counters.totalContextCalls;
  await page.mouse.click(chartBox.x + chartBox.width * 0.5, chartBox.y + chartBox.height * 0.2);
  await page.waitForTimeout(1200);
  const clickAfter2 = counters.totalContextCalls;
  counters.clickContextCalls += Math.max(0, clickAfter2 - clickBefore2);

  const lastPayload = counters.payloads[counters.payloads.length - 1] || null;
  if (lastPayload && String(lastPayload.interval || '') === '1D') {
    result.selectedParamsValid = true;
  } else {
    result.errors.push('Replay click context did not use selected interval');
  }

  result.ok = result.errors.length === 0;
  return result;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const counters = makeCounters();

  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.addInitScript((token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify({ id: 9001, userId: 9001, role: 'admin', email: 'qa@local.test' }));
    localStorage.removeItem('auraApiBaseUrlOverride');
  }, makeFakeJwt());

  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('/api/market/chart-history')) {
      counters.chartHistoryCalls += 1;
    }
    if (url.includes('/api/market/candle-context')) {
      counters.totalContextCalls += 1;
      try {
        const body = await res.json();
        if (body?.cacheHit) counters.cacheHits += 1;
        counters.payloads.push(body || {});
      } catch (_) {
        // ignore
      }
    }
  });

  let operator = { ok: false, errors: [] };
  let replay = { ok: false, errors: [] };
  try {
    operator = await runOperatorChecks(page, counters);
  } catch (e) {
    operator = { ok: false, errors: [e.message], tooltipVisible: false, panelVisible: false, selectedParamsValid: false, repeatedClickCacheObserved: false };
  }
  try {
    replay = await runReplayChecks(page, counters);
  } catch (e) {
    replay = { ok: false, errors: [e.message], tooltipVisible: false, panelVisible: false, selectedParamsValid: false };
  }

  await browser.close();

  const summary = {
    operator,
    replay,
    counters: {
      hoverContextCalls: counters.hoverContextCalls,
      clickContextCalls: counters.clickContextCalls,
      totalContextCalls: counters.totalContextCalls,
      chartHistoryCalls: counters.chartHistoryCalls,
      cacheHits: counters.cacheHits,
    },
    pageErrors,
    consoleErrors,
    pass: operator.ok && replay.ok && counters.hoverContextCalls === 0 && counters.clickContextCalls >= 2,
  };

  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
