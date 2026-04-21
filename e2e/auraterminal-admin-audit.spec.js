// @ts-check
/**
 * Authenticated admin + trader audit (production-safe, bounded).
 * Session: e2e/reports/auraterminal-new-user.json — no login performed here.
 *
 * Run: npm run test:e2e:admin
 *
 * Artifacts (written incrementally + final MD):
 * - e2e/reports/admin-audit-data.json
 * - e2e/reports/admin-audit-report.md
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE = (process.env.AUDIT_BASE_URL || 'https://www.auraterminal.ai').replace(/\/$/, '');
const STATE = path.join(process.cwd(), 'e2e', 'reports', 'auraterminal-new-user.json');
const OUT_MD = path.join(process.cwd(), 'e2e', 'reports', 'admin-audit-report.md');
const OUT_JSON = path.join(process.cwd(), 'e2e', 'reports', 'admin-audit-data.json');

/** Per-file test timeout (single suite; cap ~20m). */
const PER_SLICE_TEST_MS = 1_200_000; // 20m
/** Hard wall-clock per page (navigation + interact + measure). */
const PER_PAGE_TOTAL_MS = 55_000;
const MEASURE_CONTENT_MS = 12_000;
const INTERACT_TOTAL_MS = 38_000;
/** Navigation + DOM ready budget per page. */
const PAGE_GOTO_MS = 14_000;
const PAGE_INTERACTIVE_MS = 12_000;
/** Per click / tab action. */
const ACTION_TIMEOUT_MS = 6_000;
const LOADER_PROBE_MS = 3_000;

const MAX_TABS = 10;
const MAX_BUTTONS = 15;
const MAX_DETAILS = 3;

/** @typedef {{ severity: string, title: string, url: string, page?: string, detail?: string }} Finding */

const UNSAFE_BTN =
  /delete|remove|ban|revoke|logout|log\s*out|sign\s*out|unsubscribe|purge|reset\s*password|pay\s*now|start\s*trial|complete\s*order|subscribe\s*now|purchase|confirm\s*purchase|confirm\s*order|block\s*user|suspend|danger|transfer|withdraw|clear\s*all|archive\s*all|delete\s*account|remove\s*account|run\s*sql|execute\s*query|drop\s|truncate|^apply$/i;

function isAppHost(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    return /(^|\.)auraterminal\.ai$/i.test(h);
  } catch {
    return false;
  }
}

function hostOk(u) {
  try {
    return /auraterminal\.ai$/i.test(new URL(u).hostname.replace(/^www\./, ''));
  } catch {
    return false;
  }
}

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} label
 * @returns {Promise<T>}
 */
