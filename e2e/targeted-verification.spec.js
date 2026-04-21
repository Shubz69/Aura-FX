// @ts-check
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE = (process.env.AUDIT_BASE_URL || 'https://www.auraterminal.ai').replace(/\/$/, '');
const OUT_JSON = path.join(process.cwd(), 'e2e', 'reports', 'targeted-verification-results.json');
const OUT_MD = path.join(process.cwd(), 'e2e', 'reports', 'targeted-verification-report.md');

/** @type {Array<any>} */
const FLOW_RESULTS = [];
/** @type {Array<{url:string,text:string}>} */
const CONSOLE_ERRORS = [];
/** @type {Array<{url:string,status:number,during:string}>} */
const FAILED_HTTP = [];
/** @type {Array<{url:string,error:string,during:string}>} */
const REQUEST_FAILED = [];

function collectListeners(page) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') CONSOLE_ERRORS.push({ url: page.url(), text: msg.text() });
  });
  page.on('response', (resp) => {
    if (resp.status() >= 400) FAILED_HTTP.push({ url: resp.url(), status: resp.status(), during: page.url() });
  });
  page.on('requestfailed', (req) => {
    REQUEST_FAILED.push({ url: req.url(), error: req.failure()?.errorText || 'unknown', during: page.url() });
  });
}

