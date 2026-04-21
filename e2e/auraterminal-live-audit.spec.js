// @ts-check
/**
 * Live production audit for Aura Terminal.
 * Run: npx playwright test --config=playwright.audit.config.js
 * Optional: AUDIT_BASE_URL=https://www.auraterminal.ai AUDIT_EMAIL=... AUDIT_PASSWORD=...
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE = (process.env.AUDIT_BASE_URL || 'https://auraterminal.ai').replace(/\/$/, '');

/** @typedef {'critical'|'high'|'medium'|'low'|'info'} Severity */

/** @type {{ phase: string, severity: Severity, title: string, url?: string, steps?: string[], expected?: string, actual?: string, evidence?: string }[]} */
const FINDINGS = [];

/** @param {Severity} severity */
function finding(phase, severity, title, detail = {}) {
  FINDINGS.push({
    phase,
    severity,
    title,
    ts: new Date().toISOString(),
    ...detail,
  });
}

function isAuraHost(hostname) {
  return /(^|\.)auraterminal\.ai$/i.test(hostname || '');
}

function resolveHref(href, origin) {
  if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return null;
  try {
    return new URL(href, origin).href;
  } catch {
    return null;
  }
}

function shouldVisitUrl(url) {
  try {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol)) return false;
    if (!isAuraHost(u.hostname)) return false;
    if (/\.(png|jpe?g|gif|webp|svg|ico|css|js|woff2?)(\?|$)/i.test(u.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

const DESTRUCTIVE = /delete|remove account|unsubscribe|pay now|confirm purchase|place order|transfer|withdraw/i;

async function safeScroll(page) {
  for (let i = 0; i < 12; i += 1) {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(200);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string[]} bucket
 */
function attachRuntimeMonitors(page, bucket) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      bucket.push(`[console.error] ${page.url()} :: ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => {
    bucket.push(`[pageerror] ${page.url()} :: ${err.message}`);
  });
}

test.describe('Aura Terminal — live phased audit', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(720_000);

  test('full audit (public → routes → interactions → report)', async ({ page }) => {
    const runtimeLog = [];
    attachRuntimeMonitors(page, runtimeLog);

    const failedResponses = [];
    const failedRequests = [];
    page.on('response', (resp) => {
      const u = resp.url();
      if (resp.status() >= 400 && (isAuraHost(new URL(u).hostname) || /api\./i.test(u))) {
        failedResponses.push({ url: u, status: resp.status(), from: page.url() });
      }
    });
    page.on('requestfailed', (req) => {
      failedRequests.push({
        url: req.url(),
        error: req.failure()?.errorText || 'unknown',
        from: page.url(),
      });
    });

    const visited = new Set();
    const pageNotes = [];

    /**
     * @param {string} url
     * @param {{ scroll?: boolean }} [opts]
     */
    async function visit(url, opts = {}) {
      if (!opts.force && visited.has(url)) return;
      if (!visited.has(url)) visited.add(url);
      const started = Date.now();
      let resp;
      try {
        resp = await page.goto(url, { waitUntil: 'domcontentloaded' });
      } catch (e) {
        finding('NAV', 'high', 'Navigation failed', {
          url,
          steps: [`goto ${url}`],
          expected: 'Page loads',
          actual: String(/** @type {Error} */ (e).message || e),
          evidence: runtimeLog.slice(-5).join('\n'),
        });
        return;
      }
      const status = resp?.status() ?? 0;
      const final = page.url();
      const title = await page.title().catch(() => '');
      pageNotes.push({
        requested: url,
        finalUrl: final,
        httpStatus: status,
        title,
        ms: Date.now() - started,
      });
      if (status >= 400) {
        finding('NAV', status === 404 ? 'high' : 'medium', `HTTP ${status} on navigation`, {
          url: final,
          steps: [`goto ${url}`],
          expected: '2xx/3xx',
          actual: String(status),
        });
      }
      if (opts.scroll) await safeScroll(page);
    }

    // ─── PHASE 1: public / home ───
    finding('P1', 'info', 'Audit start', { url: BASE, evidence: `BASE=${BASE}` });
    await visit(BASE, { scroll: true });

    const origin = new URL(page.url()).origin;
    const heroClaims = await page
      .evaluate(() => {
        const h = Array.from(document.querySelectorAll('h1,h2'))
          .map((e) => e.textContent?.trim())
          .filter(Boolean)
          .slice(0, 12);
        return h;
      })
      .catch(() => []);

    const rawHrefs = await page.$$eval('a[href]', (as) =>
      [...new Set(as.map((a) => a.getAttribute('href')).filter(Boolean))],
    );
    const sameSiteUrls = [];
    for (const h of rawHrefs) {
      const abs = resolveHref(/** @type {string} */ (h), origin);
      if (abs && shouldVisitUrl(abs)) sameSiteUrls.push(abs);
    }
    const uniquePublic = [...new Set(sameSiteUrls)].slice(0, 55);
    for (const u of uniquePublic) {
      await visit(u, { scroll: false });
      await page.waitForTimeout(150);
    }

    // Footer / repeated passes: go home and collect again after scroll
    await visit(origin + '/', { scroll: true });
    const rawHrefs2 = await page.$$eval('a[href]', (as) =>
      [...new Set(as.map((a) => a.getAttribute('href')).filter(Boolean))],
    );
    for (const h of rawHrefs2) {
      const abs = resolveHref(/** @type {string} */ (h), origin);
      if (abs && shouldVisitUrl(abs) && !visited.has(abs)) sameSiteUrls.push(abs);
    }
    for (const u of [...new Set(sameSiteUrls)]) {
      if (!visited.has(u)) await visit(u, { scroll: false });
    }

    // Contact page explicit (force reload — may have been visited during link crawl)
    await visit(`${origin}/contact`, { scroll: true, force: true });
    const contactHasForm = await page.locator('form').count().catch(() => 0);
    finding('P1', contactHasForm ? 'info' : 'medium', 'Contact page form presence', {
      url: page.url(),
      actual: contactHasForm ? 'At least one <form> found' : 'No <form> detected (may still use JS submit)',
    });

    // ─── PHASE 2: direct routes ───
    const RISK_PATHS = [
      '/friends',
      '/contact-us',
      '/contact',
      '/login',
      '/register',
      '/signup',
      '/dashboard',
      '/reports',
      '/live-metrics',
      '/monthly-statements',
      '/aura-analysis',
      '/aura-analysis/dashboard/performance',
      '/choose-plan',
      '/subscription',
      '/forgot-password',
      '/reset-password',
      '/terms',
      '/privacy',
      '/explore',
      '/why-glitch',
      '/operating-system',
      '/courses',
      '/premium-ai',
      '/journal',
      '/trader-deck',
      '/surveillance',
      '/backtesting',
      '/community',
      '/messages',
      '/profile',
    ];
    for (const p of RISK_PATHS) {
      await visit(`${origin}${p}`, { scroll: true });
      const u = page.url();
      const notFound =
        (await page.getByText(/not found|404|page not found/i).count().catch(() => 0)) > 0;
      if (notFound || /\/not-found|404/i.test(u)) {
        finding('P2', 'high', `Possible 404 or not-found copy for ${p}`, {
          url: u,
          steps: [`goto ${origin}${p}`],
          expected: 'Useful page or auth redirect',
          actual: 'Not-found style content or URL',
        });
      }
      await page.waitForTimeout(120);
    }

    // ─── PHASE 3: auth surfaces (no credentials unless env) ───
    await visit(`${origin}/login`, { scroll: true });
    const hasPassword = (await page.locator('input[type="password"]').count()) > 0;
    finding('P3', 'info', 'Login page password field', {
      url: page.url(),
      actual: hasPassword ? 'Password input present' : 'No password input (unexpected for login)',
    });

    const email = process.env.AUDIT_EMAIL;
    const password = process.env.AUDIT_PASSWORD;
    if (email && password) {
      await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' });
      await page.locator('input[type="email"],input[name="email"],input#email').first().fill(email).catch(() => {});
      await page.locator('input[type="password"]').first().fill(password).catch(() => {});
      await page.locator('button[type="submit"],button:has-text("Sign"),button:has-text("Log")').first().click().catch(() => {});
      await page.waitForTimeout(5000);
      finding(
        'P3',
        'info',
        'Post-login state (env credentials used)',
        { url: page.url(), evidence: 'AUDIT_EMAIL/AUDIT_PASSWORD were set' },
      );
    } else {
      finding(
        'P3',
        'info',
        'Post-login / MFA / subscription flows not executed',
        {
          steps: ['Set AUDIT_EMAIL and AUDIT_PASSWORD to enable automated login continuation'],
          expected: 'Deep authenticated audit',
          actual: 'Skipped — no AUDIT_EMAIL / AUDIT_PASSWORD in environment',
        },
      );
    }

    // VerifyMFA /contact-us vs /contact (codebase-known issue — verify live)
    await visit(`${origin}/contact-us`, { scroll: false });
    const contactUsNotFound =
      (await page.getByText(/not found|404/i).count().catch(() => 0)) > 0 ||
      (await page.title().catch(() => '')).toLowerCase().includes('not found');
    if (contactUsNotFound) {
      finding('P3', 'high', '/contact-us shows not-found or empty marketing', {
        url: page.url(),
        steps: ['goto /contact-us'],
        expected: 'Contact/support page or redirect to /contact',
        actual: 'Likely 404 or useless page',
      });
    }

    // ─── PHASE 4 & 5: shallow interactive sweep on key public pages ───
    const sweepUrls = [BASE, `${origin}/explore`, `${origin}/courses`, `${origin}/contact`, `${origin}/why-glitch`].filter(
      (v, i, a) => a.indexOf(v) === i,
    );

    for (const sweep of sweepUrls) {
      await page.goto(sweep, { waitUntil: 'domcontentloaded' });
      await safeScroll(page);

      const links = await page.$$('a[href]');
      let linkClicks = 0;
      for (let i = 0; i < Math.min(links.length, 18); i += 1) {
        const href = await links[i].getAttribute('href').catch(() => null);
        const abs = href ? resolveHref(href, origin) : null;
        if (!abs || !shouldVisitUrl(abs)) continue;
        try {
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 25_000 }).catch(() => null),
            links[i].click({ timeout: 2000 }),
          ]);
          linkClicks += 1;
          await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
        } catch {
          // ignore
        }
      }
      finding('P5', 'info', `Link interaction sample on ${sweep}`, {
        url: sweep,
        evidence: `Approx ${linkClicks} in-page navigations attempted`,
      });

      const buttons = await page.$$('button:visible');
      let btnOk = 0;
      for (let i = 0; i < Math.min(buttons.length, 20); i += 1) {
        const label = (await buttons[i].innerText().catch(() => '')).trim().slice(0, 120);
        if (!label || DESTRUCTIVE.test(label)) continue;
        try {
          await buttons[i].click({ timeout: 2500 });
          btnOk += 1;
          await page.waitForTimeout(350);
          await page.keyboard.press('Escape').catch(() => {});
        } catch {
          finding('P5', 'low', 'Button did not respond to click', {
            url: page.url(),
            steps: [`Click "${label}"`],
            actual: 'Click timeout or intercepted',
          });
        }
      }
      finding('P5', 'info', `Button sample on ${sweep}`, { evidence: `${btnOk} buttons clicked without hard failure` });
    }

    // ─── PHASE 6: dedupe technical noise ───
    const uniqFailedResp = [...new Map(failedResponses.map((x) => [`${x.status}:${x.url}`, x])).values()];
    const uniqFailedReq = [...new Map(failedRequests.map((x) => [`${x.error}:${x.url}`, x])).values()];
    const uniqRuntime = [...new Set(runtimeLog)];

    for (const r of uniqFailedResp.slice(0, 40)) {
      finding('P6', r.status >= 500 ? 'high' : 'medium', `HTTP ${r.status} response`, {
        url: r.url,
        evidence: `Observed from page: ${r.from}`,
      });
    }
    for (const r of uniqFailedReq.slice(0, 25)) {
      finding('P6', 'medium', 'Request failed', {
        url: r.url,
        actual: r.error,
        evidence: `From: ${r.from}`,
      });
    }
    for (const line of uniqRuntime.slice(0, 40)) {
      finding('P6', 'low', 'Console / page JS error', { evidence: line });
    }

    // ─── PHASE 7: claims vs quick checks ───
    for (const claim of heroClaims) {
      finding('P7', 'info', 'Homepage heading (marketing claim)', { evidence: claim });
    }
    finding(
      'P7',
      'info',
      'Trader-heavy areas require auth — not fully verified without login',
      {
        expected: 'Charts, journal, reports, MT hub verified end-to-end',
        actual: email && password ? 'Partial (logged-in path attempted)' : 'Could not verify (no credentials)',
      },
    );

    // ─── Write artifacts ───
    const outDir = path.join(process.cwd(), 'e2e', 'reports');
    fs.mkdirSync(outDir, { recursive: true });
    const data = {
      base: BASE,
      generatedAt: new Date().toISOString(),
      pageNotes,
      findings: FINDINGS,
      failedResponses: uniqFailedResp,
      failedRequests: uniqFailedReq,
      runtimeErrors: uniqRuntime,
    };
    fs.writeFileSync(path.join(outDir, 'auraterminal-audit-data.json'), JSON.stringify(data, null, 2), 'utf8');

    const md = buildMarkdownReport(data, heroClaims);
    fs.writeFileSync(path.join(outDir, 'AURATERMINAL_AUDIT_REPORT.md'), md, 'utf8');

    finding('P8', 'info', 'Report written', {
      evidence: `e2e/reports/AURATERMINAL_AUDIT_REPORT.md and auraterminal-audit-data.json`,
    });

    // Soft assertion so CI sees green but file always written
    expect(visited.size).toBeGreaterThan(5);
  });
});

/**
 * @param {any} data
 * @param {string[]} heroClaims
 */
function buildMarkdownReport(data, heroClaims) {
  const lines = [];
  const f = /** @type {any[]} */ (data.findings || []);
  const bySev = (s) => f.filter((x) => x.severity === s);

  lines.push(`# Aura Terminal — Playwright live audit report`);
  lines.push('');
  lines.push(`- **Generated:** ${data.generatedAt}`);
  lines.push(`- **Base URL:** ${data.base}`);
  lines.push(`- **Pages visited (unique):** ${[...new Set((data.pageNotes || []).map((p) => p.requested))].length}`);
  lines.push('');
  lines.push(`## 1. Executive summary`);
  lines.push('');
  lines.push(
    `Automated Chromium audit visited the homepage, discovered same-origin links, hit explicit risk routes, ` +
      `sampled buttons/links on key public pages, and recorded console errors and failed network responses where captured. ` +
      `Authenticated trader workflows are **only partially covered** unless \`AUDIT_EMAIL\` and \`AUDIT_PASSWORD\` are provided.`,
  );
  lines.push('');
  lines.push(`## 2. Working features (observed)`);
  lines.push('');
  (data.pageNotes || []).slice(0, 35).forEach((p) => {
    lines.push(`- **${p.httpStatus}** ${p.finalUrl} — _${(p.title || '').slice(0, 80)}_ (${p.ms}ms)`);
  });
  lines.push('');
  lines.push(`## 3. Broken features (findings: high/critical)`);
  lines.push('');
  lines.push(...formatFindings(bySev('critical').concat(bySev('high'))));
  lines.push('');
  lines.push(`## 4. Missing features / gaps`);
  lines.push('');
  lines.push(...formatFindings(f.filter((x) => x.title?.includes('not executed') || x.severity === 'medium')));
  lines.push('');
  lines.push(`## 5. Buttons/links that do nothing (sampled)`);
  lines.push('');
  lines.push(...formatFindings(f.filter((x) => x.title?.includes('Button did not'))));
  lines.push('');
  lines.push(`## 6. Routes / redirects`);
  lines.push('');
  lines.push(`See **pageNotes** in \`e2e/reports/auraterminal-audit-data.json\` for requested vs final URL and HTTP status.`);
  lines.push('');
  lines.push(`## 7. Console errors & failed requests (captured)`);
  lines.push('');
  lines.push(`### Failed responses (4xx/5xx sample)`);
  (data.failedResponses || []).slice(0, 30).forEach((r) => lines.push(`- \`${r.status}\` ${r.url}`));
  lines.push('');
  lines.push(`### Failed requests`);
  (data.failedRequests || []).slice(0, 20).forEach((r) => lines.push(`- ${r.error}: ${r.url}`));
  lines.push('');
  lines.push(`### Runtime (console/pageerror sample)`);
  (data.runtimeErrors || []).slice(0, 25).forEach((r) => lines.push(`- ${r}`));
  lines.push('');
  lines.push(`## 8. Trader features verified`);
  lines.push('');
  lines.push(`- Public marketing and entry routes were loaded where HTTP allowed.`);
  lines.push(`- **Deep trader tools** (journal, MT connection hub, reports generation, AI chart check, surveillance) need a logged-in session to verify behavior beyond redirects.`);
  lines.push('');
  lines.push(`## 9. Trader features missing / gated / not verified`);
  lines.push('');
  lines.push(`- Anything behind \`AuthenticatedGuard\` or subscription: **not verifiable** without credentials in this run.`);
  lines.push('');
  lines.push(`## 10. Auth / account / subscription`);
  lines.push('');
  lines.push(
    f.find((x) => x.title?.includes('AUDIT_EMAIL'))
      ? `- ${/** @type {any} */ (f.find((x) => x.title?.includes('AUDIT_EMAIL'))).actual}`
      : '- See findings JSON.',
  );
  lines.push('');
  lines.push(`## 11. Marketing claims vs reality`);
  lines.push('');
  lines.push(`| Claim (homepage headings) | Status |`);
  lines.push(`|---|---|`);
  (heroClaims || []).forEach((c) => {
    lines.push(`| ${String(c).replace(/\|/g, '/').slice(0, 120)} | Could not fully verify without product depth test |`);
  });
  lines.push('');
  lines.push(`## 12. Highest-priority fixes`);
  lines.push('');
  bySev('critical')
    .concat(bySev('high'))
    .slice(0, 15)
    .forEach((x) => lines.push(`1. **${x.title}** (${x.severity}) — ${x.url || x.evidence || ''}`));
  lines.push('');
  lines.push(`## 13. Needs manual human verification`);
  lines.push('');
  lines.push(`- Payment / Stripe flows`);
  lines.push(`- MFA email delivery and code entry`);
  lines.push(`- Community real-time chat and moderation`);
  lines.push(`- MT4/MT5 investor password connection and dashboard data correctness`);
  lines.push(`- Mobile layouts and PWA install`);
  lines.push('');
  return lines.join('\n');
}

/** @param {any[]} arr */
function formatFindings(arr) {
  if (!arr.length) return ['- _None in this category._'];
  return arr.map((x) => {
    const parts = [`- **${x.severity}** ${x.title}`];
    if (x.url) parts.push(`  - URL: \`${x.url}\``);
    if (x.actual) parts.push(`  - Actual: ${x.actual}`);
    if (x.expected) parts.push(`  - Expected: ${x.expected}`);
    if (x.steps?.length) parts.push(`  - Steps: ${x.steps.join(' → ')}`);
    if (x.evidence) parts.push(`  - Evidence: ${String(x.evidence).slice(0, 400)}`);
    return parts.join('\n');
  });
}