async function withTimeout(promise, ms, label) {
  let t;
  const timeoutP = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(`${label} exceeded ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeoutP]);
  } finally {
    clearTimeout(t);
  }
}

const MARKETING_AND_PUBLIC = [
  '/',
  '/courses',
  '/my-courses',
  '/explore',
  '/why-glitch',
  '/operating-system',
  '/contact',
];

const TRADER_PATHS = [
  '/live-metrics',
  '/monthly-statements',
  '/trader-passport',
  '/community',
  '/messages',
  '/profile',
  '/profile/edit-name',
  '/profile/edit-email',
  '/profile/edit-address',
  '/profile/edit-phone',
  '/profile/edit-password',
  '/journal',
  '/leaderboard',
  '/affiliation',
  '/reports',
  '/reports/live',
  '/reports/dna',
  '/manual-metrics',
  '/manual-metrics/processing',
  '/manual-metrics/dashboard',
  '/trader-deck',
  '/trader-deck/trade-validator/overview',
  '/trader-deck/trade-validator/checklist',
  '/trader-deck/trade-validator/calculator',
  '/trader-deck/trade-validator/journal',
  '/trader-deck/trade-validator/analytics',
  '/trader-deck/trade-validator/trader-cv',
  '/trader-deck/trade-validator/leaderboard',
  '/trader-deck/trade-validator/trader-lab',
  '/trader-deck/trade-validator/trader-playbook',
  '/trader-deck/trade-validator/trader-playbook/missed-review',
  '/aura-analysis/ai',
  '/aura-analysis/dashboard/overview',
  '/aura-analysis/dashboard/performance',
  '/aura-analysis/dashboard/risk-lab',
  '/aura-analysis/dashboard/edge-analyzer',
  '/aura-analysis/dashboard/execution-lab',
  '/aura-analysis/dashboard/calendar',
  '/aura-analysis/dashboard/psychology',
  '/aura-analysis/dashboard/habits',
  '/aura-analysis/dashboard/growth',
  '/aura-analysis/dashboard/trader-replay',
  '/backtesting',
  '/backtesting/new',
  '/backtesting/sessions',
  '/backtesting/trades',
  '/backtesting/reports',
  '/surveillance',
  '/premium-ai',
  '/subscription',
  '/choose-plan',
];

const ADMIN_PATHS = [
  '/admin',
  '/admin/users',
  '/admin/journal',
  '/admin/messages',
  '/admin/inbox',
  '/admin/pipeline-health',
  '/admin/integration-health',
  '/admin/tools',
  '/settings',
];

/** Split trader routes so each slice stays under PER_SLICE_TEST_MS. */
const TRADER_CHUNK = 10;
const TRADER_SLICES = [];
for (let i = 0; i < TRADER_PATHS.length; i += TRADER_CHUNK) {
  TRADER_SLICES.push(TRADER_PATHS.slice(i, i + TRADER_CHUNK));
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function measureContent(page) {
  const main = page.locator('main').first();
  const hasMain = await main.count().catch(() => 0);
  const text = hasMain
    ? (await withTimeout(main.innerText().catch(() => ''), MEASURE_CONTENT_MS, 'measure main text')).trim()
    : (await withTimeout(page.locator('body').innerText().catch(() => ''), MEASURE_CONTENT_MS, 'measure body text')).trim();
  const inputs = await page.locator('main input, main select, main textarea').count().catch(() => 0);
  const tables = await page.locator('main table').count().catch(() => 0);
  const canvases = await page.locator('main canvas').count().catch(() => 0);
  const lists = await page.locator('main ul li, main ol li').count().catch(() => 0);
  const score = text.length + inputs * 40 + tables * 200 + canvases * 150 + lists * 15;
  const placeholder = /coming soon|under construction|not available yet|placeholder page|work in progress/i.test(text);
  const gatedCopy = /upgrade|subscribe|choose a plan|premium required|elite required|access denied|not authorized|sign up to continue/i.test(
    text.slice(0, 6000),
  );
  return {
    textLen: text.length,
    inputs,
    tables,
    canvases,
    lists,
    score,
    placeholder,
    gatedCopy,
    shellLikely: score < 400 && !placeholder,
  };
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} pagePath
 * @param {Finding[]} findings
 * @param {{ tabs: number, buttons: number, failedClicks: number }} stats
 * @param {{ skipHeavy: boolean }} opts
 */
async function interactNonDestructive(page, pagePath, findings, stats, opts) {
  const here = page.url();
  if (!isAppHost(here)) return;
  if (opts.skipHeavy) {
    findings.push({
      severity: 'low',
      title: 'Skipped deep interactions (heavy widget route: TradingView / lab)',
      url: here,
      page: pagePath,
    });
    return;
  }

  await page.mouse.wheel(0, 400).catch(() => {});
  await page.waitForTimeout(120);

  const tabs = page.getByRole('tab');
  const tabCount = await tabs.count().catch(() => 0);
  for (let i = 0; i < Math.min(tabCount, MAX_TABS); i += 1) {
    const t = tabs.nth(i);
    const label = (await t.innerText().catch(() => '')).trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!label || UNSAFE_BTN.test(label)) continue;
    try {
      await withTimeout(t.click({ timeout: ACTION_TIMEOUT_MS }), ACTION_TIMEOUT_MS + 500, `tab:${label.slice(0, 40)}`);
      stats.tabs += 1;
    } catch (e) {
      stats.failedClicks += 1;
      findings.push({
        severity: 'medium',
        title: `Tab click skipped/timeout: ${label.slice(0, 60)}`,
        url: page.url(),
        page: pagePath,
        detail: String(/** @type {Error} */ (e).message || e).slice(0, 240),
      });
    }
    await page.waitForTimeout(100);
    await page.keyboard.press('Escape').catch(() => {});
  }

  const buttons = page.locator('button:visible');
  const n = await buttons.count().catch(() => 0);
  const cap = Math.min(n, MAX_BUTTONS);
  for (let i = 0; i < cap; i += 1) {
    const b = buttons.nth(i);
    const txt = (await b.innerText().catch(() => '')).trim().replace(/\s+/g, ' ').slice(0, 120);
    if (!txt || txt.length > 100) continue;
    if (UNSAFE_BTN.test(txt)) continue;
    if (/show tooltip/i.test(txt)) continue;
    if (await b.isDisabled().catch(() => true)) continue;
    try {
      await withTimeout(b.click({ timeout: ACTION_TIMEOUT_MS }), ACTION_TIMEOUT_MS + 500, `btn:${txt.slice(0, 40)}`);
      stats.buttons += 1;
    } catch (e) {
      stats.failedClicks += 1;
      findings.push({
        severity: 'medium',
        title: `Button click skipped/timeout: "${txt.slice(0, 60)}"`,
        url: page.url(),
        page: pagePath,
        detail: String(/** @type {Error} */ (e).message || e).slice(0, 240),
      });
    }
    await page.waitForTimeout(80);
    await page.keyboard.press('Escape').catch(() => {});
  }

  const details = page.locator('details summary, [aria-expanded="false"]');
  const dCount = await details.count().catch(() => 0);
  for (let i = 0; i < Math.min(dCount, MAX_DETAILS); i += 1) {
    try {
      await withTimeout(
        details.nth(i).click({ timeout: ACTION_TIMEOUT_MS }),
        ACTION_TIMEOUT_MS + 400,
        'details',
      );
    } catch {
      /* skip */
    }
    await page.waitForTimeout(60);
  }
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} path
 * @param {string} group
 * @param {string} suiteId
 * @param {Finding[]} findings
 * @param {{ url: string, text: string }[]} consoleErrors
 * @param {{ url: string, status: number, during: string }[]} failedResp
 * @param {{ url: string, err: string, during: string }[]} reqFailed
 * @param {{ path: string, suiteId: string, durationMs: number; skipped?: string }[]} timings
 */
async function visitAndAudit(page, path, group, suiteId, findings, consoleErrors, failedResp, reqFailed, timings) {
  const requested = `${BASE}${path}`;
  const t0 = Date.now();
  const stats = { tabs: 0, buttons: 0, failedClicks: 0 };
  const skipHeavy = /\/trader-lab(\/|$)/i.test(path);

  // eslint-disable-next-line no-console
  console.log(`[admin-audit] ENTER suite=${suiteId} path=${path} url=${requested}`);

  try {
    return await withTimeout(
      visitAndAuditInner(page, path, group, suiteId, requested, findings, stats, skipHeavy, timings, t0),
      PER_PAGE_TOTAL_MS,
      `per-page-total:${path}`,
    );
  } catch (e) {
    const msg = String(/** @type {Error} */ (e).message || e);
    if (/per-page-total:/.test(msg) || /exceeded \d+ms/.test(msg)) {
      findings.push({
        severity: 'high',
        title: `Per-page budget exceeded (${PER_PAGE_TOTAL_MS}ms) — skipped remainder`,
        url: page.url(),
        page: path,
        detail: msg.slice(0, 300),
      });
      timings.push({ path, suiteId, durationMs: Date.now() - t0, skipped: 'page-budget' });
      // eslint-disable-next-line no-console
      console.log(`[admin-audit] SKIP suite=${suiteId} path=${path} reason=page-budget`);
    } else {
      findings.push({
        severity: 'high',
        title: 'Navigation / runtime / timeout',
        url: page.url(),
        page: path,
        detail: msg.slice(0, 400),
      });
      timings.push({ path, suiteId, durationMs: Date.now() - t0, skipped: msg.slice(0, 200) });
      // eslint-disable-next-line no-console
      console.log(`[admin-audit] SKIP suite=${suiteId} path=${path} reason=${msg.slice(0, 120)}`);
    }
    try {
      await withTimeout(
        page.goto(`${BASE}/community`, { waitUntil: 'domcontentloaded', timeout: PAGE_GOTO_MS }),
        PAGE_GOTO_MS + 800,
        'reset after error',
      ).catch(() => {});
    } catch {
      /* ignore */
    }
    return {
      path,
      group,
      suiteId,
      requested,
      httpStatus: 0,
      finalUrl: page.url(),
      title: '',
      category: 'broken',
      stats,
      content: null,
      error: msg,
      durationMs: Date.now() - t0,
    };
  }
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} path
 * @param {string} group
 * @param {string} suiteId
 * @param {string} requested
 * @param {Finding[]} findings
 * @param {{ tabs: number, buttons: number, failedClicks: number }} stats
 * @param {boolean} skipHeavy
 * @param {{ path: string, suiteId: string, durationMs: number; skipped?: string }[]} timings
 * @param {number} t0
 */
async function visitAndAuditInner(
  page,
  path,
  group,
  suiteId,
  requested,
  findings,
  stats,
  skipHeavy,
  timings,
  t0,
) {
  let httpStatus = 0;
  let finalUrl = '';
  let title = '';

  const res = await withTimeout(
    page.goto(requested, { waitUntil: 'domcontentloaded', timeout: PAGE_GOTO_MS }),
    PAGE_GOTO_MS + 1_000,
    'page.goto',
  );
  httpStatus = res?.status() || 0;
  finalUrl = page.url();
  title = (await withTimeout(page.title().catch(() => ''), 4_000, 'title').catch(() => '')) || '';

  await withTimeout(page.waitForLoadState('domcontentloaded'), PAGE_INTERACTIVE_MS, 'wait domcontentloaded').catch(
    () => {},
  );
  await withTimeout(
    page.locator('body').waitFor({ state: 'visible', timeout: PAGE_INTERACTIVE_MS }),
    PAGE_INTERACTIVE_MS + 500,
    'body visible',
  ).catch(() => {
    findings.push({
      severity: 'medium',
      title: 'Interactive timeout — body not confirmed visible in time',
      url: page.url(),
      page: path,
      detail: `>${PAGE_INTERACTIVE_MS}ms`,
    });
  });

  await page.waitForTimeout(200);

  if (/\/login(\?|$)/i.test(finalUrl)) {
    findings.push({
      severity: 'high',
      title: 'Session invalid — redirected to login',
      url: finalUrl,
      page: path,
      detail: `Requested ${requested}`,
    });
    timings.push({ path, suiteId, durationMs: Date.now() - t0 });
    // eslint-disable-next-line no-console
    console.log(`[admin-audit] LEAVE suite=${suiteId} path=${path} category=broken (login)`);
    return {
      path,
      group,
      suiteId,
      requested,
      httpStatus,
      finalUrl,
      title,
      category: 'broken',
      stats,
      content: null,
      durationMs: Date.now() - t0,
    };
  }

  if (httpStatus >= 400) {
    findings.push({
      severity: 'high',
      title: `HTTP ${httpStatus}`,
      url: finalUrl,
      page: path,
    });
  }

  const bodySnippet = (
    await withTimeout(page.locator('body').innerText().catch(() => ''), 5_000, 'body snippet').catch(() => '')
  ).slice(0, 2500);
  if (/not found|404|page not found/i.test(bodySnippet) && !path.includes('404')) {
    findings.push({
      severity: 'high',
      title: '404-style copy',
      url: finalUrl,
      page: path,
    });
  }

  const spin = page.getByText(/^Loading\b/i);
  const loadingVisible = await withTimeout(spin.first().isVisible().catch(() => false), 3_000, 'loading visible').catch(
    () => false,
  );
  if (loadingVisible) {
    await page.waitForTimeout(LOADER_PROBE_MS);
    const still = await withTimeout(spin.first().isVisible().catch(() => false), 2_000, 'loading still').catch(
      () => false,
    );
    if (still) {
      findings.push({
        severity: 'medium',
        title: `Loader still visible after ~${LOADER_PROBE_MS}ms`,
        url: finalUrl,
        page: path,
      });
    }
  }

  if (!isAppHost(page.url())) {
    findings.push({
      severity: 'low',
      title: 'Off app host (e.g. Stripe) — skipped interactions; resetting to /community',
      url: page.url(),
      page: path,
    });
  } else {
    await withTimeout(interactNonDestructive(page, path, findings, stats, { skipHeavy }), INTERACT_TOTAL_MS, 'interact')
      .catch((err) => {
        findings.push({
          severity: 'medium',
          title: 'Interaction phase capped — partial clicks only',
          url: page.url(),
          page: path,
          detail: String(err).slice(0, 240),
        });
      });
  }

  const m = await withTimeout(measureContent(page), MEASURE_CONTENT_MS + 2_000, 'measureContent').catch(() => ({
    textLen: 0,
    inputs: 0,
    tables: 0,
    canvases: 0,
    lists: 0,
    score: 0,
    placeholder: false,
    gatedCopy: false,
    shellLikely: true,
  }));
  let category = 'working';
  if (m.placeholder) category = 'placeholder';
  else if (m.gatedCopy) category = 'gated';
  else if (m.shellLikely) category = 'partially_working';
  if (httpStatus >= 400 || /\/login/i.test(finalUrl)) category = 'broken';
  else if (!isAppHost(finalUrl) || /buy\.stripe\.com|checkout\.stripe\.com/i.test(finalUrl)) {
    category = 'gated';
  }

  if (!isAppHost(page.url())) {
    await withTimeout(
      page.goto(`${BASE}/community`, { waitUntil: 'domcontentloaded', timeout: PAGE_GOTO_MS }),
      PAGE_GOTO_MS + 800,
      'reset community',
    ).catch(() => {});
  }

  const durationMs = Date.now() - t0;
  timings.push({ path, suiteId, durationMs });
  // eslint-disable-next-line no-console
  console.log(`[admin-audit] LEAVE suite=${suiteId} path=${path} category=${category} ms=${durationMs}`);

  return {
    path,
    group,
    suiteId,
    requested,
    httpStatus,
    finalUrl,
    title,
    category,
    stats,
    content: m,
    durationMs,
  };
}

/**
 * @param {any} row
 * @param {any[]} rows
 */
function upsertRow(rows, row) {
  const i = rows.findIndex((r) => r.path === row.path);
  if (i >= 0) rows[i] = row;
  else rows.push(row);
}

/**
 * @returns {any}
 */
function loadOrInitPayload() {
  if (fs.existsSync(OUT_JSON)) {
    try {
      return JSON.parse(fs.readFileSync(OUT_JSON, 'utf8'));
    } catch {
      /* fallthrough */
    }
  }
  return {
    base: BASE,
    startedAt: new Date().toISOString(),
    sessionFile: STATE,
    slicesCompleted: [],
    rows: [],
    timings: [],
    findings: [],
    consoleErrors: [],
    failedHttp: [],
    requestFailed: [],
  };
}

/**
 * @param {any} payload
 */
function persistPayload(payload) {
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  payload.updatedAt = new Date().toISOString();
  fs.writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2), 'utf8');
}

/**
 * @param {any} payload
 */
function buildMarkdownReport(payload) {
  const rows = payload.rows || [];
  const findings = payload.findings || [];
  const working = rows.filter((r) => r.category === 'working');
  const partial = rows.filter((r) => r.category === 'partially_working');
  const gated = rows.filter((r) => r.category === 'gated');
  const placeholder = rows.filter((r) => r.category === 'placeholder');
  const broken = rows.filter((r) => r.category === 'broken');
  const shellOnly = partial.filter((r) => r.content?.shellLikely);
  const uniqConsole = [...new Map((payload.consoleErrors || []).map((c) => [`${c.url}::${c.text}`, c])).values()];
  const uniqFail = [...new Map((payload.failedHttp || []).map((x) => [`${x.status}:${x.url}`, x])).values()];
  const uniqReqF = [...new Map((payload.requestFailed || []).map((x) => [`${x.err}:${x.url}`, x])).values()];
  const bySev = (s) => findings.filter((f) => f.severity === s);

  const timings = payload.timings || [];
  const longest = [...timings].sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0))[0];

  const lines = [
    '# Aura Terminal — admin session audit (bounded)',
    '',
    `- **When:** ${payload.updatedAt || payload.at || new Date().toISOString()}`,
    `- **Base:** ${payload.base}`,
    `- **Session:** \`${payload.sessionFile}\``,
    `- **Pages audited:** ${rows.length}`,
    `- **Suites completed:** ${(payload.slicesCompleted || []).join(', ') || '—'}`,
    `- **Longest page:** ${longest ? `\`${longest.path}\` (${longest.durationMs}ms, suite ${longest.suiteId})` : '—'}`,
    '',
    '## 1. Executive summary',
    '',
    `Serial suites with **incremental JSON saves**. Per-page navigation cap **~${PAGE_GOTO_MS}ms**, interactive probe **~${PAGE_INTERACTIVE_MS}ms**, per-action cap **~${ACTION_TIMEOUT_MS}ms**. Max **${MAX_TABS}** tab clicks and **${MAX_BUTTONS}** button clicks per in-app page; **Escape** after interactions. **Stripe / off-host:** no crawl; reset to \`/community\`. **Trader Lab:** load + metrics only — **no** deep TradingView interaction.`,
    '',
    `**Counts:** working **${working.length}**, partially_working **${partial.length}**, gated **${gated.length}**, placeholder **${placeholder.length}**, broken **${broken.length}**. Findings: **${findings.length}**. Console lines: **${uniqConsole.length}**, failed HTTP: **${uniqFail.length}**, requestfailed: **${uniqReqF.length}**.`,
    '',
    '## 2. Working features',
    '',
    ...working.map((r) => `- \`${r.path}\` → ${r.finalUrl} (score≈${r.content?.score ?? 'n/a'}, ${r.durationMs ?? '?'}ms)`),
    '',
    '## 3. Broken features',
    '',
    ...broken.map((r) => `- \`${r.path}\` → ${r.finalUrl} ${r.error ? `— _${r.error}_` : ''}`),
    ...(broken.length ? [] : ['- _None classified as broken._']),
    '',
    '## 4. Missing / placeholder',
    '',
    ...placeholder.map((r) => `- \`${r.path}\` → ${r.finalUrl}`),
    ...(placeholder.length ? [] : ['- _None._']),
    '',
    '## 5. Admin panel findings',
    '',
    ...findings
      .filter((f) => (f.page || '').startsWith('/admin') || (f.page || '') === '/settings')
      .map((f) => `- **${f.severity}** ${f.title} — \`${f.page}\``),
    ...(findings.some((f) => (f.page || '').startsWith('/admin')) ? [] : ['- _None admin-specific._']),
    '',
    '## 6. Console / network (sample)',
    '',
    ...uniqFail.slice(0, 25).map((x) => `- HTTP \`${x.status}\` ${x.url}`),
    ...uniqReqF.slice(0, 20).map((x) => `- ${x.err}: ${x.url}`),
    ...uniqConsole.slice(0, 25).map((c) => `- ${c.url} :: ${(c.text || '').slice(0, 180)}…`),
    '',
    '## 7. Highest priority fixes',
    '',
    ...[...bySev('critical'), ...bySev('high'), ...findings.filter((f) => f.severity === 'medium').slice(0, 10)].map(
      (f, i) => `${i + 1}. **${f.title}** (${f.severity}) ${f.page ? `\`${f.page}\`` : ''}`,
    ),
    '',
    '## 8. Shell-like pages',
    '',
    ...shellOnly.map((r) => `- \`${r.path}\` — score≈${r.content?.score}`),
    ...(shellOnly.length ? [] : ['- _None._']),
  ];
  return lines.join('\n');
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {any} payload
 */
