import React, { memo, useMemo } from 'react';
import { useAuraAnalysisData, useAuraAnalysisMetrics } from '../../../context/AuraAnalysisContext';
import { fmtPnl, fmtPct, fmtNum } from '../../../lib/aura-analysis/analytics';
import AuraAnalysisEmptyState from '../../../components/aura-analysis/AuraAnalysisEmptyState';
import { AuraHourOfDayStrip, AuraEquityAreaChart } from '../../../components/aura-analysis/AuraPerformanceCharts';
import { useAuraPerfSection, useIdleDeferredReady, useInViewOnce } from '../auraTabPerf';
import '../../../styles/aura-analysis/AuraShared.css';

function pnlCls(v) { return v > 0 ? 'aa--green' : v < 0 ? 'aa--red' : 'aa--muted'; }

function HeatCell({ value, maxAbs, label, sub, size = 'md' }) {
  const intensity = maxAbs > 0 ? Math.abs(value) / maxAbs : 0;
  const isPos = value >= 0;
  const bg = value === 0 ? 'rgba(255,255,255,0.03)'
    : isPos ? `rgba(16,185,129,${0.05 + intensity * 0.25})`
      : `rgba(239,68,68,${0.05 + intensity * 0.25})`;
  const border = value === 0 ? 'rgba(255,255,255,0.07)'
    : isPos ? `rgba(16,185,129,${0.1 + intensity * 0.3})`
      : `rgba(239,68,68,${0.1 + intensity * 0.3})`;
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: size === 'sm' ? '8px 6px' : '10px 8px', textAlign: 'center' }}>
      <div style={{ fontSize: size === 'sm' ? '0.6rem' : '0.63rem', fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: size === 'sm' ? '0.68rem' : '0.75rem', fontWeight: 700, color: value === 0 ? 'rgba(255,255,255,0.3)' : isPos ? '#f8c37d' : '#9a8f84', fontVariantNumeric: 'tabular-nums' }}>
        {value === 0 ? '—' : (isPos ? '+' : '') + fmtNum(value, 0)}
      </div>
      {sub && <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const RankedList = memo(function RankedList({ items, valueKey = 'pnl', labelKey = 'pair', title, limit = 5 }) {
  const sorted = [...items].sort((a, b) => b[valueKey] - a[valueKey]);
  const maxAbs = Math.max(...sorted.map(x => Math.abs(x[valueKey])), 1);
  return (
    <div>
      <div className="aa-section-title">{title}</div>
      {sorted.slice(0, limit).map((item, idx) => {
        const v = item[valueKey];
        const w = Math.abs(v) / maxAbs * 100;
        return (
          <div key={item[labelKey]} className="aa-bar-row">
            <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'rgba(255,255,255,0.2)', width: 16, flexShrink: 0 }}>{idx + 1}</span>
            <span className="aa-bar-label">{item[labelKey]}</span>
            <div className="aa-bar-track">
              <div className={`aa-bar-fill ${v >= 0 ? 'aa-bar-fill--green' : 'aa-bar-fill--red'}`} style={{ width: `${w}%` }} />
            </div>
            <span className={`aa-bar-val ${pnlCls(v)}`}>{fmtPnl(v)}</span>
            {item.winRate != null && <span className="aa-bar-meta">{fmtPct(item.winRate)}%</span>}
          </div>
        );
      })}
    </div>
  );
});

