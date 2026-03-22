import React from 'react';
import { useAuraAnalysis } from '../../../context/AuraAnalysisContext';
import { fmtPnl, fmtPct, fmtNum } from '../../../lib/aura-analysis/analytics';
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

function DrawdownChart({ curve, height = 120 }) {
  if (!curve || curve.length < 2) return null;
  const W = 600; const H = height;
  const vals = curve.map(p => p.ddPct);
  const mx = Math.max(...vals, 0.1);
  const pad = { t: 8, b: 20, l: 4, r: 4 };
  const xs = curve.map((_, i) => pad.l + (i / (curve.length - 1)) * (W - pad.l - pad.r));
  const ys = vals.map(v => pad.t + (v / mx) * (H - pad.t - pad.b));
  const line = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const area = `${line} L${xs[xs.length-1].toFixed(1)},${H-pad.b} L${xs[0].toFixed(1)},${H-pad.b} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height, display: 'block' }}>
      <defs>
        <linearGradient id="rl-dd" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ef4444" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#rl-dd)" />
      <path d={line} fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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
  const { analytics: a, account, trades, loading, error } = useAuraAnalysis();

  if (loading) return (
    <div className="aa-page">
      <div className="aa-grid-4" style={{ marginBottom: 12 }}>{[...Array(4)].map((_, i) => <div key={i} className="aa-skeleton aa-skeleton-kpi" />)}</div>
      <div className="aa-skeleton aa-skeleton-chart" />
    </div>
  );

  if (error) return <div className="aa-page"><div className="aa-error"><i className="fas fa-exclamation-circle aa-error-icon" />{error}</div></div>;

  if (!trades.length) return (
    <div className="aa-page">
      <div className="aa-no-platform">
        <div className="aa-no-platform-icon"><i className="fas fa-shield-alt" /></div>
        <h3>No risk data available</h3>
        <p>Connect your MT5 account to analyse your risk profile.</p>
      </div>
    </div>
  );

  const riskColor = a.riskScore < 25 ? '#10b981' : a.riskScore < 50 ? '#f59e0b' : '#ef4444';
  const maxDD = Math.max(a.maxDrawdownPct, a.currentDrawdownPct, 1);

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
            { l: 'Max Drawdown',     v: fmtPct(a.maxDrawdownPct),     c: a.maxDrawdownPct > 20 ? '#ef4444' : '#10b981' },
            { l: 'Current DD',       v: fmtPct(a.currentDrawdownPct), c: a.currentDrawdownPct > 10 ? '#ef4444' : '#10b981' },
            { l: 'Max Loss Streak',  v: String(a.maxLossStreak),      c: a.maxLossStreak >= 5 ? '#ef4444' : 'rgba(255,255,255,0.75)' },
            { l: 'SL Coverage',      v: fmtPct(a.pctWithSL),         c: a.pctWithSL < 70 ? '#f59e0b' : '#10b981' },
          ].map(({ l, v, c }) => (
            <div key={l}>
              <div style={{ fontSize: '0.58rem', fontWeight: 600, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{l}</div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: c, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Drawdown chart ── */}
      <div className="aa-chart-wrap" style={{ marginBottom: 16 }}>
        <div className="aa-chart-title">Drawdown Over Time (%)</div>
        <DrawdownChart curve={a.drawdownCurve} height={130} />
      </div>

      {/* ── Risk metrics grid ── */}
      <div className="aa-grid-3" style={{ marginBottom: 16 }}>
        <div className="aa-card">
          <div className="aa-section-title">Drawdown Metrics</div>
          {[
            { label: 'Max Drawdown $',    value: '-$' + fmtNum(a.maxDrawdown),         color: '#ef4444' },
            { label: 'Max Drawdown %',    value: fmtPct(a.maxDrawdownPct),             color: a.maxDrawdownPct > 20 ? '#ef4444' : '#f59e0b' },
            { label: 'Current DD $',      value: '-$' + fmtNum(a.currentDrawdown),     color: '#ef4444' },
            { label: 'Current DD %',      value: fmtPct(a.currentDrawdownPct),         color: a.currentDrawdownPct > 10 ? '#ef4444' : '#10b981' },
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
            { label: 'Max Win Streak',  value: String(a.maxWinStreak),  color: '#10b981' },
            { label: 'Max Loss Streak', value: String(a.maxLossStreak), color: a.maxLossStreak >= 5 ? '#ef4444' : 'rgba(255,255,255,0.75)' },
            { label: 'Current Streak',  value: `${a.currentStreak} ${a.streakType}`, color: a.streakType === 'win' ? '#10b981' : a.streakType === 'loss' ? '#ef4444' : 'rgba(255,255,255,0.4)' },
            { label: 'Gross Profit',    value: '+$' + fmtNum(a.grossProfit), color: '#10b981' },
            { label: 'Gross Loss',      value: '-$' + fmtNum(a.grossLoss),   color: '#ef4444' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)' }}>{label}</span>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
            </div>
          ))}
        </div>

        <div className="aa-card">
          <div className="aa-section-title">Execution Risk</div>
          <RiskBar label="SL Coverage"  value={a.pctWithSL} max={100} color={a.pctWithSL < 70 ? '#f59e0b' : '#10b981'} fmt={v => fmtPct(v) + '%'} />
          <RiskBar label="TP Coverage"  value={a.pctWithTP} max={100} color="#eaa960" fmt={v => fmtPct(v) + '%'} />
          {rorPct != null && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: rorPct > 30 ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)', border: `1px solid ${rorPct > 30 ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}`, borderRadius: 8 }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>Risk-of-Ruin Est.</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: rorPct > 30 ? '#ef4444' : '#10b981' }}>{fmtPct(rorPct, 1)}</div>
              <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>Probability of substantial account damage</div>
            </div>
          )}
          {account?.marginLevel != null && (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)' }}>Margin Level</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: account.marginLevel < 150 ? '#ef4444' : account.marginLevel < 300 ? '#f59e0b' : '#10b981', fontVariantNumeric: 'tabular-nums' }}>
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
          <span className="aa-title-dot" style={{ background: a.riskScore > 50 ? '#ef4444' : '#10b981' }} />
          Compliance & Warnings
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {a.maxDrawdownPct > 10 ? (
            <div className={`aa-warning ${a.maxDrawdownPct > 20 ? 'aa-warning--red' : ''}`}>
              <i className={`fas fa-exclamation-triangle aa-warning-icon`} style={{ color: a.maxDrawdownPct > 20 ? '#ef4444' : '#f59e0b' }} />
              Max drawdown of {fmtPct(a.maxDrawdownPct)} is {a.maxDrawdownPct > 20 ? 'dangerously high' : 'elevated'}. Most prop firms allow 5-10% max.
            </div>
          ) : (
            <div className="aa-insight">
              <div className="aa-insight-dot" style={{ background: '#10b981' }} />
              Max drawdown of {fmtPct(a.maxDrawdownPct)} is within safe limits.
            </div>
          )}
          {a.pctWithSL < 80 && a.totalTrades > 5 && (
            <div className="aa-warning">
              <i className="fas fa-shield-alt aa-warning-icon" style={{ color: '#f59e0b' }} />
              {fmtPct(100 - a.pctWithSL)} of trades entered without a defined stop loss — this increases risk-of-ruin significantly.
            </div>
          )}
          {a.maxLossStreak >= 5 && (
            <div className="aa-warning aa-warning--red">
              <i className="fas fa-times-circle aa-warning-icon" style={{ color: '#ef4444' }} />
              Maximum loss streak of {a.maxLossStreak} trades detected. Consider implementing a daily loss limit rule.
            </div>
          )}
          {a.currentDrawdownPct > 8 && (
            <div className="aa-warning aa-warning--red">
              <i className="fas fa-arrow-down aa-warning-icon" style={{ color: '#ef4444' }} />
              Currently in a {fmtPct(a.currentDrawdownPct)} drawdown from peak equity. Reduce position sizes until recovered.
            </div>
          )}
          {a.riskScore < 25 && a.totalTrades > 5 && (
            <div className="aa-insight">
              <div className="aa-insight-dot" style={{ background: '#10b981' }} />
              Risk profile is within controlled parameters. Maintain current discipline standards.
            </div>
          )}
          {a.profitFactor > 0 && a.profitFactor < 1 && (
            <div className="aa-warning aa-warning--red">
              <i className="fas fa-chart-line aa-warning-icon" style={{ color: '#ef4444' }} />
              Profit factor of {fmtNum(a.profitFactor)} means losses are exceeding profits. Review your strategy edge.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
