/**
 * Aura Analysis — Pure Analytics Engine
 * No React, no side-effects. All calculations derived from linked MetaTrader trade data (MT4/MT5).
 */

import { buildInstitutionalMetrics, emptyInstitutionalMetrics } from './analytics/institutionalMetrics';
import { computePropRiskPack } from './propRiskPack';
import { runMonteCarloOffMainThread } from './monteCarloRunner';
import { institutionalInputFingerprint } from './institutionalInputFingerprint';
import {
  isAuraAnalysisDevPerfEnabled,
  auraAnalysisDevPerfSetLastAnalyticsStages,
} from './auraAnalysisDevPerf';

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
function tradeDate(t) { return t.closeTime || t.openTime || t.created_at || null; }

function finiteNum(n, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

/** Prefer server-normalized net PnL (MT: profit + commission + swap). */
function tradeNetPnl(t) {
  if (t == null) return 0;
  if (t.netPnl != null && Number.isFinite(Number(t.netPnl))) return Number(t.netPnl);
  return finiteNum(t.pnl);
}

function dedupeAnalyticsTrades(trades) {
  if (!Array.isArray(trades) || trades.length < 2) return trades || [];
  const map = new Map();
  for (const t of trades) {
    const k = `${String(t.id ?? '')}|${String(sym(t)).replace(/\s/g, '')}|${String(tradeDate(t) || '')}`.slice(0, 220);
    map.set(k, t);
  }
  return Array.from(map.values());
}

function safeRatio(num, den, fallback = 0) {
  const a = finiteNum(num);
  const b = finiteNum(den);
  if (b === 0 || !Number.isFinite(a / b)) return fallback;
  return a / b;
}

function medianSorted(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Population standard deviation (analytics sample = full filtered set). */
function populationStdDev(arr) {
  if (!arr.length) return 0;
  if (arr.length === 1) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

/**
 * Van Tharp-style SQN: sqrt(N) * (mean R / std R). R from broker rMultiple when present,
 * else PnL normalized by average loss size (1R proxy).
 */
function computeSqn(sorted, pnls, avgLossAmount) {
  if (!sorted.length || avgLossAmount < 1e-9) return { sqn: 0, expectancyR: 0, rStd: 0 };
  const rMultiples = sorted.map((t, i) => {
    const ex = Number(t.rMultiple);
    if (Number.isFinite(ex) && Math.abs(ex) > 1e-9) return ex;
    return pnls[i] / avgLossAmount;
  });
  const meanR = rMultiples.reduce((s, v) => s + v, 0) / rMultiples.length;
  const rStd = populationStdDev(rMultiples);
  const sqn = rStd > 1e-9 ? Math.sqrt(sorted.length) * (meanR / rStd) : 0;
  return { sqn, expectancyR: meanR, rStd };
}

/** Histogram of closed-trade PnL for distribution charts. */
function buildPnlHistogram(pnls, maxBins = 14) {
  if (!pnls.length) return [];
  const mn = Math.min(...pnls);
  const mx = Math.max(...pnls);
  if (Math.abs(mx - mn) < 1e-9) {
    const sum = pnls.reduce((s, v) => s + v, 0);
    return [{ from: mn, to: mx, count: pnls.length, pnlSum: sum }];
  }
  const n = Math.min(maxBins, Math.max(6, Math.ceil(Math.sqrt(pnls.length))));
  const step = (mx - mn) / n;
  const bins = Array.from({ length: n }, (_, i) => ({
    from: mn + i * step,
    to: mn + (i + 1) * step,
    count: 0,
    pnlSum: 0,
  }));
  pnls.forEach(p => {
    let i = Math.floor((p - mn) / step);
    if (i >= n) i = n - 1;
    if (i < 0) i = 0;
    bins[i].count += 1;
    bins[i].pnlSum += p;
  });
  return bins;
}

/**
 * Stable key for closed-trade analytics + institutional heavy work (matches computeAnalytics ordering).
 */
export function auraAnalysisClosedDataKey(trades = [], account = null) {
  const deduped = dedupeAnalyticsTrades(trades);
  const closedPool = deduped.filter((t) => t.tradeStatus !== 'open');
  if (closedPool.length === 0) {
    const liveBal = account?.balance != null ? finiteNum(account.balance) : null;
    return `open_${deduped.length}_${liveBal ?? ''}_${account?.equity ?? ''}`;
  }
  const sorted = [...closedPool].sort((a, b) => {
    const ta = new Date(tradeDate(a) || 0).getTime();
    const tb = new Date(tradeDate(b) || 0).getTime();
    return ta - tb;
  });
  const pnls = sorted.map(tradeNetPnl);
  const totalPnl = pnls.reduce((s, v) => s + v, 0);
  const liveBal = account?.balance != null ? finiteNum(account.balance) : null;
  const startBalance = liveBal != null ? liveBal - totalPnl : 10000;
  return institutionalInputFingerprint(sorted, pnls, startBalance);
}

async function computeAnalyticsImpl(trades = [], account = null) {
  const devPerf = isAuraAnalysisDevPerfEnabled();
  const tAnalytics0 = devPerf && typeof performance !== 'undefined' ? performance.now() : 0;
  const markDone = (extra = {}) => {
    if (!devPerf || typeof performance === 'undefined') return;
    const ms = performance.now() - tAnalytics0;
    auraAnalysisDevPerfSetLastAnalyticsStages({
      ...extra,
      'analytics.compute': Math.round(ms * 10) / 10,
    });
  };

  const deduped = dedupeAnalyticsTrades(trades);
  if (!deduped.length) {
    const out = emptyAnalytics(account);
    markDone({ 'analytics.path': 'empty' });
    return out;
  }

  const openPositions = deduped.filter((t) => t.tradeStatus === 'open');
  const closedPool = deduped.filter((t) => t.tradeStatus !== 'open');

  if (closedPool.length === 0) {
    const out = analyticsOpenPositionsOnly(account, openPositions, deduped);
    markDone({ 'analytics.path': 'openOnly' });
    return out;
  }

  const sorted = [...closedPool].sort((a, b) => {
    const ta = new Date(tradeDate(a) || 0).getTime();
    const tb = new Date(tradeDate(b) || 0).getTime();
    return ta - tb;
  });

  const pnls = sorted.map(tradeNetPnl);
  const totalPnl = pnls.reduce((s, v) => s + v, 0);

  let winCount = 0;
  let lossCount = 0;
  let beCount = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  for (let i = 0; i < pnls.length; i++) {
    const p = pnls[i];
    if (p > 0) {
      winCount++;
      grossProfit += p;
    } else if (p < 0) {
      lossCount++;
      grossLoss += -p;
    } else {
      beCount++;
    }
  }

  const profitFactorRaw = safeRatio(grossProfit, grossLoss, 0);
  const profitFactor = grossLoss > 0
    ? Math.min(999, profitFactorRaw)
    : grossProfit > 0
      ? 999
      : 0;
  const winRate = sorted.length > 0 ? safeRatio(winCount, sorted.length, 0) * 100 : 0;
  const lossRate = sorted.length > 0 ? safeRatio(lossCount, sorted.length, 0) * 100 : 0;
  const avgWin  = winCount  > 0 ? grossProfit / winCount  : 0;
  const avgLoss = lossCount > 0 ? grossLoss   / lossCount : 0;
  const payoffRatio = avgLoss > 0 ? safeRatio(avgWin, avgLoss, 0) : 0;
  const expectancy = (winRate / 100) * avgWin - ((100 - winRate) / 100) * avgLoss;
  const bestTrade  = pnls.length ? Math.max(...pnls) : 0;
  const worstTrade = pnls.length ? Math.min(...pnls) : 0;
  const avgRR = sorted.reduce((s, t) => s + (Number(t.rMultiple) || 0), 0) / sorted.length;

  let bestIdx = 0;
  let worstIdx = 0;
  for (let i = 1; i < pnls.length; i++) {
    if (pnls[i] > pnls[bestIdx]) bestIdx = i;
    if (pnls[i] < pnls[worstIdx]) worstIdx = i;
  }
  const bestTradeFull  = pnls.length ? sorted[bestIdx] : null;
  const worstTradeFull = pnls.length ? sorted[worstIdx] : null;

  // ── Equity curve ────────────────────────────────────────────────────────
  const currentBalance = account?.balance ?? null;
  const liveEquity = account?.equity != null ? finiteNum(account.equity) : null;
  const liveBal = currentBalance != null ? finiteNum(currentBalance) : null;
  const floatingPnl =
    liveEquity != null && liveBal != null ? liveEquity - liveBal : null;
  const startBalance = liveBal != null ? liveBal - totalPnl : 10000;
  let runBal = startBalance;
  const equityCurve = [{ date: null, balance: startBalance, pnl: 0, idx: 0 }];
  sorted.forEach((t, i) => {
    runBal += tradeNetPnl(t);
    equityCurve.push({ date: tradeDate(t), balance: runBal, pnl: tradeNetPnl(t), idx: i + 1 });
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
    const p = tradeNetPnl(t);
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
    expectancy: d.trades > 0 ? d.pnl / d.trades : 0,
    pf:      d.gl > 0 ? Math.min(999, d.gp / d.gl) : d.gp > 0 ? 999 : 0,
  })).sort((a, b) => b.pnl - a.pnl);

  // ── By session ───────────────────────────────────────────────────────────
  const sessMap = {};
  sorted.forEach(t => {
    const s = t.session || detectSession(t.openTime || tradeDate(t)) || 'Unknown';
    if (!sessMap[s]) sessMap[s] = { pnl: 0, trades: 0, wins: 0, gp: 0, gl: 0 };
    const p = tradeNetPnl(t);
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
    expectancy: d.trades > 0 ? d.pnl / d.trades : 0,
    pf:      d.gl > 0 ? Math.min(999, d.gp / d.gl) : d.gp > 0 ? 999 : 0,
  })).sort((a, b) => b.pnl - a.pnl);

  // ── By weekday ───────────────────────────────────────────────────────────
  const byWeekday = Array(7).fill(null).map((_, i) => ({
    day: WEEKDAY_NAMES[i], dayIndex: i, pnl: 0, trades: 0, wins: 0, winRate: 0,
  }));
  sorted.forEach(t => {
    const d = tradeDate(t);
    if (!d) return;
    const wd = new Date(d).getDay();
    const p = tradeNetPnl(t);
    byWeekday[wd].pnl    += p;
    byWeekday[wd].trades += 1;
    if (p > 0) byWeekday[wd].wins += 1;
  });
  byWeekday.forEach(w => { w.winRate = w.trades > 0 ? (w.wins / w.trades) * 100 : 0; });

  // ── By hour (UTC) — optimal window / heatmaps (TradeZella-style time slicing) ─
  const byHourUtc = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    pnl: 0,
    trades: 0,
    wins: 0,
    winRate: 0,
  }));
  sorted.forEach(t => {
    const d = tradeDate(t);
    if (!d) return;
    const h = new Date(d).getUTCHours();
    const p = tradeNetPnl(t);
    byHourUtc[h].pnl += p;
    byHourUtc[h].trades += 1;
    if (p > 0) byHourUtc[h].wins += 1;
  });
  byHourUtc.forEach(h => {
    h.winRate = h.trades > 0 ? (h.wins / h.trades) * 100 : 0;
  });

  // ── By direction ─────────────────────────────────────────────────────────
  const dirStats = (arr) => {
    const p  = arr.reduce((s, t) => s + tradeNetPnl(t), 0);
    const w  = arr.filter(t => tradeNetPnl(t) > 0).length;
    const gp = arr.filter(t => tradeNetPnl(t) > 0).reduce((s, t) => s + tradeNetPnl(t), 0);
    const gl = Math.abs(arr.filter(t => tradeNetPnl(t) < 0).reduce((s, t) => s + tradeNetPnl(t), 0));
    return { trades: arr.length, pnl: p, wins: w, losses: arr.length - w, winRate: arr.length > 0 ? (w / arr.length) * 100 : 0, pf: gl > 0 ? Math.min(999, gp / gl) : gp > 0 ? 999 : 0 };
  };
  const buyTrades = [];
  const sellTrades = [];
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    const dr = (t.direction || '').toLowerCase();
    if (dr === 'buy') buyTrades.push(t);
    else if (dr === 'sell') sellTrades.push(t);
  }
  const byDirection = {
    buy:  dirStats(buyTrades),
    sell: dirStats(sellTrades),
  };

  // ── By month ─────────────────────────────────────────────────────────────
  const moMap = {};
  sorted.forEach(t => {
    const d = tradeDate(t);
    if (!d) return;
    const key = new Date(d).toISOString().slice(0, 7);
    if (!moMap[key]) moMap[key] = { pnl: 0, trades: 0, wins: 0 };
    const p = tradeNetPnl(t);
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
    byDay[key].pnl += tradeNetPnl(t);
    byDay[key].trades.push(t);
    if (tradeNetPnl(t) > 0) byDay[key].wins += 1;
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
  const medianDurationMs = medianSorted(durations);

  const winDurMs = sorted
    .filter((t, i) => pnls[i] > 0 && t.openTime && t.closeTime)
    .map(t => new Date(t.closeTime).getTime() - new Date(t.openTime).getTime())
    .filter(d => d >= 0);
  const lossDurMs = sorted
    .filter((t, i) => pnls[i] < 0 && t.openTime && t.closeTime)
    .map(t => new Date(t.closeTime).getTime() - new Date(t.openTime).getTime())
    .filter(d => d >= 0);
  const avgWinDurationMs = winDurMs.length > 0
    ? winDurMs.reduce((s, v) => s + v, 0) / winDurMs.length : 0;
  const avgLossDurationMs = lossDurMs.length > 0
    ? lossDurMs.reduce((s, v) => s + v, 0) / lossDurMs.length : 0;

  // ── Execution ────────────────────────────────────────────────────────────
  let withSLCount = 0;
  let withTPCount = 0;
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    if (t.sl || t.stopLoss) withSLCount++;
    if (t.tp || t.takeProfit) withTPCount++;
  }
  const pctWithSL = sorted.length > 0 ? safeRatio(withSLCount, sorted.length, 0) * 100 : 0;
  const pctWithTP = sorted.length > 0 ? safeRatio(withTPCount, sorted.length, 0) * 100 : 0;
  const pctNoSL = sorted.length > 0 ? Math.max(0, 100 - pctWithSL) : 0;
  const pctNoTP = sorted.length > 0 ? Math.max(0, 100 - pctWithTP) : 0;

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
    weekMap[key].pnl += tradeNetPnl(t);
  });
  const byWeek = Object.values(weekMap).sort((a, b) => a.week.localeCompare(b.week));
  const avgTradesPerWeek = byWeek.length > 0
    ? byWeek.reduce((s, w) => s + w.trades, 0) / byWeek.length : 0;

  const vols = sorted.map(t => finiteNum(t.volume)).filter(v => v > 0);
  const volMean = vols.length ? vols.reduce((s, v) => s + v, 0) / vols.length : 0;
  const volStd = vols.length > 1
    ? Math.sqrt(vols.reduce((s, v) => s + (v - volMean) ** 2, 0) / (vols.length - 1))
    : 0;
  const lotSizeCv = volMean > 0 ? safeRatio(volStd, volMean, 0) : 0;
  const oversizedTradeCount = volMean > 0 && volStd > 0
    ? vols.filter(v => v > volMean + 2 * volStd).length
    : 0;

  const topSymShare = sorted.length > 0 && bySymbol.length > 0
    ? safeRatio(bySymbol[0].trades, sorted.length, 0) * 100
    : 0;

  let revengeStyleCount = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (tradeNetPnl(prev) >= 0) continue;
    const ta = new Date(tradeDate(prev) || 0).getTime();
    const tb = new Date(cur.openTime || tradeDate(cur) || 0).getTime();
    if (!Number.isFinite(ta) || !Number.isFinite(tb) || tb < ta) continue;
    if (tb - ta <= 5 * 60 * 1000) revengeStyleCount += 1;
  }
  const revengeStyleRate = sorted.length > 1 ? safeRatio(revengeStyleCount, sorted.length - 1, 0) * 100 : 0;

  const realisedPnl = totalPnl;

  // ── Advanced metrics (recovery, SQN, distribution, streak $) ─────────────
  const pnlStdDev = populationStdDev(pnls);
  const pnlMean = sorted.length > 0 ? totalPnl / sorted.length : 0;
  const sharpeLike = pnlStdDev > 1e-9 ? pnlMean / pnlStdDev : 0;
  const losingPnls = pnls.filter(p => p < 0);
  const downsideStdDev = populationStdDev(losingPnls.length ? losingPnls : [0]);
  const sortinoLike = downsideStdDev > 1e-9 ? pnlMean / downsideStdDev : 0;

  const recoveryFactor = maxDrawdown > 1e-6 ? totalPnl / maxDrawdown : (totalPnl > 0 ? 999 : 0);

  const tFirst = new Date(tradeDate(sorted[0]) || 0).getTime();
  const tLast = new Date(tradeDate(sorted[sorted.length - 1]) || 0).getTime();
  const periodYears = Math.max(tLast - tFirst, 86400000) / (365.25 * 86400000);
  const cagrPct = periodYears > 0 && startBalance > 0 && finalBal > 0
    ? (Math.pow(finalBal / startBalance, 1 / periodYears) - 1) * 100
    : totalReturnPct;
  const calmarRatio = maxDrawdownPct > 0.05 ? safeRatio(cagrPct, maxDrawdownPct, 0) : 0;
  const returnToMaxDrawdown = maxDrawdownPct > 0.05 ? safeRatio(totalReturnPct, maxDrawdownPct, 0) : 0;

  const largestWinPctOfGross = grossProfit > 1e-6 ? safeRatio(bestTrade, grossProfit, 0) * 100 : 0;
  const largestLossPctOfGross = grossLoss > 1e-6 ? safeRatio(Math.abs(worstTrade), grossLoss, 0) * 100 : 0;

  let maxConsecWinSum = 0;
  let maxConsecLossSum = 0;
  let runW = 0;
  let runL = 0;
  pnls.forEach(p => {
    if (p > 0) {
      runW += p;
      runL = 0;
      if (runW > maxConsecWinSum) maxConsecWinSum = runW;
    } else if (p < 0) {
      runL += p;
      runW = 0;
      if (Math.abs(runL) > maxConsecLossSum) maxConsecLossSum = Math.abs(runL);
    } else {
      runW = 0;
      runL = 0;
    }
  });

  const lossUnitForR = avgLoss > 1e-9 ? avgLoss : (lossCount > 0 ? grossLoss / lossCount : 0);
  const { sqn, expectancyR, rStd } = computeSqn(sorted, pnls, lossUnitForR || 1);

  const kellyOptimalFraction = payoffRatio > 1e-6 && winRate > 0 && winRate < 100
    ? (winRate / 100) - safeRatio(1 - winRate / 100, payoffRatio, 0)
    : 0;

  const pnlHistogram = buildPnlHistogram(pnls);

  const behaviorVolatilityScore = Math.min(100, Math.round(
    safeRatio(pnlStdDev, Math.abs(pnlMean) + 1, 0) * 18
    + safeRatio(rStd, 1, 0) * 12
    + Math.min(revengeStyleRate, 40)
  ));

  // ── Risk score ───────────────────────────────────────────────────────────
  const riskScore = calcRiskScore({
    maxDrawdownPct, currentDrawdownPct, pctWithSL, maxLossStreak,
    marginLevel: account?.marginLevel, winRate,
  });

  // ── Insights ─────────────────────────────────────────────────────────────
  const insights = buildInsights({
    sampleSize: sorted.length,
    bySession, bySymbol, byDirection, byWeekday, winRate, profitFactor, maxDrawdownPct, pctWithSL,
    avgDurationMs, currentStreak, streakType, revengeStyleRate, topSymbolConcentrationPct: topSymShare,
    floatingPnl,
    accountBalance: liveBal,
    curveIsApproximation: true,
    openPositionsCount: openPositions.length,
    sqn,
    kellyOptimalFraction,
    calmarRatio,
    largestWinPctOfGross,
  });

  const institutionalFp = institutionalInputFingerprint(sorted, pnls, startBalance);
  const tMonte0 =
    devPerf && typeof performance !== 'undefined' ? performance.now() : 0;
  const syncMs =
    devPerf && typeof performance !== 'undefined' ? tMonte0 - tAnalytics0 : 0;
  const monteCarlo = await runMonteCarloOffMainThread(pnls, startBalance, {
    cacheKey: institutionalFp,
  });
  const tInst0 =
    devPerf && typeof performance !== 'undefined' ? performance.now() : 0;
  const monteMs = devPerf && typeof performance !== 'undefined' ? tInst0 - tMonte0 : 0;

  const institutional = buildInstitutionalMetrics({
    sorted,
    pnls,
    lossUnitForR: lossUnitForR || 1,
    startBalance,
    byMonth,
    drawdownCurve,
    revengeStyleRate,
    pctWithSL,
    behaviorVolatilityScore,
    sqn,
    expectancyR,
    payoffRatio,
    winRate,
    pnlStdDev,
    byHourUtc,
    monteCarloOverride: monteCarlo,
  });
  if (devPerf && typeof performance !== 'undefined') {
    const tDone = performance.now();
    const instMs = tDone - tInst0;
    const totalMs = tDone - tAnalytics0;
    auraAnalysisDevPerfSetLastAnalyticsStages({
      'analytics.path': 'closedTrades',
      'analytics.sync': Math.round(syncMs * 10) / 10,
      'analytics.monteCarlo': Math.round(monteMs * 10) / 10,
      'analytics.institutional': Math.round(instMs * 10) / 10,
      'analytics.compute': Math.round(totalMs * 10) / 10,
    });
  }

  const propRiskPack = computePropRiskPack({ byDay, equityCurve, drawdownCurve });

  return {
    totalTrades: sorted.length,
    openPositionsCount: openPositions.length,
    closedTradesCount: sorted.length,
    tradeRowsTotal: deduped.length,
    wins: winCount, losses: lossCount, breakeven: beCount,
    winRate, lossRate, totalPnl, realisedPnl, floatingPnl,
    grossProfit, grossLoss, profitFactor, payoffRatio, expectancy,
    avgWin, avgLoss, bestTrade, worstTrade, bestTradeFull, worstTradeFull, avgRR,
    equityCurve, drawdownCurve, maxDrawdown, maxDrawdownPct, currentDrawdown, currentDrawdownPct,
    startBalance, currentBalance: finalBal,
    bySymbol, bySession, byWeekday, byHourUtc, byDirection, byMonth, byDay, byWeek,
    currentStreak, streakType, maxWinStreak, maxLossStreak,
    avgDurationMs, medianDurationMs,
    avgWinDurationMs, avgLossDurationMs,
    pctWithSL, pctWithTP, pctNoSL, pctNoTP,
    avgTimeBetweenMs, avgTradesPerWeek,
    lotSizeCv, oversizedTradeCount, topSymbolConcentrationPct: topSymShare,
    revengeStyleRate,
    totalReturn, totalReturnPct, bestMonth, worstMonth, profitableMonths,
    riskScore, riskLabel: getRiskLabel(riskScore),
    insights,
    equityCurveMethod: 'closed_trade_sequential',
    equityCurveIsApproximation: true,
    pnlStdDev,
    sharpeLike,
    sortinoLike,
    recoveryFactor,
    calmarRatio,
    cagrPct,
    periodYears,
    returnToMaxDrawdown,
    largestWinPctOfGross,
    largestLossPctOfGross,
    maxConsecWinSum,
    maxConsecLossSum,
    sqn,
    expectancyR,
    rStd,
    kellyOptimalFraction,
    pnlHistogram,
    behaviorVolatilityScore,
    institutionalInputFingerprint: institutionalFp,
    institutional,
    propRiskPack,
  };
}

