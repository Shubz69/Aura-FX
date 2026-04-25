// @ts-check
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE = (process.env.AUDIT_BASE_URL || 'https://www.auraterminal.ai').replace(/\/$/, '');
const ADMIN_STATE = path.join(process.cwd(), 'e2e', 'reports', 'auraterminal-admin.json');
const USER_STATE = path.join(process.cwd(), 'e2e', 'reports', 'auraterminal-normal-user.json');
const SIGNUP_CREDS = path.join(process.cwd(), 'e2e', 'reports', 'signup-credentials.txt');
const REPORT_MD = path.join(process.cwd(), 'e2e', 'reports', 'REALTIME_LATENCY_AND_CONCURRENCY_REPORT.md');
const REPORT_JSON = path.join(process.cwd(), 'e2e', 'reports', 'realtime-latency-and-concurrency-report.json');

function readOriginLocalStorage(statePath, originUrl) {
  const raw = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const origin = (raw?.origins || []).find((o) => o.origin === originUrl) || (raw?.origins || [])[0];
  return origin?.localStorage || [];
}

function readSignupCredentials() {
  if (!fs.existsSync(SIGNUP_CREDS)) return null;
  const raw = fs.readFileSync(SIGNUP_CREDS, 'utf8');
  const kv = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (!m) continue;
    kv[m[1]] = m[2];
  }
  if (!kv.EMAIL || !kv.PASSWORD) return null;
  return { email: kv.EMAIL, password: kv.PASSWORD };
}

function isUserStateLikelyExpired() {
  try {
    const ls = readOriginLocalStorage(USER_STATE, BASE);
    const token = ls.find((x) => x.name === 'token')?.value;
    if (!token) return true;
    const payload = JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    const expMs = Number(payload?.exp || 0) * 1000;
    return !expMs || Date.now() >= expMs - 30_000;
  } catch {
    return true;
  }
}

function readNormalUserIdFromState() {
  const ls = readOriginLocalStorage(USER_STATE, BASE);
  const userEntry = ls.find((x) => x.name === 'user');
  const userObj = userEntry?.value ? JSON.parse(userEntry.value) : null;
  const id = userObj?.id != null ? String(userObj.id) : '';
  if (!id) throw new Error('Could not read normal-user id from storage state');
  return id;
}

function readNormalUserTokenFromState() {
  const ls = readOriginLocalStorage(USER_STATE, BASE);
  return ls.find((x) => x.name === 'token')?.value || '';
}

