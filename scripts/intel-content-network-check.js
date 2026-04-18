/**
 * Live-style GET check for Market Intelligence content API (intel-daily + intel-weekly).
 * Prints briefs.length, briefKind list, categorySleevePack — same fields as DevTools Network response.
 *
 * Usage (repo root):
 *   node scripts/intel-content-network-check.js --base=https://www.auraterminal.ai --date=2026-04-18
 *   node scripts/intel-content-network-check.js --base=http://localhost:3000 --date=2026-04-18 --token=YOUR_JWT
 *
 * Weekly row uses week-ending Sunday derived from --date (same rule as the app).
 */

/* eslint-disable no-console */
const axios = require('axios');
const { getTraderDeckIntelStorageYmd } = require('../api/trader-deck/deskDates');

function parseArgs() {
  const out = { base: '', date: '', token: '' };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--base=')) out.base = a.slice(7).replace(/\/$/, '');
    else if (a.startsWith('--date=')) out.date = a.slice(7).trim().slice(0, 10);
    else if (a.startsWith('--token=')) out.token = a.slice(8).trim();
  }
  return out;
}

async function fetchIntel(base, type, date, token) {
  const url = `${base}/api/trader-deck/content`;
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await axios.get(url, {
    params: { type, date, autogen: '0' },
    headers,
    validateStatus: () => true,
    timeout: 60000,
  });
  return res;
}

function summarize(label, res) {
  const d = res.data || {};
  const briefs = Array.isArray(d.briefs) ? d.briefs : [];
  const kinds = briefs.map((b) => b.briefKind).filter(Boolean);
  console.log(`\n=== ${label} ===`);
  console.log(`HTTP ${res.status}  type=${d.type}  response.date=${d.date}  briefsSourceDate=${d.briefsSourceDate || ''}`);
  console.log(`briefs.length=${briefs.length}`);
  console.log(`categorySleevePack:`, JSON.stringify(d.categorySleevePack || null));
  console.log(`deskAutomationConfigured=${d.deskAutomationConfigured}`);
  if (kinds.length) console.log(`briefKind values:\n  ${kinds.join('\n  ')}`);
}

async function main() {
  const { base, date, token } = parseArgs();
  if (!/^https?:\/\//i.test(base) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error('Usage: node scripts/intel-content-network-check.js --base=https://host --date=YYYY-MM-DD [--token=JWT]');
    process.exit(1);
  }

  const dailyStorage = getTraderDeckIntelStorageYmd(date, 'daily');
  const weeklyStorage = getTraderDeckIntelStorageYmd(date, 'weekly');

  const dailyRes = await fetchIntel(base, 'intel-daily', dailyStorage, token);
  summarize(`intel-daily (storage date ${dailyStorage})`, dailyRes);

  const weeklyRes = await fetchIntel(base, 'intel-weekly', weeklyStorage, token);
  summarize(`intel-weekly (storage date ${weeklyStorage}, week-ending Sunday)`, weeklyRes);

  if (dailyRes.status >= 400 || weeklyRes.status >= 400) {
    console.warn('\nNon-2xx: add --token= if the deployment requires auth for this route.');
    process.exit(2);
  }
  console.log('\nDone. Compare briefs.length with UI; if API has rows but UI shows 0, inspect client filter (INTEL_API_BRIEF_KIND_RE).');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