/** Same fingerprint → same object; avoids duplicate work on polling / strict-mode / rapid re-entry. */
let __analyticsResultCache = { key: '', value: /** @type {any} */ (null) };
const __analyticsInflight = new Map();

/** Call when switching platform or after logout so a new account cannot reuse cache. */
export function invalidateAuraAnalyticsCache() {
  __analyticsResultCache = { key: '', value: null };
  __analyticsInflight.clear();
}

export async function computeAnalytics(trades = [], account = null) {
  const key = auraAnalysisClosedDataKey(trades, account);
  if (__analyticsResultCache.key === key && __analyticsResultCache.value) {
    if (isAuraAnalysisDevPerfEnabled()) {
      auraAnalysisDevPerfSetLastAnalyticsStages({
        'analytics.cacheHit': true,
        'analytics.compute': 0,
      });
    }
    return __analyticsResultCache.value;
  }
  const existing = __analyticsInflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const result = await computeAnalyticsImpl(trades, account);
      __analyticsResultCache = { key, value: result };
      return result;
    } finally {
      __analyticsInflight.delete(key);
    }
  })();

  __analyticsInflight.set(key, promise);
  return promise;
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

function buildInsights({
  sampleSize = 0,
  bySession, bySymbol, byDirection, byWeekday, winRate, profitFactor, maxDrawdownPct, pctWithSL,
  avgDurationMs, currentStreak, streakType, revengeStyleRate = 0, topSymbolConcentrationPct = 0,
  floatingPnl = null,
  accountBalance = null,
  curveIsApproximation = false,
  openPositionsCount = 0,
  sqn = 0,
  kellyOptimalFraction = 0,
  calmarRatio = 0,
  largestWinPctOfGross = 0,
}) {
  const out = [];
  const fmt$  = v => '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct = v => Number(v).toFixed(1) + '%';
  const pf = finiteNum(profitFactor);

  if (curveIsApproximation && sampleSize > 0) {
    out.push('Equity and drawdown here follow closed-trade P/L in order — not tick-level broker equity.');
  }

  if (openPositionsCount > 0 && sampleSize > 0) {
    out.push(`${openPositionsCount} open position(s) in the list — win rate and profit factor use closed trades only; live floating P/L is from account equity vs balance.`);
  }

  if (sampleSize > 0 && sampleSize < 8) {
    out.push('Limited trade sample in this period — insights get more reliable as more closed trades are included.');
  }

  if (
    floatingPnl != null
    && accountBalance != null
    && Number.isFinite(floatingPnl)
    && Number.isFinite(accountBalance)
    && Math.abs(accountBalance) > 1e-6
  ) {
    const ratio = Math.abs(floatingPnl / accountBalance);
    if (ratio >= 0.02) {
      out.push(`Open exposure is meaningful — floating P/L is roughly ${fmtPct(ratio * 100)} of balance, so live risk can differ from closed-trade analytics alone.`);
    }
  }

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

  if (pf > 2) out.push(`Profit factor of ${pf.toFixed(2)} — your edge is working well.`);
  else if (pf < 1 && pf > 0) out.push('Profit factor below 1.0 — losses outweigh wins. Focus on quality.');

  if (maxDrawdownPct > 20) out.push(`Max drawdown of ${fmtPct(maxDrawdownPct)} detected — review risk management.`);
  if (pctWithSL < 70) out.push(`${fmtPct(100 - pctWithSL)} of trades entered without a stop loss — key risk area.`);
  if (streakType === 'win' && currentStreak >= 3) out.push(`Currently on a ${currentStreak}-trade win streak — great execution.`);
  if (streakType === 'loss' && currentStreak >= 3) out.push(`${currentStreak} consecutive losses — consider a session break.`);

  if (topSymbolConcentrationPct >= 55 && bySymbol.length) {
    out.push(`${fmtPct(topSymbolConcentrationPct)} of trades are in one symbol — watch concentration risk.`);
  }
  if (revengeStyleRate >= 25 && sampleSize >= 10) {
    out.push('Several entries follow losses within minutes — watch for emotional re-entry patterns.');
  }
  if (avgDurationMs > 0 && avgDurationMs < 120000 && sampleSize >= 15) {
    out.push('Very short average hold times — ensure you are not over-scalping without a defined edge.');
  }

  if (sampleSize >= 30 && sqn >= 3) {
    out.push(`System quality (SQN-style) reads strong at ${sqn.toFixed(2)} on ${sampleSize} trades — edge is statistically structured.`);
  } else if (sampleSize >= 15 && sqn < 0.5 && sqn !== 0) {
    out.push('Low R-multiple consistency (SQN) — average outcome per unit risk is noisy; refine execution or sample size.');
  }

  if (kellyOptimalFraction > 0.25 && sampleSize >= 20) {
    out.push(`Full Kelly sizing would imply ~${(kellyOptimalFraction * 100).toFixed(0)}% of capital per trade — professionals typically use a fraction (e.g. ¼ Kelly) to survive variance.`);
  }

  if (calmarRatio > 3 && maxDrawdownPct > 3) {
    out.push(`Return vs max drawdown (Calmar-style) is favourable (${calmarRatio.toFixed(2)}) — growth has been efficient relative to worst peak-to-trough.`);
  }

  if (largestWinPctOfGross > 45) {
    out.push('A large share of gross profit comes from one winner — results may be less robust if that setup disappears.');
  }

  return out.slice(0, 10);
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

function analyticsOpenPositionsOnly(account, openPositions, allRows) {
  const base = emptyAnalytics(account);
  const liveBal = account?.balance != null ? finiteNum(account.balance) : null;
  const liveEq = account?.equity != null ? finiteNum(account.equity) : null;
  const floatingPnl = liveEq != null && liveBal != null ? liveEq - liveBal : base.floatingPnl;
  return {
    ...base,
    floatingPnl: floatingPnl ?? base.floatingPnl,
    openPositionsCount: openPositions.length,
    closedTradesCount: 0,
    tradeRowsTotal: allRows.length,
    equityCurveMethod: 'none_no_closed_trades',
    equityCurveIsApproximation: false,
    insights: [
      'No closed trades in this date range — win rate, profit factor, and equity curve need closed deal history. Open rows may still appear in your trade list.',
      ...(floatingPnl != null && Math.abs(floatingPnl) > 1e-6
        ? ['Account banner balance vs equity reflects live floating P/L until closed deals are in range.']
        : []),
    ],
    institutionalInputFingerprint: '',
  };
}

export function emptyAnalytics(account) {
  const emptyDir = { trades: 0, pnl: 0, wins: 0, losses: 0, winRate: 0, pf: 0 };
  const bal = account?.balance != null ? finiteNum(account.balance) : NaN;
  const eq = account?.equity != null ? finiteNum(account.equity) : NaN;
  const floating = Number.isFinite(eq) && Number.isFinite(bal) ? eq - bal : null;
  return {
    totalTrades: 0,
    openPositionsCount: 0,
    closedTradesCount: 0,
    tradeRowsTotal: 0,
    wins: 0, losses: 0, breakeven: 0,
    winRate: 0, lossRate: 0, totalPnl: 0, realisedPnl: 0, floatingPnl: floating,
    grossProfit: 0, grossLoss: 0,
    profitFactor: 0, payoffRatio: 0, expectancy: 0, avgWin: 0, avgLoss: 0,
    bestTrade: 0, worstTrade: 0, bestTradeFull: null, worstTradeFull: null, avgRR: 0,
    equityCurve: [], drawdownCurve: [],
    maxDrawdown: 0, maxDrawdownPct: 0, currentDrawdown: 0, currentDrawdownPct: 0,
    startBalance: account?.balance ?? 0, currentBalance: account?.balance ?? 0,
    bySymbol: [], bySession: [],
    byWeekday: Array(7).fill(null).map((_, i) => ({ day: WEEKDAY_NAMES[i], dayIndex: i, pnl: 0, trades: 0, wins: 0, winRate: 0 })),
    byHourUtc: Array.from({ length: 24 }, (_, hour) => ({ hour, pnl: 0, trades: 0, wins: 0, winRate: 0 })),
    byDirection: { buy: emptyDir, sell: emptyDir },
    byMonth: [], byDay: {}, byWeek: [],
    currentStreak: 0, streakType: 'none', maxWinStreak: 0, maxLossStreak: 0,
    avgDurationMs: 0, medianDurationMs: 0,
    avgWinDurationMs: 0, avgLossDurationMs: 0,
    pctWithSL: 0, pctWithTP: 0, pctNoSL: 0, pctNoTP: 0,
    avgTimeBetweenMs: 0, avgTradesPerWeek: 0,
    lotSizeCv: 0, oversizedTradeCount: 0, topSymbolConcentrationPct: 0, revengeStyleRate: 0,
    totalReturn: 0, totalReturnPct: 0, bestMonth: null, worstMonth: null, profitableMonths: 0,
    riskScore: 0, riskLabel: 'Controlled', insights: [],
    equityCurveMethod: 'none',
    equityCurveIsApproximation: false,
    pnlStdDev: 0,
    sharpeLike: 0,
    sortinoLike: 0,
    recoveryFactor: 0,
    calmarRatio: 0,
    cagrPct: 0,
    periodYears: 0,
    returnToMaxDrawdown: 0,
    largestWinPctOfGross: 0,
    largestLossPctOfGross: 0,
    maxConsecWinSum: 0,
    maxConsecLossSum: 0,
    sqn: 0,
    expectancyR: 0,
    rStd: 0,
    kellyOptimalFraction: 0,
    pnlHistogram: [],
    behaviorVolatilityScore: 0,
    institutionalInputFingerprint: '',
    institutional: emptyInstitutionalMetrics(),
    propRiskPack: {
      tradingDaysObserved: 0,
      worstDayPnl: 0,
      worstDayKey: null,
      bestDayPnl: 0,
      bestDayKey: null,
      worstRolling5TradingDaysPnl: null,
      worstRolling5TradingDaysEnd: null,
      worstRolling7TradingDaysPnl: null,
      maxConsecutiveRedDays: 0,
      recoveryTradesAfterWorstDd: null,
    },
  };
}
