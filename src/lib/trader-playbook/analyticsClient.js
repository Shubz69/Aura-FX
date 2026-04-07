function n(x) {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function summarizeValidatorTrades(trades, playbookId) {
  const list = (trades || []).filter(
    (t) =>
      t.playbookSetupId === playbookId &&
      String(t.setupTagType || '').toUpperCase() === 'PLAYBOOK' &&
      ['win', 'loss', 'breakeven'].includes(String(t.result || '').toLowerCase())
  );
  const wins = list.filter((t) => String(t.result).toLowerCase() === 'win').length;
  const losses = list.filter((t) => String(t.result).toLowerCase() === 'loss').length;
  const be = list.filter((t) => String(t.result).toLowerCase() === 'breakeven').length;
  const closed = list.length;
  const pnls = list.map((t) => n(t.pnl));
  const totalPnl = pnls.reduce((a, b) => a + b, 0);
  const avgR = list.length > 0 ? list.reduce((s, t) => s + n(t.rMultiple), 0) / list.length : null;
  const gw = pnls.filter((p) => p > 0).reduce((a, b) => a + b, 0);
  const gl = -pnls.filter((p) => p < 0).reduce((a, b) => a + b, 0);
  const pf = gl > 0 ? gw / gl : gw > 0 ? null : null;
  return {
    count: list.length,
    wins,
    losses,
    breakevens: be,
    winRate: closed ? wins / closed : null,
    profitFactor: pf,
    expectancy: closed ? totalPnl / closed : null,
    totalPnl,
    avgWin: wins ? gw / wins : null,
    avgLoss: losses ? gl / losses : null,
    avgR,
    best: pnls.length ? Math.max(...pnls) : null,
    worst: pnls.length ? Math.min(...pnls) : null,
  };
}

export function summarizeJournalTrades(trades, playbookId) {
  const list = (trades || []).filter(
    (t) => t.playbookSetupId === playbookId && String(t.setupTagType || '').toUpperCase() === 'PLAYBOOK'
  );
  const rs = list.map((t) => n(t.rResult));
  if (!rs.length)
    return { count: 0, wins: 0, losses: 0, breakevens: 0, winRate: null, totalR: 0, expectancyR: null };
  const wins = rs.filter((r) => r > 0).length;
  const losses = rs.filter((r) => r < 0).length;
  const be = rs.filter((r) => r === 0).length;
  const closed = rs.length;
  const totalR = rs.reduce((a, b) => a + b, 0);
  return {
    count: closed,
    wins,
    losses,
    breakevens: be,
    winRate: closed ? wins / closed : null,
    totalR,
    expectancyR: closed ? totalR / closed : null,
  };
}

function topEntries(obj, nMax = 4) {
  return Object.entries(obj)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, nMax);
}

/** Breakdowns for current playbook tagged trades only — honest counts from client data. */
export function computeExecutionBreakdowns(vTrades, jTrades, playbookId) {
  const v = (vTrades || []).filter(
    (t) => t.playbookSetupId === playbookId && String(t.setupTagType || '').toUpperCase() === 'PLAYBOOK'
  );
  const j = (jTrades || []).filter(
    (t) => t.playbookSetupId === playbookId && String(t.setupTagType || '').toUpperCase() === 'PLAYBOOK'
  );

  const byDow = {};
  const bySession = {};
  const byPair = {};
  let maxWinStreak = 0;
  let maxLossStreak = 0;

  const combined = [
    ...v.map((t) => ({
      at: t.createdAt,
      pair: (t.pair || '').toUpperCase(),
      session: (t.session || '').trim() || '—',
      result: String(t.result || '').toLowerCase(),
    })),
    ...j.map((t) => ({
      at: t.date,
      pair: (t.pair || '').toUpperCase(),
      session: (t.session || '').trim() || '—',
      result: n(t.rResult) > 0 ? 'win' : n(t.rResult) < 0 ? 'loss' : 'breakeven',
    })),
  ].sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));

  combined.forEach((row) => {
    const d = row.at ? new Date(row.at) : null;
    const dow = d && !Number.isNaN(d.getTime()) ? DOW[d.getDay()] : '—';
    byDow[dow] = (byDow[dow] || 0) + 1;
    const sessKey = row.session || '—';
    bySession[sessKey] = (bySession[sessKey] || 0) + 1;
    const pk = row.pair || '—';
    byPair[pk] = (byPair[pk] || 0) + 1;
  });

  const chronological = [...combined].sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
  let curWS = 0;
  let curLS = 0;
  chronological.forEach((row) => {
    if (row.result === 'win') {
      curWS += 1;
      curLS = 0;
      maxWinStreak = Math.max(maxWinStreak, curWS);
    } else if (row.result === 'loss') {
      curLS += 1;
      curWS = 0;
      maxLossStreak = Math.max(maxLossStreak, curLS);
    } else {
      curWS = 0;
      curLS = 0;
    }
  });

  return {
    byDow: topEntries(byDow, 7),
    bySession: topEntries(bySession, 6),
    byPair: topEntries(byPair, 8),
    maxWinStreak,
    maxLossStreak,
    sampleSize: combined.length,
  };
}