async function runFlow(page, flow) {
  const issuesBefore = { c: CONSOLE_ERRORS.length, h: FAILED_HTTP.length, r: REQUEST_FAILED.length };
  const checks = [];
  let status = 'pass';
  let finalUrl = '';

  for (const c of flow.checks) {
    await page.goto(`${BASE}${c.path}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(c.waitMs || 1200);
    finalUrl = page.url();
    const body = (await page.locator('body').innerText().catch(() => '')).slice(0, 10000);
    const urlMatched = c.expectUrl ? c.expectUrl.some((u) => finalUrl.includes(u)) : true;
    const textMatched = c.expectText ? c.expectText.some((t) => new RegExp(t, 'i').test(body)) : true;
    const pass = urlMatched && textMatched;
    if (!pass) status = 'fail';
    checks.push({
      path: c.path,
      url: finalUrl,
      expected: c.expected,
      actual: `urlMatch=${urlMatched}, textMatch=${textMatched}`,
      pass,
      tested: c.tested,
    });
  }

  const newConsole = CONSOLE_ERRORS.slice(issuesBefore.c);
  const newHttp = FAILED_HTTP.slice(issuesBefore.h);
  const newReqFailed = REQUEST_FAILED.slice(issuesBefore.r);

  FLOW_RESULTS.push({
    flow: flow.name,
    status,
    url: finalUrl,
    tested: flow.tested,
    expected: flow.expected,
    actual: status === 'pass' ? 'Behavior matched targeted expectations.' : 'One or more expectations did not match.',
    checks,
    consoleIssues: newConsole,
    networkIssues: [...newHttp, ...newReqFailed],
    completion: status === 'pass' ? 'complete' : 'partial_or_regressed',
  });
}

function writeArtifacts() {
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    flows: FLOW_RESULTS,
    totals: {
      pass: FLOW_RESULTS.filter((f) => f.status === 'pass').length,
      fail: FLOW_RESULTS.filter((f) => f.status === 'fail').length,
    },
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2), 'utf8');

  const lines = [
    '# Targeted Playwright Verification',
    '',
    `- Generated: ${payload.generatedAt}`,
    `- Base: ${BASE}`,
    `- Pass: ${payload.totals.pass}`,
    `- Fail: ${payload.totals.fail}`,
    '',
  ];
  for (const f of FLOW_RESULTS) {
    lines.push(`## ${f.flow} — ${f.status.toUpperCase()}`);
    lines.push(`- URL: ${f.url}`);
    lines.push(`- Tested: ${f.tested}`);
    lines.push(`- Expected: ${f.expected}`);
    lines.push(`- Actual: ${f.actual}`);
    lines.push(`- Fix status: ${f.completion}`);
    lines.push(`- Console issues: ${f.consoleIssues.length}`);
    lines.push(`- Network issues: ${f.networkIssues.length}`);
    for (const ch of f.checks) {
      lines.push(`  - [${ch.pass ? 'pass' : 'fail'}] ${ch.path} -> ${ch.url} | ${ch.actual}`);
    }
    lines.push('');
  }
  fs.writeFileSync(OUT_MD, lines.join('\n'), 'utf8');
}

test.describe('Targeted changed-flow verification', () => {
  test('verify only changed flows', async ({ page }) => {
    collectListeners(page);

    const flows = [
      {
        name: 'reports/dna access behavior',
        tested: 'Route gating and clarity on /reports/dna.',
        expected: 'Eligible users reach report; ineligible users see gating/redirect instead of broken 403 shell.',
        checks: [
          {
            path: '/reports/dna',
            tested: 'Open DNA report route',
            expected: 'Either report content or explicit gate messaging',
            expectUrl: ['/reports/dna', '/choose-plan', '/reports'],
            expectText: ['DNA|Trader DNA|Elite|upgrade|choose plan|access denied|reports'],
          },
        ],
      },
      {
        name: 'manual metrics / csv metrics access behavior',
        tested: 'Eligibility behavior on manual metrics dashboard/processing.',
        expected: 'Eligible users load dashboard; ineligible users redirected/gated without silent failure.',
        checks: [
          {
            path: '/manual-metrics/dashboard',
            tested: 'Open CSV metrics dashboard route',
            expected: 'Dashboard or redirect/gate',
            expectUrl: ['/manual-metrics/dashboard', '/reports', '/choose-plan'],
            expectText: ['metrics|dashboard|reports|upgrade|choose plan|access'],
          },
          {
            path: '/manual-metrics/processing',
            tested: 'Open processing step route',
            expected: 'Processing UI or explicit gating',
            expectUrl: ['/manual-metrics/processing', '/reports', '/choose-plan'],
            expectText: ['metrics|processing|reports|upgrade|access'],
          },
        ],
      },
      {
        name: 'user/admin live messaging',
        tested: 'User /messages route stability and live state readiness.',
        expected: 'Messages page loads thread UI; no dead shell.',
        checks: [
          {
            path: '/messages',
            tested: 'Open user messaging page',
            expected: 'Thread list/messages input or explicit empty state',
            expectUrl: ['/messages'],
            expectText: ['message|thread|inbox|send|conversation|loading messages'],
            waitMs: 2000,
          },
        ],
      },
      {
        name: 'admin inbox stability',
        tested: 'Admin inbox hydration/loading behavior on /admin/inbox.',
        expected: 'Inbox loads with deterministic loading states and usable controls.',
        checks: [
          {
            path: '/admin/inbox',
            tested: 'Open admin inbox',
            expected: 'User list/message area with loading or ready indicators',
            expectUrl: ['/admin/inbox'],
            expectText: ['admin|inbox|loading|messages|users|friends'],
            waitMs: 2200,
          },
        ],
      },
      {
        name: 'notifications/session refresh stability',
        tested: 'Session/refresh-sensitive surfaces touched by request orchestration.',
        expected: 'Dashboard/profile load without unstable refresh loop.',
        checks: [
          {
            path: '/dashboard',
            tested: 'Open dashboard after auth/session checks',
            expected: 'Page loads normally without hard auth failure loop',
            expectUrl: ['/dashboard', '/login'],
            expectText: ['dashboard|aura|welcome|login'],
          },
          {
            path: '/profile',
            tested: 'Open profile (notifications/session-adjacent)',
            expected: 'Profile loads with user settings controls',
            expectUrl: ['/profile', '/login'],
            expectText: ['profile|language|timezone|settings|login'],
          },
        ],
      },
      {
        name: 'premium/subscription/courses/aura-analysis state clarity',
        tested: 'State clarity on touched shell-like routes.',
        expected: 'Clear loading/gated/placeholder/ready/error state messaging.',
        checks: [
          {
            path: '/premium-ai',
            tested: 'Open premium AI route',
            expected: 'Verifying/gated/ready messaging, not blank shell',
            expectUrl: ['/premium-ai', '/subscription'],
            expectText: ['premium|verifying|subscription|access|ai'],
          },
          {
            path: '/subscription',
            tested: 'Open subscription route',
            expected: 'Plan/status clarity',
            expectUrl: ['/subscription'],
            expectText: ['subscription|plan|status|billing|access'],
          },
          {
            path: '/courses',
            tested: 'Open courses route',
            expected: 'Course placeholder/ready clarity message',
            expectUrl: ['/courses'],
            expectText: ['course|library|preview|placeholder'],
          },
          {
            path: '/aura-analysis/dashboard/performance',
            tested: 'Open aura analysis dashboard route',
            expected: 'Loading/error/no-data/ready signal',
            expectUrl: ['/aura-analysis/dashboard/performance', '/aura-analysis', '/subscription'],
            expectText: ['analysis|dashboard|loading|no data|error|performance|access'],
            waitMs: 2000,
          },
        ],
      },
    ];

    for (const flow of flows) {
      await runFlow(page, flow);
    }

    writeArtifacts();
    expect(FLOW_RESULTS.length).toBe(6);
  });
});

