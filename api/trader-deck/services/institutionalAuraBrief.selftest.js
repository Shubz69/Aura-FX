/**
 * Offline QA checks (no OpenAI): conditional macro, repetition validators, markdown format.
 * Run: node api/trader-deck/services/institutionalAuraBrief.selftest.js
 */

/* eslint-disable no-console */
const assert = require('assert');
const {
  INSTITUTIONAL_INSTRUMENTS,
  assembleDailyMarkdown,
  validateDailyMarkdownFormat,
  validateWeeklyMarkdownFormat,
  _test: t,
} = require('./institutionalAuraBrief');

function block(id, label, lonPrefix, nyPrefix, uniq) {
  const lonTail = ` London path for ${label} (${uniq}) is shaped by local liquidity and European prints before NY handoff.`;
  const nyTail = ` New York for ${label} (${uniq}) reprices through US data and cash flows, not a copy of London’s setup.`;
  return {
    id,
    label,
    londonSessionBias: 'Neutral',
    newYorkSessionBias: 'Neutral',
    londonParagraph: `${lonPrefix}${lonTail}`,
    newYorkParagraph: `${nyPrefix}${nyTail}`,
    trend: 'Consolidation with directional bias data-dependent',
    support: '1.0500',
    resistance: '1.0650',
    technicalBias: 'Neutral',
    technicalNote:
      'Structure shows a defined range; momentum fades into the midpoint until a break with follow-through volume.',
    trades: { london: { sell: null, buy: null }, newYork: { sell: null, buy: null } },
  };
}

function makeBlocksDistinct() {
  const ids = INSTITUTIONAL_INSTRUMENTS;
  const prefixes = [
    'Gold’s flow picture is dominated by real-rate and reserve-demand dynamics today, so ',
    'US equity index futures lean on earnings breadth and rates, meaning ',
    'Tech-heavy exposure implies duration sensitivity, so ',
    'Crude balances OPEC expectations against inventories, and ',
    'Cable is driven by UK data and BoE pricing, with ',
    'EUR/USD tracks ECB–Fed repricing, so ',
    'USD/JPY reflects yield spreads and risk proxy flows, with ',
    'USD/CHF follows the franc’s haven bid and dollar tone, so ',
    'CAD/JPY embeds oil-beta and yen crosses, meaning ',
    'EUR/CHF is a euro-franc policy spread trade, so ',
    'GBP/JPY combines sterling idiosyncrasy with yen funding, with ',
  ];
  const ny = [
    'New York will reprice off US releases and curve moves, so ',
    'The US cash open tests gap risk and sector leadership, with ',
    'Afternoon flow focuses on megacap earnings sensitivity, meaning ',
    'Settlement and EIA risk reshape energy gamma, so ',
    'North American hours stress UK prints vs dollar, with ',
    'NY liquidity amplifies ECB/Fed divergence trades, so ',
    'Tokyo-to-NY handoff in yen crosses matters for ',
    'Safe-haven bid into the US close can flip ',
    'Oil inventory headlines into NY often define ',
    'SNB/ECB undertones reprice euro-franc into ',
    'Sterling-yen is a risk barometer through NY with ',
  ];
  return ids.map((spec, i) => {
    const noise = ` Unique_kw_${spec.id}_${i}_${(i * 9241 + 331).toString(36)}`;
    return block(
      spec.id,
      spec.label,
      `${prefixes[i] || prefixes[0]}${noise} `,
      `${ny[i] || ny[0]}${noise} `,
      `${spec.id}-${i}`
    );
  });
}

function makeBlocksRobotic() {
  const same =
    'In the London session traders watch yields and risk sentiment while the dollar sets the tone for crosses.';
  const sameNy =
    'In New York the session watches yields and risk sentiment while the dollar sets the tone for crosses.';
  return INSTITUTIONAL_INSTRUMENTS.map((spec, i) =>
    block(spec.id, spec.label, same.slice(0, 80), sameNy.slice(0, 80), `R${i}`)
  );
}

