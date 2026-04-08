/**
 * Prop-firm-style lens: worst days, rolling loss windows on trading-day series, DD recovery.
 */
export function computePropRiskPack({ byDay, equityCurve, drawdownCurve }) {
  const dayKeys = Object.keys(byDay || {}).sort();
  let worstDayPnl = 0;
  let worstDayKey = null;
  let bestDayPnl = 0;
  let bestDayKey = null;
  for (const k of dayKeys) {
    const p = byDay[k].pnl;
    if (worstDayKey == null || p < worstDayPnl) {
      worstDayPnl = p;
      worstDayKey = k;
    }
    if (bestDayKey == null || p > bestDayPnl) {
      bestDayPnl = p;
      bestDayKey = k;
    }
  }

  let worstRolling5 = null;
  let worstRolling5End = null;
  for (let i = 0; i <= dayKeys.length - 5; i++) {
    let s = 0;
    for (let j = 0; j < 5; j++) s += byDay[dayKeys[i + j]].pnl;
    if (worstRolling5 == null || s < worstRolling5) {
      worstRolling5 = s;
      worstRolling5End = dayKeys[i + 4];
    }
  }

  let worstRolling7 = null;
  for (let i = 0; i <= dayKeys.length - 7; i++) {
    let s = 0;
    for (let j = 0; j < 7; j++) s += byDay[dayKeys[i + j]].pnl;
    if (worstRolling7 == null || s < worstRolling7) worstRolling7 = s;
  }

  let maxConsecutiveRedDays = 0;
  let run = 0;
  for (const k of dayKeys) {
    if (byDay[k].pnl < 0) {
      run++;
      if (run > maxConsecutiveRedDays) maxConsecutiveRedDays = run;
    } else {
      run = 0;
    }
  }

  let recoveryTradesAfterWorstDd = null;
  if (drawdownCurve?.length > 1 && equityCurve?.length > 1) {
    let ddPeakIdx = 0;
    for (let i = 1; i < drawdownCurve.length; i++) {
      if (drawdownCurve[i].dd > drawdownCurve[ddPeakIdx].dd) ddPeakIdx = i;
    }
    const peakBalanceBeforeTrough = equityCurve[ddPeakIdx].balance + drawdownCurve[ddPeakIdx].dd;
    for (let j = ddPeakIdx + 1; j < equityCurve.length; j++) {
      if (equityCurve[j].balance > peakBalanceBeforeTrough) {
        recoveryTradesAfterWorstDd = equityCurve[j].idx - equityCurve[ddPeakIdx].idx;
        break;
      }
    }
  }

  return {
    tradingDaysObserved: dayKeys.length,
    worstDayPnl: worstDayKey != null ? worstDayPnl : 0,
    worstDayKey,
    bestDayPnl: bestDayKey != null ? bestDayPnl : 0,
    bestDayKey,
    worstRolling5TradingDaysPnl: worstRolling5,
    worstRolling5TradingDaysEnd: worstRolling5End,
    worstRolling7TradingDaysPnl: worstRolling7,
    maxConsecutiveRedDays,
    recoveryTradesAfterWorstDd,
  };
}
