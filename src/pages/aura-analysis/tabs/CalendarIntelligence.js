import React, { useState, useMemo } from 'react';
import { useAuraAnalysis } from '../../../context/AuraAnalysisContext';
import { fmtPnl, fmtPct, fmtNum } from '../../../lib/aura-analysis/analytics';
import AuraAnalysisEmptyState from '../../../components/aura-analysis/AuraAnalysisEmptyState';
import '../../../styles/aura-analysis/AuraShared.css';

function pnlCls(v) { return v > 0 ? 'aa--green' : v < 0 ? 'aa--red' : 'aa--muted'; }

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default function CalendarIntelligence() {
  const { analytics: a, trades, loading, error, activePlatformId, connections } = useAuraAnalysis();
  const needsConnection = !connections?.length || !activePlatformId;
  const [viewDate, setViewDate] = useState(() => new Date());
  const [selDay, setSelDay]     = useState(null);

  const y = viewDate.getFullYear();
  const m = viewDate.getMonth();

  /* ── Build calendar grid ─────────────────────────────────── */
  const grid = useMemo(() => {
    const firstDow = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${y}-${String(m + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const dayData = a.byDay?.[key];
      cells.push({ d, key, pnl: dayData?.pnl ?? null, tradeCount: dayData?.trades?.length ?? 0, wins: dayData?.wins ?? 0 });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [y, m, a.byDay]);

  /* ── Month stats ─────────────────────────────────────────── */
  const monthStats = useMemo(() => {
    const moKey = `${y}-${String(m + 1).padStart(2,'0')}`;
    return a.byMonth.find(bm => bm.month === moKey) || null;
  }, [y, m, a.byMonth]);

  /* ── Selected day trades ─────────────────────────────────── */
  const selDayData = selDay ? (a.byDay?.[selDay] || null) : null;

  /* ── Calendar intensity helpers ─────────────────────────── */
  const dayPnls = grid.filter(c => c && c.pnl != null).map(c => Math.abs(c.pnl));
  const maxDayPnl = dayPnls.length > 0 ? Math.max(...dayPnls, 1) : 1;

  const calLabel = `${MONTHS[m]} ${y}`;
  const today = new Date().toISOString().slice(0, 10);

  if (loading) return (
    <div className="aa-page">
      <div className="aa-skeleton" style={{ height: 380, borderRadius: 14, marginBottom: 12 }} />
      <div className="aa-grid-3">{[...Array(3)].map((_, i) => <div key={i} className="aa-skeleton aa-skeleton-kpi" />)}</div>
    </div>
  );

  if (error) return <div className="aa-page"><div className="aa-error"><i className="fas fa-exclamation-circle aa-error-icon" />{error}</div></div>;

  if (!trades.length) {
    return (
      <div className="aa-page">
        <AuraAnalysisEmptyState
          icon="mt5"
          variant={needsConnection ? 'connect' : 'data'}
          title={needsConnection ? 'Connect to fill your calendar' : 'No trades in this period'}
          description={
            needsConnection
              ? 'Connect MetaTrader from the Connection Hub to colour daily P/L and see which days you trade best.'
              : 'Calendar insights appear when closed trades exist in the selected history window.'
          }
        />
      </div>
    );
  }

  return (
    <div className="aa-page">

      {/* ── Month summary stats ── */}
      <div className="aa-grid-4" style={{ marginBottom: 16 }}>
        {[
          { label: 'Month P/L',    value: monthStats ? fmtPnl(monthStats.pnl)              : '—',  cls: monthStats ? pnlCls(monthStats.pnl) : '' },
          { label: 'Month Trades', value: monthStats ? String(monthStats.trades)            : '0',  cls: '' },
          { label: 'Month Win%',   value: monthStats ? fmtPct(monthStats.winRate) + '%'    : '—',  cls: monthStats?.winRate >= 50 ? 'aa--green' : 'aa--red' },
          { label: 'Trading Days', value: String(grid.filter(c => c && c.tradeCount > 0).length), cls: '' },
        ].map(({ label, value, cls }) => (
          <div key={label} className="aa-kpi">
            <span className="aa-kpi-label">{label}</span>
            <span className={`aa-kpi-value ${cls}`}>{value}</span>
          </div>
        ))}
      </div>

      <div className="aa-grid-2" style={{ marginBottom: 16, alignItems: 'start' }}>

        {/* ── Full calendar ── */}
        <div className="aa-card">
          {/* Nav */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
            <button type="button" onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1))}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '1.1rem', padding: '0 6px', lineHeight: 1 }}>‹</button>
            <span style={{ flex: 1, textAlign: 'center', fontSize: '0.82rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {calLabel}
            </span>
            <button type="button" onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1))}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '1.1rem', padding: '0 6px', lineHeight: 1 }}>›</button>
          </div>

          {/* Weekday headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 5 }}>
            {WEEKDAYS.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: '0.6rem', fontWeight: 700, color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '2px 0' }}>{d}</div>
            ))}
          </div>

          {/* Cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {grid.map((cell, idx) => {
              if (!cell) return <div key={idx} />;
              const isToday = cell.key === today;
              const isSel   = selDay === cell.key;
              const intensity = cell.pnl != null ? Math.abs(cell.pnl) / maxDayPnl : 0;
              const isPos = cell.pnl != null && cell.pnl >= 0;

              let bg, bdr;
              if (isSel) { bg = 'rgba(234,169,96,0.28)'; bdr = 'rgba(234,169,96,0.65)'; }
              else if (cell.pnl == null) { bg = 'rgba(255,255,255,0.02)'; bdr = 'rgba(255,255,255,0.06)'; }
              else if (isPos) { bg = `rgba(234,169,96,${0.05 + intensity * 0.22})`; bdr = `rgba(234,169,96,${0.14 + intensity * 0.3})`; }
              else            { bg = `rgba(140,125,115,${0.06 + intensity * 0.18})`;  bdr = `rgba(140,125,115,${0.16 + intensity * 0.26})`; }

              return (
                <button key={cell.key} type="button"
                  onClick={() => setSelDay(p => p === cell.key ? null : cell.key)}
                  style={{ background: bg, border: `1px solid ${bdr}`, borderRadius: 7, padding: '5px 3px 4px', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s', minHeight: 48 }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: isToday ? 700 : 400, color: isToday ? '#fcd9a8' : 'rgba(255,255,255,0.65)', marginBottom: 2 }}>{cell.d}</div>
                  {cell.pnl != null && (
                    <>
                      <div style={{ fontSize: '0.58rem', fontWeight: 700, color: isPos ? '#f8c37d' : '#9a8f84', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                        {isPos ? '+' : ''}{Math.abs(cell.pnl) >= 1000 ? fmtNum(cell.pnl / 1000, 1) + 'k' : fmtNum(cell.pnl, 0)}
                      </div>
                      <div style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>{cell.tradeCount}T</div>
                    </>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 14, marginTop: 12, justifyContent: 'flex-end' }}>
            {[['#f8c37d', 'Profit day'], ['#9a8f84', 'Loss day'], ['rgba(255,255,255,0.15)', 'No trades']].map(([c, l]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
                <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.3)' }}>{l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right panel: day detail + monthly summary ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Day detail */}
          <div className="aa-card">
            {selDay && selDayData ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
                    {new Date(selDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </span>
                  <button type="button" onClick={() => setSelDay(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '1rem', padding: 0 }}>×</button>
                </div>
                <div style={{ display: 'flex', gap: 14, marginBottom: 12, flexWrap: 'wrap' }}>
                  {[
                    { l: 'Day P/L',  v: fmtPnl(selDayData.pnl),  c: selDayData.pnl >= 0 ? '#f8c37d' : '#9a8f84' },
                    { l: 'Trades',   v: String(selDayData.trades.length), c: 'rgba(255,255,255,0.75)' },
                    { l: 'Wins',     v: String(selDayData.wins),          c: '#f8c37d' },
                    { l: 'Win Rate', v: selDayData.trades.length > 0 ? fmtPct(selDayData.wins / selDayData.trades.length * 100) + '%' : '—', c: 'rgba(255,255,255,0.75)' },
                  ].map(({ l, v, c }) => (
                    <div key={l} style={{ flex: '1 1 60px' }}>
                      <div style={{ fontSize: '0.58rem', fontWeight: 600, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{l}</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: c, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                    </div>
                  ))}
                </div>
                <div className="aa-table-wrap">
                  <table className="aa-table">
                    <thead><tr><th>Symbol</th><th>Dir</th><th>Lots</th><th>P/L</th></tr></thead>
                    <tbody>
                      {selDayData.trades.map((t, i) => (
                        <tr key={t.id || i}>
                          <td style={{ fontWeight: 700 }}>{t.pair || '—'}</td>
                          <td>
                            <span className={`aa-pill ${(t.direction||'').toLowerCase() === 'buy' ? 'aa-pill--green' : 'aa-pill--red'}`} style={{ fontSize: '0.56rem' }}>
                              {(t.direction || '—').toUpperCase()}
                            </span>
                          </td>
                          <td className="aa-table-num">{t.volume != null ? fmtNum(t.volume, 2) : '—'}</td>
                          <td className={`aa-table-num ${pnlCls(Number(t.pnl)||0)}`}>{fmtPnl(t.pnl)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="aa-empty" style={{ padding: '20px 0' }}>
                <div className="aa-empty-icon"><i className="fas fa-calendar-day" /></div>
                <p>Select a day to view trade detail</p>
              </div>
            )}
          </div>

          {/* Monthly performance table */}
          <div className="aa-card">
            <div className="aa-section-title">All Months</div>
            {a.byMonth.length === 0 ? (
              <div className="aa-empty">No monthly data</div>
            ) : (
              <div className="aa-table-wrap">
                <table className="aa-table">
                  <thead><tr><th>Month</th><th>Trades</th><th>Win%</th><th>Net P/L</th></tr></thead>
                  <tbody>
                    {[...a.byMonth].reverse().slice(0, 12).map(mo => (
                      <tr key={mo.month} style={{ cursor: 'pointer' }}
                        onClick={() => setViewDate(new Date(mo.month + '-15'))}>
                        <td style={{ fontWeight: 600 }}>
                          {new Date(mo.month + '-15').toLocaleString('en-US', { month: 'short', year: 'numeric' })}
                        </td>
                        <td className="aa-table-num">{mo.trades}</td>
                        <td className={`aa-table-num ${mo.winRate >= 50 ? 'aa--green' : 'aa--red'}`}>{fmtPct(mo.winRate)}%</td>
                        <td className={`aa-table-num ${pnlCls(mo.pnl)}`}>{fmtPnl(mo.pnl)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Weekly overview ── */}
      {a.byWeek.length > 0 && (
        <div className="aa-card">
          <div className="aa-section-title">Weekly P/L History</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(() => {
              const recent = [...a.byWeek].reverse().slice(0, 8);
              const maxAbs = Math.max(...recent.map(w => Math.abs(w.pnl)), 1);
              return recent.map(w => {
                const bWidth = Math.abs(w.pnl) / maxAbs * 100;
                const wLabel = new Date(w.week + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                return (
                  <div key={w.week} className="aa-bar-row">
                    <span className="aa-bar-label">Wk {wLabel}</span>
                    <div className="aa-bar-track">
                      <div className={`aa-bar-fill ${w.pnl >= 0 ? 'aa-bar-fill--green' : 'aa-bar-fill--red'}`} style={{ width: `${bWidth}%` }} />
                    </div>
                    <span className={`aa-bar-val ${pnlCls(w.pnl)}`}>{fmtPnl(w.pnl)}</span>
                    <span className="aa-bar-meta">{w.trades}T</span>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

    </div>
  );
}
