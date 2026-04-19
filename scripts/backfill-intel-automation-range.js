/**
 * Backfill eight-sleeve institutional Market Intelligence briefs (daily + weekly)
 * for a date range by calling the same generator as /api/cron/auto-market-briefs.
 *
 * Requirements:
 * - --dry-run: none (prints planned daily/weekly pack dates only).
 * - Real run: MySQL env (api/db.js) + PERPLEXITY_API_KEY (see isTraderDeskAutomationConfigured()).
 *   Repo-root `.env` and `.env.local` are loaded automatically (same folder as package.json).
 *
 * Verify env without running a range:
 *   node scripts/backfill-intel-automation-range.js --check-env
 *
 * Run from repo root (long-running — dozens of LLM pack runs):
 *   node scripts/backfill-intel-automation-range.js --from=2026-03-01
 *   (--to defaults to today in Europe/London; dates run newest → oldest so recent MI fills first.)
 *
 * Options:
 *   --daily-only       Skip weekly packs
 *   --weekly-only      Skip daily packs
 *   --include-weekends Also run daily on Sat/Sun London (default: Mon–Fri only)
 *   --force            Regenerate even when 8/8 sleeves already exist
 *   --delay-ms=4000    Pause between pack invocations (default 4000)
 *   --dry-run          Log planned work only; no generation
 *   --check-env        Print whether PERPLEXITY_API_KEY + MySQL vars are set; exit 0 if ready
 *   --parallel-sleeves Run 8 category LLMs in parallel (faster; console stays quiet for minutes)
 *   --oldest-first     Process --from → --to ascending (default is newest-first: --to down to --from)
 *
 * Optional env (see institutionalAuraBrief.js):
 *   INSTITUTIONAL_PERPLEXITY_TIMEOUT_MS — Perplexity fetch timeout per attempt (default 300000; was 180000).
 *
 * Default for this script: one sleeve at a time so you see steady progress (set before any API require).
 */

/* eslint-disable no-console */

'use strict';

const path = require('path');
const repoRoot = path.join(__dirname, '..');
// Bare `node scripts/...` does not load .env; mirror local CRA-style secrets at repo root.
require('dotenv').config({ path: path.join(repoRoot, '.env') });
require('dotenv').config({ path: path.join(repoRoot, '.env.local'), override: true });

const argv = process.argv.slice(2);
if (!argv.includes('--parallel-sleeves')) {
  process.env.INSTITUTIONAL_WFA_SEQUENTIAL = '1';
}

const { DateTime } = require('luxon');
const { executeQuery } = require('../api/db');
const { getWeekEndingSundayUtcYmd } = require('../api/trader-deck/deskDates');
const {
  INSTITUTIONAL_DAILY_WFA_KINDS,
  INSTITUTIONAL_WEEKLY_WFA_KINDS,
} = require('../api/trader-deck/deskBriefKinds');
const {
  generateAndStoreInstitutionalBriefOnly,
  isTraderDeskAutomationConfigured,
} = require('../api/trader-deck/services/autoBriefGenerator');

const TZ = 'Europe/London';

