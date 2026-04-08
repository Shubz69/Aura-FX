import React, { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuraAnalysisData, useAuraAnalysisMetrics } from '../../../context/AuraAnalysisContext';
import { buildHabitsStrengthsReport } from '../../../lib/aura-analysis/habitsStrengthsReport';
import { computeSetupAttribution } from '../../../lib/aura-analysis/setupAttribution';
import AuraAnalysisEmptyState from '../../../components/aura-analysis/AuraAnalysisEmptyState';
import { fmtPnl, fmtPct } from '../../../lib/aura-analysis/analytics';
import { useAuraPerfSection } from '../auraTabPerf';
import '../../../styles/aura-analysis/AuraShared.css';

const HabitsReportMain = memo(function HabitsReportMain() {
  useAuraPerfSection('HabitsReport.main');
  const { trades, patchTradeMetadata } = useAuraAnalysisData();
  const { analytics: a } = useAuraAnalysisMetrics();

  const report = useMemo(() => buildHabitsStrengthsReport(a), [a]);
  const setups = useMemo(() => computeSetupAttribution(trades), [trades]);

  const recent = useMemo(() => {
    return [...trades]
      .filter((t) => String(t.tradeStatus || '').toLowerCase() !== 'open')
      .slice(-18)
      .reverse();
  }, [trades]);

  return (
    <div className="aa-page">
      <div className="aa-card aa-card--accent" style={{ marginBottom: 16 }}>
        <div className="aa-section-title-lg" style={{ marginBottom: 8 }}>
          <span className="aa-title-dot" />
          Habits &amp; strengths
        </div>
        <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.52)', margin: 0, lineHeight: 1.65, maxWidth: 720 }}>
          This report mirrors journal-style coaching: it combines automated insights, behaviour clustering, and execution path
          stats when available — no manual mood tags required. Tag setups and rate trades below to unlock expectancy-by-setup
          (TradeZella-style attribution).
        </p>
      </div>

      <div className="aa-grid-2" style={{ marginBottom: 16 }}>
        <div className="aa-card">
          <div className="aa-section-title">Top strengths</div>
          {!report.strengths.length ? (
            <p className="aa-empty">Not enough edge yet — widen the sample or improve discipline signals.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.78rem', color: 'rgba(255,255,255,0.78)', lineHeight: 1.7 }}>
              {report.strengths.map((s) => (
                <li key={s.title}>
                  <strong style={{ color: '#f8c37d' }}>{s.title}</strong>
                  {s.detail ? ` — ${s.detail}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="aa-card">
          <div className="aa-section-title">Watch list (weaknesses / habits)</div>
          {!report.weaknesses.length ? (
            <p className="aa-empty">No major habit flags in this window.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.78rem', color: 'rgba(255,255,255,0.78)', lineHeight: 1.7 }}>
              {report.weaknesses.map((s) => (
                <li key={(s.title + s.detail).slice(0, 80)}>
                  <strong style={{ color: '#c9a05c' }}>{s.title}</strong>
                  {s.detail ? ` — ${s.detail}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {report.habitFlags.length > 0 && (
        <div className="aa-card" style={{ marginBottom: 16 }}>
          <div className="aa-section-title">Habit flags</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {report.habitFlags.map((f) => (
              <span key={f.code} className={`aa-pill ${f.severity === 'high' ? 'aa-pill--red' : 'aa-pill--amber'}`}>
                {f.label}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="aa-card" style={{ marginBottom: 16 }}>
        <div className="aa-section-title">Expectancy by setup / tag</div>
        <p style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.38)', margin: '0 0 12px' }}>
          Assign a setup name in the table below (stored on this device). “Unassigned” means only MT history — still useful for volume share.
        </p>
        {setups.length === 0 ? (
          <p className="aa-empty">No trades in range.</p>
        ) : (
          <div className="aa-table-wrap" style={{ overflowX: 'auto' }}>
            <table className="aa-table" style={{ width: '100%', fontSize: '0.72rem' }}>
              <thead>
                <tr>
                  <th>Setup</th>
                  <th>Trades</th>
                  <th>Win %</th>
                  <th>Expectancy</th>
                  <th>Total P/L</th>
                </tr>
              </thead>
              <tbody>
                {setups.map((row) => (
                  <tr key={row.setupKey}>
                    <td>{row.setupKey}</td>
                    <td>{row.n}</td>
                    <td>{fmtPct(row.winRate)}</td>
                    <td>{fmtPnl(row.expectancy)}</td>
                    <td className={row.pnl >= 0 ? 'aa--green' : 'aa--red'}>{fmtPnl(row.pnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="aa-card">
        <div className="aa-section-title">Trade metadata (rating · setup · note)</div>
        <p style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.38)', margin: '0 0 12px' }}>
          Stored locally per account — enriches rows before analytics runs. Open{' '}
          <Link to="/trader-deck/trade-validator/trader-playbook" style={{ color: '#eaa960' }}>Playbook</Link>
          {' '}for full setup management.
        </p>
        {!recent.length ? (
          <p className="aa-empty">No recent closed trades.</p>
        ) : (
          <div className="aa-table-wrap" style={{ overflowX: 'auto' }}>
            <table className="aa-table" style={{ width: '100%', fontSize: '0.68rem' }}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Pair</th>
                  <th>P/L</th>
                  <th>Rating</th>
                  <th>Setup tag</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((t) => (
                  <tr key={String(t.id)}>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{String(t.id).slice(-8)}</td>
                    <td>{t.pair || t.symbol || '—'}</td>
                    <td>{fmtPnl(t.netPnl != null ? Number(t.netPnl) : Number(t.pnl) || 0)}</td>
                    <td>
                      <select
                        className="aura-db-filter-select"
                        style={{ minWidth: 56, fontSize: '0.65rem' }}
                        value={t.userRating != null ? String(t.userRating) : ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          patchTradeMetadata(t.id, { rating: v === '' ? null : Number(v) });
                        }}
                      >
                        <option value="">—</option>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        className="aura-db-filter-select"
                        style={{ width: 100, fontSize: '0.65rem' }}
                        placeholder="Tag"
                        key={`setup-${t.id}-${t.userSetupKey || ''}`}
                        defaultValue={t.userSetupKey || ''}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          patchTradeMetadata(t.id, { setupKey: v || null });
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="aura-db-filter-select"
                        style={{ minWidth: 120, fontSize: '0.65rem' }}
                        placeholder="Short note"
                        key={`note-${t.id}-${t.userNote || ''}`}
                        defaultValue={t.userNote || ''}
                        onBlur={(e) => patchTradeMetadata(t.id, { note: e.target.value.trim() || null })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
});

export default function HabitsReport() {
  const { trades, loading, error, connections, activePlatformId } = useAuraAnalysisData();
  const needsConnection = !connections?.length || !activePlatformId;

  if (loading) {
    return (
      <div className="aa-page">
        <div className="aa-skeleton aa-skeleton-kpi" style={{ marginBottom: 12 }} />
        <div className="aa-skeleton" style={{ minHeight: 220, borderRadius: 12 }} />
      </div>
    );
  }
  if (needsConnection) {
    return <AuraAnalysisEmptyState title="Connect MetaTrader" message="Link an MT account from Connection Hub to run habits & strengths." />;
  }
  if (error) {
    return <AuraAnalysisEmptyState title="Data error" message={error} />;
  }

  return <HabitsReportMain />;
}