function stats(values) {
  if (!values.length) return { min: null, median: null, p95: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  const pick = (p) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
  return { min: sorted[0], median: pick(0.5), p95: pick(0.95), max: sorted[sorted.length - 1] };
}

async function dismissConsentIfPresent(page) {
  const backdrop = page.locator('.gdpr-backdrop');
  if (!(await backdrop.isVisible().catch(() => false))) return;
  const consent = page
    .locator('button:has-text("Accept"), button:has-text("Agree"), button:has-text("Allow"), button:has-text("Got it"), button:has-text("Dismiss")')
    .first();
  if (await consent.isVisible().catch(() => false)) await consent.click({ timeout: 5000 }).catch(() => {});
}

function isNonPostableChannelLabel(label) {
  const t = String(label || '').trim().toLowerCase();
  if (!t) return true;
  return t === 'welcome' || t.startsWith('announcement') || t === 'levels' || t.includes('notification') || /\brules?\b/.test(t);
}

function channelTryOrder(labels) {
  const entries = labels.map((label, index) => ({ index, label: String(label || '').trim(), t: String(label || '').trim().toLowerCase() }));
  const safe = entries.filter((e) => !isNonPostableChannelLabel(e.label));
  safe.sort((a, b) => (a.t === 'general' ? -1 : b.t === 'general' ? 1 : a.t.localeCompare(b.t)));
  return safe;
}

function extractThreadIdFromUrl(url) {
  const m = String(url || '').match(/\/api\/messages\/threads\/(\d+)/i);
  return m?.[1] || null;
}

async function waitVisible(locator, timeout = 15000) {
  try {
    await locator.first().waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

async function rehydrateAuthFromState(page, statePath) {
  const ls = readOriginLocalStorage(statePath, BASE);
  if (!ls.length) return;
  await page.addInitScript((items) => {
    for (const item of items) {
      try { localStorage.setItem(item.name, item.value); } catch (_) { /* ignore */ }
    }
  }, ls);
}

async function ensureMessagesComposerReady(page) {
  const input = page.locator('.message-input, .message-input-form input[type="text"]').first();
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await page.goto(`${BASE}/messages`, { waitUntil: 'domcontentloaded' });
    await dismissConsentIfPresent(page);
    await page.waitForURL(/\/messages(?:\?|$)/i, { timeout: 15000 }).catch(() => {});
    await page.locator('.messages-page-container').first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
    const visible = await input.isVisible().catch(() => false);
    if (visible) {
      await expect(input).toBeEnabled({ timeout: 15000 });
      return input;
    }
    const authGate = page.locator('input[type="password"], input[name="password"], button:has-text("Login")').first();
    if (await authGate.isVisible().catch(() => false)) {
      if (attempt === 1) {
        await rehydrateAuthFromState(page, USER_STATE);
        const creds = readSignupCredentials();
        if (creds) {
          await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
          await dismissConsentIfPresent(page);
          await page.locator('input[type="email"], input[name="email"]').first().fill(creds.email, { timeout: 10000 }).catch(() => {});
          await page.locator('input[type="password"], input[name="password"]').first().fill(creds.password, { timeout: 10000 }).catch(() => {});
          await page.locator('button:has-text("Login"), button:has-text("Sign In"), button[type="submit"]').first().click({ timeout: 10000 }).catch(() => {});
          await page.waitForTimeout(1500);
        }
        continue;
      }
      return null;
    }
  }
  return null;
}

async function ensureCommunityComposerReady(page, channelNameLocator) {
  await channelNameLocator.click({ timeout: 8000, force: true });
  const composer = page.locator('#community-message-input').first();
  await composer.waitFor({ state: 'visible', timeout: 20000 });
  return composer;
}

async function ensureCommunityChannelsVisible(page) {
  const creds = readSignupCredentials();
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await page.goto(`${BASE}/community`, { waitUntil: 'domcontentloaded' });
    await dismissConsentIfPresent(page);
    const authGate = page.locator('input[type="password"], input[name="password"], button:has-text("Login")').first();
    if (await authGate.isVisible().catch(() => false)) {
      if (creds) {
        await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
        await dismissConsentIfPresent(page);
        await page.locator('input[type="email"], input[name="email"]').first().fill(creds.email, { timeout: 10000 }).catch(() => {});
        await page.locator('input[type="password"], input[name="password"]').first().fill(creds.password, { timeout: 10000 }).catch(() => {});
        await page.locator('button:has-text("Login"), button:has-text("Sign In"), button[type="submit"]').first().click({ timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(1500);
        continue;
      }
      throw new Error('Community page is unauthenticated (login gate visible).');
    }
    const channelsSection = page.locator('.channels-section').first();
    if (await channelsSection.isVisible().catch(() => false)) return channelsSection;
    const mobileToggle = page.locator('button[aria-label*="channel" i], button[aria-label*="menu" i], .mobile-sidebar-toggle, .sidebar-toggle').first();
    if (await mobileToggle.isVisible().catch(() => false)) {
      await mobileToggle.click({ timeout: 5000 }).catch(() => {});
    }
    if (await channelsSection.isVisible().catch(() => false)) return channelsSection;
    await channelsSection.waitFor({ state: 'visible', timeout: 12000 }).catch(() => {});
    if (await channelsSection.isVisible().catch(() => false)) return channelsSection;
  }
  throw new Error('Community channels list did not become visible.');
}

async function refreshNormalUserStateIfNeeded(browser) {
  if (!isUserStateLikelyExpired()) return { refreshed: false, valid: true };
  const creds = readSignupCredentials();
  if (!creds) return { refreshed: false, valid: false };
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await dismissConsentIfPresent(page);
    await page.locator('input[type="email"], input[name="email"]').first().fill(creds.email, { timeout: 15000 });
    await page.locator('input[type="password"], input[name="password"]').first().fill(creds.password, { timeout: 15000 });
    await page.locator('button:has-text("Login"), button:has-text("Sign In"), button[type="submit"]').first().click({ timeout: 15000 });
    await page.waitForURL(/\/(messages|community|dashboard|home)/i, { timeout: 30000 }).catch(() => {});
    await ctx.storageState({ path: USER_STATE });
    return { refreshed: true, valid: true };
  } catch {
    return { refreshed: false, valid: false };
  } finally {
    await ctx.close();
  }
}

async function pickWritableCommunityChannel(page, namesLocator, preferredOrder) {
  for (const item of preferredOrder) {
    const candidate = namesLocator.nth(item.index);
    const composer = await ensureCommunityComposerReady(page, candidate);
    const enabled = await composer.isEnabled().catch(() => false);
    if (enabled) {
      await expect(composer).toBeEnabled({ timeout: 5000 });
      return { chosen: item, composer };
    }
  }
  throw new Error('No writable community channel found for this user.');
}

async function forceSelectChannelById(page, channelId, fallbackLabel = '') {
  if (!channelId) return false;
  await page.goto(`${BASE}/community/${encodeURIComponent(channelId)}`, { waitUntil: 'domcontentloaded' });
  await dismissConsentIfPresent(page);
  const onChannel = () => {
    const p = new URL(page.url()).pathname || '';
    return p.endsWith(`/${channelId}`);
  };
  if (onChannel()) return true;
  const byHref = page.locator(`a[href*="/community/${channelId}"], [href*="/community/${channelId}"]`).first();
  if (await byHref.isVisible().catch(() => false)) {
    await byHref.click({ timeout: 8000, force: true }).catch(() => {});
    await page.waitForTimeout(500);
    if (onChannel()) return true;
  }
  const byData = page.locator(`[data-channel-id="${channelId}"], [data-id="${channelId}"]`).first();
  if (await byData.isVisible().catch(() => false)) {
    await byData.click({ timeout: 8000, force: true }).catch(() => {});
    await page.waitForTimeout(500);
    if (onChannel()) return true;
  }
  if (fallbackLabel) {
    const byLabel = page.locator('.channels-section li').filter({ hasText: fallbackLabel }).first();
    if (await byLabel.isVisible().catch(() => false)) {
      await byLabel.click({ timeout: 8000, force: true }).catch(() => {});
      await page.waitForTimeout(500);
    }
  }
  return onChannel();
}

function extractChannelIdFromPathname(urlString) {
  try {
    const p = new URL(urlString).pathname || '';
    const parts = p.split('/').filter(Boolean);
    if (parts[0] !== 'community') return '';
    return parts[1] || '';
  } catch {
    return '';
  }
}

async function getVisibleSelectedChannelName(page) {
  const activeName = page.locator(
    '.channels-section li.active .channel-name, .channels-section li.selected .channel-name, .channels-section li[aria-current="page"] .channel-name'
  ).first();
  if (await activeName.isVisible().catch(() => false)) {
    return (await activeName.innerText().catch(() => '')).trim();
  }
  const title = page.locator('.chat-header .channel-name, .chat-header h2, .chat-header h3').first();
  if (await title.isVisible().catch(() => false)) {
    return (await title.innerText().catch(() => '')).replace(/^#/, '').trim();
  }
  return '';
}

test.describe('Realtime latency + concurrency validation', () => {
  test.setTimeout(900000);

  test('bounded latency and concurrency checks', async ({ browser }) => {
    if (!fs.existsSync(ADMIN_STATE)) throw new Error(`Missing admin state: ${ADMIN_STATE}`);
    if (!fs.existsSync(USER_STATE)) throw new Error(`Missing user state: ${USER_STATE}`);

    const userStateStatus = await refreshNormalUserStateIfNeeded(browser);
    const adminCtx = await browser.newContext({ storageState: ADMIN_STATE });
    const userCtx = await browser.newContext({ storageState: USER_STATE });
    const adminPage = await adminCtx.newPage();
    const userPage = await userCtx.newPage();

    /** @type {Array<any>} */
    const apiIssues = [];
    /** @type {{ phase: string, community: { getNoCursor:number[], getAfterId:number[], post:number[], reloadGet:number[], pollingGet:number[] }, headers: Array<any> }} */
    const communityDiag = {
      phase: 'init',
      community: { getNoCursor: [], getAfterId: [], post: [], reloadGet: [], pollingGet: [] },
      headers: []
    };
    const reqStartedAt = new Map();
    const observe = (page) => {
      page.on('request', (req) => {
        reqStartedAt.set(req, Date.now());
      });
      page.on('response', (r) => {
        const url = r.url();
        if (!/\/api\/messages\/threads|\/api\/community\//i.test(url)) return;
        if (r.status() >= 400) apiIssues.push({ type: 'http', status: r.status(), url, during: page.url() });
        if (!/\/api\/community\/channels\/[^/]+\/messages/i.test(url)) return;
        const req = r.request();
        const method = req.method();
        const ms = Math.max(0, Date.now() - (reqStartedAt.get(req) || Date.now()));
        const hasAfterId = /[?&]afterId=\d+/i.test(url);
        if (method === 'POST') {
          communityDiag.community.post.push(ms);
          return;
        }
        if (method !== 'GET') return;
        const mode = hasAfterId ? 'afterId' : 'noCursor';
        if (!hasAfterId) communityDiag.community.getNoCursor.push(ms);
        else communityDiag.community.getAfterId.push(ms);
        if (communityDiag.phase === 'reload' && !hasAfterId) {
          communityDiag.community.reloadGet.push(ms);
        } else if (hasAfterId) {
          communityDiag.community.pollingGet.push(ms);
        }
        communityDiag.headers.push({
          mode,
          status: r.status(),
          ms,
          queryMode: r.headers()['x-community-query-mode'] || null,
          queryMs: r.headers()['x-community-query-ms'] || null,
          rowCount: r.headers()['x-community-row-count'] || null,
          url
        });
      });
      page.on('requestfailed', (req) => {
        const url = req.url();
        if (!/\/api\/messages\/threads|\/api\/community\//i.test(url)) return;
        apiIssues.push({ type: 'requestfailed', error: req.failure()?.errorText || 'unknown', url, during: page.url() });
      });
    };
    observe(adminPage);
    observe(userPage);

    const result = {
      generatedAt: new Date().toISOString(),
      base: BASE,
      normalUserState: userStateStatus,
      partA: null,
      partB: null,
      partC: null,
      partD: null,
      apiIssues
    };

    try {
      // Part A: admin/user messaging latency
      const qaUserId = readNormalUserIdFromState();
      await adminPage.goto(`${BASE}/admin/inbox?user=${encodeURIComponent(qaUserId)}`, { waitUntil: 'domcontentloaded' });
      await userPage.goto(`${BASE}/messages`, { waitUntil: 'domcontentloaded' });
      await dismissConsentIfPresent(adminPage);
      await dismissConsentIfPresent(userPage);
      await expect(adminPage.locator('.admin-inbox-form-row input[type="text"]')).toBeEnabled({ timeout: 30000 });
      const userMessageInput = await ensureMessagesComposerReady(userPage);

      if (!userMessageInput) {
        result.partA = {
          sentEachDirection: 0,
          adminToUser: stats([]),
          userToAdmin: stats([]),
          combined: stats([]),
          missing: 0,
          duplicates: 0,
          composerStuck: true,
          realtimeFeel: false,
          note: 'Skipped: /messages user session unauthenticated in current storage state.'
        };
      } else {
        const adminToUserVisible = [];
        const userToAdminVisible = [];
        let missing = 0;
        let duplicates = 0;
        let composerStuck = false;

        for (let i = 0; i < 10; i += 1) {
          const token = `LAT_A2U_${Date.now()}_${i}`;
          const postP = adminPage.waitForResponse((r) => /\/api\/messages\/threads\/\d+\/messages/i.test(r.url()) && r.request().method() === 'POST', { timeout: 15000 });
          const tClick = Date.now();
          await adminPage.locator('.admin-inbox-form-row input[type="text"]').fill(token);
          await adminPage.locator('.admin-inbox-send-btn').click();
          const visible = await waitVisible(userPage.locator('.message-content', { hasText: token }), 15000);
          await postP.catch(() => null);
          const tVisible = Date.now();
          if (!visible) missing += 1;
          else adminToUserVisible.push(tVisible - tClick);
          const c = await userPage.locator('.message-content', { hasText: token }).count();
          if (c > 1) duplicates += (c - 1);
        }

        for (let i = 0; i < 10; i += 1) {
          const token = `LAT_U2A_${Date.now()}_${i}`;
          const postP = userPage.waitForResponse((r) => /\/api\/messages\/threads\/\d+\/messages/i.test(r.url()) && r.request().method() === 'POST', { timeout: 15000 });
          const tClick = Date.now();
          await userMessageInput.fill(token);
          await userPage.locator('.send-button').click();
          const visible = await waitVisible(adminPage.locator('.admin-inbox-message-text', { hasText: token }), 15000);
          await postP.catch(() => null);
          const tVisible = Date.now();
          if (!visible) missing += 1;
          else userToAdminVisible.push(tVisible - tClick);
          const c = await adminPage.locator('.admin-inbox-message-text', { hasText: token }).count();
          if (c > 1) duplicates += (c - 1);
        }

        await adminPage.locator('.admin-inbox-form-row input[type="text"]').fill(`LAT_COMPOSER_${Date.now()}`);
        composerStuck = !(await adminPage.locator('.admin-inbox-send-btn').isEnabled().catch(() => false));

        const allVisible = [...adminToUserVisible, ...userToAdminVisible];
        const s = stats(allVisible);
        const realtimeFeel = missing === 0 && duplicates === 0 && !composerStuck && (s.median ?? 999999) < 1000 && (s.p95 ?? 999999) < 3000;
        result.partA = {
          sentEachDirection: 10,
          adminToUser: stats(adminToUserVisible),
          userToAdmin: stats(userToAdminVisible),
          combined: s,
          missing,
          duplicates,
          composerStuck,
          realtimeFeel
        };
      }

      // Part B + C: community latency + multi-channel
      const commPage = await userCtx.newPage();
      observe(commPage);
      communityDiag.phase = 'community_steady';
      const channelsSection = await ensureCommunityChannelsVisible(commPage);
      const names = channelsSection.locator('li .channel-name');
      await expect(names.first()).toBeVisible({ timeout: 20000 });
      const n = await names.count();
      const labels = [];
      for (let i = 0; i < n; i += 1) labels.push(((await names.nth(i).innerText().catch(() => '')) || '').trim());
      const writable = channelTryOrder(labels);
      if (!writable.length) throw new Error('No candidate community channel found');
      const picked = await pickWritableCommunityChannel(commPage, names, writable);
      const chosen = picked.chosen;
      const communityInput = picked.composer;
      await commPage.waitForURL(/\/community\/[^/?#]+/i, { timeout: 10000 }).catch(() => {});
      const chosenChannelId = extractChannelIdFromPathname(commPage.url());
      const chosenChannelName = chosen.label;

      const commVisible = [];
      let commMissing = 0;
      let commDup = 0;
      const commTokens = [];
      for (let i = 0; i < 10; i += 1) {
        const token = `LAT_COMM_${Date.now()}_${i}`;
        commTokens.push(token);
        const postP = commPage.waitForResponse((r) => /\/api\/community\/channels\/[^/]+\/messages/i.test(r.url()) && r.request().method() === 'POST', { timeout: 15000 });
        const tClick = Date.now();
        await communityInput.fill(token);
        await communityInput.press('Enter');
        const visible = await waitVisible(commPage.locator('.chat-messages').getByText(token, { exact: true }), 15000);
        await postP.catch(() => null);
        const tVisible = Date.now();
        if (!visible) commMissing += 1;
        else commVisible.push(tVisible - tClick);
        const c = await commPage.locator('.chat-messages').getByText(token, { exact: true }).count();
        if (c > 1) commDup += (c - 1);
      }

      communityDiag.phase = 'reload';
      let reloadFetchSettled = false;
      const reloadGetPromise = chosenChannelId
        ? commPage.waitForResponse((r) => {
            const url = r.url();
            return r.request().method() === 'GET'
              && url.includes(`/api/community/channels/${chosenChannelId}/messages`)
              && !/[?&]afterId=/.test(url)
              && r.status() < 500;
          }, { timeout: 20000 }).then(() => { reloadFetchSettled = true; }).catch(() => null)
        : Promise.resolve();
      if (chosenChannelId) await forceSelectChannelById(commPage, chosenChannelId, chosen.label);
      else await commPage.reload({ waitUntil: 'domcontentloaded' });
      await dismissConsentIfPresent(commPage);
      const reloadChannels = await ensureCommunityChannelsVisible(commPage);
      const reloadNames = reloadChannels.locator('li .channel-name');
      const selectedById = chosenChannelId
        ? reloadChannels.locator(`a[href*="/community/${chosenChannelId}"], [data-channel-id="${chosenChannelId}"], [data-id="${chosenChannelId}"]`).first()
        : reloadNames.filter({ hasText: chosen.label }).first();
      await ensureCommunityComposerReady(commPage, selectedById).catch(() => null);
      await reloadGetPromise;
      const reloadSelectedChannelId = extractChannelIdFromPathname(commPage.url());
      const reloadSelectedChannelName = await getVisibleSelectedChannelName(commPage);
      let reloadOneCopy = true;
      let reloadZeroCount = 0;
      let reloadDupCount = 0;
      const chatContainer = commPage.locator('.chat-messages').first();
      for (const token of commTokens) {
        await waitVisible(chatContainer.getByText(token, { exact: true }), 12000);
        const c = await chatContainer.getByText(token, { exact: true }).count().catch(() => 0);
        if (c === 0) reloadZeroCount += 1;
        if (c > 1) reloadDupCount += (c - 1);
        if (c !== 1) reloadOneCopy = false;
      }
      const postTokenCheck = commTokens[commTokens.length - 1];
      const userBearer = readNormalUserTokenFromState();
      const postTokenPresentInApi = await commPage.request.get(`${BASE}/api/community/channels/${encodeURIComponent(chosenChannelId || 'general')}/messages`, {
        failOnStatusCode: false,
        headers: userBearer ? { Authorization: `Bearer ${userBearer}` } : undefined,
      }).then(async (r) => {
        const body = await r.json().catch(() => []);
        return Array.isArray(body) && body.some((m) => String(m?.content || '').includes(postTokenCheck));
      }).catch(() => false);
      const uiContainsPostedMessageAfterReselect = await chatContainer.getByText(postTokenCheck, { exact: true }).count().then((c) => c > 0).catch(() => false);
      const wrongChannelAfterReload = Boolean(chosenChannelId) && String(reloadSelectedChannelId) !== String(chosenChannelId);
      const reloadFailureMode = reloadOneCopy
        ? 'none'
        : (reloadZeroCount > 0 ? 'zero' : (reloadDupCount > 0 ? 'duplicate' : (wrongChannelAfterReload ? 'wrong_channel' : (!reloadFetchSettled ? 'early_assertion' : 'unknown'))));
      communityDiag.phase = 'post_reload';
      result.partB = {
        sent: 10,
        latency: stats(commVisible),
        missing: commMissing,
        duplicates: commDup,
        reloadOneCopy,
        reloadFailureMode,
        reloadDiagnostics: {
          chosenChannelId,
          chosenChannelName,
          reloadSelectedChannelId,
          reloadSelectedChannelName,
          reloadFetchSettled,
          wrongChannelAfterReload,
          reloadZeroCount,
          reloadDupCount,
          postTokenPresentInApi,
          uiContainsPostedMessageAfterReselect
        },
        endpointBreakdown: {
          getNoCursor: stats(communityDiag.community.getNoCursor),
          getAfterId: stats(communityDiag.community.getAfterId),
          post: stats(communityDiag.community.post),
          reloadFetch: stats(communityDiag.community.reloadGet),
          pollingFetch: stats(communityDiag.community.pollingGet)
        }
      };

      // Part C multi-channel
      if (writable.length >= 2) {
        const second = writable[1];
        const page2 = await userCtx.newPage();
        observe(page2);
        await page2.goto(`${BASE}/community`, { waitUntil: 'domcontentloaded' });
        await dismissConsentIfPresent(page2);
        try {
          const names2 = page2.locator('.channels-section li .channel-name');
          await names2.nth(second.index).click({ timeout: 8000, force: true });
          await commPage.locator('.channels-section li .channel-name').nth(chosen.index).click({ timeout: 8000, force: true });
          const t1 = `LAT_CH1_${Date.now()}`;
          const t2 = `LAT_CH2_${Date.now()}`;
          await Promise.all([
            (async () => { await commPage.locator('#community-message-input').fill(t1); await commPage.locator('#community-message-input').press('Enter'); })(),
            (async () => { await page2.locator('#community-message-input').fill(t2); await page2.locator('#community-message-input').press('Enter'); })()
          ]);
          const v1 = await waitVisible(commPage.locator('.chat-messages').getByText(t1, { exact: true }), 15000);
          const v2 = await waitVisible(page2.locator('.chat-messages').getByText(t2, { exact: true }), 15000);
          const leak1 = await commPage.locator('.chat-messages').getByText(t2, { exact: true }).count().catch(() => 0);
          const leak2 = await page2.locator('.chat-messages').getByText(t1, { exact: true }).count().catch(() => 0);
          await commPage.reload({ waitUntil: 'domcontentloaded' });
          await page2.reload({ waitUntil: 'domcontentloaded' });
          await dismissConsentIfPresent(commPage);
          await dismissConsentIfPresent(page2);
          result.partC = {
            verified: v1 && v2,
            channelsUsed: [chosen.label, second.label],
            noCrossChannelLeakage: leak1 === 0 && leak2 === 0,
            note: v1 && v2 ? 'Multi-channel bounded check complete.' : 'One or more channel posts were not visible in timeout; treated as not fully verified.'
          };
        } catch (e) {
          result.partC = { verified: false, channelsUsed: [chosen.label, second.label], reason: `Multi-channel attempt failed: ${String(e?.message || e)}` };
        }
        await page2.close();
      } else {
        result.partC = { verified: false, reason: 'Only one writable channel found; true multi-channel concurrency NOT VERIFIED.' };
      }
      await commPage.close();

      // Part D intentionally skipped in this focused run (reload channel persistence only).
      result.partD = { verified: false, extraUsers: 0, note: 'Skipped in focused reload-persistence run.' };

      fs.writeFileSync(REPORT_JSON, JSON.stringify(result, null, 2), 'utf8');
      const lines = [
        '# Realtime Latency and Concurrency Report',
        '',
        `- Generated: ${result.generatedAt}`,
        `- Base: ${BASE}`,
        '',
        '## Part A — Admin/User Message Latency',
        `- Sent each direction: ${result.partA.sentEachDirection}`,
        `- Combined min/median/p95/max: ${result.partA.combined.min}/${result.partA.combined.median}/${result.partA.combined.p95}/${result.partA.combined.max} ms`,
        `- Missing: ${result.partA.missing}`,
        `- Duplicates: ${result.partA.duplicates}`,
        `- Composer stuck: ${result.partA.composerStuck}`,
        `- Realtime feel: ${result.partA.realtimeFeel}`,
        '',
        '## Part B — Community Latency',
        `- Sent: ${result.partB.sent}`,
        `- min/median/p95/max: ${result.partB.latency.min}/${result.partB.latency.median}/${result.partB.latency.p95}/${result.partB.latency.max} ms`,
        `- Missing: ${result.partB.missing}`,
        `- Duplicates: ${result.partB.duplicates}`,
        `- Exactly-one-copy after reload: ${result.partB.reloadOneCopy}`,
        '',
        '## Part C — Multi-channel Community Concurrency',
        `- Verified: ${result.partC.verified}`,
        `- Detail: ${result.partC.verified ? `channels=${result.partC.channelsUsed.join(', ')}, noCrossChannelLeakage=${result.partC.noCrossChannelLeakage}` : result.partC.reason}`,
        '',
        '## Part D — Multi-user Concurrency',
        `- Verified: ${result.partD.verified}`,
        `- Detail: ${result.partD.note}`,
        '',
        '## API Issues (/api/messages/threads* + /api/community/*)',
        `- Count: ${result.apiIssues.length}`
      ];
      fs.writeFileSync(REPORT_MD, `${lines.join('\n')}\n`, 'utf8');

      // This spec is an audit/reporting run; it records pass/fail evidence in artifacts.
    } finally {
      await adminCtx.close();
      await userCtx.close();
    }
  });
});

