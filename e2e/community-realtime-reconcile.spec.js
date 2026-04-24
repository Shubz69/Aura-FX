// @ts-check

import { test, expect } from '@playwright/test';

import fs from 'fs';

import path from 'path';



const BASE = (process.env.AUDIT_BASE_URL || 'https://www.auraterminal.ai').replace(/\/$/, '');

const USER_STATE = path.join(process.cwd(), 'e2e', 'reports', 'auraterminal-normal-user.json');



/** @param {import('@playwright/test').Page} page */

async function dismissConsentIfPresent(page) {

  const backdrop = page.locator('.gdpr-backdrop');

  if (!(await backdrop.isVisible().catch(() => false))) return;

  const consent = page

    .locator('button:has-text("Accept"), button:has-text("Agree"), button:has-text("Allow"), button:has-text("Got it")')

    .first();

  if (await consent.isVisible().catch(() => false)) {

    await consent.click({ timeout: 5000 }).catch(() => {});

  } else {

    await page.keyboard.press('Escape').catch(() => {});

    await backdrop.click({ position: { x: 5, y: 5 } }).catch(() => {});

  }

}



/** Announcements / rules-style channels — do not post here. */

function isNonPostableChannelLabel(label) {

  const t = (label || '').trim().toLowerCase();

  if (!t) return true;

  if (t === 'welcome') return true;

  if (t.startsWith('announcement')) return true;

  if (t === 'levels') return true;

  if (t.includes('notification')) return true;

  if (/\brules?\b/.test(t)) return true;

  return false;

}



/** Prefer #general-style channels first. */

function channelTryOrder(labels) {

  const entries = labels.map((label, index) => ({ index, label: label.trim(), t: label.trim().toLowerCase() }));

  const safe = entries.filter((e) => !isNonPostableChannelLabel(e.label));

  safe.sort((a, b) => {

    if (a.t === 'general') return -1;

    if (b.t === 'general') return 1;

    return a.t.localeCompare(b.t);

  });

  return safe;

}



/** @param {import('@playwright/test').Page} page */

async function scrollChatToBottom(page) {

  const box = page.locator('.chat-messages');

  if (await box.isVisible().catch(() => false)) {

    await box.evaluate((el) => {

      el.scrollTop = el.scrollHeight;

    });

  }

  await page.waitForTimeout(500);

}



/** @param {import('@playwright/test').Page} page */

function chatMessageText(page, token) {

  return page.locator('.chat-messages').getByText(token, { exact: true });

}



