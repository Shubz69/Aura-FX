/**
 * Trader Coach Engine – detects behavioral patterns: overtrading, revenge trading, inconsistent risk.
 * Input: array of trades { timestamp, outcome, pnl?, symbol?, riskPercent? }. Uses in-memory state.
 */

const TRADES_WINDOW_MS = 10 * 60 * 1000;   // 10 minutes
const MIN_TRADES_OVERTRADING = 3;
const REVENGE_WINDOW_MS = 15 * 60 * 1000;  // 15 min after a loss
const RISK_TOLERANCE_PCT = 0.5;             // 0.5% variation in risk % to flag inconsistency

function parseTime(ts) {
  if (ts == null) return 0;
  if (typeof ts === 'number') return ts;
  const d = new Date(ts);
  return Number.isFinite(d.getTime()) ? d.getTime() : 0;
}

function detectOvertrading(trades) {
  if (!Array.isArray(trades) || trades.length < MIN_TRADES_OVERTRADING) return null;
  const sorted = [...trades].sort((a, b) => parseTime(a.timestamp) - parseTime(b.timestamp));
  for (let i = 0; i <= sorted.length - MIN_TRADES_OVERTRADING; i++) {
    const window = sorted.slice(i, i + MIN_TRADES_OVERTRADING);
    const first = parseTime(window[0].timestamp);
    const last = parseTime(window[window.length - 1].timestamp);
    if (last - first <= TRADES_WINDOW_MS) {
      return {
        detected: true,
        message: `You entered ${MIN_TRADES_OVERTRADING} trades within 10 minutes. This behavior often indicates overtrading. Consider waiting for higher-conviction setups.`,
        count: MIN_TRADES_OVERTRADING,
        windowMinutes: 10
      };
    }
  }
  return null;
}

function detectRevengeTrading(trades) {
  if (!Array.isArray(trades) || trades.length < 2) return null;
  const sorted = [...trades].sort((a, b) => parseTime(a.timestamp) - parseTime(b.timestamp));
  for (let i = 0; i < sorted.length - 1; i++) {
    const loss = sorted[i].outcome === 'loss' || (sorted[i].pnl != null && sorted[i].pnl < 0);
    if (!loss) continue;
    const lossTime = parseTime(sorted[i].timestamp);
    const next = sorted[i + 1];
    const nextTime = parseTime(next.timestamp);
    if (nextTime - lossTime <= REVENGE_WINDOW_MS) {
      return {
        detected: true,
        message: 'You entered a trade shortly after a loss. This behavior often indicates revenge trading. Pause and reassess before next trade.',
        minutesAfterLoss: Math.round((nextTime - lossTime) / 60000)
      };
    }
  }
  return null;
}

function detectInconsistentRisk(trades) {
  const withRisk = (trades || []).filter(t => t.riskPercent != null && Number(t.riskPercent) > 0);
  if (withRisk.length < 2) return null;
  const pcts = withRisk.map(t => Number(t.riskPercent));
  const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length;
  const spread = Math.max(...pcts) - Math.min(...pcts);
  if (spread > RISK_TOLERANCE_PCT * 2) {
    return {
      detected: true,
      message: 'Risk per trade varies significantly. Inconsistent risk can lead to drawdowns. Stick to a fixed risk % (e.g. 1–2%).',
      minRisk: Math.min(...pcts),
      maxRisk: Math.max(...pcts)
    };
  }
  return null;
}

/**
 * Analyze recent trades for discipline issues.
 * @param {Array<{ timestamp, outcome, pnl?, symbol?, riskPercent? }>} trades
 * @returns {Object} { warnings, overtrading, revengeTrading, inconsistentRisk, summary }
 */
function analyze(trades = []) {
  const overtrading = detectOvertrading(trades);
  const revengeTrading = detectRevengeTrading(trades);
  const inconsistentRisk = detectInconsistentRisk(trades);

  const warnings = [overtrading, revengeTrading, inconsistentRisk].filter(Boolean);

  let summary = 'Trading discipline: No issues detected.';
  if (warnings.length > 0) {
    summary = 'Trading Discipline Warning: ' + warnings.map(w => w.message).join(' ');
  }

  return {
    warnings,
    overtrading: overtrading ?? { detected: false },
    revengeTrading: revengeTrading ?? { detected: false },
    inconsistentRisk: inconsistentRisk ?? { detected: false },
    summary
  };
}

module.exports = { analyze, detectOvertrading, detectRevengeTrading, detectInconsistentRisk };
