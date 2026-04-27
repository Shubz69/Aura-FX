/**
 * Operator Intelligence — QA: auth, sections, chart candle click, viewports, console hygiene.
 * Uses the same saved normal-user storage pattern as other Aura Terminal e2e specs.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const BASE = (process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const SRC_STATE = path.join(process.cwd(), 'e2e', 'reports', 'auraterminal-normal-user.json');
const SIGNUP_CREDS = path.join(process.cwd(), 'e2e', 'reports', 'signup-credentials.txt');
const ARTIFACT_DIR = path.join(process.cwd(), 'e2e', 'artifacts', 'operator-intelligence-qa');
const REPORT_MD = path.join(process.cwd(), 'e2e', 'reports', 'operator-intelligence-qa-report.md');
const LOCAL_STATE = path.join(tmpdir(), 'aura-operator-intelligence-storage.json');

const VIEWPORTS = [
  { id: 'desktop', width: 1440, height: 900 },
  { id: 'tablet', width: 834, height: 1112 },
  { id: 'mobile', width: 390, height: 844 },
];

function ensureAuthStateForLocalhost() {
  if (!fs.existsSync(SRC_STATE)) return { ok: false, reason: `Missing storage state: ${SRC_STATE}` };
  const raw = JSON.parse(fs.readFileSync(SRC_STATE, 'utf8'));
  if (raw.origins?.[0]) {
    raw.origins[0].origin = BASE;
  }
  fs.mkdirSync(path.dirname(LOCAL_STATE), { recursive: true });
  fs.writeFileSync(LOCAL_STATE, JSON.stringify(raw), 'utf8');
  return { ok: true };
}

const authSetup = ensureAuthStateForLocalhost();
if (authSetup.ok) {
  test.use({ storageState: LOCAL_STATE });
}

test.beforeAll(() => {
  if (!authSetup.ok) {
    throw new Error(authSetup.reason || 'Auth storage unavailable — run e2e create-normal-user-state / manual-save-normal-user-state');
  }
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('auraApiBaseUrlOverride');
    } catch {
      /* ignore */
    }
  });
});

test.describe.configure({ mode: 'serial' });
test.setTimeout(240000);

function readSignupCredentials() {
  if (!fs.existsSync(SIGNUP_CREDS)) return null;
  const out = {};
  for (const line of fs.readFileSync(SIGNUP_CREDS, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  if (!out.EMAIL || !out.PASSWORD) return null;
  return { email: out.EMAIL, password: out.PASSWORD };
}

async function dismissConsentIfPresent(page) {
  const agree = page.getByRole('button', { name: /i agree|accept|allow|got it|dismiss/i }).first();
  if (await agree.isVisible().catch(() => false)) {
    await agree.click({ timeout: 5000 }).catch(() => {});
  }
}

async function ensureAuthenticated(page) {
  await dismissConsentIfPresent(page);
  const onLogin =
    /\/login(\?|$)/i.test(page.url()) ||
    (await page.getByRole('heading', { name: /sign in/i }).first().isVisible().catch(() => false));
  if (!onLogin) return;
  const creds = readSignupCredentials();
  if (!creds) throw new Error(`On /login but missing ${SIGNUP_CREDS} for auth refresh`);
  const emailInput = page.getByLabel(/email or username|email/i).first();
  const passwordInput = page.getByLabel(/password/i).first();
  await emailInput.fill(creds.email);
  await passwordInput.fill(creds.password);
  await page.getByRole('button', { name: /login|sign in/i }).first().click();
  await page
    .waitForURL(/\/(home|community|messages|trader-deck|operator)/i, { timeout: 45000 })
    .catch(() => {});
  await dismissConsentIfPresent(page);
  const stillOnLogin =
    /\/login(\?|$)/i.test(page.url()) ||
    (await page.getByRole('heading', { name: /sign in/i }).first().isVisible().catch(() => false));
  if (stillOnLogin) {
    throw new Error('Login refresh failed — still on sign-in after credentials submit');
  }
}

function writeReport(payload) {
  fs.mkdirSync(path.dirname(REPORT_MD), { recursive: true });
  const lines = [
    '# Operator Intelligence — Playwright QA report',
    '',
    `**Generated:** ${new Date().toISOString()}`,
    '',
    `## Overall: ${payload.pass ? 'PASS' : 'FAIL'}`,
    '',
    payload.failReason ? `**Failure:** ${payload.failReason}\n\n` : '',
    '## Screenshots',
    '',
    ...(payload.screenshots.length ? payload.screenshots.map((p) => `- \`${p}\``) : ['- (none)']),
    '',
    '## Console errors (blocking)',
    '',
    (payload.consoleErrors && payload.consoleErrors.length
      ? payload.consoleErrors.map((e) => `- \`${String(e).replace(/`/g, "'")}\``).join('\n')
      : '- (none)'),
    '',
    '## Console errors (ignored — documented dev / stale JWT noise)',
    '',
    (payload.consoleErrorsIgnored && payload.consoleErrorsIgnored.length
      ? payload.consoleErrorsIgnored.map((e) => `- \`${String(e).replace(/`/g, "'")}\``).join('\n')
      : '- (none)'),
    '',
    '## Visual / layout issues',
    '',
    payload.visualIssues.length
      ? payload.visualIssues.map((v) => `- ${v}`).join('\n')
      : '- (none noted)',
    '',
    '## Build (npm run build)',
    '',
    payload.buildSection || '- *(see terminal / re-run `npm run build`)*',
    '',
    '## Recommended fixes',
    '',
    payload.recommendations || '- None',
    '',
  ];
  fs.writeFileSync(REPORT_MD, lines.join('\n'), 'utf8');
}