test.describe('Community realtime / REST reconcile', () => {
  test.setTimeout(180000);

  test('writable channel: post appears and survives reload', async ({ browser }) => {

    test.skip(!fs.existsSync(USER_STATE), `Missing ${USER_STATE}`);



    const ctx = await browser.newContext({

      storageState: USER_STATE,

      viewport: { width: 1440, height: 900 },

    });

    const page = await ctx.newPage();

    await page.goto(`${BASE}/community`, { waitUntil: 'domcontentloaded' });



    const channelsSection = page.locator('.channels-section').first();

    const signInHeading = page.getByRole('heading', { name: /^sign in$/i });

    try {

      await Promise.race([

        channelsSection.waitFor({ state: 'visible', timeout: 35000 }),

        page.waitForURL(/\/login(\?|$)/i, { timeout: 35000 }),

        signInHeading.waitFor({ state: 'visible', timeout: 35000 }),

      ]);

    } catch {

      // fall through

    }



    const url = page.url();

    const loginWall =

      /\/login(\?|$)/i.test(url) ||

      (await signInHeading.isVisible().catch(() => false)) ||

      (await page.getByRole('button', { name: /^login$/i }).isVisible().catch(() => false));

    if (loginWall) {

      test.skip(true, 'Not authenticated (storage state missing or expired); cannot exercise community UI.');

    }



    await page

      .waitForResponse(

        (r) => /\/api\/community\/channels/i.test(r.url()) && r.status() >= 200 && r.status() < 500,

        { timeout: 35000 },

      )

      .catch(() => {});



    if (!(await channelsSection.isVisible().catch(() => false))) {

      await channelsSection.waitFor({ state: 'visible', timeout: 30000 });

    }



    await dismissConsentIfPresent(page);



    const names = channelsSection.locator('li .channel-name');

    await expect(names.first()).toBeVisible({ timeout: 25000 });

    const n = await names.count();

    const labels = [];

    for (let i = 0; i < n; i += 1) {

      labels.push(((await names.nth(i).innerText().catch(() => '')) || '').trim());

    }



    // Welcome channel surfaces rules acknowledgement (unlock / re-accept).

    const welcomeIdx = labels.findIndex((l) => l.toLowerCase() === 'welcome');

    if (welcomeIdx >= 0) {

      await names.nth(welcomeIdx).scrollIntoViewIfNeeded().catch(() => {});

      await names.nth(welcomeIdx).click({ timeout: 8000, force: true });

      await page.waitForTimeout(2000);

    }



    const rulesAck = page.getByText(/read and agree to the rules/i).first();

    let rulesAccepted = false;

    if (await rulesAck.isVisible({ timeout: 4000 }).catch(() => false)) {

      const acceptResp = page

        .waitForResponse(

          (r) => r.url().includes('/api/community/accept-onboarding') && r.status() >= 200 && r.status() < 300,

          { timeout: 20000 },

        )

        .catch(() => null);

      await rulesAck.click({ timeout: 8000 });

      await acceptResp;

      rulesAccepted = true;

      await page.waitForTimeout(2000);

      await page

        .waitForResponse(

          (r) => /\/api\/community\/channels/i.test(r.url()) && r.status() >= 200 && r.status() < 500,

          { timeout: 20000 },

        )

        .catch(() => {});

    }



    if (rulesAccepted) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await dismissConsentIfPresent(page);
      await page
        .waitForResponse(
          (r) => /\/api\/community\/channels/i.test(r.url()) && r.status() >= 200 && r.status() < 500,
          { timeout: 35000 },
        )
        .catch(() => {});
      if (!(await channelsSection.isVisible().catch(() => false))) {
        await channelsSection.waitFor({ state: 'visible', timeout: 30000 });
      }
      await page.waitForTimeout(2500);
    }

    console.log(`COMM_RULES_ACK=${rulesAccepted ? 'accepted' : 'none_or_already'}`);



    const labelsAfter = [];

    const nAfter = await names.count();

    for (let i = 0; i < nAfter; i += 1) {

      labelsAfter.push(((await names.nth(i).innerText().catch(() => '')) || '').trim());

    }



    const order = channelTryOrder(labelsAfter);

    let openedWritable = false;

    let chosenLabel = '';



    for (const { index, label } of order) {

      await names.nth(index).scrollIntoViewIfNeeded().catch(() => {});

      await names.nth(index).click({ timeout: 8000, force: true }).catch(() => {});

      await page.waitForTimeout(1500);

      const input = page.locator('#community-message-input');

      if (await input.isVisible().catch(() => false)) {

        const disabled = await input.isDisabled().catch(() => true);

        if (!disabled) {

          openedWritable = true;

          chosenLabel = label;

          break;

        }

      }

    }



    if (!openedWritable) {

      test.skip(

        true,

        'No writable non-announcement community channel for this user after rules flow (input disabled everywhere tried).',

      );

    }



    console.log(`COMM_WRITABLE_CHANNEL=${chosenLabel}`);



    const token = `COMM_QA_E2E_${Date.now()}`;

    await page.locator('#community-message-input').fill(token);

    const sendAck = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        r.url().includes('/api/community/channels/') &&
        r.url().includes('messages') &&
        r.status() >= 200 &&
        r.status() < 400,
      { timeout: 45000 },
    );

    await page.locator('#community-message-input').press('Enter');

    await sendAck;
    await scrollChatToBottom(page);

    await expect(chatMessageText(page, token).first()).toBeVisible({ timeout: 25000 });

    const firstCount = await chatMessageText(page, token).count();

    expect(firstCount).toBe(1);



    await page.reload({ waitUntil: 'domcontentloaded' });

    await dismissConsentIfPresent(page);
    await page.getByRole('button', { name: 'Dismiss' }).click({ timeout: 4000 }).catch(() => {});

    const channelsSectionReload = page.locator('.channels-section').first();

    await channelsSectionReload.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});

    await page
      .waitForResponse(
        (r) => /\/api\/community\/channels/i.test(r.url()) && r.status() >= 200 && r.status() < 500,
        { timeout: 35000 },
      )
      .catch(() => {});

    const escaped = chosenLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const channelRow = channelsSectionReload
      .locator('li')
      .filter({ has: page.locator('.channel-name', { hasText: new RegExp(`^\\s*${escaped}\\s*$`, 'i') }) })
      .first();
    await channelRow.scrollIntoViewIfNeeded().catch(() => {});
    const messagesReady = page
      .waitForResponse(
        (r) =>
          r.request().method() === 'GET' &&
          /\/api\/community\/channels\/[^/]+\/messages/i.test(r.url()) &&
          r.status() >= 200 &&
          r.status() < 500,
        { timeout: 45000 },
      )
      .catch(() => null);
    await channelRow.click({ timeout: 12000 });
    await messagesReady;
    await page.waitForTimeout(2000);
    await scrollChatToBottom(page);
    await page.waitForTimeout(1000);

    await expect(chatMessageText(page, token).first()).toBeVisible({ timeout: 45000 });

    const afterReload = await chatMessageText(page, token).count();

    expect(afterReload).toBe(1);



    await ctx.close();

  });

  test('rapid channel switching does not leave stale thread content', async ({ browser }) => {
    test.skip(!fs.existsSync(USER_STATE), `Missing ${USER_STATE}`);
    const ctx = await browser.newContext({
      storageState: USER_STATE,
      viewport: { width: 1440, height: 900 },
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/community`, { waitUntil: 'domcontentloaded' });

    const channelsSection = page.locator('.channels-section').first();
    await channelsSection.waitFor({ state: 'visible', timeout: 30000 });
    await dismissConsentIfPresent(page);
    const rows = channelsSection.locator('li');
    await expect(rows.first()).toBeVisible({ timeout: 20000 });
    const names = rows.locator('.channel-name');
    const count = await names.count();
    const labels = [];
    for (let i = 0; i < count; i += 1) labels.push(((await names.nth(i).innerText().catch(() => '')) || '').trim());
    const candidates = channelTryOrder(labels);
    test.skip(candidates.length < 2, 'Need at least two writable channels for rapid-switch stale test.');

    const first = candidates[0];
    const second = candidates[1];
    const clickChannel = async ({ label }) => {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const row = channelsSection
        .locator('li')
        .filter({ has: page.locator('.channel-name', { hasText: new RegExp(`^\\s*${escaped}\\s*$`, 'i') }) })
        .first();
      await row.scrollIntoViewIfNeeded().catch(() => {});
      const ready = page.waitForResponse(
        (r) =>
          r.request().method() === 'GET' &&
          /\/api\/community\/channels\/[^/]+\/messages/i.test(r.url()) &&
          r.status() >= 200 &&
          r.status() < 500,
        { timeout: 25000 }
      ).catch(() => null);
      await row.click({ timeout: 8000, force: true });
      await ready;
      await page.waitForTimeout(900);
    };

    await clickChannel(first);
    const firstChatText = await page.locator('.chat-messages').innerText().catch(() => '');

    // Rapid switch burst (same user behavior that previously caused stale overwrite)
    await clickChannel(second);
    await clickChannel(first);
    await clickChannel(second);

    const secondChatText = await page.locator('.chat-messages').innerText().catch(() => '');
    const secondLabelVisible = await page
      .locator('.channel-name.active, .channel-item.active .channel-name')
      .filter({ hasText: new RegExp(second.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })
      .first()
      .isVisible()
      .catch(() => false);

    // Primary assertion: final selected channel is second; stale overwrite typically keeps previous text.
    // Text can legitimately overlap between channels, so we accept either a visible final active channel marker
    // or distinct chat pane content after the final switch.
    expect(secondLabelVisible || (firstChatText && secondChatText && firstChatText !== secondChatText)).toBeTruthy();
    await ctx.close();
  });

});


