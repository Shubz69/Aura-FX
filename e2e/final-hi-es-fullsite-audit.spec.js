import { test, expect } from '@playwright/test';
import fs from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const ARTIFACT_ROOT = path.join(process.cwd(), 'e2e', 'artifacts', 'final-hi-es-fullsite-audit');
const BASE = (process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const SRC_ADMIN_STATE = path.join(process.cwd(), 'e2e', 'reports', 'auraterminal-admin.json');
const LOCAL_STATE = path.join(tmpdir(), 'aura-final-hi-es-admin-storage.json');

const ROUTES = [
  { id: 'login', path: '/login' },
  { id: 'signup', path: '/signup' },
  { id: 'home', path: '/' },
  { id: 'profile', path: '/profile' },
  { id: 'community', path: '/community' },
  { id: 'trader-deck', path: '/trader-deck' },
  { id: 'journal', path: '/journal' },
  { id: 'leaderboard', path: '/leaderboard' },
  { id: 'pipeline-monitor', path: '/admin/pipeline-health' },
  { id: 'trader-lab', path: '/trader-deck/trade-validator/trader-lab' },
  { id: 'trader-playbook', path: '/trader-deck/trade-validator/trader-playbook' },
  { id: 'trade-validator', path: '/trader-deck/trade-validator/checklist' },
  { id: 'surveillance', path: '/surveillance' },
  { id: 'operator-intelligence', path: '/operator-intelligence' },
  { id: 'aura-analysis', path: '/aura-analysis/dashboard/overview' },
  { id: 'performance-dna', path: '/reports/dna' },
  { id: 'settings', path: '/settings' },
  { id: 'admin', path: '/admin' },
];

const ALLOWED_PATTERNS = [
  /\bAura\b/i,
  /\bAURA\b/,
  /\bTM\b/,
  /\bFX\b/,
  /\bPnL\b/i,
  /\bSL\b/,
  /\bTP\b/,
  /\bLong\b/,
  /\bShort\b/,
  /\bBreakout\b/i,
  /\bLiquidity\b/i,
  /\bOrder flow\b/i,
  /\bEURUSD|GBPUSD|USDJPY|XAUUSD|BTCUSD|SPY\b/i,
  /\bAPI\b/,
  /\bURL\b/,
  /\bHTTP\b/i,
  /\bAdmin\b/i,
  /\bGoogle Cloud\b/i,
];

function classifyVisibleEnglish(bodyText) {
  const lines = String(bodyText || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const englishLike = lines
    .filter((line) => /[A-Za-z]{3,}/.test(line))
    .slice(0, 250);

  const allowed = [];
  const fixCandidates = [];

  for (const line of englishLike) {
    if (ALLOWED_PATTERNS.some((re) => re.test(line))) {
      allowed.push(line);
    } else {
      fixCandidates.push(line);
    }
  }

  return {
    allowed: [...new Set(allowed)].slice(0, 120),
    fixCandidates: [...new Set(fixCandidates)].slice(0, 120),
  };
}

function ensureAuthStateForLocalhost() {
  if (!fs.existsSync(SRC_ADMIN_STATE)) return false;
  const raw = JSON.parse(fs.readFileSync(SRC_ADMIN_STATE, 'utf8'));
  if (Array.isArray(raw.origins)) {
    raw.origins = raw.origins.map((o) => ({ ...o, origin: BASE }));
  }
  fs.writeFileSync(LOCAL_STATE, JSON.stringify(raw), 'utf8');
  return true;
}

const hasAuthState = ensureAuthStateForLocalhost();
if (hasAuthState) {
  // eslint-disable-next-line no-empty-pattern
  test.use({ storageState: LOCAL_STATE });
}

async function captureRouteAudit(page, language, route) {
  const routeDir = path.join(ARTIFACT_ROOT, language);
  fs.mkdirSync(routeDir, { recursive: true });

  await page.goto(route.path, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const consentBtn = page.getByRole('button', { name: /मैं सहमत हूँ|Estoy de acuerdo|I agree|I Agree/i }).first();
  if (await consentBtn.count()) {
    await consentBtn.click({ timeout: 2000 }).catch(() => {});
  }
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1200);

  const pngPath = path.join(routeDir, `${route.id}.png`);
  const txtPath = path.join(routeDir, `${route.id}.txt`);
  const reviewPath = path.join(routeDir, `${route.id}.english-review.json`);

  await page.screenshot({ path: pngPath, fullPage: true });
  const bodyText = await page.evaluate(() => document.body?.innerText || '');
  fs.writeFileSync(txtPath, bodyText.slice(0, 120000), 'utf8');

  const review = classifyVisibleEnglish(bodyText);
  fs.writeFileSync(
    reviewPath,
    JSON.stringify(
      {
        route: route.path,
        language,
        allowedVisibleEnglish: review.allowed,
        fixCandidates: review.fixCandidates,
      },
      null,
      2,
    ),
    'utf8',
  );
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(600000);

for (const language of ['hi', 'es']) {
  test(`final full-site ${language} visual/text proof pass`, async ({ page }) => {
    await page.addInitScript(
      ({ lang }) => {
        try {
          localStorage.setItem('aura_site_language_pref', lang);
        } catch (e) {
          // no-op in audit bootstrap
        }
      },
      { lang: language },
    );

    for (const route of ROUTES) {
      await captureRouteAudit(page, language, route);
    }

    await expect(page.locator('html')).toHaveAttribute('lang', language);
  });
}

