'use strict';

const assert = require('assert');
const { intelResponseBriefKindSlug } = require('../api/trader-deck/deskBriefKinds');

function run() {
  assert.strictEqual(
    intelResponseBriefKindSlug('equities', 'daily'),
    'aura_institutional_daily_stocks'
  );
  assert.strictEqual(
    intelResponseBriefKindSlug('global_macro', 'daily'),
    'aura_institutional_daily_indices'
  );
  assert.strictEqual(
    intelResponseBriefKindSlug('aura_institutional_daily_forex', 'daily'),
    'aura_institutional_daily_forex'
  );
  assert.strictEqual(
    intelResponseBriefKindSlug('equities', 'weekly'),
    'aura_institutional_weekly_stocks'
  );
  assert.strictEqual(intelResponseBriefKindSlug('general', 'daily'), null);
  assert.strictEqual(intelResponseBriefKindSlug('', 'daily'), null);
  console.log('OK intel-response-brief-kind-slug tests');
}

run();
