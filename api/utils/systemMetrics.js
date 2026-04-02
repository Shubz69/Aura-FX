/**
 * In-process counters + lightweight alert hooks (Node API / workers).
 */

const metrics = {
  mt5_sync_attempts: 0,
  mt5_sync_failures: 0,
  chart_checks_run: 0,
  integrity_check_failures: 0,
};

const mt5FailureTimes = [];
const MT5_FAIL_WINDOW_MS = 300000;
const MT5_FAIL_ALERT_THRESHOLD = 5;

function getSnapshot() {
  return {
    ...metrics,
    ts: new Date().toISOString(),
  };
}

function inc(key, n = 1) {
  if (metrics[key] === undefined) metrics[key] = 0;
  metrics[key] += n;
}

function recordMt5SyncAttempt() {
  inc('mt5_sync_attempts');
}

function recordMt5SyncFailure() {
  inc('mt5_sync_failures');
  const now = Date.now();
  mt5FailureTimes.push(now);
  const cutoff = now - MT5_FAIL_WINDOW_MS;
  while (mt5FailureTimes.length && mt5FailureTimes[0] < cutoff) mt5FailureTimes.shift();
  if (mt5FailureTimes.length >= MT5_FAIL_ALERT_THRESHOLD) {
    try {
      const { logWarn } = require('./systemLogger');
      logWarn('metrics', 'alert_repeated_mt5_failures', {
        count: mt5FailureTimes.length,
        windowMs: MT5_FAIL_WINDOW_MS,
      });
    } catch (_) {
      /* optional */
    }
  }
}

function recordChartCheck() {
  inc('chart_checks_run');
}

function recordIntegrityCheckFailed() {
  inc('integrity_check_failures');
  try {
    const { logWarn } = require('./systemLogger');
    logWarn('metrics', 'alert_integrity_check_failed', {
      total: metrics.integrity_check_failures,
    });
  } catch (_) {
    /* optional */
  }
}

module.exports = {
  getSnapshot,
  inc,
  recordMt5SyncAttempt,
  recordMt5SyncFailure,
  recordChartCheck,
  recordIntegrityCheckFailed,
  metrics,
};