function attachListeners(page, payload) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') (payload.consoleErrors ||= []).push({ url: page.url(), text: msg.text() });
  });
  page.on('response', (resp) => {
    const u = resp.url();
    if (resp.status() >= 400 && (hostOk(u) || /\/api\//i.test(u))) {
      (payload.failedHttp ||= []).push({ url: u, status: resp.status(), during: page.url() });
    }
  });
  page.on('requestfailed', (req) => {
    (payload.requestFailed ||= []).push({
      url: req.url(),
      err: req.failure()?.errorText || 'fail',
      during: page.url(),
    });
  });
}

test.describe('Aura Terminal — admin audit (bounded, incremental)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(() => {
    if (!fs.existsSync(STATE)) {
      throw new Error(`Missing session storage state: ${STATE}`);
    }
  });

  test(`slice: public marketing (${MARKETING_AND_PUBLIC.length} pages)`, async ({ page }) => {
    test.setTimeout(PER_SLICE_TEST_MS);
    const payload = loadOrInitPayload();
    attachListeners(page, payload);
    const suiteId = 'public';
    if (!payload.findings) payload.findings = [];
    if (!payload.timings) payload.timings = [];

    try {
      await page.goto(`${BASE}/community`, { waitUntil: 'domcontentloaded', timeout: PAGE_GOTO_MS });
      if (/\/login/i.test(page.url())) {
        payload.findings.push({
          severity: 'critical',
          title: 'Saved session expired — authenticated areas unreliable',
          url: page.url(),
          detail: 'Regenerate e2e/reports/auraterminal-new-user.json',
        });
      }

      for (const p of MARKETING_AND_PUBLIC) {
        const row = await visitAndAudit(page, p, 'public', suiteId, payload.findings, [], [], [], payload.timings);
        upsertRow(payload.rows, row);
        persistPayload(payload);
      }
      payload.slicesCompleted = [...new Set([...(payload.slicesCompleted || []), suiteId])];
      persistPayload(payload);
      expect(fs.existsSync(OUT_JSON)).toBeTruthy();
    } finally {
      persistPayload(payload);
    }
  });

  for (let si = 0; si < TRADER_SLICES.length; si += 1) {
    const chunk = TRADER_SLICES[si];
    const suiteId = `trader-${si + 1}`;
    test(`slice: ${suiteId} (${chunk.length} pages)`, async ({ page }) => {
      test.setTimeout(PER_SLICE_TEST_MS);
      const payload = loadOrInitPayload();
      attachListeners(page, payload);
      if (!payload.findings) payload.findings = [];
      if (!payload.timings) payload.timings = [];

      try {
        await page.goto(`${BASE}/community`, { waitUntil: 'domcontentloaded', timeout: PAGE_GOTO_MS }).catch(() => {});
        for (const p of chunk) {
          const row = await visitAndAudit(page, p, 'trader', suiteId, payload.findings, [], [], [], payload.timings);
          upsertRow(payload.rows, row);
          persistPayload(payload);
        }
        payload.slicesCompleted = [...new Set([...(payload.slicesCompleted || []), suiteId])];
        persistPayload(payload);
        expect(fs.existsSync(OUT_JSON)).toBeTruthy();
      } finally {
        persistPayload(payload);
      }
    });
  }

  test(`slice: admin (${ADMIN_PATHS.length} pages) + optional community`, async ({ page }) => {
    test.setTimeout(PER_SLICE_TEST_MS);
    const payload = loadOrInitPayload();
    attachListeners(page, payload);
    if (!payload.findings) payload.findings = [];
    if (!payload.timings) payload.timings = [];

    await page.goto(`${BASE}/community`, { waitUntil: 'domcontentloaded', timeout: PAGE_GOTO_MS }).catch(() => {});

    const suiteId = 'admin';
    for (const p of ADMIN_PATHS) {
      const row = await visitAndAudit(page, p, 'admin', suiteId, payload.findings, [], [], [], payload.timings);
      upsertRow(payload.rows, row);
      persistPayload(payload);
    }

    try {
      payload.slicesCompleted = [...new Set([...(payload.slicesCompleted || []), suiteId])];
      payload.at = new Date().toISOString();

      const rows = payload.rows || [];
      const working = rows.filter((r) => r.category === 'working');
      const partial = rows.filter((r) => r.category === 'partially_working');
      const gated = rows.filter((r) => r.category === 'gated');
      const placeholder = rows.filter((r) => r.category === 'placeholder');
      const broken = rows.filter((r) => r.category === 'broken');
      const shellOnly = partial.filter((r) => r.content?.shellLikely);

      payload.summary = {
        total: rows.length,
        working: working.length,
        partially_working: partial.length,
        gated: gated.length,
        placeholder: placeholder.length,
        broken: broken.length,
        findings: (payload.findings || []).length,
        consoleErrors: [...new Map((payload.consoleErrors || []).map((c) => [`${c.url}::${c.text}`, c])).values()].length,
        failedHttp: [...new Map((payload.failedHttp || []).map((x) => [`${x.status}:${x.url}`, x])).values()].length,
        requestFailed: [...new Map((payload.requestFailed || []).map((x) => [`${x.err}:${x.url}`, x])).values()].length,
        shellLikelyPages: shellOnly.length,
      };

      const uniqConsole = [...new Map((payload.consoleErrors || []).map((c) => [`${c.url}::${c.text}`, c])).values()];
      const uniqFail = [...new Map((payload.failedHttp || []).map((x) => [`${x.status}:${x.url}`, x])).values()];
      const uniqReqF = [...new Map((payload.requestFailed || []).map((x) => [`${x.err}:${x.url}`, x])).values()];
      payload.consoleErrors = uniqConsole.slice(0, 120);
      payload.failedHttp = uniqFail.slice(0, 80);
      payload.requestFailed = uniqReqF.slice(0, 60);

      const timings = payload.timings || [];
      const longest = [...timings].sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0))[0];
      const skipped = timings.filter((t) => t.skipped);
      payload.analysis = {
        longestPage: longest || null,
        skippedInteractions: skipped.length,
        slices: payload.slicesCompleted || [],
        fullyTestedSuites: payload.slicesCompleted || [],
        note: 'Each slice completes independently; rows merge by path. Trader-lab: no deep widget crawl.',
      };

      persistPayload(payload);
      const md = buildMarkdownReport(payload);
      fs.writeFileSync(OUT_MD, md, 'utf8');
      persistPayload(payload);

      expect(fs.existsSync(OUT_MD)).toBeTruthy();
      expect(rows.length).toBeGreaterThan(50);
      return; // explicit hard stop after admin finalization
    } finally {
      persistPayload(payload);
    }
  });
});
