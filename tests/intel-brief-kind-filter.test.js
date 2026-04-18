/**
 * Ensures every institutional brief_kind slug passes the same regex the UI uses
 * to filter GET /api/trader-deck/content rows (no accidental drop of valid sleeves).
 */
'use strict';

const assert = require('assert');
const {
  INSTITUTIONAL_DAILY_WFA_KINDS,
  INSTITUTIONAL_WEEKLY_WFA_KINDS,
} = require('../api/trader-deck/deskBriefKinds');

const INTEL_API_BRIEF_KIND_RE =
  /^aura_sunday_market_open$|^aura_institutional_daily_(forex|crypto|commodities|etfs|stocks|indices|bonds|futures)$|^aura_institutional_weekly_(forex|crypto|commodities|etfs|stocks|indices|bonds|futures)$/;

function run() {
  for (const k of INSTITUTIONAL_DAILY_WFA_KINDS) {
    assert.ok(
      INTEL_API_BRIEF_KIND_RE.test(String(k).toLowerCase()),
      `daily kind must pass UI filter: ${k}`
    );
  }
  for (const k of INSTITUTIONAL_WEEKLY_WFA_KINDS) {
    assert.ok(
      INTEL_API_BRIEF_KIND_RE.test(String(k).toLowerCase()),
      `weekly kind must pass UI filter: ${k}`
    );
  }
  assert.ok(INTEL_API_BRIEF_KIND_RE.test('aura_sunday_market_open'), 'Sunday open allowed on daily intel');
  console.log('OK intel-brief-kind-filter tests');
}

run();
