/**
 * Backfill or refresh Aura PDF-style briefs for a date range.
 * - Optional --purge: delete rows whose brief_kind is in LEGACY_INTEL_BRIEF_KINDS.
 * - For each London calendar day: run daily pack Mon–Sat only; on Mondays also run weekly pack.
 *
 * Usage (repo root, with .env / database + PERPLEXITY_API_KEY):
 *   node --env-file=.env.local scripts/aura-briefs-backfill.js --from=2026-03-01 --to=2026-04-18
 *   node --env-file=.env.local scripts/aura-briefs-backfill.js --from=2026-03-01 --to=2026-04-18 --purge
 */

/* eslint-disable no-console */
const { DateTime } = require('luxon');
const { generateAndStoreInstitutionalBriefOnly } = require('../api/trader-deck/services/autoBriefGenerator');
const { executeQuery } = require('../api/db');
const { LEGACY_INTEL_BRIEF_KINDS } = require('../api/trader-deck/deskBriefKinds');

const TZ = 'Europe/London';

function parseArgs() {
  const out = { from: null, to: null, purge: false, dry: false };
  for (const a of process.argv.slice(2)) {
    if (a === '--purge') out.purge = true;
    else if (a === '--dry') out.dry = true;
    else if (a.startsWith('--from=')) out.from = a.slice('--from='.length);
    else if (a.startsWith('--to=')) out.to = a.slice('--to='.length);
  }
  return out;
}

async function purgeLegacyRange(fromYmd, toYmd) {
  const legacy = [...LEGACY_INTEL_BRIEF_KINDS].map((k) => String(k).toLowerCase());
  const ph = legacy.map(() => '?').join(',');
  const [header] = await executeQuery(
    `DELETE FROM trader_deck_briefs WHERE date >= ? AND date <= ? AND LOWER(brief_kind) IN (${ph})`,
    [fromYmd, toYmd, ...legacy]
  );
  return Number(header?.affectedRows ?? header?.changedRows ?? 0);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const { from, to, purge, dry } = parseArgs();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(from || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(to || ''))) {
    console.error('Usage: --from=YYYY-MM-DD --to=YYYY-MM-DD [--purge] [--dry]');
    process.exit(1);
  }
  if (dry) {
    console.log('Dry run: no DB or generation.');
    process.exit(0);
  }
  if (purge) {
    const n = await purgeLegacyRange(from, to);
    console.log(`Purge legacy rows in [${from}..${to}]: ${n} deleted (best-effort).`);
  }

  let start = DateTime.fromISO(from, { zone: TZ }).startOf('day');
  const end = DateTime.fromISO(to, { zone: TZ }).startOf('day');
  if (end < start) {
    console.error('--to must be >= --from');
    process.exit(1);
  }

  for (let d = start; d <= end; d = d.plus({ days: 1 })) {
    const ymd = d.toFormat('yyyy-LL-dd');
    const wd = d.weekday; // 1=Mon .. 7=Sun
    const runDate = d.set({ hour: 0, minute: 5, second: 0 }).toJSDate();

    if (wd !== 7) {
      console.log(`Daily pack ${ymd} …`);
      try {
        const res = await generateAndStoreInstitutionalBriefOnly({
          period: 'daily',
          runDate,
          timeZone: TZ,
        });
        console.log(`  →`, res.skipped ? res.reason : res.success ? 'ok' : res.error || res);
      } catch (e) {
        console.error(`  ✗ daily ${ymd}`, e.message || e);
      }
      await sleep(2500);
    } else {
      console.log(`Skip daily ${ymd} (Sunday).`);
    }

    if (wd === 1) {
      console.log(`Weekly pack ${ymd} …`);
      try {
        const res = await generateAndStoreInstitutionalBriefOnly({
          period: 'weekly',
          runDate,
          timeZone: TZ,
        });
        console.log(`  →`, res.skipped ? res.reason : res.success ? 'ok' : res.error || res);
      } catch (e) {
        console.error(`  ✗ weekly ${ymd}`, e.message || e);
      }
      await sleep(2500);
    }
  }
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