function parseArgs() {
  const out = {
    from: '2026-03-01',
    to: '',
    dailyOnly: false,
    weeklyOnly: false,
    includeWeekends: false,
    force: false,
    delayMs: 4000,
    dryRun: false,
    checkEnv: false,
    oldestFirst: false,
  };
  for (const a of argv) {
    if (a.startsWith('--from=')) out.from = a.slice(7).trim().slice(0, 10);
    else if (a.startsWith('--to=')) out.to = a.slice(5).trim().slice(0, 10);
    else if (a === '--daily-only') out.dailyOnly = true;
    else if (a === '--weekly-only') out.weeklyOnly = true;
    else if (a === '--include-weekends') out.includeWeekends = true;
    else if (a === '--force') out.force = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--check-env') out.checkEnv = true;
    else if (a.startsWith('--delay-ms=')) out.delayMs = Math.max(0, Number(a.slice(11)) || 0);
    else if (a === '--oldest-first') out.oldestFirst = true;
  }
  if (!out.to) {
    out.to = DateTime.now().setZone(TZ).toISODate();
  }
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function countInstitutionalKinds(dateYmd, period) {
  const kinds = period === 'weekly' ? INSTITUTIONAL_WEEKLY_WFA_KINDS : INSTITUTIONAL_DAILY_WFA_KINDS;
  const ph = kinds.map(() => '?').join(',');
  const [rows] = await executeQuery(
    `SELECT COUNT(DISTINCT LOWER(brief_kind)) AS c FROM trader_deck_briefs
     WHERE date = ? AND period = ? AND LOWER(brief_kind) IN (${ph})`,
    [dateYmd, period, ...kinds.map((k) => String(k).toLowerCase())]
  );
  return Number(rows?.[0]?.c || 0);
}

function jsDateNoonLondon(ymd) {
  const dt = DateTime.fromISO(`${String(ymd).slice(0, 10)}T12:00:00`, { zone: TZ });
  return dt.isValid ? dt.toJSDate() : new Date();
}

function jsDateNoonUtc(ymd) {
  const dt = DateTime.fromISO(`${String(ymd).slice(0, 10)}T12:00:00`, { zone: 'utc' });
  return dt.isValid ? dt.toJSDate() : new Date();
}

async function main() {
  const opts = parseArgs();
  if (opts.checkEnv) {
    const key = String(process.env.PERPLEXITY_API_KEY || '').trim();
    const mysqlOk = Boolean(
      process.env.MYSQL_HOST &&
        process.env.MYSQL_USER &&
        process.env.MYSQL_PASSWORD &&
        process.env.MYSQL_DATABASE
    );
    console.log('[backfill] check-env — loaded', path.join(repoRoot, '.env'), 'and .env.local (if present)');
    console.log(
      '  PERPLEXITY_API_KEY:',
      key ? `set (length ${key.length})` : 'MISSING — put in .env or set in shell before node'
    );
    console.log(
      '  MySQL:',
      mysqlOk ? 'HOST/USER/PASSWORD/DATABASE set' : 'MISSING — real backfill needs these (see api/db.js)'
    );
    const ok = Boolean(key) && mysqlOk;
    if (!ok) console.error('[backfill] Not ready for a real run until missing items are set.');
    process.exit(ok ? 0 : 1);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.from) || !/^\d{4}-\d{2}-\d{2}$/.test(opts.to)) {
    console.error('Invalid --from / --to (use YYYY-MM-DD)');
    process.exit(1);
  }
  if (opts.from > opts.to) {
    console.error('--from must be <= --to');
    process.exit(1);
  }

  if (!opts.dryRun && !isTraderDeskAutomationConfigured()) {
    console.error(
      '[backfill] Automation not configured (set PERPLEXITY_API_KEY for real runs). Dry-run does not need it: add --dry-run to preview dates only.'
    );
    process.exit(1);
  }

  let start = DateTime.fromISO(opts.from, { zone: TZ }).startOf('day');
  const end = DateTime.fromISO(opts.to, { zone: TZ }).endOf('day');
  if (!start.isValid || !end.isValid) {
    console.error('Invalid date range');
    process.exit(1);
  }

  const dailyDates = [];
  for (let d = start; d <= end; d = d.plus({ days: 1 })) {
    const wd = d.weekday; // 1=Mon … 7=Sun
    if (!opts.includeWeekends && (wd === 6 || wd === 7)) continue;
    dailyDates.push(d.toISODate());
  }

  const weeklySundays = new Set();
  for (let d = start; d <= end; d = d.plus({ days: 1 })) {
    const y = d.toISODate();
    weeklySundays.add(getWeekEndingSundayUtcYmd(y));
  }
  let weeklySorted = [...weeklySundays].sort();
  if (!opts.oldestFirst) {
    dailyDates.reverse();
    weeklySorted.reverse();
  }

  console.log('[backfill] Range', opts.from, '→', opts.to, TZ);
  console.log(
    '[backfill] Order:',
    opts.oldestFirst ? 'oldest → newest (--oldest-first)' : 'newest → oldest (default; recent MI visible first)'
  );
  console.log(
    '[backfill] Plan:',
    !opts.weeklyOnly ? `${dailyDates.length} daily pack(s) (Mon–Fri${opts.includeWeekends ? ' + weekends' : ''})` : '',
    !opts.dailyOnly ? `${weeklySorted.length} weekly pack(s) (UTC week-ending Sunday keys)` : '',
    opts.dryRun ? '(dry-run)' : ''
  );
  if (!opts.dryRun && process.env.INSTITUTIONAL_WFA_SEQUENTIAL === '1') {
    console.log('[backfill] LLM sleeves: one category at a time (steady logs). Use --parallel-sleeves for all-at-once.');
  }

  const results = { daily: [], weekly: [], errors: [] };

  if (!opts.weeklyOnly) {
    for (const ymd of dailyDates) {
      try {
        if (!opts.force && !opts.dryRun) {
          const c = await countInstitutionalKinds(ymd, 'daily');
          if (c >= 8) {
            console.log('[backfill] daily skip (complete)', ymd, c, '/8');
            results.daily.push({ date: ymd, skipped: true, reason: 'complete', count: c });
            continue;
          }
        }
        console.log('[backfill] daily run', ymd, opts.dryRun ? '(dry-run)' : '…');
        if (opts.dryRun) {
          results.daily.push({ date: ymd, dryRun: true });
          continue;
        }
        const out = await generateAndStoreInstitutionalBriefOnly({
          period: 'daily',
          runDate: jsDateNoonLondon(ymd),
          timeZone: TZ,
        });
        results.daily.push({ date: ymd, out });
        console.log('[backfill] daily done', ymd, out?.success === false ? out : 'ok');
        if (opts.delayMs) await sleep(opts.delayMs);
      } catch (e) {
        console.error('[backfill] daily error', ymd, e.message || e);
        results.errors.push({ period: 'daily', date: ymd, error: String(e.message || e) });
      }
    }
  }

  if (!opts.dailyOnly) {
    for (const sun of weeklySorted) {
      try {
        if (!opts.force && !opts.dryRun) {
          const c = await countInstitutionalKinds(sun, 'weekly');
          if (c >= 8) {
            console.log('[backfill] weekly skip (complete)', sun, c, '/8');
            results.weekly.push({ date: sun, skipped: true, reason: 'complete', count: c });
            continue;
          }
        }
        console.log('[backfill] weekly run', sun, opts.dryRun ? '(dry-run)' : '…');
        if (opts.dryRun) {
          results.weekly.push({ date: sun, dryRun: true });
          continue;
        }
        const out = await generateAndStoreInstitutionalBriefOnly({
          period: 'weekly',
          runDate: jsDateNoonUtc(sun),
          timeZone: TZ,
        });
        results.weekly.push({ date: sun, out });
        console.log('[backfill] weekly done', sun, out?.success === false ? out : 'ok');
        if (opts.delayMs) await sleep(opts.delayMs);
      } catch (e) {
        console.error('[backfill] weekly error', sun, e.message || e);
        results.errors.push({ period: 'weekly', date: sun, error: String(e.message || e) });
      }
    }
  }

  console.log('[backfill] Summary', JSON.stringify({ ...results, errors: results.errors.slice(0, 50) }, null, 0));
  process.exit(results.errors.length ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