const EdgeFullInstrumentTable = memo(function EdgeFullInstrumentTable({ trades, bySymbol }) {
  const rows = useMemo(() => bySymbol.map((s) => {
    const symTrades = trades.filter(t => (t.pair || t.symbol) === s.pair);
    const wins = symTrades.filter(t => (Number(t.pnl) || 0) > 0);
    const lossArr = symTrades.filter(t => (Number(t.pnl) || 0) < 0);
    const avgWin = wins.length > 0 ? wins.reduce((acc, t) => acc + (Number(t.pnl) || 0), 0) / wins.length : 0;
    const avgLoss = lossArr.length > 0 ? Math.abs(lossArr.reduce((acc, t) => acc + (Number(t.pnl) || 0), 0)) / lossArr.length : 0;
    const exp = (s.winRate / 100) * avgWin - ((100 - s.winRate) / 100) * avgLoss;
    return { s, avgWin, avgLoss, exp };
  }), [trades, bySymbol]);

  return (
    <div className="aa-table-wrap">
      <table className="aa-table">
        <thead>
          <tr><th>Symbol</th><th>Trades</th><th>Win%</th><th>Avg Win</th><th>Avg Loss</th><th>P-Factor</th><th>Expectancy</th><th>Net P/L</th></tr>
        </thead>
        <tbody>
          {rows.map(({ s, avgWin, avgLoss, exp }) => (
            <tr key={s.pair}>
              <td style={{ fontWeight: 700 }}>{s.pair}</td>
              <td className="aa-table-num">{s.trades}</td>
              <td className={`aa-table-num ${s.winRate >= 50 ? 'aa--green' : 'aa--red'}`}>{fmtPct(s.winRate)}</td>
              <td className="aa-table-num aa--green">{avgWin > 0 ? fmtPnl(avgWin) : '—'}</td>
              <td className="aa-table-num aa--red">{avgLoss > 0 ? '-$' + fmtNum(avgLoss) : '—'}</td>
              <td className={`aa-table-num ${s.pf >= 1 ? 'aa--green' : 'aa--red'}`}>{s.pf > 0 ? fmtNum(s.pf) : '—'}</td>
              <td className={`aa-table-num ${pnlCls(exp)}`}>{exp !== 0 ? fmtPnl(exp) : '—'}</td>
              <td className={`aa-table-num ${pnlCls(s.pnl)}`}>{fmtPnl(s.pnl)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

const EdgeAnalyzerBody = memo(function EdgeAnalyzerBody({ trades }) {
  const { analytics: a, analyticsDataKey } = useAuraAnalysisMetrics();
  useAuraPerfSection('EdgeAnalyzer.body');
  const deferMid = useIdleDeferredReady(analyticsDataKey || '');
  const [fullRef, fullVis] = useInViewOnce({ rootMargin: '220px' });

  const wdActive = a.byWeekday.filter(w => w.trades > 0);
  const wdMaxAbs = Math.max(...wdActive.map(w => Math.abs(w.pnl)), 1);
  const sessMaxAbs = Math.max(...a.bySession.map(s => Math.abs(s.pnl)), 1);

  const bestSymbol = a.bySymbol[0] || null;
  const worstSymbol = a.bySymbol[a.bySymbol.length - 1] || null;
  const bestSession = a.bySession[0] || null;
  const worstSession = a.bySession[a.bySession.length - 1] || null;

  return (
    <div className="aa-page">

      <div className="aa-grid-4" style={{ marginBottom: 12 }}>
        {[
          { label: 'Best Pair', value: bestSymbol?.pair || '—', sub: bestSymbol ? fmtPnl(bestSymbol.pnl) : '', cls: 'aa--green' },
          { label: 'Worst Pair', value: worstSymbol?.pair || '—', sub: worstSymbol ? fmtPnl(worstSymbol.pnl) : '', cls: 'aa--red' },
          { label: 'Best Session', value: bestSession?.session || '—', sub: bestSession ? fmtPct(bestSession.winRate) + '% WR' : '', cls: 'aa--green' },
          { label: 'Worst Session', value: worstSession?.session || '—', sub: worstSession ? fmtPct(worstSession.winRate) + '% WR' : '', cls: 'aa--red' },
        ].map(({ label, value, sub, cls }) => (
          <div key={label} className="aa-kpi">
            <span className="aa-kpi-label">{label}</span>
            <span className={`aa-kpi-value ${cls}`} style={{ fontSize: '0.92rem' }}>{value}</span>
            {sub && <span className="aa-kpi-sub">{sub}</span>}
          </div>
        ))}
      </div>

      <div className="aa-grid-4" style={{ marginBottom: 16 }}>
        {[
          { label: 'SQN', value: fmtNum(a.sqn, 2), cls: a.sqn >= 2.5 ? 'aa--green' : '', sub: 'System quality' },
          { label: 'Expectancy R', value: fmtNum(a.expectancyR, 2), cls: pnlCls(a.expectancyR), sub: 'Per 1R' },
          { label: 'Recovery F.', value: a.recoveryFactor > 0 && a.recoveryFactor < 900 ? fmtNum(a.recoveryFactor, 2) : a.recoveryFactor >= 900 ? '∞' : '—', cls: a.recoveryFactor >= 2 ? 'aa--green' : '', sub: 'Net ÷ max DD' },
          { label: 'Largest win % GP', value: a.largestWinPctOfGross > 0 ? fmtPct(a.largestWinPctOfGross) : '—', cls: a.largestWinPctOfGross > 45 ? 'aa--amber' : '', sub: 'Concentration' },
          { label: 'Edge stability', value: String(a.institutional?.edgeStabilityScore ?? '—'), cls: '', sub: '/100' },
          { label: 'Edge decay', value: a.institutional?.edgeDecay?.decayFlag ? 'Yes' : 'No', cls: a.institutional?.edgeDecay?.decayFlag ? 'aa--amber' : 'aa--green', sub: '1/2 sample' },
          { label: '1H exp.', value: a.institutional?.edgeDecay?.firstHalfExpectancy != null ? fmtPnl(a.institutional.edgeDecay.firstHalfExpectancy) : '—', cls: '', sub: '$/trade' },
          { label: '2H exp.', value: a.institutional?.edgeDecay?.secondHalfExpectancy != null ? fmtPnl(a.institutional.edgeDecay.secondHalfExpectancy) : '—', cls: '', sub: '$/trade' },
        ].map(({ label, value, sub, cls }) => (
          <div key={label} className="aa-kpi">
            <span className="aa-kpi-label">{label}</span>
            <span className={`aa-kpi-value ${cls || ''}`}>{value}</span>
            {sub && <span className="aa-kpi-sub">{sub}</span>}
          </div>
        ))}
      </div>

      <div className="aa-grid-2" style={{ marginBottom: 16 }}>
        <div className="aa-card">
          <div className="aa-section-title">Edge vs time (UTC)</div>
          {deferMid ? (
            <AuraHourOfDayStrip byHourUtc={a.byHourUtc} />
          ) : (
            <div className="aa-skeleton" style={{ height: 64, borderRadius: 8 }} aria-hidden />
          )}
        </div>
        <div>
          <AuraEquityAreaChart curve={a.equityCurve} height={128} title="Equity context" />
        </div>
      </div>

      <div className="aa-grid-2" style={{ marginBottom: 16 }}>
        <div className="aa-card">
          <RankedList items={a.bySymbol} labelKey="pair" title="Best Performing Pairs" />
          {a.bySymbol.length > 3 && (
            <>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '14px 0' }} />
              <RankedList items={[...a.bySymbol].reverse()} labelKey="pair" title="Worst Performing Pairs" limit={3} />
            </>
          )}
        </div>

        <div className="aa-card">
          <RankedList items={a.bySession} labelKey="session" title="Session Ranking by P/L" />
          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '14px 0' }} />

          <div className="aa-section-title">Long vs Short Edge</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {[
              { key: 'buy', label: 'Long', col: '#f8c37d', data: a.byDirection.buy },
              { key: 'sell', label: 'Short', col: '#9a8f84', data: a.byDirection.sell },
            ].map(({ key, label, col, data }) => (
              <div key={key} style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: col, marginBottom: 8 }}>{label} ({data.trades})</div>
                {[
                  { l: 'Win Rate', v: fmtPct(data.winRate) + '%', c: data.winRate >= 50 ? '#f8c37d' : '#9a8f84' },
                  { l: 'Net P/L', v: fmtPnl(data.pnl), c: data.pnl >= 0 ? '#f8c37d' : '#9a8f84' },
                  { l: 'P-Factor', v: data.pf > 0 ? fmtNum(data.pf) : '—', c: data.pf >= 1 ? '#f8c37d' : '#9a8f84' },
                ].map(({ l, v, c }) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)' }}>{l}</span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: c }}>{v}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="aa-card" style={{ marginBottom: 16 }}>
        <div className="aa-section-title">Weekday P/L Heatmap</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
          {a.byWeekday.map(w => (
            <HeatCell key={w.day} value={w.trades > 0 ? w.pnl : 0} maxAbs={wdMaxAbs}
              label={w.day} sub={w.trades > 0 ? `${w.trades}T · ${fmtPct(w.winRate)}%` : '—'} />
          ))}
        </div>
      </div>

      {a.bySession.length > 0 && (
        <div className="aa-card" style={{ marginBottom: 16 }}>
          <div className="aa-section-title">Session Performance Grid</div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(a.bySession.length, 4)}, 1fr)`, gap: 6 }}>
            {a.bySession.map(s => (
              <HeatCell key={s.session} value={s.pnl} maxAbs={sessMaxAbs}
                label={s.session} sub={`${s.trades}T · ${fmtPct(s.winRate)}%`} />
            ))}
          </div>
        </div>
      )}

      <div className="aa-card" ref={fullRef}>
        <div className="aa-section-title-lg" style={{ marginBottom: 12 }}>
          <span className="aa-title-dot" />
          Full Instrument Report
        </div>
        {!fullVis ? (
          <div className="aa-skeleton" style={{ minHeight: 200, borderRadius: 10 }} aria-hidden />
        ) : (
          <EdgeFullInstrumentTable trades={trades} bySymbol={a.bySymbol} />
        )}
      </div>

    </div>
  );
});

export default function EdgeAnalyzer() {
  const { trades, loading, error, activePlatformId, connections } = useAuraAnalysisData();
  const needsConnection = !connections?.length || !activePlatformId;

  if (loading) return (
    <div className="aa-page">
      <div className="aa-grid-3" style={{ marginBottom: 12 }}>{[...Array(3)].map((_, i) => <div key={i} className="aa-skeleton" style={{ height: 100, borderRadius: 12 }} />)}</div>
      <div className="aa-grid-2">{[...Array(2)].map((_, i) => <div key={i} className="aa-skeleton aa-skeleton-chart" />)}</div>
    </div>
  );

  if (error) return <div className="aa-page"><div className="aa-error"><i className="fas fa-exclamation-circle aa-error-icon" />{error}</div></div>;

  if (!trades.length) {
    return (
      <div className="aa-page">
        <AuraAnalysisEmptyState
          icon="mt5"
          variant={needsConnection ? 'connect' : 'data'}
          title={needsConnection ? 'Connect to surface your edge' : 'No trades in this period'}
          description={
            needsConnection
              ? 'Connect MetaTrader from the Connection Hub to map sessions, symbols, and directions where you win or lose.'
              : 'Edge heatmaps need trades in the selected range. Expand the date window or wait for history.'
          }
        />
      </div>
    );
  }

  return <EdgeAnalyzerBody trades={trades} />;
}
