import { monteCarloRiskFixed, MC_DEFAULT_RUNS } from './analytics/monteCarloRisk';

const memo = { key: null, result: null };
const MEMO_CAP = 4;
const memoQueue = [];

function remember(key, result) {
  if (!key) return;
  if (memoQueue.length >= MEMO_CAP) {
    const old = memoQueue.shift();
    if (memo.key === old) {
      memo.key = null;
      memo.result = null;
    }
  }
  memoQueue.push(key);
  memo.key = key;
  memo.result = result;
}

function fromMemo(key) {
  if (key && memo.key === key && memo.result) return memo.result;
  return null;
}

/**
 * Runs Monte Carlo off the main thread when Worker is available; sync fallback otherwise.
 * @param {number[]} pnls
 * @param {number} startBalance
 * @param {{ runs?: number, cacheKey?: string | null }} [opts]
 * @returns {Promise<object>} Monte Carlo summary (same shape as monteCarloRiskFixed).
 */
export function runMonteCarloOffMainThread(pnls, startBalance, opts = {}) {
  const runs = opts.runs ?? MC_DEFAULT_RUNS;
  const cacheKey = opts.cacheKey ?? null;

  const cached = fromMemo(cacheKey);
  if (cached) return Promise.resolve(cached);

  if (!Array.isArray(pnls) || pnls.length < 5 || !Number.isFinite(startBalance) || startBalance <= 1e-6) {
    const mc = monteCarloRiskFixed(pnls, startBalance, runs);
    remember(cacheKey, mc);
    return Promise.resolve(mc);
  }

  if (typeof Worker === 'undefined') {
    const mc = monteCarloRiskFixed(pnls, startBalance, runs);
    remember(cacheKey, mc);
    return Promise.resolve(mc);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (mc) => {
      if (settled) return;
      settled = true;
      remember(cacheKey, mc);
      resolve(mc);
    };

    let worker;
    const timer = setTimeout(() => {
      try {
        worker?.terminate();
      } catch (_) { /* noop */ }
      finish(monteCarloRiskFixed(pnls, startBalance, runs));
    }, 12000);

    try {
      worker = new Worker(
        new URL('./workers/institutionalMonteCarlo.worker.js', import.meta.url),
        { type: 'module' }
      );
      worker.onmessage = (ev) => {
        clearTimeout(timer);
        try {
          worker.terminate();
        } catch (_) { /* noop */ }
        const mc = ev.data?.mc;
        if (mc && typeof mc === 'object') finish(mc);
        else finish(monteCarloRiskFixed(pnls, startBalance, runs));
      };
      worker.onerror = () => {
        clearTimeout(timer);
        try {
          worker.terminate();
        } catch (_) { /* noop */ }
        finish(monteCarloRiskFixed(pnls, startBalance, runs));
      };
      worker.postMessage({ pnls, startBalance, runs });
    } catch (_) {
      clearTimeout(timer);
      finish(monteCarloRiskFixed(pnls, startBalance, runs));
    }
  });
}