/** Missed-trade pattern summary for this playbook */
export function summarizeMissedPatterns(mTrades, playbookId) {
  const rows = (mTrades || []).filter((m) => !playbookId || m.playbookId === playbookId);
  const byType = {};
  rows.forEach((m) => {
    const k = (m.missType || 'unknown').toLowerCase();
    byType[k] = (byType[k] || 0) + 1;
  });
  return { total: rows.length, topMissTypes: topEntries(byType, 5) };
}

/**
 * @param {object} ctx — validatorSummary, journalSummary, globalSummary (hub), mPatterns, breakdowns, playbookName
 */
export function ruleBasedInsights(ctx = {}) {
  const v = ctx.validatorSummary || {};
  const j = ctx.journalSummary || {};
  const g = ctx.globalSummary || {};
  const m = ctx.mPatterns || { total: 0, topMissTypes: [] };
  const bd = ctx.breakdowns || { sampleSize: 0 };
  const book = ctx.playbookName ? String(ctx.playbookName).trim() : '';

  const working = [];
  const hurting = [];
  const refine = [];

  const closedV = v.count || 0;
  const closedJ = j.count || 0;

  if (closedV >= 8 && v.winRate != null && v.winRate >= 0.52 && (v.profitFactor == null || v.profitFactor >= 1.15)) {
    working.push(
      `Measured edge is holding: ${(v.winRate * 100).toFixed(1)}% win rate over ${closedV} closed validator trades${
        v.profitFactor != null ? `, profit factor ${v.profitFactor.toFixed(2)}` : ''
      } — treat this as your sizing baseline until regime shifts.`
    );
  } else if (closedV >= 4 && closedV < 8 && v.winRate != null && v.winRate >= 0.55) {
    working.push(
      `Early sample (${closedV} closes) leans positive — keep tagging before you resize; one bad week should not rewrite rules yet.`
    );
  }

  if (closedJ >= 8 && j.expectancyR != null && j.expectancyR > 0.08) {
    working.push(
      `Journal expectancy ${j.expectancyR.toFixed(2)}R per trade across ${closedJ} executions — the process is paying when you stay on book.`
    );
  }

  if (bd.sampleSize >= 10 && bd.byPair.length) {
    const [topPair, topN] = bd.byPair[0];
    working.push(
      `Execution clusters on ${topPair} (${topN} tagged) — codify any symbol-specific tweaks in Rules so the edge stays repeatable.`
    );
  }

  if (closedV >= 6 && v.winRate != null && v.winRate < 0.42) {
    hurting.push(
      `Win rate ${(v.winRate * 100).toFixed(1)}% across ${closedV} validator closes — either conditions are outside regime or entries/invalidations are too loose for this book.`
    );
  }

  if (closedV >= 6 && v.profitFactor != null && v.profitFactor < 1) {
    hurting.push(
      `Profit factor ${v.profitFactor.toFixed(2)} — average loss is winning the arithmetic; do not add size until payoff structure is fixed.`
    );
  }

  if (closedV >= 5 && v.expectancy != null && v.expectancy < 0) {
    hurting.push(
      `Negative $ expectancy (${v.expectancy.toFixed(2)} per trade) — stand down on size${book ? ` for “${book}”` : ''} until rules or tags are corrected.`
    );
  }

  const noSetupRate = g.noSetupRate;
  const tagged = g.taggedTrades ?? 0;
  const noS = g.noSetupTrades ?? 0;
  if (noSetupRate != null && noSetupRate > 0.22 && tagged + noS >= 12) {
    hurting.push(
      `${(noSetupRate * 100).toFixed(1)}% of classified fills are off-plan (no setup) — that is direct leakage against anything you measure on playbook rows.`
    );
  }

  const uncl = g.unclassifiedTrades ?? 0;
  if (uncl >= 8 && uncl > (tagged + noS) * 0.35) {
    hurting.push(
      `${uncl} rows still untagged — discipline and edge metrics are understated until every close is classified.`
    );
  }

  if (m.total >= 4 && tagged >= 10 && m.total / tagged > 0.35) {
    hurting.push(
      `Missed / mis-execution log (${m.total}) is heavy vs ${tagged} on-book trades — tighten prep, timing, or thresholds; the opportunity cost is real.`
    );
  }

  if (m.topMissTypes.length && m.total >= 3) {
    const [t1, c1] = m.topMissTypes[0];
    refine.push(
      `Dominant miss pattern: “${t1}” (${c1}×) — pick one countermeasure and write it into Stand down or Checklist this week.`
    );
  }

  if (closedV < 5 && closedJ < 5 && bd.sampleSize < 5) {
    refine.push(
      'Not enough tagged history to judge this book — close the log: classify every fill, then revisit edge and expectancy with a clean denominator.'
    );
  }

  if (bd.maxLossStreak >= 4 && closedV + closedJ >= 15) {
    refine.push(
      `${bd.maxLossStreak}-loss streak in sample — if structure was valid each time, tighten context filters; if not, this is execution drift.`
    );
  }

  if (v.count >= 12 && v.profitFactor != null && v.profitFactor >= 1.4 && v.winRate != null && v.winRate < 0.5) {
    refine.push(
      'High payoff asymmetry (strong profit factor, sub-50% win rate) — document the exact conditions of your largest winners in Refinement so you do not dilute them.'
    );
  }

  return { working, hurting, refine };
}
