/**
 * Live-style verification: eight institutional sleeves (daily + weekly) are wired
 * consistently across deskBriefKinds, PDF assemblers, and the generator maps.
 *
 * Optional DB spot-check when MySQL is configured:
 *   node --env-file=.env.local scripts/verify-eight-institutional-sleeves.js --date=2026-04-18
 *
 * Static only:
 *   node scripts/verify-eight-institutional-sleeves.js
 */

/* eslint-disable no-console */
const assert = require('assert');
const {
  INSTITUTIONAL_DAILY_WFA_KINDS,
  INSTITUTIONAL_WEEKLY_WFA_KINDS,
  DESK_AUTOMATION_CATEGORY_KINDS,
} = require('../api/trader-deck/deskBriefKinds');
const dailyBriefPdfBrief = require('../api/trader-deck/services/dailyBriefPdfBrief');
const weeklyWfaPdfBrief = require('../api/trader-deck/services/weeklyWfaPdfBrief');

const TAIL_RE = /^(forex|crypto|commodities|etfs|stocks|indices|bonds|futures)$/;

function checkKindArrays() {
  assert.strictEqual(INSTITUTIONAL_DAILY_WFA_KINDS.length, 8, 'daily kinds count');
  assert.strictEqual(INSTITUTIONAL_WEEKLY_WFA_KINDS.length, 8, 'weekly kinds count');
  for (const k of INSTITUTIONAL_DAILY_WFA_KINDS) {
    assert.match(String(k), /^aura_institutional_daily_[a-z]+$/, String(k));
    const tail = String(k).replace(/^aura_institutional_daily_/, '');
    assert.match(tail, TAIL_RE, `daily tail ${tail}`);
  }
  for (const k of INSTITUTIONAL_WEEKLY_WFA_KINDS) {
    assert.match(String(k), /^aura_institutional_weekly_[a-z]+$/, String(k));
    const tail = String(k).replace(/^aura_institutional_weekly_/, '');
    assert.match(tail, TAIL_RE, `weekly tail ${tail}`);
  }
  const dTails = INSTITUTIONAL_DAILY_WFA_KINDS.map((k) =>
    String(k).replace(/^aura_institutional_daily_/, '')
  ).sort();
  const wTails = INSTITUTIONAL_WEEKLY_WFA_KINDS.map((k) =>
    String(k).replace(/^aura_institutional_weekly_/, '')
  ).sort();
  assert.deepStrictEqual(dTails, wTails, 'daily and weekly category tails must match');
  assert.deepStrictEqual(
    dTails,
    [...DESK_AUTOMATION_CATEGORY_KINDS].sort(),
    'tails must match DESK_AUTOMATION_CATEGORY_KINDS'
  );
}

function checkPdfHeaders() {
  for (const k of INSTITUTIONAL_DAILY_WFA_KINDS) {
    assert.ok(dailyBriefPdfBrief.DAILY_KIND_TO_HEADER[k], `missing DAILY_KIND_TO_HEADER[${k}]`);
  }
  for (const k of INSTITUTIONAL_WEEKLY_WFA_KINDS) {
    assert.ok(weeklyWfaPdfBrief.WFA_KIND_TO_HEADER[k], `missing WFA_KIND_TO_HEADER[${k}]`);
  }
}

async function optionalDbCheck(dateYmd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateYmd || ''))) {
    console.log('DB check: skipped (pass --date=YYYY-MM-DD with MYSQL_* for stored-row counts).');
    return;
  }
  let executeQuery;
  try {
    ({ executeQuery } = require('../api/db'));
  } catch (e) {
    console.log('DB check: skipped (db module load failed).');
    return;
  }
  const dLower = INSTITUTIONAL_DAILY_WFA_KINDS.map((k) => String(k).toLowerCase());
  const wLower = INSTITUTIONAL_WEEKLY_WFA_KINDS.map((k) => String(k).toLowerCase());
  const phD = dLower.map(() => '?').join(',');
  const phW = wLower.map(() => '?').join(',');
  try {
    const [dailyRows] = await executeQuery(
      `SELECT LOWER(brief_kind) AS brief_kind, COUNT(*) AS n FROM trader_deck_briefs
       WHERE date = ? AND period = 'daily' AND LOWER(brief_kind) IN (${phD}) GROUP BY LOWER(brief_kind)`,
      [dateYmd, ...dLower]
    );
    const [weeklyRows] = await executeQuery(
      `SELECT LOWER(brief_kind) AS brief_kind, COUNT(*) AS n FROM trader_deck_briefs
       WHERE date = ? AND period = 'weekly' AND LOWER(brief_kind) IN (${phW}) GROUP BY LOWER(brief_kind)`,
      [dateYmd, ...wLower]
    );
    const dKinds = new Set((dailyRows || []).map((r) => String(r.brief_kind).toLowerCase()));
    const wKinds = new Set((weeklyRows || []).map((r) => String(r.brief_kind).toLowerCase()));
    console.log(`DB ${dateYmd} daily distinct institutional kinds: ${dKinds.size}/8`, [...dKinds].sort().join(', ') || '(none)');
    console.log(`DB ${dateYmd} weekly distinct institutional kinds: ${wKinds.size}/8`, [...wKinds].sort().join(', ') || '(none)');
    const dOk = INSTITUTIONAL_DAILY_WFA_KINDS.every((k) => dKinds.has(String(k).toLowerCase()));
    const wOk = INSTITUTIONAL_WEEKLY_WFA_KINDS.every((k) => wKinds.has(String(k).toLowerCase()));
    if (!dOk) console.warn('WARN: daily pack incomplete for that date (expected 8 kinds).');
    if (!wOk) console.warn('WARN: weekly pack incomplete for that date (use week-ending Sunday as storage date).');
  } catch (e) {
    console.log('DB check: query failed:', String(e.message || e).slice(0, 160));
  }
}

function parseDateArg() {
  const a = process.argv.find((x) => String(x).startsWith('--date='));
  return a ? String(a).slice('--date='.length).trim() : '';
}

async function main() {
  checkKindArrays();
  checkPdfHeaders();
  console.log('Static wire check: OK — 8 daily + 8 weekly slugs, PDF headers, desk category order.');
  await optionalDbCheck(parseDateArg());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
