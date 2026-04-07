import React from 'react';
import { useAuraAnalysis } from '../../../context/AuraAnalysisContext';
import { fmtPnl, fmtPct, fmtNum } from '../../../lib/aura-analysis/analytics';
import AuraAnalysisEmptyState from '../../../components/aura-analysis/AuraAnalysisEmptyState';
import { AuraDrawdownAreaChart, AuraPnlHistogram } from '../../../components/aura-analysis/AuraPerformanceCharts';
import '../../../styles/aura-analysis/AuraShared.css';

function pnlCls(v) { return v > 0 ? 'aa--green' : v < 0 ? 'aa--red' : 'aa--muted'; }

function ScoreRing({ score, color, size = 110 }) {
  const r = size / 2 - 7;
  const circ = 2 * Math.PI * r;
  const filled = circ * Math.min(score / 100, 1);
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="7"
        strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.8s ease' }} />
    </svg>
  );
}

function RiskBar({ label, value, max, color, fmt }) {
  const w = Math.min(Math.abs(value) / max * 100, 100);
  return (
    <div className="aa-bar-row">
      <span className="aa-bar-label aa-bar-label--wide">{label}</span>
      <div className="aa-bar-track">
        <div className="aa-bar-fill" style={{ width: `${w}%`, background: `linear-gradient(90deg, ${color}aa, ${color})` }} />
      </div>
      <span className="aa-bar-val" style={{ color }}>{fmt(value)}</span>
    </div>
  );
}

