/**
 * Aura Analysis — Pure Analytics Engine
 * No React, no side-effects. All calculations derived from MT5 trade data.
 */

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function detectSession(timeVal) {
  if (!timeVal) return 'Unknown';
  const h = new Date(timeVal).getUTCHours();
  if (h >= 0 && h < 8) return 'Asian';
  if (h >= 7 && h < 12) return 'London';
  if (h >= 12 && h < 17) return 'New York';
  if (h >= 17 && h < 21) return 'NY Close';
  return 'Asian';
}

function sym(t) { return t.pair || t.symbol || '—'; }
function pnl(t) { return Number(t.pnl) || 0; }
function tradeDate(t) { return t.closeTime || t.openTime || t.created_at || null; }

export function computeAnalytics(trades = [], account = null) {
  if (!trades.length) return emptyAnalytics(account);

  const sorted = [...trades].sort((a, b) => {
    const ta = new Date(tradeDate(a) || 0).getTime();
    const tb = new Date(tradeDate(b) || 0).getTime();
    return ta - tb;
  });

  const pnls = sorted.map(pnl);
  const totalPnl = pnls.reduce((s, v) => s + v, 0);

  const winArr  = sorted.filter((_, i) => pnls[i] > 0);
  const lossArr = sorted.filter((_, i) => pnls[i] < 0);
  const beArr   = sorted.filter((_, i) => pnls[i] === 0);

  const grossProfit = winArr.reduce((s, t) => s + pnl(t), 0);
  const grossLoss   = Math.abs(lossArr.reduce((s, t) => s + pnl(t), 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
  const winRate = sorted.length > 0 ? (winArr.length / sorted.length) * 100 : 0;
  const avgWin  = winArr.length  > 0 ? grossProfit / winArr.length  : 0;
  const avgLoss = lossArr.length > 0 ? grossLoss   / lossArr.length : 0;
  const expectancy = (winRate / 100) * avgWin - ((100 - winRate) / 100) * avgLoss;
  const bestTrade  = pnls.length ? Math.max(...pnls) : 0;
  const worstTrade = pnls.length ? Math.min(...pnls) : 0;
  const avgRR = sorted.reduce((s, t) => s + (Number(t.rMultiple) || 0), 0) / sorted.length;

  const sortedByPnl = [...sorted].sort((a, b) => pnl(b) - pnl(a));
  const bestTradeFull  = sortedByPnl[0] || null;
  const worstTradeFull = sortedByPnl[sortedByPnl.length - 1] || null;

  // ── Equity curve ────────────────────────────────────────────────────────
  const currentBalance = account?.balance ?? null;
  const startBalance = currentBalance != null ? currentBalance - totalPnl : 10000;
  let runBal = startBalance;
  const equityCurve = [{ date: null, balance: startBalance, pnl: 0, idx: 0 }];
  sorted.forEach((t, i) => {
    runBal += pnl(t);
    equityCurve.push({ date: tradeDate(t), balance: runBal, pnl: pnl(t), idx: i + 1 });
  });

  // ── Drawdown curve ──────────────────────────────────────────────────────
  let peak = startBalance;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  const drawdownCurve = equityCurve.map(p => {
    if (p.balance > peak) peak = p.balance;
    const dd    = peak - p.balance;
    const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
    if (dd    > maxDrawdown)    maxDrawdown    = dd;
    if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;
    return { date: p.date, dd, ddPct };
  });
  const finalBal = equityCurve[equityCurve.length - 1].balance;
  let finalPeak = startBalance;
  equityCurve.forEach(p => { if (p.balance > finalPeak) finalPeak = p.balance; });
  const currentDrawdown    = finalPeak - finalBal;
  const currentDrawdownPct = finalPeak > 0 ? (currentDrawdown / finalPeak) * 100 : 0;

  // ── By symbol ────────────────────────────────────────────────────────────
  const symMap = {};
  sorted.forEach(t => {
    const s = sym(t);
    if (!symMap[s]) symMap[s] = { pnl: 0, trades: 0, wins: 0, gp: 0, gl: 0 };
    const p = pnl(t);
    symMap[s].pnl    += p;
    symMap[s].trades += 1;
    if (p > 0) { symMap[s].wins += 1; symMap[s].gp += p; }
    else if (p < 0) symMap[s].gl += Math.abs(p);
  });
  const bySymbol = Object.entries(symMap).map(([pair, d]) => ({
    pair,
    pnl:     d.pnl,
    trades:  d.trades,
    wins:    d.wins,
    losses:  d.trades - d.wins,
    winRate: d.trades > 0 ? (d.wins / d.trades) * 100 : 0,
    avgPnl:  d.trades > 0 ? d.pnl / d.trades : 0,
    pf:      d.gl > 0 ? d.gp / d.gl : d.gp > 0 ? 99 : 0,
  })).sort((a, b) => b.pnl - a.pnl);

  // ── By session ───────────────────────────────────────────────────────────
  const sessMap = {};
  sorted.forEach(t => {
    const s = t.session || detectSession(t.openTime || tradeDate(t)) || 'Unknown';
    if (!sessMap[s]) sessMap[s] = { pnl: 0, trades: 0, wins: 0, gp: 0, gl: 0 };
    const p = pnl(t);
    sessMap[s].pnl    += p;
    sessMap[s].trades += 1;
    if (p > 0) { sessMap[s].wins += 1; sessMap[s].gp += p; }
    else if (p < 0) sessMap[s].gl += Math.abs(p);
  });
  const bySession = Object.entries(sessMap).map(([session, d]) => ({
    session,
    pnl:     d.pnl,
    trades:  d.trades,
    wins:    d.wins,
    winRate: d.trades > 0 ? (d.wins / d.trades) * 100 : 0,
    pf:      d.gl > 0 ? d.gp / d.gl : d.gp > 0 ? 99 : 0,
  })).sort((a, b) => b.pnl - a.pnl);

  // ── By weekday ───────────────────────────────────────────────────────────
  const byWeekday = Array(7).fill(null).map((_, i) => ({
    day: WEEKDAY_NAMES[i], dayIndex: i, pnl: 0, trades: 0, wins: 0, winRate: 0,
  }));
  sorted.forEach(t => {
    const d = tradeDate(t);
    if (!d) return;
    const wd = new Date(d).getDay();
    const p = pnl(t);
    byWeekday[wd].pnl    += p;
    byWeekday[wd].trades += 1;
    if (p > 0) byWeekday[wd].wins += 1;
  });
  byWeekday.forEach(w => { w.winRate = w.trades > 0 ? (w.wins / w.trades) * 100 : 0; });

  // ── By direction ─────────────────────────────────────────────────────────
  const dirStats = (arr) => {
    const p  = arr.reduce((s, t) => s + pnl(t), 0);
    const w  = arr.filter(t => pnl(t) > 0).length;
    const gp = arr.filter(t => pnl(t) > 0).reduce((s, t) => s + pnl(t), 0);
    const gl = Math.abs(arr.filter(t => pnl(t) < 0).reduce((s, t) => s + pnl(t), 0));
    return { trades: arr.length, pnl: p, wins: w, losses: arr.length - w, winRate: arr.length > 0 ? (w / arr.length) * 100 : 0, pf: gl > 0 ? gp / gl : gp > 0 ? 99 : 0 };
  };
  const byDirection = {
    buy:  dirStats(sorted.filter(t => (t.direction || '').toLowerCase() === 'buy')),
    sell: dirStats(sorted.filter(t => (t.direction || '').toLowerCase() === 'sell')),
  };

  // ── By month ─────────────────────────────────────────────────────────────
  const moMap = {};
  sorted.forEach(t => {
    const d = tradeDate(t);
    if (!d) return;
    const key = new Date(d).toISOString().slice(0, 7);
    if (!moMap[key]) moMap[key] = { pnl: 0, trades: 0, wins: 0 };
    const p = pnl(t);
    moMap[key].pnl += p; moMap[key].trades += 1;
    if (p > 0) moMap[key].wins += 1;
  });
  const byMonth = Object.entries(moMap).map(([month, d]) => ({
    month, pnl: d.pnl, trades: d.trades, wins: d.wins,
    winRate: d.trades > 0 ? (d.wins / d.trades) * 100 : 0,
  })).sort((a, b) => a.month.localeCompare(b.month));

  // ── By day (for calendar) ────────────────────────────────────────────────
  const byDay = {};
  sorted.forEach(t => {
    const d = tradeDate(t);
    if (!d) return;
    const key = new Date(d).toISOString().slice(0, 10);
    if (!byDay[key]) byDay[key] = { pnl: 0, trades: [], wins: 0 };
    byDay[key].pnl += pnl(t);
    byDay[key].trades.push(t);
    if (pnl(t) > 0) byDay[key].wins += 1;
  });

  // ── Streaks ──────────────────────────────────────────────────────────────
  let maxWinStreak = 0, maxLossStreak = 0, tw = 0, tl = 0;
  pnls.forEach(p => {
    if (p > 0) { tw++; tl = 0; if (tw > maxWinStreak) maxWinStreak = tw; }
    else if (p < 0) { tl++; tw = 0; if (tl > maxLossStreak) maxLossStreak = tl; }
    else { tw = 0; tl = 0; }
  });
  let currentStreak = 0;
  let streakType = 'none';
  if (pnls.length > 0) {
    const last = pnls[pnls.length - 1];
    if (last > 0) {
      streakType = 'win';
      for (let i = pnls.length - 1; i >= 0 && pnls[i] > 0; i--) currentStreak++;
    } else if (last < 0) {
      streakType = 'loss';
      for (let i = pnls.length - 1; i >= 0 && pnls[i] < 0; i--) currentStreak++;
    }
  }

  // ── Duration ─────────────────────────────────────────────────────────────
  const durations = sorted
    .filter(t => t.openTime && t.closeTime)
    .map(t => new Date(t.closeTime).getTime() - new Date(t.openTime).getTime())
    .filter(d => d >= 0);
  const avgDurationMs = durations.length > 0
    ? durations.reduce((s, v) => s + v, 0) / durations.length : 0;

  // ── Execution ────────────────────────────────────────────────────────────
  const withSL = sorted.filter(t => t.sl || t.stopLoss).length;
  const withTP = sorted.filter(t => t.tp || t.takeProfit).length;
  const pctWithSL = sorted.length > 0 ? (withSL / sorted.length) * 100 : 0;
  const pctWithTP = sorted.length > 0 ? (withTP / sorted.length) * 100 : 0;

  const timeBetween = [];
  for (let i = 1; i < sorted.length; i++) {
    const a = new Date(tradeDate(sorted[i - 1]) || 0).getTime();
    const b = new Date(sorted[i].openTime || tradeDate(sorted[i]) || 0).getTime();
    if (a && b && b > a) timeBetween.push(b - a);
  }
  const avgTimeBetweenMs = timeBetween.length > 0
    ? timeBetween.reduce((s, v) => s + v, 0) / timeBetween.length : 0;

  // ── Growth ───────────────────────────────────────────────────────────────
  const totalReturn    = finalBal - startBalance;
  const totalReturnPct = startBalance > 0 ? (totalReturn / startBalance) * 100 : 0;
  const bestMonth      = byMonth.length > 0 ? [...byMonth].sort((a, b) => b.pnl - a.pnl)[0] : null;
  const worstMonth     = byMonth.length > 0 ? [...byMonth].sort((a, b) => a.pnl - b.pnl)[0] : null;
  let profitableMonths = 0;
  for (let i = byMonth.length - 1; i >= 0; i--) {
    if (byMonth[i].pnl > 0) profitableMonths++;
    else break;
  }

  // ── Risk score ───────────────────────────────────────────────────────────
  const riskScore = calcRiskScore({
    maxDrawdownPct, currentDrawdownPct, pctWithSL, maxLossStreak,
    marginLevel: account?.marginLevel, winRate,
  });

  // ── Insights ─────────────────────────────────────────────────────────────
  const insights = buildInsights({ bySession, bySymbol, byDirection, byWeekday, winRate, profitFactor, maxDrawdownPct, pctWithSL, avgDurationMs, currentStreak, streakType });

  // ── Trade frequency by week (for overtrading detection) ──────────────────
  const weekMap = {};
  sorted.forEach(t => {
    const d = tradeDate(t);
    if (!d) return;
    const dt = new Date(d);
    const monday = new Date(dt);
    monday.setUTCDate(dt.getUTCDate() - dt.getUTCDay() + 1);
    const key = monday.toISOString().slice(0, 10);
    if (!weekMap[key]) weekMap[key] = { week: key, trades: 0, pnl: 0 };
    weekMap[key].trades += 1;
    weekMap[key].pnl += pnl(t);
  });
  const byWeek = Object.values(weekMap).sort((a, b) => a.week.localeCompare(b.week));
  const avgTradesPerWeek = byWeek.length > 0
    ? byWeek.reduce((s, w) => s + w.trades, 0) / byWeek.length : 0;

  return {
    totalTrades: sorted.length, wins: winArr.length, losses: lossArr.length, breakeven: beArr.length,
    winRate, totalPnl, grossProfit, grossLoss, profitFactor, expectancy,
    avgWin, avgLoss, bestTrade, worstTrade, bestTradeFull, worstTradeFull, avgRR,
    equityCurve, drawdownCurve, maxDrawdown, maxDrawdownPct, currentDrawdown, currentDrawdownPct,
    startBalance, currentBalance: finalBal,
    bySymbol, bySession, byWeekday, byDirection, byMonth, byDay, byWeek,
    currentStreak, streakType, maxWinStreak, maxLossStreak,
    avgDurationMs, pctWithSL, pctWithTP, avgTimeBetweenMs, avgTradesPerWeek,
    totalReturn, totalReturnPct, bestMonth, worstMonth, profitableMonths,
    riskScore, riskLabel: getRiskLabel(riskScore),
    insights,
  };
}

function calcRiskScore({ maxDrawdownPct, currentDrawdownPct, pctWithSL, maxLossStreak, marginLevel, winRate }) {
  let score = 0;
  score += maxDrawdownPct > 30 ? 28 : maxDrawdownPct > 20 ? 18 : maxDrawdownPct > 10 ? 10 : 3;
  score += currentDrawdownPct > 15 ? 18 : currentDrawdownPct > 8 ? 9 : 2;
  score += pctWithSL < 50 ? 24 : pctWithSL < 80 ? 12 : 0;
  score += maxLossStreak >= 6 ? 14 : maxLossStreak >= 4 ? 7 : 0;
  score += marginLevel != null && marginLevel < 150 ? 10 : marginLevel != null && marginLevel < 300 ? 5 : 0;
  score += winRate < 30 ? 6 : 0;
  return Math.min(100, Math.max(0, score));
}

function getRiskLabel(score) {
  if (score < 25) return 'Controlled';
  if (score < 50) return 'Moderate';
  if (score < 75) return 'Aggressive';
  return 'Dangerous';
}

function buildInsights({ bySession, bySymbol, byDirection, byWeekday, winRate, profitFactor, maxDrawdownPct, pctWithSL, avgDurationMs, currentStreak, streakType }) {
  const out = [];
  const fmt$  = v => '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct = v => Number(v).toFixed(1) + '%';

  if (bySession.length > 0 && bySession[0].pnl > 0)
    out.push(`${bySession[0].session} is your strongest session — ${fmt$(bySession[0].pnl)} total with ${fmtPct(bySession[0].winRate)} win rate.`);
  const worstSess = [...bySession].sort((a, b) => a.pnl - b.pnl)[0];
  if (worstSess && worstSess.pnl < 0)
    out.push(`${worstSess.session} session is dragging results — consider reducing activity here.`);

  if (bySymbol.length > 0 && bySymbol[0].pnl > 0)
    out.push(`${bySymbol[0].pair} is your top instrument — ${fmtPct(bySymbol[0].winRate)} win rate.`);
  const worstSym = [...bySymbol].sort((a, b) => a.pnl - b.pnl)[0];
  if (worstSym && worstSym.pnl < 0)
    out.push(`${worstSym.pair} has cost ${fmt$(Math.abs(worstSym.pnl))} — review your edge on this pair.`);

  const activeDays = byWeekday.filter(w => w.trades > 0);
  const bestDay  = [...activeDays].sort((a, b) => b.pnl - a.pnl)[0];
  const worstDay = [...activeDays].sort((a, b) => a.pnl - b.pnl)[0];
  if (bestDay && bestDay.pnl > 0)
    out.push(`${bestDay.day} is your most profitable trading day.`);
  if (worstDay && worstDay.pnl < 0 && worstDay.day !== bestDay?.day)
    out.push(`${worstDay.day} consistently underperforms — review setups for that day.`);

  if (byDirection.buy.trades > 2 && byDirection.sell.trades > 2) {
    const diff = Math.abs(byDirection.buy.winRate - byDirection.sell.winRate);
    if (diff >= 10) {
      const better = byDirection.buy.winRate > byDirection.sell.winRate ? 'Long' : 'Short';
      const betterWR = Math.max(byDirection.buy.winRate, byDirection.sell.winRate);
      out.push(`${better} trades significantly outperform — ${fmtPct(betterWR)} win rate.`);
    }
  }

  if (profitFactor > 2) out.push(`Profit factor of ${profitFactor.toFixed(2)} — your edge is working well.`);
  else if (profitFactor < 1 && profitFactor > 0) out.push(`Profit factor below 1.0 — losses outweigh wins. Focus on quality.`);

  if (maxDrawdownPct > 20) out.push(`Max drawdown of ${fmtPct(maxDrawdownPct)} detected — review risk management.`);
  if (pctWithSL < 70) out.push(`${fmtPct(100 - pctWithSL)} of trades entered without a stop loss — key risk area.`);
  if (streakType === 'win' && currentStreak >= 3) out.push(`Currently on a ${currentStreak}-trade win streak — great execution.`);
  if (streakType === 'loss' && currentStreak >= 3) out.push(`${currentStreak} consecutive losses — consider a session break.`);

  return out.slice(0, 7);
}

export function fmtDuration(ms) {
  if (!ms || ms <= 0) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function fmtPnl(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v >= 0 ? `+$${abs}` : `-$${abs}`;
}

export function fmtNum(n, decimals = 2) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtPct(n, decimals = 1) {
  return Number(n).toFixed(decimals) + '%';
}

export function fmtCurrency(n, currency = 'USD') {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(n));
}

function emptyAnalytics(account) {
  const emptyDir = { trades: 0, pnl: 0, wins: 0, losses: 0, winRate: 0, pf: 0 };
  return {
    totalTrades: 0, wins: 0, losses: 0, breakeven: 0,
    winRate: 0, totalPnl: 0, grossProfit: 0, grossLoss: 0,
    profitFactor: 0, expectancy: 0, avgWin: 0, avgLoss: 0,
    bestTrade: 0, worstTrade: 0, bestTradeFull: null, worstTradeFull: null, avgRR: 0,
    equityCurve: [], drawdownCurve: [],
    maxDrawdown: 0, maxDrawdownPct: 0, currentDrawdown: 0, currentDrawdownPct: 0,
    startBalance: account?.balance ?? 0, currentBalance: account?.balance ?? 0,
    bySymbol: [], bySession: [],
    byWeekday: Array(7).fill(null).map((_, i) => ({ day: WEEKDAY_NAMES[i], dayIndex: i, pnl: 0, trades: 0, wins: 0, winRate: 0 })),
    byDirection: { buy: emptyDir, sell: emptyDir },
    byMonth: [], byDay: {}, byWeek: [],
    currentStreak: 0, streakType: 'none', maxWinStreak: 0, maxLossStreak: 0,
    avgDurationMs: 0, pctWithSL: 0, pctWithTP: 0, avgTimeBetweenMs: 0, avgTradesPerWeek: 0,
    totalReturn: 0, totalReturnPct: 0, bestMonth: null, worstMonth: null, profitableMonths: 0,
    riskScore: 0, riskLabel: 'Controlled', insights: [],
  };
}
