const { executeQuery } = require('../db');
const { ensureSurveillanceSchema } = require('./schema');
const { upsertRawEvent } = require('./store');
const { ADAPTERS } = require('./adapters');
const { sleep } = require('./httpFetch');
const {
  ensureAdapterRows,
  pickDueAdapterIds,
  markSuccess,
  markFailure,
} = require('./adapterState');
const { runCorroborationPass } = require('./corroboration');

function log(runId, level, msg, extra) {
  const line = `[surveillance] ${runId} ${msg}${extra != null ? ` ${JSON.stringify(extra)}` : ''}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

async function recordRunStart(adapterId) {
  const [r] = await executeQuery(
    `INSERT INTO surveillance_ingest_runs (adapter_id, items_in, items_out) VALUES (?, 0, 0)`,
    [adapterId]
  );
  return r && r.insertId != null ? r.insertId : null;
}

async function recordRunEnd(runDbId, itemsIn, itemsOut, errorCode, durationMs, meta) {
  if (!runDbId) return;
  await executeQuery(
    `UPDATE surveillance_ingest_runs SET finished_at = UTC_TIMESTAMP(), items_in = ?, items_out = ?, error_code = ?, duration_ms = ?, meta = ? WHERE id = ?`,
    [itemsIn, itemsOut, errorCode, durationMs, JSON.stringify(meta || {}), runDbId]
  ).catch(() => {});
}

function adapterById(id) {
  return ADAPTERS.find((a) => a.id === id);
}

async function runSurveillanceIngestion(opts = {}) {
  const runId = `ing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const started = Date.now();
  const maxTotalMs = opts.maxTotalMs || 240000;
  const delayMs = opts.delayMs || 550;
  const maxAdaptersPerRun = opts.maxAdaptersPerRun || 16;
  const maxPerAdapter = opts.maxPerAdapter || 14;

  const shouldStop = () => Date.now() - started > maxTotalMs;

  await ensureSurveillanceSchema();
  await ensureAdapterRows(ADAPTERS);

  const dueIds = await pickDueAdapterIds(maxAdaptersPerRun);
  const summary = { adapters: [], errors: [], dueCount: dueIds.length };

  const ctxBase = {
    runId,
    delayMs,
    maxPerAdapter,
    shouldStop,
    sleep,
    log: (lvl, m, e) => log(runId, lvl, m, e),
  };

  for (const adapterId of dueIds) {
    if (shouldStop()) break;
    const adapter = adapterById(adapterId);
    if (!adapter) {
      log(runId, 'warn', `unknown_adapter ${adapterId}`);
      continue;
    }

    const t0 = Date.now();
    let runDbId;
    let itemsOut = 0;
    let itemsIn = 0;
    let errorCode = null;
    let ingestMeta = null;
    try {
      runDbId = await recordRunStart(adapter.id);
      const runResult = await adapter.run(ctxBase);
      const items = Array.isArray(runResult) ? runResult : runResult?.items || [];
      ingestMeta = Array.isArray(runResult) ? null : runResult?.meta || null;
      itemsIn = items.length;
      for (const raw of items) {
        if (shouldStop()) break;
        try {
          await upsertRawEvent(raw);
          itemsOut += 1;
        } catch (e) {
          log(runId, 'warn', `upsert ${adapter.id}`, e.message);
        }
      }
      await markSuccess(adapter.id, itemsIn, itemsOut, Date.now() - t0, ingestMeta);
    } catch (e) {
      errorCode = e.message || 'adapter_failed';
      summary.errors.push({ adapter: adapter.id, error: errorCode });
      log(runId, 'error', `adapter ${adapter.id}`, errorCode);
      await markFailure(adapter.id, errorCode, Date.now() - t0);
    } finally {
      await recordRunEnd(runDbId, itemsIn, itemsOut, errorCode, Date.now() - t0, {
        runId,
        ...(ingestMeta && typeof ingestMeta === 'object' ? ingestMeta : {}),
      });
      summary.adapters.push({ id: adapter.id, itemsIn, itemsOut, ms: Date.now() - t0, errorCode });
    }
  }

  try {
    await runCorroborationPass();
  } catch (e) {
    log(runId, 'warn', 'corroboration_pass', e.message);
  }

  log(runId, 'info', 'ingest_complete', { ms: Date.now() - started, summary });
  return { success: true, runId, durationMs: Date.now() - started, summary };
}

module.exports = { runSurveillanceIngestion };