test('Operator Intelligence QA (sections, nav order, candle drawer, viewports)', async ({ page }) => {
  const consoleErrors = [];
  const pageErrors = [];
  const screenshots = [];
  const visualIssues = [];
  const reportBase = {
    pass: false,
    screenshots,
    consoleErrors: [],
    consoleErrorsRaw: [],
    consoleErrorsIgnored: [],
    visualIssues,
    failReason: '',
    buildSection: '- *(pending — run `npm run build` after Playwright)*',
    recommendations:
      '- If auth storage expires, regenerate `e2e/reports/auraterminal-normal-user.json` via `create-normal-user-state` / `manual-save-normal-user-state`.',
  };

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`[console.error] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    pageErrors.push(`[pageerror] ${String(err)}`);
  });

  const capture = async (suffix) => {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    const p = path.join(ARTIFACT_DIR, `${suffix}.png`);
    await page.screenshot({ path: p, fullPage: true });
    screenshots.push(p);
  };

  const assertNoHorizontalOverflow = async (viewportId) => {
    const bad = await page.evaluate(() => {
      const root = document.querySelector('.oi-page') || document.body;
      const pad = 4;
      return root.scrollWidth > root.clientWidth + pad;
    });
    if (bad) {
      visualIssues.push(`${viewportId}: horizontal overflow (.oi-page or body scrollWidth > clientWidth)`);
    }
    expect(
      bad,
      `${viewportId}: page should not scroll horizontally`,
    ).toBe(false);
  };

  const expectCoreSections = async () => {
    await expect(page.getByRole('region', { name: /aura pulse/i })).toBeVisible({ timeout: 60000 });
    await expect(page.getByText(/^market drivers$/i).first()).toBeVisible();
    await expect(page.getByText(/^operator bias engine$/i).first()).toBeVisible();
    await expect(page.getByText(/^live market view$/i).first()).toBeVisible();
    await expect(page.getByText(/^market intelligence feed$/i).first()).toBeVisible();
    await expect(page.getByText(/^market impact calendar$/i).first()).toBeVisible();
    await expect(page.getByText(/^what to do now$/i).first()).toBeVisible();
  };

  try {
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${BASE}/operator-intelligence`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await ensureAuthenticated(page);
      await page.goto(`${BASE}/operator-intelligence`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await ensureAuthenticated(page);
      await page.waitForLoadState('load').catch(() => {});

      if (/\/login(\?|$)/i.test(page.url())) {
        throw new Error(`Route gated: redirected to login (url=${page.url()})`);
      }

      await expect(page.locator('h1.oi-title').filter({ hasText: /operator intelligence/i })).toBeVisible({
        timeout: 60000,
      });

      await expectCoreSections();

      const chartFrame = page.locator('.oi-chart-frame').first();
      await expect(chartFrame).toBeVisible({ timeout: 90000 });
      const chartMsg = page.locator('.oi-chart-frame--msg');
      if (await chartMsg.isVisible().catch(() => false)) {
        const t = await chartMsg.innerText().catch(() => '');
        throw new Error(`Chart render failure: ${t}`);
      }
      const canvas = chartFrame.locator('canvas').first();
      await expect(canvas).toBeVisible({ timeout: 90000 });

      if (vp.id === 'desktop') {
        await page.locator('.user-icon').click();
        const dropdown = page.locator('.user-dropdown');
        await expect(dropdown).toBeVisible();
        const opLink = dropdown.locator('a.dropdown-item[href="/operator-galaxy"]').first();
        const oiLink = dropdown.locator('a.dropdown-item[href="/operator-intelligence"]').first();
        await expect(opLink).toBeVisible();
        await expect(oiLink).toBeVisible();
        const order = await dropdown.evaluate(() => {
          const links = [...document.querySelectorAll('.user-dropdown a.dropdown-item')];
          return {
            op: links.findIndex((a) => a.getAttribute('href') === '/operator-galaxy'),
            oi: links.findIndex((a) => a.getAttribute('href') === '/operator-intelligence'),
          };
        });
        if (order.op === -1 || order.oi === -1) {
          throw new Error(`Missing Operator / Operator Intelligence links in dropdown (order=${JSON.stringify(order)})`);
        }
        if (order.oi !== order.op + 1) {
          throw new Error(
            `Operator Intelligence must be directly under The Operator (link indices op=${order.op}, oi=${order.oi})`,
          );
        }
        await expect(oiLink).toHaveText(/operator intelligence|navbar\.operatorintelligence/i);
        await page.keyboard.press('Escape').catch(() => {});
      }

      if (vp.id === 'desktop') {
        const box = await canvas.boundingBox();
        if (!box) throw new Error('Chart canvas has no bounding box');
        const clickXs = [0.55, 0.48, 0.62];
        const clickYs = [0.28, 0.22, 0.32];
        let opened = false;
        for (let i = 0; i < clickXs.length && !opened; i += 1) {
          await page.mouse.click(box.x + box.width * clickXs[i], box.y + box.height * clickYs[i]);
          try {
            await expect(page.getByRole('dialog', { name: /candle intelligence/i })).toBeVisible({
              timeout: 4000,
            });
            opened = true;
          } catch {
            /* try next point */
          }
        }
        if (!opened) {
          throw new Error('Candle Intelligence panel did not open after chart clicks');
        }
        await expect(page.getByText(/practical guidance/i).first()).toBeVisible();
        // Backdrop: avoids fixed navbar intercepting the drawer header close control on some viewports.
        await page.locator('.oi-drawer__backdrop').click({ position: { x: 24, y: Math.min(480, vp.height * 0.5) } });
        await expect(page.getByRole('dialog', { name: /candle intelligence/i })).not.toBeVisible({
          timeout: 10000,
        });
      }

      await assertNoHorizontalOverflow(vp.id);
      await capture(`oi-${vp.id}`);
    }

    const rawErrors = [...consoleErrors, ...pageErrors];
    /**
     * Dev shell noise (not Operator Intelligence regressions):
     * - CRA / webpack client vs app STOMP on `/ws` → invalid frame.
     * - Expired JWT in saved Playwright storage → /api/* 403 until state is regenerated.
     */
    const ignorableConsole = (line) => {
      if (/WebSocket connection to 'ws:\/\/.+\/ws' failed: Invalid frame header/i.test(line)) return true;
      if (/Failed to load resource: the server responded with a status of 403/i.test(line)) return true;
      if (/Access forbidden: Authentication failed or insufficient permissions/i.test(line)) return true;
      if (/\[observability\].*session_verify_user/i.test(line)) return true;
      if (/\[observability\].*api\.response_interceptor.*type:\s*auth/i.test(line)) return true;
      if (/Subscription fetch error: AxiosError/i.test(line)) return true;
      return false;
    };
    const pageErrorsOnly = rawErrors.filter((l) => l.startsWith('[pageerror]'));
    const consoleOnly = rawErrors.filter((l) => l.startsWith('[console.error]'));
    const blockingConsole = consoleOnly.filter((l) => !ignorableConsole(l));
    const blocking = [...pageErrorsOnly, ...blockingConsole];
    reportBase.consoleErrorsRaw = rawErrors;
    reportBase.consoleErrorsIgnored = consoleOnly.filter((l) => ignorableConsole(l));
    if (blocking.length) {
      // eslint-disable-next-line no-console
      console.error('Blocking browser errors:\n', blocking.join('\n'));
    }
    expect(blocking, 'No page errors and no non-ignorable console errors').toEqual([]);

    reportBase.pass = true;
    reportBase.consoleErrors = blocking;
  } catch (e) {
    reportBase.failReason = String(e?.message || e);
    reportBase.consoleErrorsRaw = [...consoleErrors, ...pageErrors];
    reportBase.consoleErrors = [...consoleErrors, ...pageErrors];
    try {
      await capture('oi-FAILURE-state');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    writeReport(reportBase);
  }
});
