/**
 * TradeZella-style "habits & strengths" narrative from existing analytics only (no new samples).
 * Deterministic ranking for the same analytics payload.
 */

function pushUnique(arr, item, key) {
  const k = key || item.title;
  if (!k || arr.some((x) => (x.title || x) === k)) return;
  arr.push(typeof item === 'string' ? { title: item, detail: '' } : item);
}

/** @param {Record<string, any>} a analytics payload from computeAnalytics */
export function buildHabitsStrengthsReport(a) {
  const strengths = [];
  const weaknesses = [];
  const habitFlags = [];

  const inst = a.institutional;
  const eq = inst?.executionQuality;
  const beh = inst?.behavioural;

  if (!a.totalTrades) {
    return {
      strengths,
      weaknesses: [{ title: 'No closed trades in range', detail: 'Widen the date filter or sync history to generate habits insights.' }],
      habitFlags,
    };
  }

  if (a.pctWithSL >= 85) {
    pushUnique(strengths, { title: 'Stop usage', detail: `${a.pctWithSL.toFixed(0)}% of trades carry a stop — disciplined risk definition.` });
  } else if (a.pctWithSL < 65) {
    pushUnique(weaknesses, { title: 'Thin stop coverage', detail: `Only ${a.pctWithSL.toFixed(0)}% of trades have a recorded stop — prop-style drawdown risk rises fast.` });
    habitFlags.push({ code: 'low_sl', label: 'Many trades without SL', severity: 'high' });
  }

  if (a.revengeStyleRate < 12) {
    pushUnique(strengths, { title: 'Calm re-entry', detail: 'Very few trades open within 5 minutes of a loss — good impulse control.' });
  } else if (a.revengeStyleRate >= 22) {
    pushUnique(weaknesses, { title: 'Revenge-style frequency', detail: `${a.revengeStyleRate.toFixed(1)}% of trades follow a loss within five minutes — pause rules help.` });
    habitFlags.push({ code: 'revenge', label: 'Fast re-entries after red closes', severity: a.revengeStyleRate >= 35 ? 'high' : 'med' });
  }

  if (a.winRate >= 52 && a.profitFactor >= 1.2) {
    pushUnique(strengths, { title: 'Positive expectancy stack', detail: `Win rate and profit factor both supportive (${a.winRate.toFixed(0)}% / ${a.profitFactor.toFixed(2)} PF).` });
  } else if (a.profitFactor < 1 && a.totalTrades >= 12) {
    pushUnique(weaknesses, { title: 'Sub-1 profit factor', detail: 'Gross losses exceed gross profit — size, selection, or exits need review.' });
  }

  if (a.maxLossStreak >= 6) {
    pushUnique(weaknesses, { title: 'Long loss streaks', detail: `Max ${a.maxLossStreak} consecutive losses — consider daily max-loss or strategy pause triggers.` });
    habitFlags.push({ code: 'loss_run', label: 'Extended loss streaks', severity: 'med' });
  } else if (a.maxLossStreak <= 3 && a.totalTrades >= 15) {
    pushUnique(strengths, { title: 'Contained loss runs', detail: 'Loss streaks stayed short relative to sample size.' });
  }

  if (eq?.entryEfficiencyAvg != null && eq.entryEfficiencyAvg >= 0.55) {
    pushUnique(strengths, { title: 'Entry timing (path)', detail: 'Entry efficiency vs excursion path looks strong.' });
  } else if (eq?.entryEfficiencyAvg != null && eq.entryEfficiencyAvg < 0.35 && eq.mfeMaeTradeCoverage?.mfe >= 5) {
    pushUnique(weaknesses, { title: 'Weak entry efficiency', detail: 'Entries often late vs path MFE — review triggers and FOMO entries.' });
  }

  if (eq?.rrCaptureRatioAvg != null && eq.rrCaptureRatioAvg >= 0.45) {
    pushUnique(strengths, { title: 'RR capture', detail: 'You convert a solid share of available R when path data exists.' });
  } else if (eq?.rrCaptureRatioAvg != null && eq.rrCaptureRatioAvg < 0.28 && eq.mfeMaeTradeCoverage?.mfe >= 5) {
    pushUnique(weaknesses, { title: 'RR left on table', detail: 'Realized R is low vs available excursion — targets/trailing may be misfit.' });
  }

  const mc = inst?.riskEngine?.monteCarlo?.ruinProbApprox;
  if (mc != null && mc <= 0.12) {
    pushUnique(strengths, { title: 'Tail risk (sim)', detail: 'Bootstrap risk-of-ruin estimate is in a comfortable band for the sample.' });
  } else if (mc != null && mc > 0.22) {
    pushUnique(weaknesses, { title: 'Elevated tail risk', detail: 'Monte Carlo suggests meaningful breach risk — reduce size until edge stabilizes.' });
    habitFlags.push({ code: 'tail', label: 'High simulated ruin share', severity: 'high' });
  }

  const mcost = beh?.mistakeCost?.totalMistakeCost;
  if (mcost > 0 && mcost > Math.max(1, Math.abs(a.totalPnl) * 0.08)) {
    pushUnique(weaknesses, {
      title: 'Mistake tax',
      detail: `Estimated mistake/revenge tail cost ~$${mcost.toFixed(0)} — exits and impulse trades may dominate P/L.`,
    });
    habitFlags.push({ code: 'mistake_cost', label: 'Structured mistake cost visible', severity: 'med' });
  }

  const clusters = beh?.mistakeClustering?.lossBurstClusters;
  if (clusters >= 3) {
    pushUnique(weaknesses, { title: 'Loss clustering', detail: `${clusters} bursts of 3+ losses — batch review those sessions.` });
    habitFlags.push({ code: 'clusters', label: 'Repeated loss clusters', severity: 'med' });
  }

  if (a.topSymbolConcentrationPct > 62) {
    pushUnique(weaknesses, { title: 'Symbol concentration', detail: `${a.topSymbolConcentrationPct.toFixed(0)}% of trades in one symbol — outcome variance is narrow but fragile.` });
  } else if (a.topSymbolConcentrationPct < 38 && a.bySymbol?.length >= 3) {
    pushUnique(strengths, { title: 'Diversified activity', detail: 'Trades spread across multiple symbols in this window.' });
  }

  // Surface top automated insights as habits (trim)
  (a.insights || []).slice(0, 6).forEach((txt) => {
    const t = String(txt).toLowerCase();
    if (t.includes('dragging') || t.includes('underperform') || t.includes('danger') || t.includes('without a defined stop')) {
      pushUnique(weaknesses, { title: 'Pattern note', detail: txt });
    } else if (t.includes('strongest wins') || t.includes('most profitable') || t.includes('within safe limits')) {
      pushUnique(strengths, { title: 'Pattern note', detail: txt });
    }
  });

  return {
    strengths: strengths.slice(0, 8),
    weaknesses: weaknesses.slice(0, 8),
    habitFlags,
  };
}
