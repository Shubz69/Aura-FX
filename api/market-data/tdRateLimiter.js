/**
 * Per-process Twelve Data throttle: max concurrent in-flight + soft RPM cap.
 * TWELVE_DATA_MAX_RPM (default 480), TWELVE_DATA_MAX_CONCURRENT (default 8)
 */

const MAX_RPM = Math.max(30, parseInt(process.env.TWELVE_DATA_MAX_RPM || '480', 10) || 480);
const MAX_CONCURRENT = Math.max(1, parseInt(process.env.TWELVE_DATA_MAX_CONCURRENT || '8', 10) || 8);
const MIN_GAP_MS = Math.ceil(60000 / MAX_RPM);

let inFlight = 0;
const stampede = [];
let lastStart = 0;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Run fn inside concurrency + spacing gate.
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withThrottle(fn) {
  while (inFlight >= MAX_CONCURRENT) {
    await sleep(15);
  }
  const now = Date.now();
  const wait = Math.max(0, MIN_GAP_MS - (now - lastStart));
  if (wait > 0) await sleep(wait);
  lastStart = Date.now();
  inFlight += 1;
  try {
    return await fn();
  } finally {
    inFlight -= 1;
  }
}

function stats() {
  return { maxRpm: MAX_RPM, maxConcurrent: MAX_CONCURRENT, minGapMs: MIN_GAP_MS, inFlight };
}

module.exports = {
  withThrottle,
  stats,
};
