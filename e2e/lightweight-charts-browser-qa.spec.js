import { test, expect } from '@playwright/test';

const BASE_URL = process.env.QA_BASE_URL || 'http://localhost:3000';
const CHART_STORAGE_KEY = 'aura_chart_user_request_v1';

const SYMBOLS = [
  { label: 'EURUSD', value: 'OANDA:EURUSD' },
  { label: 'XAUUSD', value: 'OANDA:XAUUSD' },
  { label: 'BTCUSD', value: 'COINBASE:BTCUSD' },
  { label: 'SPX', value: 'OANDA:SPX500USD' },
  { label: 'NAS100', value: 'OANDA:NAS100USD' },
  { label: 'SOLUSD', value: 'BINANCE:SOLUSDT' },
  { label: 'USOIL', value: 'TVC:USOIL' },
];

const TFS_LAB = [
  { label: '15m', value: '15' },
  { label: '1H', value: '60' },
  { label: '4H', value: '240' },
  { label: '1D', value: '1D' },
];

const TFS_REPLAY = [
  { label: '15m', value: '15' },
  { label: '1H', value: '60' },
  { label: '4H', value: '240' },
  { label: 'Daily', value: 'D' },
];

function buildUnsignedJwt(payload) {
  const h = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${h}.${p}.x`;
}

async function applyAuthBypass(page) {
  const now = Math.floor(Date.now() / 1000);
  const token = buildUnsignedJwt({
    id: 9001,
    userId: 9001,
    email: 'qa@local.test',
    role: 'admin',
    exp: now + 86400,
  });
  await page.addInitScript((tkn) => {
    localStorage.setItem('token', tkn);
    localStorage.setItem('user', JSON.stringify({ id: 9001, userId: 9001, email: 'qa@local.test', role: 'admin' }));
    localStorage.setItem('mfaVerified', 'true');
  }, token);
}

async function setChartRequestAndGo(page, path, payload) {
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ([key, data]) => {
      sessionStorage.setItem(key, JSON.stringify(data));
    },
    [CHART_STORAGE_KEY, payload]
  );
  await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded' });
}

async function waitForChartApi(page, expectedSymbol, expectedInterval, failures) {
  const response = await page.waitForResponse(
    (resp) => {
      if (!resp.url().includes('/api/market/chart-history')) return false;
      try {
        const u = new URL(resp.url());
        return u.searchParams.get('symbol') === expectedSymbol && u.searchParams.get('interval') === expectedInterval;
      } catch {
        return false;
      }
    },
    { timeout: 30000 }
  );
  if (!response.ok()) failures.push({ url: response.url(), status: response.status(), where: 'chart-history' });
  return response;
}

async function dismissGdprIfPresent(page) {
  const agree = page.getByRole('button', { name: 'I Agree' });
  if (await agree.count()) {
    try {
      if (await agree.first().isVisible({ timeout: 1000 })) {
        await agree.first().click({ timeout: 5000 });
      }
    } catch {
      // ignore if not shown
    }
  }
}

async function assertCandlesVisible(page) {
  try {
    await expect(page.locator('.trader-suite-chart-frame canvas').first()).toBeVisible({ timeout: 7000 });
    return true;
  } catch {
    return false;
  }
}

test.describe.configure({ mode: 'serial' });

test('Lightweight Charts browser QA', async ({ page }) => {
  test.setTimeout(25 * 60 * 1000);

  const consoleWarnings = [];
  const failedApi = [];
  const renderIssues = [];
  const resizeChecks = [];

  page.on('console', (m) => {
    const type = m.type();
    if (type === 'warning' || type === 'error') {
      const txt = m.text();
      if (
        txt.includes('LightweightInstrumentChart')
        || txt.includes('chart-history')
        || txt.includes('Failed to load resource')
      ) {
        consoleWarnings.push({ type, text: txt });
      }
    }
  });

  page.on('response', (r) => {
    if (r.url().includes('/api/market/chart-history') && !r.ok()) {
      failedApi.push({ status: r.status(), url: r.url() });
    }
  });

  await applyAuthBypass(page);

  await page.goto(`${BASE_URL}/trader-deck/trade-validator/trader-lab`, { waitUntil: 'domcontentloaded' });
  await dismissGdprIfPresent(page);
  await expect(page.locator('.tlab-chart-host--fill')).toBeVisible({ timeout: 30000 });
  const labRectBefore = await page.locator('.tlab-chart-host--fill').boundingBox();

  for (const sym of SYMBOLS) {
    await dismissGdprIfPresent(page);
    await page.selectOption('.tlab-chart-toolbar select.tlab-select', sym.value);
    for (const tf of TFS_LAB) {
      await page.locator('.tlab-chart-toolbar--terminal .tlab-tf', { hasText: tf.label }).first().click();
      const res = await waitForChartApi(page, sym.value, tf.value, failedApi);
      let body = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      const hasCanvas = await assertCandlesVisible(page);
      if (!hasCanvas || !body?.success || !Array.isArray(body?.bars) || body.bars.length < 2) {
        renderIssues.push({
          page: 'TraderLab',
          symbol: sym.value,
          interval: tf.value,
          status: res.status(),
          success: body?.success ?? null,
          barCount: Array.isArray(body?.bars) ? body.bars.length : null,
          diagnostics: body?.diagnostics || null,
          hasCanvas,
        });
      }
    }
  }

  await page.setViewportSize({ width: 1366, height: 900 });
  await assertCandlesVisible(page);
  await page.setViewportSize({ width: 1024, height: 720 });
  await assertCandlesVisible(page);
  const labRectAfter = await page.locator('.tlab-chart-host--fill').boundingBox();
  expect(labRectBefore && labRectAfter).toBeTruthy();
  resizeChecks.push({
    page: 'TraderLab',
    before: labRectBefore,
    after: labRectAfter,
    deltaY: Math.abs(labRectBefore.y - labRectAfter.y),
    deltaWidth: Math.abs(labRectBefore.width - labRectAfter.width),
    deltaHeight: Math.abs(labRectBefore.height - labRectAfter.height),
  });

  for (const sym of SYMBOLS) {
    for (const tf of TFS_REPLAY) {
      await setChartRequestAndGo(page, '/aura-analysis/dashboard/trader-replay', {
        chartSymbol: sym.value,
        interval: tf.value,
        path: '/aura-analysis/dashboard/trader-replay',
        ts: Date.now(),
      });
      await dismissGdprIfPresent(page);
      const replayFrame = page.locator('.aura-tr-chart-frame');
      if (!(await replayFrame.count())) {
        renderIssues.push({
          page: 'TraderReplay',
          symbol: sym.value,
          interval: tf.value,
          blocked: true,
          currentUrl: page.url(),
          note: 'Replay workspace not reachable (likely connection/entitlement gate).',
        });
        break;
      }
      const res = await waitForChartApi(page, sym.value, tf.value, failedApi);
      let body = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      const hasCanvas = await assertCandlesVisible(page);
      if (!hasCanvas || !body?.success || !Array.isArray(body?.bars) || body.bars.length < 2) {
        renderIssues.push({
          page: 'TraderReplay',
          symbol: sym.value,
          interval: tf.value,
          status: res.status(),
          success: body?.success ?? null,
          barCount: Array.isArray(body?.bars) ? body.bars.length : null,
          diagnostics: body?.diagnostics || null,
          hasCanvas,
        });
      }
    }
  }

  const replayRectBefore = await page.locator('.aura-tr-chart-frame').boundingBox();
  if (replayRectBefore) {
    await page.setViewportSize({ width: 1400, height: 900 });
    await assertCandlesVisible(page);
    await page.setViewportSize({ width: 1000, height: 700 });
    await assertCandlesVisible(page);
    const replayRectAfter = await page.locator('.aura-tr-chart-frame').boundingBox();
    if (replayRectAfter) {
      resizeChecks.push({
        page: 'TraderReplay',
        before: replayRectBefore,
        after: replayRectAfter,
        deltaY: Math.abs(replayRectBefore.y - replayRectAfter.y),
        deltaWidth: Math.abs(replayRectBefore.width - replayRectAfter.width),
        deltaHeight: Math.abs(replayRectBefore.height - replayRectAfter.height),
      });
    }
  }

  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await dismissGdprIfPresent(page);
  await page.locator('.chatbot-toggle').click();
  await page.locator('.chatbot-input input').fill('show gold 4H in Replay');
  await page.locator('.chatbot-input button[type="submit"]').click();
  await page.waitForURL(/(aura-analysis\/dashboard\/trader-replay|connection-hub)/, { timeout: 30000 });
  let chatRes = null;
  let chatBody = null;
  try {
    chatRes = await waitForChartApi(page, 'OANDA:XAUUSD', '240', failedApi);
    chatBody = await chatRes.json().catch(() => null);
  } catch {
    chatRes = null;
  }
  const hasReplayChip = await page.locator('.aura-tr-chip').count();
  const chatCanvas = await assertCandlesVisible(page);
  if (!chatRes || !chatCanvas || !chatBody?.success || !Array.isArray(chatBody?.bars) || chatBody.bars.length < 2 || !hasReplayChip) {
    renderIssues.push({
      page: 'ChatbotReplayRoute',
      symbol: 'OANDA:XAUUSD',
      interval: '240',
      status: chatRes ? chatRes.status() : null,
      success: chatBody?.success ?? null,
      barCount: Array.isArray(chatBody?.bars) ? chatBody.bars.length : null,
      diagnostics: chatBody?.diagnostics || null,
      hasCanvas: chatCanvas,
      currentUrl: page.url(),
    });
  }

  console.log('QA_WARNINGS', JSON.stringify(consoleWarnings, null, 2));
  console.log('QA_FAILED_API', JSON.stringify(failedApi, null, 2));
  console.log('QA_RENDER_ISSUES', JSON.stringify(renderIssues, null, 2));
  console.log('QA_RESIZE', JSON.stringify(resizeChecks, null, 2));
});
