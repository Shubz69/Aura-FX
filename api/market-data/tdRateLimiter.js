/**
 * Global per-process Twelve Data gate: rolling 60s RPM cap, bounded concurrency,
 * priority queue (interactive over background), in-flight dedupe by URL+params.
 *
 * Env:
 * - TWELVE_DATA_MAX_RPM (default 520 — headroom under common ~610 Venture caps; tune per deployment)
 * - TWELVE_DATA_MAX_CONCURRENT (default 4)
 *
 * Multi-instance / serverless: each isolate has its own gate — set TWELVE_DATA_MAX_RPM to
 * planMax / expectedConcurrentInstances to avoid aggregate spikes.
 */

const { getTdRequestMeta } = require('./tdRequestContext');

const WINDOW_MS = 60000;
const MAX_RPM = Math.max(30, parseInt(process.env.TWELVE_DATA_MAX_RPM || '520', 10) || 520);
const MAX_CONCURRENT = Math.max(1, parseInt(process.env.TWELVE_DATA_MAX_CONCURRENT || '4', 10) || 4);

const highQ = [];
const lowQ = [];
let activeExecutions = 0;
let pumpScheduled = false;

const recentStampWindow = [];

let rpmWaitCount = 0;
let rpmWaitMsTotal = 0;
let dedupeJoinCount = 0;
let tdRetryCount = 0;

const execByFeature = {};
let queuePeakHigh = 0;
let queuePeakLow = 0;

const inflightDedupe = new Map();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildDedupeKey(path, params) {
  const p = { ...(params || {}) };
  delete p.apikey;
  const keys = Object.keys(p).sort();
  const qs = keys.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(p[k]))}`).join('&');
  return `${path}?${qs}`;
}

function pruneStamps() {
  const t0 = Date.now() - WINDOW_MS;
  while (recentStampWindow.length && recentStampWindow[0] < t0) {
    recentStampWindow.shift();
  }
}

async function acquireRpmSlot() {
  for (;;) {
    pruneStamps();
    if (recentStampWindow.length < MAX_RPM) {
      recentStampWindow.push(Date.now());
      return;
    }
    const wait = recentStampWindow[0] + WINDOW_MS - Date.now() + 1;
    if (wait > 0) {
      rpmWaitCount += 1;
      const slice = Math.min(wait, 2000);
      rpmWaitMsTotal += slice;
      await sleep(slice);
    }
  }
}

function dequeue() {
  return highQ.shift() || lowQ.shift();
}

function recordQueuePeaks() {
  if (highQ.length > queuePeakHigh) queuePeakHigh = highQ.length;
  if (lowQ.length > queuePeakLow) queuePeakLow = lowQ.length;
}

function bumpExec(feature) {
  const f = feature || 'twelvedata';
  execByFeature[f] = (execByFeature[f] || 0) + 1;
}

async function runSlot(job) {
  const { fn, resolve, reject, dedupeKey, feature } = job;
  try {
    await acquireRpmSlot();
    const result = await fn();
    bumpExec(feature);
    resolve(result);
  } catch (e) {
    reject(e);
  } finally {
    if (dedupeKey) inflightDedupe.delete(dedupeKey);
    activeExecutions -= 1;
    schedulePump();
  }
}

function schedulePump() {
  if (pumpScheduled) return;
  pumpScheduled = true;
  setImmediate(() => {
    pumpScheduled = false;
    pump();
  });
}

function pump() {
  while (activeExecutions < MAX_CONCURRENT) {
    const job = dequeue();
    if (!job) break;
    activeExecutions += 1;
    runSlot(job);
  }
}

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{ dedupeKey?: string|null, feature?: string|null, priority?: 'interactive'|'background' }} [meta]
 * @returns {Promise<T>}
 */
async function withThrottle(fn, meta = {}) {
  const ctx = getTdRequestMeta();
  const feature = meta.feature != null ? meta.feature : ctx.throttleFeature || 'twelvedata';
  const priority =
    meta.priority || (ctx.trafficClass === 'background' ? 'background' : 'interactive');
  const dedupeKey = meta.dedupeKey != null ? meta.dedupeKey : null;

  if (dedupeKey) {
    const existing = inflightDedupe.get(dedupeKey);
    if (existing) {
      dedupeJoinCount += 1;
      return existing;
    }
  }

  let resolve;
  let reject;
  const p = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  if (dedupeKey) {
    inflightDedupe.set(dedupeKey, p);
  }

  const job = { fn, resolve, reject, feature, dedupeKey };
  if (priority === 'background') lowQ.push(job);
  else highQ.push(job);
  recordQueuePeaks();
  schedulePump();

  return p;
}

function recordTdRetry() {
  tdRetryCount += 1;
}

function stats() {
  pruneStamps();
  return {
    maxRpm: MAX_RPM,
    maxConcurrent: MAX_CONCURRENT,
    windowMs: WINDOW_MS,
    inFlight: activeExecutions,
    queuedInteractive: highQ.length,
    queuedBackground: lowQ.length,
    rollingWindowUsedSlots: recentStampWindow.length,
    rpmWaitsLifetime: rpmWaitCount,
    rpmWaitMsEstimated: rpmWaitMsTotal,
    dedupeJoinsLifetime: dedupeJoinCount,
    retriesLifetime: tdRetryCount,
    execByFeature: { ...execByFeature },
    queuePeakInteractive: queuePeakHigh,
    queuePeakBackground: queuePeakLow,
  };
}

function resetDiagnostics() {
  rpmWaitCount = 0;
  rpmWaitMsTotal = 0;
  dedupeJoinCount = 0;
  tdRetryCount = 0;
  Object.keys(execByFeature).forEach((k) => delete execByFeature[k]);
  queuePeakHigh = 0;
  queuePeakLow = 0;
}

module.exports = {
  withThrottle,
  stats,
  buildDedupeKey,
  resetDiagnostics,
  recordTdRetry,
};