function run() {
  const p1Base = {
    keyEvents: [
      {
        eventName: 'US CPI m/m',
        currencyRegion: 'USD',
        whatItMeasures: 'Consumer inflation momentum for the month.',
        whyTradersCare: 'Shifts Fed path pricing and front-end rates, with knock-on to USD, gold, and indices.',
        marketsAffected: 'DXY, XAU/USD, US2Y, NAS100.',
      },
    ],
    openingContext: 'x'.repeat(450),
    marketThemesToday: 'y'.repeat(300),
  };

  const distinctBlocks = makeBlocksDistinct();
  const include1 = t.shouldIncludeGlobalMacroSection(p1Base, distinctBlocks);
  assert.strictEqual(include1, true, 'rich macro should include section');

  const p1Dup = {
    ...p1Base,
    openingContext: `${p1Base.keyEvents[0].whyTradersCare} ${p1Base.keyEvents[0].marketsAffected} `.repeat(20),
    marketThemesToday: `${p1Base.keyEvents[0].whatItMeasures} ${p1Base.keyEvents[0].whyTradersCare} `.repeat(15),
  };
  const include2 = t.shouldIncludeGlobalMacroSection(p1Dup, distinctBlocks);
  assert.strictEqual(include2, false, 'near-duplicate macro vs calendar should omit');

  const divOk = t.validateDailyInstrumentLanguageDiversity(distinctBlocks);
  assert.strictEqual(divOk.ok, true, `distinct blocks should pass diversity: ${divOk.reasons}`);

  const divBad = t.validateDailyInstrumentLanguageDiversity(makeBlocksRobotic());
  assert.strictEqual(divBad.ok, false, 'robotic blocks should fail diversity');

  const roboticMerged = t.validateDailyMerged(
    p1Base,
    makeBlocksRobotic(),
    INSTITUTIONAL_INSTRUMENTS
  );
  assert.strictEqual(roboticMerged.ok, false, 'robotic sleeve should fail merged QC');

  const md = assembleDailyMarkdown(
    'DAILY MARKET BRIEF – Monday, 30 March 2026',
    '2026-03-30',
    'Monday, 30 March 2026',
    p1Base,
    distinctBlocks,
    true
  );
  const fmt = validateDailyMarkdownFormat(md, INSTITUTIONAL_INSTRUMENTS);
  assert.strictEqual(fmt.ok, true, `daily format: ${fmt.issues}`);

  const mdNoMacro = assembleDailyMarkdown(
    'DAILY MARKET BRIEF – Monday, 30 March 2026',
    '2026-03-30',
    'Monday, 30 March 2026',
    p1Base,
    distinctBlocks,
    false
  );
  const fmt2 = validateDailyMarkdownFormat(mdNoMacro, INSTITUTIONAL_INSTRUMENTS);
  assert.strictEqual(fmt2.ok, true, `daily format without macro: ${fmt2.issues}`);

  const weeklyMd = [
    '# WEEKLY MARKET BRIEF – 1st – 5th April 2026',
    '',
    '## Summary for the previous week',
    '',
    'Body.',
    '',
    '## How things turned out',
    '',
    ...INSTITUTIONAL_INSTRUMENTS.map(
      (s) => `### ${s.label}\n\n**Fundamental overview:** Text.\n\n**Market impact:** Text.\n`
    ),
    '## The potential for this week',
    '',
    ...INSTITUTIONAL_INSTRUMENTS.map(
      (s) => `### ${s.label}\n\n**Fundamental factors:** Text.\n\n**Potential impact:** Text.\n`
    ),
    '## Important news this week',
    '',
    '### Monday',
    '',
    '- Event one',
    '',
    "## What's happened over the weekend?",
    '',
    'Weekend body.',
  ].join('\n');

  const wfmt = validateWeeklyMarkdownFormat(weeklyMd, INSTITUTIONAL_INSTRUMENTS);
  assert.strictEqual(wfmt.ok, true, `weekly format: ${wfmt.issues}`);

  console.log('institutionalAuraBrief.selftest: all assertions passed.');
}

run();
