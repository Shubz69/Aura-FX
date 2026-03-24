import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Api from '../../services/Api';
import { useTradeValidatorAccount } from '../../context/TradeValidatorAccountContext';
import { formatMoneyAccount, formatSignedPnL } from '../../lib/aura-analysis/formatAccountCurrency';
import { getScoreLabel } from '../../lib/aura-analysis/validator/scoreCalculator';
import '../../styles/aura-analysis/AuraAnalytics.css';

function computeAnalyticsKpis(trades = [], pnlData = {}) {
  const totalTrades = trades.length;
  const wins = trades.filter((t) => (t.result || '').toLowerCase() === 'win' || (Number(t.pnl) || 0) > 0).length;
  const losses = trades.filter((t) => (t.result || '').toLowerCase() === 'loss' || (Number(t.pnl) || 0) < 0).length;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const totalPnL = pnlData.totalPnL != null ? pnlData.totalPnL : trades.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
  const avgR = trades.length ? trades.reduce((s, t) => s + (Number(t.rMultiple) ?? Number(t.rr) ?? 0), 0) / trades.length : 0;
  const grossProfit = trades.filter((t) => (Number(t.pnl) || 0) > 0).reduce((s, t) => s + Number(t.pnl), 0);
  const grossLoss = Math.abs(trades.filter((t) => (Number(t.pnl) || 0) < 0).reduce((s, t) => s + Number(t.pnl), 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
  const checklistPcts = trades.map((t) => t.checklistPercent != null ? Number(t.checklistPercent) : null).filter((x) => x != null);
  const avgChecklistPct = checklistPcts.length ? checklistPcts.reduce((a, b) => a + b, 0) / checklistPcts.length : null;

  const sortedByDate = [...trades].sort((a, b) => new Date(a.created_at || a.createdAt || a.date) - new Date(b.created_at || b.createdAt || b.date));
  let maxDrawdown = 0;
  let peak = 0;
  let running = 0;
  sortedByDate.forEach((t) => {
    running += Number(t.pnl) || 0;
    if (running > peak) peak = running;
    const dd = peak - running;
    if (dd > maxDrawdown) maxDrawdown = dd;
  });

  let longestWin = 0;
  let longestLoss = 0;
  let curWin = 0;
  let curLoss = 0;
  sortedByDate.forEach((t) => {
    const pnl = Number(t.pnl) || 0;
    const isWin = (t.result || '').toLowerCase() === 'win' || pnl > 0;
    const isLoss = (t.result || '').toLowerCase() === 'loss' || pnl < 0;
    if (isWin) {
      curWin += 1;
      curLoss = 0;
      if (curWin > longestWin) longestWin = curWin;
    } else if (isLoss) {
      curLoss += 1;
      curWin = 0;
      if (curLoss > longestLoss) longestLoss = curLoss;
    } else {
      curWin = 0;
      curLoss = 0;
    }
  });

  const consistencyScore = totalTrades > 0 ? Math.round(Math.min(100, Math.max(0, 50 + (winRate - 50) * 0.4))) : 0;

  const scoreValues = trades
    .map((t) => {
      if (t.checklistScore != null && Number.isFinite(Number(t.checklistScore))) return Number(t.checklistScore);
      if (t.checklistPercent != null && Number.isFinite(Number(t.checklistPercent))) return Number(t.checklistPercent) * 2;
      return null;
    })
    .filter((v) => v != null);
  const avgScore = scoreValues.length ? scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length : null;
  const averageGrade = avgScore != null ? getScoreLabel(Math.round(avgScore)) : null;

  return {
    totalTrades,
    winRate,
    averageR: avgR,
    totalPnL,
    profitFactor,
    expectancyR: avgR,
    maxDrawdown,
    consistencyScore,
    longestWinStreak: longestWin,
    longestLossStreak: longestLoss,
    avgChecklistPct,
    averageGrade,
  };
}

function buildEquityCurve(trades, startBalance = 10000) {
  const sorted = [...trades].sort((a, b) => new Date(a.created_at || a.createdAt || a.date) - new Date(b.created_at || b.createdAt || b.date));
  const out = [{ date: sorted[0] ? (sorted[0].created_at || sorted[0].createdAt || sorted[0].date) : new Date().toISOString(), equity: startBalance }];
  let equity = startBalance;
  sorted.forEach((t) => {
    equity += Number(t.pnl) || 0;
    out.push({ date: t.created_at || t.createdAt || t.date, equity });
  });
  return out;
}

function buildPairPerformance(trades) {
  const byPair = {};
  trades.forEach((t) => {
    const pair = t.pair || '—';
    if (!byPair[pair]) byPair[pair] = 0;
    byPair[pair] += Number(t.pnl) || 0;
  });
  return Object.entries(byPair).map(([pair, pnl]) => ({ pair, pnl })).sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));
}

