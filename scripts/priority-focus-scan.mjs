/**
 * One-pass surface scan: messaging + key data routes (authenticated storage state).
 * Writes e2e/reports/priority-focus-scan.json — summarize into ISSUE_BOARD.md then keep or trim.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const BASE = (process.env.AUDIT_BASE_URL || 'https://www.auraterminal.ai').replace(/\/$/, '');
const STORAGE = process.env.PLAYWRIGHT_STORAGE || path.join(root, 'e2e/reports/auraterminal-normal-user.json');
const OUT = path.join(root, 'e2e/reports/priority-focus-scan.json');

const ROUTES = [
  '/messages',
  '/admin/inbox',
  '/reports',
  '/reports/dna',
  '/reports/live',
  '/manual-metrics/dashboard',
  '/manual-metrics/processing',
  '/trader-deck',
  '/trader-deck/trade-validator/overview',
  '/aura-analysis/dashboard/overview',
  '/backtesting',
  '/backtesting/sessions',
  '/surveillance',
  '/premium-ai',
  '/subscription',
  '/profile',
];

function flags(text, finalUrl) {
  const t = (text || '').slice(0, 80000);
  return {
    bodyChars: t.length,
    looksLogin: /\/login/i.test(finalUrl) || /\bsign in\b/i.test(t) && /password/i.test(t),
    looksForbidden: /\b403\b|forbidden|not authorized|access denied/i.test(t),
    looksError: /something went wrong|application error|unexpected error/i.test(t),
    stuckLoading: /\bloading\b/i.test(t) && t.length < 400,
    emptyShell: t.length < 800 && !/footer|navigation|navbar/i.test(t),
  };
}

async function main() {
  if (!fs.existsSync(STORAGE)) {
    console.error('Missing storage state:', STORAGE);
    process.exit(1);
  }
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: STORAGE });
  const page = await context.newPage();
  const pageErrors = [];
  const requestFailed = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message || e).slice(0, 500)));
  page.on('requestfailed', (req) => {
    const f = req.failure();
    requestFailed.push({
      url: req.url(),
      error: f?.errorText || 'unknown',
      resourceType: req.resourceType(),
    });
  });

  const routes = [];
  for (const route of ROUTES) {
    const url = `${BASE}${route}`;
    pageErrors.length = 0;
    requestFailed.length = 0;
    let finalUrl = url;
    let ok = true;
    let errMsg = '';
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(1200);
      finalUrl = page.url();
      const title = await page.title().catch(() => '');
      const text = await page.evaluate(() => document.body?.innerText || '');
      const apiFails = requestFailed.filter(
        (r) => r.url.includes('/api/') && !r.url.includes('translate.google')
      );
      routes.push({
        route,
        requestedUrl: url,
        finalUrl,
        httpStatus: resp?.status() ?? null,
        title: title.slice(0, 200),
        ...flags(text, finalUrl),
        pageErrors: [...pageErrors],
        apiRequestFailures: apiFails.slice(0, 12),
      });
    } catch (e) {
      ok = false;
      errMsg = String(e.message || e);
      routes.push({
        route,
        requestedUrl: url,
        finalUrl: page.url(),
        httpStatus: null,
        error: errMsg,
        pageErrors: [...pageErrors],
        apiRequestFailures: requestFailed.filter((r) => r.url.includes('/api/')).slice(0, 12),
      });
    }
    void ok;
  }

  await browser.close();

  const out = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    storageState: STORAGE,
    routes,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
  console.log('Wrote', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