export default function RiskLab() {
  const { analytics: a, account, trades, loading, error, activePlatformId, connections } = useAuraAnalysis();
  const needsConnection = !connections?.length || !activePlatformId;

  if (loading) return (
    <div className="aa-page">
      <div className="aa-grid-4" style={{ marginBottom: 12 }}>{[...Array(4)].map((_, i) => <div key={i} className="aa-skeleton aa-skeleton-kpi" />)}</div>
      <div className="aa-skeleton aa-skeleton-chart" />
    </div>
  );

  if (error) return <div className="aa-page"><div className="aa-error"><i className="fas fa-exclamation-circle aa-error-icon" />{error}</div></div>;

  if (!trades.length) {
    return (
      <div className="aa-page">
        <AuraAnalysisEmptyState
          icon="mt5"
          variant={needsConnection ? 'connect' : 'data'}
          title={needsConnection ? 'Connect to analyse risk' : 'No trades in this period'}
          description={
            needsConnection
              ? 'Link MetaTrader from the Connection Hub to see drawdown, streaks, stop-loss usage, and risk scores.'
              : 'Risk metrics need closed trades in the selected range. Widen the date filter or refresh data.'
          }
        />
      </div>
    );
  }

  const riskColor = a.riskScore < 25 ? '#f8c37d' : a.riskScore < 50 ? '#c9a05c' : '#9a8f84';

  /* Risk-of-ruin estimate: simplified Kelly formula */
  const rorPct = a.winRate > 0 && a.avgWin > 0 && a.avgLoss > 0
    ? Math.max(0, 100 - (a.winRate * 1.1)) : null;

  return (
    <div className="aa-page">

      {/* ── Risk score banner ── */}
      <div className="aa-card aa-card--accent" style={{ marginBottom: 16, display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: 110, height: 110, flexShrink: 0 }}>
          <ScoreRing score={a.riskScore} color={riskColor} size={110} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
            <span style={{ fontSize: '1.6rem', fontWeight: 800, color: riskColor, lineHeight: 1 }}>{a.riskScore}</span>
            <span style={{ fontSize: '0.55rem', fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Risk Score</span>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: riskColor, marginBottom: 4 }}>
            <i className={`fas ${a.riskScore < 25 ? 'fa-check-circle' : a.riskScore < 50 ? 'fa-exclamation-circle' : 'fa-times-circle'}`} style={{ marginRight: 8 }} />
            {a.riskLabel} Risk Profile
          </div>
          <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, maxWidth: 480 }}>
            {a.riskScore < 25 && 'Your risk management is well-controlled. Continue maintaining these discipline standards.'}
            {a.riskScore >= 25 && a.riskScore < 50 && 'Moderate risk exposure detected. Review position sizing and stop loss usage to improve safety.'}
            {a.riskScore >= 50 && a.riskScore < 75 && 'Aggressive risk profile. Multiple risk indicators are elevated — reduce position sizes and enforce stop losses.'}
            {a.riskScore >= 75 && 'Dangerous risk exposure. Immediate action required. Consider pausing trading and reviewing your risk framework.'}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
          {[
            { l: 'Max Drawdown',     v: fmtPct(a.maxDrawdownPct),     c: a.maxDrawdownPct > 20 ? '#9a8f84' : '#f8c37d' },
            { l: 'Current DD',       v: fmtPct(a.currentDrawdownPct), c: a.currentDrawdownPct > 10 ? '#9a8f84' : '#f8c37d' },
            { l: 'Max Loss Streak',  v: String(a.maxLossStreak),      c: a.maxLossStreak >= 5 ? '#9a8f84' : 'rgba(255,255,255,0.75)' },
            { l: 'SL Coverage',      v: fmtPct(a.pctWithSL),         c: a.pctWithSL < 70 ? '#c9a05c' : '#f8c37d' },
          ].map(({ l, v, c }) => (
            <div key={l}>
              <div style={{ fontSize: '0.58rem', fontWeight: 600, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{l}</div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: c, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Drawdown chart ── */}
      <div style={{ marginBottom: 16 }}>
        <AuraDrawdownAreaChart curve={a.drawdownCurve} height={136} title="Drawdown over time (%)" />
      </div>

      {/* ── Risk metrics grid ── */}
      <div className="aa-grid-3" style={{ marginBottom: 16 }}>
        <div className="aa-card">
          <div className="aa-section-title">Drawdown Metrics</div>
          {[
            { label: 'Max Drawdown $',    value: '-$' + fmtNum(a.maxDrawdown),         color: '#9a8f84' },
            { label: 'Max Drawdown %',    value: fmtPct(a.maxDrawdownPct),             color: a.maxDrawdownPct > 20 ? '#9a8f84' : '#c9a05c' },
            { label: 'Current DD $',      value: '-$' + fmtNum(a.currentDrawdown),     color: '#9a8f84' },
            { label: 'Current DD %',      value: fmtPct(a.currentDrawdownPct),         color: a.currentDrawdownPct > 10 ? '#9a8f84' : '#f8c37d' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)' }}>{label}</span>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
            </div>
          ))}
        </div>

        <div className="aa-card">
          <div className="aa-section-title">Streak & Consistency</div>
          {[
            { label: 'Max Win Streak',  value: String(a.maxWinStreak),  color: '#f8c37d' },
            { label: 'Max Loss Streak', value: String(a.maxLossStreak), color: a.maxLossStreak >= 5 ? '#9a8f84' : 'rgba(255,255,255,0.75)' },
            { label: 'Current Streak',  value: `${a.currentStreak} ${a.streakType}`, color: a.streakType === 'win' ? '#f8c37d' : a.streakType === 'loss' ? '#9a8f84' : 'rgba(255,255,255,0.4)' },
            { label: 'Gross Profit',    value: '+$' + fmtNum(a.grossProfit), color: '#f8c37d' },
            { label: 'Gross Loss',      value: '-$' + fmtNum(a.grossLoss),   color: '#9a8f84' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)' }}>{label}</span>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
            </div>
          ))}
        </div>

        <div className="aa-card">
          <div className="aa-section-title">Execution Risk</div>
          {[
            { label: 'Recovery factor', value: a.recoveryFactor > 0 && a.recoveryFactor < 900 ? fmtNum(a.recoveryFactor, 2) : a.recoveryFactor >= 900 ? '∞' : '—', color: a.recoveryFactor >= 2 ? '#f8c37d' : 'rgba(255,255,255,0.65)' },
            { label: 'Calmar (est.)', value: a.calmarRatio > 0 ? fmtNum(a.calmarRatio, 2) : '—', color: 'rgba(255,255,255,0.65)' },
            { label: 'Max consec. loss $', value: a.maxConsecLossSum > 0 ? '-$' + fmtNum(a.maxConsecLossSum) : '—', color: '#c49b7c' },
            { label: 'Largest loss % of GL', value: a.largestLossPctOfGross > 0 ? fmtPct(a.largestLossPctOfGross) : '—', color: a.largestLossPctOfGross > 40 ? '#c9a05c' : 'rgba(255,255,255,0.65)' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)' }}>{label}</span>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
            </div>
          ))}
          {a.kellyOptimalFraction !== 0 && (
            <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(234,169,96,0.08)', border: '1px solid rgba(234,169,96,0.2)', borderRadius: 8 }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>Kelly hint</div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#f8c37d' }}>
                Full Kelly ≈ {fmtPct(a.kellyOptimalFraction * 100, 1)} of balance / trade (use a fraction in live trading).
              </div>
            </div>
          )}
          <div style={{ marginTop: 12 }} className="aa-section-title">P/L tail risk</div>
          <AuraPnlHistogram bins={a.pnlHistogram} height={96} />
          <RiskBar label="SL Coverage"  value={a.pctWithSL} max={100} color={a.pctWithSL < 70 ? '#c9a05c' : '#f8c37d'} fmt={v => fmtPct(v) + '%'} />
          <RiskBar label="TP Coverage"  value={a.pctWithTP} max={100} color="#eaa960" fmt={v => fmtPct(v) + '%'} />
          {rorPct != null && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: rorPct > 30 ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)', border: `1px solid ${rorPct > 30 ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}`, borderRadius: 8 }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>Risk-of-Ruin Est.</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: rorPct > 30 ? '#9a8f84' : '#f8c37d' }}>{fmtPct(rorPct, 1)}</div>
              <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>Probability of substantial account damage</div>
            </div>
          )}
          {account?.marginLevel != null && (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)' }}>Margin Level</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: account.marginLevel < 150 ? '#9a8f84' : account.marginLevel < 300 ? '#c9a05c' : '#f8c37d', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtNum(account.marginLevel, 1)}%
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Compliance warnings ── */}
      <div className="aa-card">
        <div className="aa-section-title-lg" style={{ marginBottom: 12 }}>
          <span className="aa-title-dot" style={{ background: a.riskScore > 50 ? '#9a8f84' : '#f8c37d' }} />
          Compliance & Warnings
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {a.maxDrawdownPct > 10 ? (
            <div className={`aa-warning ${a.maxDrawdownPct > 20 ? 'aa-warning--red' : ''}`}>
              <i className={`fas fa-exclamation-triangle aa-warning-icon`} style={{ color: a.maxDrawdownPct > 20 ? '#9a8f84' : '#c9a05c' }} />
              Max drawdown of {fmtPct(a.maxDrawdownPct)} is {a.maxDrawdownPct > 20 ? 'dangerously high' : 'elevated'}. Most prop firms allow 5-10% max.
            </div>
          ) : (
            <div className="aa-insight">
              <div className="aa-insight-dot" style={{ background: '#f8c37d' }} />
              Max drawdown of {fmtPct(a.maxDrawdownPct)} is within safe limits.
            </div>
          )}
          {a.pctWithSL < 80 && a.totalTrades > 5 && (
            <div className="aa-warning">
              <i className="fas fa-shield-alt aa-warning-icon" style={{ color: '#c9a05c' }} />
              {fmtPct(100 - a.pctWithSL)} of trades entered without a defined stop loss — this increases risk-of-ruin significantly.
            </div>
          )}
          {a.maxLossStreak >= 5 && (
            <div className="aa-warning aa-warning--red">
              <i className="fas fa-times-circle aa-warning-icon" style={{ color: '#9a8f84' }} />
              Maximum loss streak of {a.maxLossStreak} trades detected. Consider implementing a daily loss limit rule.
            </div>
          )}
          {a.currentDrawdownPct > 8 && (
            <div className="aa-warning aa-warning--red">
              <i className="fas fa-arrow-down aa-warning-icon" style={{ color: '#9a8f84' }} />
              Currently in a {fmtPct(a.currentDrawdownPct)} drawdown from peak equity. Reduce position sizes until recovered.
            </div>
          )}
          {a.riskScore < 25 && a.totalTrades > 5 && (
            <div className="aa-insight">
              <div className="aa-insight-dot" style={{ background: '#f8c37d' }} />
              Risk profile is within controlled parameters. Maintain current discipline standards.
            </div>
          )}
          {a.profitFactor > 0 && a.profitFactor < 1 && (
            <div className="aa-warning aa-warning--red">
              <i className="fas fa-chart-line aa-warning-icon" style={{ color: '#9a8f84' }} />
              Profit factor of {fmtNum(a.profitFactor)} means losses are exceeding profits. Review your strategy edge.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
