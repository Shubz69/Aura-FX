import React from 'react';
import { useAuraAnalysis } from '../../../context/AuraAnalysisContext';
import { fmtPnl, fmtPct, fmtNum, fmtDuration } from '../../../lib/aura-analysis/analytics';
import '../../../styles/aura-analysis/AuraShared.css';

function pnlCls(v) { return v > 0 ? 'aa--green' : v < 0 ? 'aa--red' : 'aa--muted'; }

function ScoreGauge({ score, label, color }) {
  const r = 42; const circ = 2 * Math.PI * r;
  const filled = circ * Math.min(score / 100, 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative', width: 110, height: 110 }}>
        <svg width="110" height="110" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="55" cy="55" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
          <circle cx="55" cy="55" r={r} fill="none" stroke={color} strokeWidth="8"
            strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.8s ease' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
          <span style={{ fontSize: '1.6rem', fontWeight: 800, color, lineHeight: 1 }}>{score}</span>
          <span style={{ fontSize: '0.52rem', fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>/ 100</span>
        </div>
      </div>
      <span style={{ fontSize: '0.72rem', fontWeight: 700, color }}>{label}</span>
    </div>
  );
}

function MetricRow({ label, value, color, sub }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      <div>
        <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>{label}</div>
        {sub && <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>{sub}</div>}
      </div>
      <span style={{ fontSize: '0.85rem', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

export default function ExecutionLab() {
  const { analytics: a, trades, loading, error } = useAuraAnalysis();

  if (loading) return (
    <div className="aa-page">
      <div className="aa-grid-3" style={{ marginBottom: 12 }}>{[...Array(3)].map((_, i) => <div key={i} className="aa-skeleton" style={{ height: 100, borderRadius: 12 }} />)}</div>
      <div className="aa-grid-2">{[...Array(2)].map((_, i) => <div key={i} className="aa-skeleton aa-skeleton-chart" />)}</div>
    </div>
  );

  if (error) return <div className="aa-page"><div className="aa-error"><i className="fas fa-exclamation-circle aa-error-icon" />{error}</div></div>;

  if (!trades.length) return (
    <div className="aa-page">
      <div className="aa-no-platform">
        <div className="aa-no-platform-icon"><i className="fas fa-rocket" /></div>
        <h3>No execution data yet</h3>
        <p>Your execution quality metrics will appear here once you have trade history.</p>
      </div>
    </div>
  );

  /* ── Execution score computation ── */
  let execScore = 50;
  if (a.pctWithSL >= 90) execScore += 20;
  else if (a.pctWithSL >= 70) execScore += 10;
  else execScore -= 15;

  if (a.pctWithTP >= 80) execScore += 10;
  else if (a.pctWithTP >= 60) execScore += 5;

  if (a.winRate >= 55) execScore += 10;
  else if (a.winRate >= 45) execScore += 5;
  else execScore -= 5;

  if (a.profitFactor >= 2) execScore += 10;
  else if (a.profitFactor >= 1.5) execScore += 5;
  else if (a.profitFactor < 1) execScore -= 10;

  if (a.maxLossStreak >= 6) execScore -= 10;
  else if (a.maxLossStreak >= 4) execScore -= 5;

  execScore = Math.max(0, Math.min(100, Math.round(execScore)));

  const execLabel = execScore >= 75 ? 'Elite' : execScore >= 55 ? 'Disciplined' : execScore >= 35 ? 'Developing' : 'Needs Work';
  const execColor = execScore >= 75 ? '#10b981' : execScore >= 55 ? '#8b5cf6' : execScore >= 35 ? '#f59e0b' : '#ef4444';

  /* ── Duration buckets ── */
  const withDuration = trades.filter(t => t.openTime && t.closeTime);
  const buckets = { 'Under 1h': 0, '1h–4h': 0, '4h–1d': 0, '1d+': 0 };
  withDuration.forEach(t => {
    const ms = new Date(t.closeTime).getTime() - new Date(t.openTime).getTime();
    const h = ms / 3600000;
    if (h < 1) buckets['Under 1h']++;
    else if (h < 4) buckets['1h–4h']++;
    else if (h < 24) buckets['4h–1d']++;
    else buckets['1d+']++;
  });
  const bucketMax = Math.max(...Object.values(buckets), 1);

  /* ── Overtrading check ── */
  const overtradingFlag = a.avgTradesPerWeek > 25;
  const highActivityFlag = a.avgTradesPerWeek > 15;

  /* ── Holding-time vs outcome ── */
  const winDurations  = trades.filter(t => (Number(t.pnl) || 0) > 0 && t.openTime && t.closeTime)
    .map(t => new Date(t.closeTime).getTime() - new Date(t.openTime).getTime());
  const lossDurations = trades.filter(t => (Number(t.pnl) || 0) < 0 && t.openTime && t.closeTime)
    .map(t => new Date(t.closeTime).getTime() - new Date(t.openTime).getTime());
  const avgWinDur  = winDurations.length  > 0 ? winDurations.reduce((s, v) => s + v, 0)  / winDurations.length  : 0;
  const avgLossDur = lossDurations.length > 0 ? lossDurations.reduce((s, v) => s + v, 0) / lossDurations.length : 0;

  return (
    <div className="aa-page">

      {/* ── Execution score banner ── */}
      <div className="aa-card aa-card--accent" style={{ marginBottom: 16, display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap' }}>
        <ScoreGauge score={execScore} label={execLabel} color={execColor} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: execColor, marginBottom: 4 }}>
            <i className={`fas ${execScore >= 75 ? 'fa-rocket' : execScore >= 55 ? 'fa-check-circle' : 'fa-exclamation-circle'}`} style={{ marginRight: 8 }} />
            Execution Quality: {execLabel}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.65, maxWidth: 460 }}>
            {execScore >= 75 && 'Elite-level execution discipline. Your process is consistent, structured, and aligned with professional standards.'}
            {execScore >= 55 && execScore < 75 && 'Good execution habits with room to sharpen. Focus on SL/TP consistency and reducing emotional interference.'}
            {execScore >= 35 && execScore < 55 && 'Execution quality needs improvement. Inconsistent risk management and entry discipline detected.'}
            {execScore < 35 && 'Poor execution patterns detected. Immediate focus on structured entries, defined risk, and emotional control is required.'}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <span className={`aa-pill ${a.pctWithSL >= 80 ? 'aa-pill--green' : 'aa-pill--amber'}`}>
              SL: {fmtPct(a.pctWithSL)}%
            </span>
            <span className="aa-pill aa-pill--accent">
              TP: {fmtPct(a.pctWithTP)}%
            </span>
            <span className={`aa-pill ${a.winRate >= 50 ? 'aa-pill--green' : 'aa-pill--red'}`}>
              WR: {fmtPct(a.winRate)}%
            </span>
            {overtradingFlag && <span className="aa-pill aa-pill--red">Overtrading Detected</span>}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
          {[
            { l: 'Avg Duration',  v: fmtDuration(a.avgDurationMs),       c: 'rgba(255,255,255,0.75)' },
            { l: 'Avg Win Dur',   v: fmtDuration(avgWinDur),              c: '#10b981' },
            { l: 'Avg Loss Dur',  v: fmtDuration(avgLossDur),             c: avgLossDur > avgWinDur ? '#ef4444' : 'rgba(255,255,255,0.75)' },
            { l: 'Avg Per Week',  v: fmtNum(a.avgTradesPerWeek, 1) + 'T', c: overtradingFlag ? '#ef4444' : 'rgba(255,255,255,0.75)' },
          ].map(({ l, v, c }) => (
            <div key={l}>
              <div style={{ fontSize: '0.58rem', fontWeight: 600, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{l}</div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: c, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Metrics grid ── */}
      <div className="aa-grid-3" style={{ marginBottom: 16 }}>

        {/* SL/TP usage */}
        <div className="aa-card">
          <div className="aa-section-title">Risk Management</div>
          <MetricRow label="Stop Loss Usage"  value={fmtPct(a.pctWithSL) + '%'} color={a.pctWithSL >= 80 ? '#10b981' : '#f59e0b'} sub={`${Math.round(a.totalTrades * a.pctWithSL / 100)} of ${a.totalTrades} trades`} />
          <MetricRow label="Take Profit Usage" value={fmtPct(a.pctWithTP) + '%'} color="#8b5cf6" sub={`${Math.round(a.totalTrades * a.pctWithTP / 100)} of ${a.totalTrades} trades`} />
          <MetricRow label="Profit Factor" value={a.profitFactor > 0 ? fmtNum(a.profitFactor) : '—'} color={a.profitFactor >= 1.5 ? '#10b981' : a.profitFactor >= 1 ? '#f59e0b' : '#ef4444'} />
          <MetricRow label="Expectancy / Trade" value={a.expectancy !== 0 ? fmtPnl(a.expectancy) : '—'} color={a.expectancy >= 0 ? '#10b981' : '#ef4444'} />
          <MetricRow label="Avg Win / Avg Loss" value={a.avgWin > 0 && a.avgLoss > 0 ? fmtNum(a.avgWin / a.avgLoss) + 'x' : '—'}
            color={a.avgWin > a.avgLoss ? '#10b981' : '#ef4444'} sub={`${fmtPnl(a.avgWin)} avg win`} />
        </div>

        {/* Holding time breakdown */}
        <div className="aa-card">
          <div className="aa-section-title">Holding Time Distribution</div>
          {Object.entries(buckets).map(([label, count]) => {
            const w = count / bucketMax * 100;
            return (
              <div key={label} className="aa-bar-row">
                <span className="aa-bar-label" style={{ width: 80 }}>{label}</span>
                <div className="aa-bar-track">
                  <div className="aa-bar-fill aa-bar-fill--accent" style={{ width: `${w}%` }} />
                </div>
                <span className="aa-bar-val aa--muted">{count}T</span>
              </div>
            );
          })}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '12px 0' }} />
          <MetricRow label="Win trades avg hold"  value={fmtDuration(avgWinDur)}  color="#10b981" />
          <MetricRow label="Loss trades avg hold" value={fmtDuration(avgLossDur)} color={avgLossDur > avgWinDur ? '#ef4444' : 'rgba(255,255,255,0.75)'}
            sub={avgLossDur > avgWinDur ? 'Holding losers too long' : 'Duration balanced'} />
        </div>

        {/* Frequency & discipline */}
        <div className="aa-card">
          <div className="aa-section-title">Discipline Signals</div>
          <MetricRow label="Trades / Week" value={fmtNum(a.avgTradesPerWeek, 1)} color={overtradingFlag ? '#ef4444' : highActivityFlag ? '#f59e0b' : '#10b981'}
            sub={overtradingFlag ? 'High frequency — review selectivity' : highActivityFlag ? 'Active — monitor quality' : 'Good selectivity'} />
          <MetricRow label="Max Win Streak"  value={String(a.maxWinStreak)}  color="#10b981" />
          <MetricRow label="Max Loss Streak" value={String(a.maxLossStreak)} color={a.maxLossStreak >= 5 ? '#ef4444' : 'rgba(255,255,255,0.75)'}
            sub={a.maxLossStreak >= 5 ? 'High — add daily loss limit' : 'Acceptable'} />
          <MetricRow label="Win Rate"  value={fmtPct(a.winRate) + '%'}  color={a.winRate >= 50 ? '#10b981' : '#ef4444'} />
          <MetricRow label="Breakeven" value={String(a.breakeven)} color="rgba(255,255,255,0.5)" />
        </div>
      </div>

      {/* ── Discipline warnings ── */}
      <div className="aa-card">
        <div className="aa-section-title-lg" style={{ marginBottom: 12 }}>
          <span className="aa-title-dot" style={{ background: execColor }} />
          Execution Warnings & Tips
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {a.pctWithSL < 80 && (
            <div className="aa-warning">
              <i className="fas fa-shield-alt aa-warning-icon" style={{ color: '#f59e0b' }} />
              {fmtPct(100 - a.pctWithSL)}% of trades missing a stop loss. Every trade should have a defined exit before entry.
            </div>
          )}
          {avgLossDur > avgWinDur * 1.5 && avgWinDur > 0 && (
            <div className="aa-warning aa-warning--red">
              <i className="fas fa-clock aa-warning-icon" style={{ color: '#ef4444' }} />
              Losing trades are held {fmtDuration(avgLossDur - avgWinDur)} longer than winners — classic sign of letting losses run.
            </div>
          )}
          {overtradingFlag && (
            <div className="aa-warning aa-warning--red">
              <i className="fas fa-exclamation-circle aa-warning-icon" style={{ color: '#ef4444' }} />
              Averaging {fmtNum(a.avgTradesPerWeek, 1)} trades per week. High frequency correlates with lower quality setups — be more selective.
            </div>
          )}
          {a.maxLossStreak >= 5 && (
            <div className="aa-warning aa-warning--red">
              <i className="fas fa-times aa-warning-icon" style={{ color: '#ef4444' }} />
              Max loss streak of {a.maxLossStreak} trades. Implement a 3-trade daily loss limit to prevent emotional spirals.
            </div>
          )}
          {a.pctWithSL >= 90 && a.winRate >= 50 && (
            <div className="aa-insight">
              <div className="aa-insight-dot" />
              Excellent discipline — {fmtPct(a.pctWithSL)}% SL coverage and {fmtPct(a.winRate)}% win rate. Keep maintaining this standard.
            </div>
          )}
          {a.profitFactor >= 2 && (
            <div className="aa-insight">
              <div className="aa-insight-dot" />
              Profit factor of {fmtNum(a.profitFactor)} signals a genuinely profitable strategy edge. Protect it by maintaining discipline.
            </div>
          )}
          {a.profitFactor > 0 && a.profitFactor < 1 && (
            <div className="aa-warning aa-warning--red">
              <i className="fas fa-chart-line aa-warning-icon" style={{ color: '#ef4444' }} />
              Profit factor below 1.0 — review your setup criteria and ensure you're only taking A+ setups.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
