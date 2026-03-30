/**
 * Live institutional brief verification (same code path as cron / admin automation).
 * Requires: MYSQL_*, OPENAI_API_KEY, OPENAI_AUTOMATION_MODEL, TwelveData or quote fallbacks as configured.
 *
 * Usage (from repo root):
 *   node --env-file=.env.local scripts/live-verify-institutional-briefs.js
 */

/* eslint-disable no-console */
const { generateAndStoreInstitutionalBriefOnly } = require('../api/trader-deck/services/autoBriefGenerator');
const { executeQuery } = require('../api/db');

const TZ = 'Europe/London';

async function loadBriefBody(briefId) {
  const [rows] = await executeQuery(
    'SELECT file_data, title, date, period, brief_kind, generation_meta FROM trader_deck_briefs WHERE id = ? LIMIT 1',
    [briefId]
  );
  const r = rows && rows[0];
  if (!r) return null;
  let text = '';
  if (r.file_data) {
    text = Buffer.isBuffer(r.file_data) ? r.file_data.toString('utf8') : String(r.file_data);
  }
  let meta = r.generation_meta;
  if (meta && typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch {
      meta = null;
    }
  }
  return { ...r, bodyText: text, generation_meta: meta };
}

function snippet(md, max = 2200) {
  const s = String(md || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n\n… [truncated ${s.length - max} chars]`;
}

function assessMarkdown(label, md, meta) {
  const hasMacro = /^##\s+Global macro and geopolitical environment\s*$/im.test(md);
  const lines = [
    `[${label}]`,
    `  includeGlobalMacroSection (meta): ${meta?.structuredBrief?.includeGlobalMacroSection ?? meta?.includeGlobalMacroSection ?? 'n/a'}`,
    `  H2 "Global macro" present in body: ${hasMacro}`,
    `  length: ${md.length} chars`,
  ];
  return lines.join('\n');
}

async function run() {
  if (!String(process.env.OPENAI_AUTOMATION_MODEL || '').trim()) {
    console.error('OPENAI_AUTOMATION_MODEL is not set. Aborting.');
    process.exit(1);
  }
  if (!String(process.env.OPENAI_API_KEY || '').trim()) {
    console.error('OPENAI_API_KEY is not set. Aborting.');
    process.exit(1);
  }

  /** Lighter typical weekday (avoid known US payroll Friday). */
  const lightRun = new Date('2026-04-14T06:00:00+01:00');
  /** Heavier: first Friday of month (often payroll + month-end flow). */
  const heavyRun = new Date('2026-04-03T06:00:00+01:00');
  /** Weekly: Sunday storage date in Europe/London week model. */
  const weeklyRun = new Date('2026-04-12T18:00:00+01:00');

  const results = [];

  console.log('Generating LIGHT daily (2026-04-14)…');
  const lightRes = await generateAndStoreInstitutionalBriefOnly({
    period: 'daily',
    runDate: lightRun,
    timeZone: TZ,
  });
  results.push({ tag: 'daily-light', runDate: lightRun.toISOString(), res: lightRes });

  console.log('Generating HEAVY daily (2026-04-03)…');
  const heavyRes = await generateAndStoreInstitutionalBriefOnly({
    period: 'daily',
    runDate: heavyRun,
    timeZone: TZ,
  });
  results.push({ tag: 'daily-heavy', runDate: heavyRun.toISOString(), res: heavyRes });

  console.log('Generating WEEKLY (2026-04-12 Sunday)…');
  const weeklyRes = await generateAndStoreInstitutionalBriefOnly({
    period: 'weekly',
    runDate: weeklyRun,
    timeZone: TZ,
  });
  results.push({ tag: 'weekly', runDate: weeklyRun.toISOString(), res: weeklyRes });

  for (const item of results) {
    const { res, tag } = item;
    console.log('\n---', tag, '---');
    console.log(JSON.stringify(res, null, 2));
    if (res.success && res.briefId && !res.skipped) {
      const loaded = await loadBriefBody(res.briefId);
      if (loaded) {
        console.log(assessMarkdown(tag, loaded.bodyText, loaded.generation_meta));
        console.log('\n--- Snippet ---\n');
        console.log(snippet(loaded.bodyText));
      }
    }
  }

  console.log('\nDone.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