function buildSessionPerformance(trades) {
  const bySession = {};
  trades.forEach((t) => {
    const session = t.session || 'Unknown';
    if (!bySession[session]) bySession[session] = 0;
    bySession[session] += Number(t.pnl) || 0;
  });
  return Object.entries(bySession).map(([session, pnl]) => ({ session, pnl })).sort((a, b) => b.pnl - a.pnl);
}

export default function AuraAnalytics() {
  const { accounts, selectedAccountId, loading: accountsLoading } = useTradeValidatorAccount();
  const analyticsCurrency = useMemo(() => {
    const a = accounts.find((x) => Number(x.id) === Number(selectedAccountId));
    return a?.accountCurrency || 'USD';
  }, [accounts, selectedAccountId]);
  const [trades, setTrades] = useState([]);
  const [pnlData, setPnlData] = useState({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(() => {
    const params =
      selectedAccountId != null && Number.isFinite(Number(selectedAccountId))
        ? { validatorAccountId: selectedAccountId }
        : {};
    return Promise.all([
      Api.getAuraAnalysisTrades(params).then((r) => (r.data?.trades ?? r.data?.data ?? [])),
      Api.getAuraAnalysisPnl(params).then((r) => ({
        totalPnL: r.data?.totalPnL ?? r.data?.monthlyPnl ?? 0,
        dailyPnl: r.data?.dailyPnl,
        weeklyPnl: r.data?.weeklyPnl,
        monthlyPnl: r.data?.monthlyPnl,
      })),
    ]).then(([t, p]) => {
      setTrades(Array.isArray(t) ? t : []);
      setPnlData(typeof p === 'object' ? p : {});
    });
  }, [selectedAccountId]);

  useEffect(() => {
    if (accountsLoading) return undefined;
    setLoading(true);
    fetchData()
      .catch(() => {})
      .finally(() => setLoading(false));
    return undefined;
  }, [accountsLoading, fetchData]);

  const kpis = useMemo(() => computeAnalyticsKpis(trades, pnlData), [trades, pnlData]);
  const equityCurve = useMemo(() => buildEquityCurve(trades), [trades]);
  const pairPerformance = useMemo(() => buildPairPerformance(trades), [trades]);
  const sessionPerformance = useMemo(() => buildSessionPerformance(trades), [trades]);

  const equityMin = useMemo(() => (equityCurve.length ? Math.min(...equityCurve.map((p) => p.equity)) : 0), [equityCurve]);
  const equityMax = useMemo(() => (equityCurve.length ? Math.max(...equityCurve.map((p) => p.equity)) : 1), [equityCurve]);
  const pairMax = useMemo(() => (pairPerformance.length ? Math.max(...pairPerformance.map((p) => Math.abs(p.pnl))) : 1), [pairPerformance]);
  const sessionExtent = useMemo(() => {
    if (!sessionPerformance.length) return 1;
    const vals = sessionPerformance.map((p) => p.pnl);
    return Math.max(...vals.map(Math.abs), 1);
  }, [sessionPerformance]);

  if (accountsLoading || loading) {
    return (
      <div className="aura-analytics">
        <h1 className="aura-analytics-title">Analytics</h1>
        <p className="aura-analytics-loading">Loading…</p>
      </div>
    );
  }

  return (
    <div className="aura-analytics">
      <h1 className="aura-analytics-title">Analytics</h1>

      <div className="aura-analytics-kpi-grid">
        <div className="aura-analytics-kpi-card">
          <span className="aura-analytics-kpi-label">Total trades</span>
          <span className="aura-analytics-kpi-value">{kpis.totalTrades}</span>
        </div>
        <div className="aura-analytics-kpi-card">
          <span className="aura-analytics-kpi-label">Win rate</span>
          <span className="aura-analytics-kpi-value positive">{kpis.winRate.toFixed(2)}%</span>
        </div>
        <div className="aura-analytics-kpi-card">
          <span className="aura-analytics-kpi-label">Average R</span>
          <span className="aura-analytics-kpi-value">{kpis.averageR.toFixed(2)}</span>
        </div>
        <div className="aura-analytics-kpi-card">
          <span className="aura-analytics-kpi-label">Total PnL</span>
          <span className={`aura-analytics-kpi-value ${kpis.totalPnL >= 0 ? 'positive' : 'negative'}`}>
            {formatSignedPnL(kpis.totalPnL, analyticsCurrency)}
          </span>
        </div>
        <div className="aura-analytics-kpi-card">
          <span className="aura-analytics-kpi-label">Profit factor</span>
          <span className="aura-analytics-kpi-value">{kpis.profitFactor.toFixed(2)}</span>
        </div>
        <div className="aura-analytics-kpi-card">
          <span className="aura-analytics-kpi-label">Expectancy (R)</span>
          <span className="aura-analytics-kpi-value">{kpis.expectancyR.toFixed(2)}</span>
        </div>
        <div className="aura-analytics-kpi-card">
          <span className="aura-analytics-kpi-label">Max drawdown</span>
          <span className="aura-analytics-kpi-value negative">
            {formatMoneyAccount(kpis.maxDrawdown, analyticsCurrency)}
          </span>
        </div>
        <div className="aura-analytics-kpi-card">
          <span className="aura-analytics-kpi-label">Consistency score</span>
          <span className="aura-analytics-kpi-value">{kpis.consistencyScore}</span>
        </div>
        <div className="aura-analytics-kpi-card">
          <span className="aura-analytics-kpi-label">Longest win streak</span>
          <span className="aura-analytics-kpi-value">{kpis.longestWinStreak}</span>
        </div>
        <div className="aura-analytics-kpi-card">
          <span className="aura-analytics-kpi-label">Longest loss streak</span>
          <span className="aura-analytics-kpi-value">{kpis.longestLossStreak}</span>
        </div>
        <div className="aura-analytics-kpi-card">
          <span className="aura-analytics-kpi-label">Avg checklist %</span>
          <span className="aura-analytics-kpi-value">
            {kpis.avgChecklistPct != null ? `${kpis.avgChecklistPct.toFixed(2)}%` : '—'}
          </span>
        </div>
        <div className="aura-analytics-kpi-card">
          <span className="aura-analytics-kpi-label">Average grade</span>
          <span className="aura-analytics-kpi-value">
            {kpis.averageGrade || '—'}
          </span>
        </div>
      </div>

      <section className="aura-analytics-section aura-analytics-equity-section">
        <h2 className="aura-analytics-section-title">Equity curve</h2>
        <div className="aura-analytics-equity-chart">
          {equityCurve.length > 1 ? (
            <>
              <div className="aura-analytics-equity-yaxis">
                {[equityMax, (equityMax + equityMin) / 2, equityMin].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => b - a).map((v) => (
                  <span key={v}>${(v / 1000).toFixed(0)}k-</span>
                ))}
              </div>
              <div className="aura-analytics-equity-svg-wrap">
                <svg viewBox="0 0 500 180" preserveAspectRatio="none" className="aura-analytics-equity-svg">
                  <defs>
                    <linearGradient id="aura-equity-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(248,195,125,0.35)" />
                      <stop offset="100%" stopColor="rgba(248,195,125,0)" />
                    </linearGradient>
                  </defs>
                  <path
                    fill="url(#aura-equity-fill)"
                    d={
                      equityCurve
                        .map((p, i) => {
                          const x = (i / Math.max(1, equityCurve.length - 1)) * 480 + 10;
                          const y = 160 - ((p.equity - equityMin) / (equityMax - equityMin || 1)) * 140;
                          return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                        })
                        .join(' ') + (equityCurve.length > 1 ? ` L 490 160 L 10 160 Z` : '')
                    }
                  />
                  <path
                    fill="none"
                    stroke="rgba(248,195,125,0.95)"
                    strokeWidth="2"
                    d={equityCurve
                      .map((p, i) => {
                        const x = (i / Math.max(1, equityCurve.length - 1)) * 480 + 10;
                        const y = 160 - ((p.equity - equityMin) / (equityMax - equityMin || 1)) * 140;
                        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                      })
                      .join(' ')}
                  />
                </svg>
              </div>
              <div className="aura-analytics-equity-xaxis">
                {equityCurve.length >= 2 && (
                  <>
                    <span>{new Date(equityCurve[0].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}</span>
                    <span>{new Date(equityCurve[equityCurve.length - 1].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}</span>
                  </>
                )}
              </div>
            </>
          ) : (
            <p className="aura-analytics-chart-empty">Add trades to see equity curve</p>
          )}
        </div>
      </section>

      <div className="aura-analytics-charts-row">
        <section className="aura-analytics-section aura-analytics-bar-section">
          <h2 className="aura-analytics-section-title">PnL by pair</h2>
          <div className="aura-analytics-pair-chart">
            {pairPerformance.length ? (
              pairPerformance.slice(0, 6).map(({ pair, pnl }) => (
                <div key={pair} className="aura-analytics-pair-row">
                  <span className="aura-analytics-pair-label">{pair}</span>
                  <div className="aura-analytics-pair-bar-wrap">
                    <div
                      className="aura-analytics-pair-bar"
                      style={{ width: `${(Math.abs(pnl) / (pairMax || 1)) * 100}%` }}
                    />
                  </div>
                  <span className={`aura-analytics-pair-value ${pnl >= 0 ? 'positive' : 'negative'}`}>{formatSignedPnL(pnl, analyticsCurrency)}</span>
                </div>
              ))
            ) : (
              <p className="aura-analytics-chart-empty">No pair data yet</p>
            )}
          </div>
        </section>
        <section className="aura-analytics-section aura-analytics-bar-section">
          <h2 className="aura-analytics-section-title">PnL by session</h2>
          <div className="aura-analytics-session-chart">
            {sessionPerformance.length ? (
              <>
                <div className="aura-analytics-session-yaxis">
                  {sessionExtent > 0 && (
                    <>
                      <span>{formatMoneyAccount(sessionExtent, analyticsCurrency)}</span>
                      <span>{formatMoneyAccount(0, analyticsCurrency)}</span>
                      <span>{formatMoneyAccount(-sessionExtent, analyticsCurrency)}</span>
                    </>
                  )}
                </div>
                <div className="aura-analytics-session-bars">
                  {sessionPerformance.map(({ session, pnl }) => {
                    const pct = sessionExtent > 0 ? (Math.abs(pnl) / sessionExtent) * 50 : 0;
                    return (
                      <div key={session} className="aura-analytics-session-cell">
                        <div className="aura-analytics-session-bar-wrap">
                          <div
                            className={`aura-analytics-session-bar ${pnl >= 0 ? 'positive' : 'negative'}`}
                            style={{
                              height: `${pct}%`,
                              bottom: pnl >= 0 ? '50%' : undefined,
                              top: pnl < 0 ? '50%' : undefined,
                            }}
                          />
                        </div>
                        <span className="aura-analytics-session-label">{session}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="aura-analytics-chart-empty">No session data yet</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
