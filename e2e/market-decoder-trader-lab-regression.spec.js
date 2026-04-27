import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE = (
  process.env.AUDIT_BASE_URL
  || process.env.PLAYWRIGHT_BASE_URL
  || 'http://127.0.0.1:3000'
).replace(/\/$/, '');
const USER_STATE = path.join(process.cwd(), 'e2e', 'reports', 'auraterminal-normal-user.json');
const SIGNUP_CREDS = path.join(process.cwd(), 'e2e', 'reports', 'signup-credentials.txt');
const LEAKAGE_TERMS = [
  'Preferred:',
  'Bull case',
  'Bear case',
  'pivot',
  'retest',
  'stop loss',
  'entry',
  'target',
  'break above',
  'rejection below',
];

test.use({ storageState: USER_STATE });
test.setTimeout(180000);

test.describe('Market Decoder -> Trader Lab regression', () => {
  const readSignupCredentials = () => {
    if (!fs.existsSync(SIGNUP_CREDS)) return null;
    const out = {};
    for (const line of fs.readFileSync(SIGNUP_CREDS, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) out[m[1]] = m[2];
    }
    if (!out.EMAIL || !out.PASSWORD) return null;
    return { email: out.EMAIL, password: out.PASSWORD };
  };

  const dismissConsentIfPresent = async (page) => {
    const agree = page.getByRole('button', { name: /i agree|accept|allow|got it|dismiss/i }).first();
    if (await agree.isVisible().catch(() => false)) {
      await agree.click({ timeout: 5000 }).catch(() => {});
    }
  };

  const ensureAuthenticated = async (page) => {
    await dismissConsentIfPresent(page);
    const onLogin = /\/login(\?|$)/i.test(page.url())
      || await page.getByRole('heading', { name: /sign in/i }).first().isVisible().catch(() => false);
    if (!onLogin) return;
    const creds = readSignupCredentials();
    if (!creds) throw new Error('Missing signup credentials for auth refresh');
    const emailInput = page.getByLabel(/email or username|email/i).first();
    const passwordInput = page.getByLabel(/password/i).first();
    await emailInput.fill(creds.email);
    await passwordInput.fill(creds.password);
    await page.getByRole('button', { name: /login|sign in/i }).first().click();
    await page.waitForURL(/\/(trader-deck|community|dashboard|home|messages)/i, { timeout: 30000 }).catch(() => {});
    await dismissConsentIfPresent(page);
    const stillOnLogin = /\/login(\?|$)/i.test(page.url())
      || await page.getByRole('heading', { name: /sign in/i }).first().isVisible().catch(() => false);
    if (stillOnLogin) {
      const headingSnapshot = await page.locator('h1, h2, h3').allInnerTexts().catch(() => []);
      const bodySnapshot = await page.locator('body').innerText().catch(() => '');
      const debugInfo = {
        currentUrl: page.url(),
        visibleHeadingText: Array.isArray(headingSnapshot) ? headingSnapshot.join(' | ').slice(0, 600) : '',
        visibleTextSnapshot: String(bodySnapshot || '').slice(0, 900),
        signupCredentialsExists: fs.existsSync(SIGNUP_CREDS),
        normalUserStateExists: fs.existsSync(USER_STATE),
      };
      throw new Error(
        `Auth setup invalid: could not reach authenticated Trader Deck route after login attempt\n` +
        `Debug: ${JSON.stringify(debugInfo, null, 2)}`
      );
    }
  };

  test('export, save, reload keeps decoder export integrity', async ({ page }) => {
    const gotoMarketDecoder = async () => {
      const candidates = [
        '/trader-deck/market-decoder',
        '/trader-deck?tab=intelligence&mode=decoder',
        '/trader-deck',
      ];
      for (const route of candidates) {
        await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
        await ensureAuthenticated(page);
        const hasDecoderShell = await page.locator('.md-ref-title', { hasText: /market decoder/i }).first().isVisible().catch(() => false);
        if (hasDecoderShell) return;
      }
      await page.goto(`${BASE}/trader-deck`, { waitUntil: 'domcontentloaded' });
      await ensureAuthenticated(page);
      const openDecoderCandidates = [
        page.getByRole('button', { name: /market decoder/i }).first(),
        page.locator('button:has-text("Market Decoder")').first(),
        page.locator('[aria-label*="Market decoder"] button').first(),
      ];
      for (const candidate of openDecoderCandidates) {
        if (await candidate.isVisible().catch(() => false)) {
          await candidate.click({ force: true });
          break;
        }
      }
      await expect(page.locator('.md-ref-title', { hasText: /market decoder/i }).first()).toBeVisible({ timeout: 30000 });
    };

    const resolveActionButton = async (kind) => {
      const patterns = {
        decode: /decode|run decoder|analyze|generate/i,
        export: /export|send to trader lab|open trader lab/i,
        save: /save lab|save/i,
      };
      const pattern = patterns[kind];
      const candidates = [
        page.getByTestId?.(`market-decoder-${kind}-button`) ?? page.locator('__never__'),
        page.getByRole('button', { name: pattern }).first(),
        page.locator(`button:has-text("${kind === 'decode' ? 'Decode' : kind === 'export' ? 'Export' : 'Save lab'}")`).first(),
        page.locator('button').filter({ hasText: pattern }).first(),
      ];
      for (const candidate of candidates) {
        if (await candidate.isVisible().catch(() => false)) return candidate;
      }
      throw new Error(`Could not find ${kind} action button`);
    };

    const consoleErrors = [];
    const backend500s = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('response', (res) => {
      if (res.url().includes('/api/') && res.status() >= 500) {
        backend500s.push(`${res.status()} ${res.url()}`);
      }
    });

    const mockedBrief = {
      header: { asset: 'EURUSD', price: 1.0854, marketType: 'FX', changePercent: 0.24 },
      instrument: { canonical: 'EURUSD', display: 'EURUSD' },
      meta: { generatedAt: '2026-04-27T10:30:00.000Z', canonicalSymbol: 'EURUSD' },
      instantRead: {
        bias: 'Bullish',
        conviction: 'Medium',
        tradingCondition: 'Trend',
        bestApproach: 'Buy pullbacks while macro backdrop stays supportive.',
      },
      finalOutput: {
        currentPosture: 'SELECTIVE LONGS',
        postureSubtitle: 'Macro tailwind with event risk control',
        reason: 'Macro and policy differentials still support EURUSD upside.',
        whatWouldChangeThis: 'A sharp hawkish repricing in Fed expectations.',
      },
      whatMattersNow: [
        { label: 'Macro driver', text: 'Euro area growth stabilization while US data cools on the margin.' },
        { label: 'Technical driver', text: 'Higher-low sequence remains intact above weekly demand.' },
        { label: 'Immediate risk/event', text: 'Upcoming CPI and central bank speakers can shift rate expectations.' },
      ],
      keyLevels: {
        resistance1: 1.0912,
        resistance2: 1.0958,
        support1: 1.0798,
        support2: 1.0745,
        pivot: 1.0847,
        keyLevelsDisplay: {
          resistance1: '1.0912',
          support1: '1.0798',
        },
      },
      scenarioMap: {
        bullish: { condition: 'Sustained bid with macro support through high-impact data.' },
        bearish: { condition: 'Macro surprise flips policy differential against EUR.' },
        noTrade: { when: 'Event volatility without directional follow-through.' },
      },
      executionGuidance: {
        preferredDirection: 'Selective Long',
        entryCondition: 'Wait for confirmation candle after pullback into demand.',
        invalidation: 'Thesis fails if macro repricing flips to USD-positive shock.',
        riskConsideration: 'Cut risk ahead of high-impact data windows.',
        avoidThis: 'Do not chase thin-liquidity spikes.',
      },
      marketPulse: {
        signalBrief: 'Macro regime mildly EUR-supportive while risk sentiment remains constructive.',
      },
      technicalAnalysis:
        'Trend remains constructive with higher-lows and momentum support; confirmation is required at demand.',
      fundamentalAnalysis:
        'ECB/Fed policy divergence, inflation trend moderation, and upcoming macro prints support a cautious EURUSD long bias.',
      keyDrivers: [
        {
          title: 'Policy expectations',
          impact: 'High',
          direction: 'EUR supportive',
          explanation: 'Relative rate expectations have shifted away from peak USD strength.',
        },
        {
          title: 'Economic data path',
          impact: 'Medium',
          direction: 'Two-way',
          explanation: 'CPI and labor releases can alter front-end yield spreads quickly.',
        },
      ],
      traderThesis: {
        whatToSee: 'Constructive pullback structure with macro tone unchanged.',
        whyValid: 'Macro/policy context still supports upside continuation.',
        whatConfirmsEntry: 'Bullish confirmation after pullback and event-risk check.',
      },
      riskSummary: {
        newsRisk: 'Moderate around CPI headlines',
        volatilityRisk: 'Moderate',
        eventRisk: 'Elevated around scheduled releases',
      },
      confirmation: 'Bullish confirmation candle after pullback and stable macro tone.',
      invalidation: 'Unexpected hawkish USD repricing invalidates the setup.',
      fundamentals: {
        macroBackdrop: 'Euro area activity stabilizing while US growth momentum cools.',
        centralBankPolicy: 'ECB/Fed differential is less USD-supportive than prior quarter.',
        economicData: 'CPI and labor data remain the immediate policy catalysts.',
        geopoliticalContext: 'No major escalation currently repricing risk premium.',
        crossAssetContext: 'Rates and USD index behavior remain primary transmission channels.',
        fundamentalBacking:
          'Macro backdrop: ECB/Fed policy differential narrowing.\nPolicy context: rates repricing less USD-supportive.\nData context: CPI/labor releases can reinforce or weaken EUR bid.',
      },
    };

    await page.route('**/api/trader-deck/market-decoder-symbols**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          suggestions: [{ symbol: 'EURUSD', label: 'EUR/USD' }],
        }),
      });
    });
    await page.route('**/api/trader-deck/market-decoder**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          brief: mockedBrief,
          cached: false,
          cacheTtlSec: 600,
        }),
      });
    });

    await gotoMarketDecoder();

    const decodeButton = await resolveActionButton('decode');
    await expect(decodeButton).toBeVisible({ timeout: 30000 });
    await decodeButton.click();

    const exportButton = await resolveActionButton('export');
    await expect(exportButton).toBeVisible({ timeout: 30000 });
    await exportButton.click();

    await page.waitForURL(/\/trader-deck\/trade-validator\/trader-lab/i, { timeout: 30000 });

    const fundamentalBox = page.getByLabel('Fundamental backing');
    await expect(fundamentalBox).toBeVisible({ timeout: 20000 });
    const fundamentalText = await fundamentalBox.inputValue();
    expect(fundamentalText.trim().length).toBeGreaterThan(0);
    for (const term of LEAKAGE_TERMS) {
      expect(fundamentalText.toLowerCase()).not.toContain(term.toLowerCase());
    }

    const thesisConfirm = page.locator('#tl-thesis-whatConfirmsEntry');
    await expect(thesisConfirm).toBeVisible();
    const thesisConfirmText = (await thesisConfirm.inputValue()).toLowerCase();
    expect(thesisConfirmText).toContain('confirmation');

    const whatSee = page.locator('#tl-thesis-whatDoISee');
    await expect(whatSee).toBeVisible();
    expect((await whatSee.inputValue()).trim().length).toBeGreaterThan(0);

    const saveResponsePromise = page.waitForResponse(
      (res) =>
        /\/api\/trader-lab\/sessions(\/[a-f0-9-]{36})?$/.test(res.url()) &&
        ['POST', 'PUT'].includes(res.request().method()),
      { timeout: 30000 }
    );
    const saveButton = await resolveActionButton('save');
    await saveButton.click();
    const saveResponse = await saveResponsePromise;
    expect(saveResponse.ok()).toBeTruthy();
    const saved = await saveResponse.json();
    expect(saved?.session?.decoderExport).toBeTruthy();
    expect(saved?.session?.decoderExport?.fundamentals?.fundamentalBacking).toBeTruthy();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(fundamentalBox).toBeVisible({ timeout: 20000 });
    const reloadedFundamentalText = await fundamentalBox.inputValue();
    expect(reloadedFundamentalText.trim().length).toBeGreaterThan(0);
    for (const term of LEAKAGE_TERMS) {
      expect(reloadedFundamentalText.toLowerCase()).not.toContain(term.toLowerCase());
    }

    const sessionsRes = await page.request.get(`${BASE}/api/trader-lab/sessions`, { failOnStatusCode: false });
    expect(sessionsRes.status()).toBeLessThan(500);
    const sessionsBody = await sessionsRes.json().catch(() => ({}));
    const firstSession = Array.isArray(sessionsBody?.sessions) ? sessionsBody.sessions[0] : null;
    expect(firstSession?.decoderExport).toBeTruthy();

    expect(consoleErrors).toEqual([]);
    expect(backend500s).toEqual([]);
  });
});
