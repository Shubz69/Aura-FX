/**
 * Manual metrics dashboard — CSV snapshot (Aura-style density, no Aura provider).
 */
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { isSuperAdmin } from '../../utils/roles';
import AuraTerminalThemeShell from '../../components/AuraTerminalThemeShell';
import { useReportsEligibility } from './useReportsEligibility';
import '../../styles/aura-analysis/AuraShared.css';
import '../../styles/reports/ReportsPage.css';
import '../../styles/reports/Mt5CsvDashboard.css';
import '../../styles/reports/ManualMetricsPages.css';

const BASE_URL = process.env.REACT_APP_API_URL || '';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function aggregateBySymbol(trades) {
  const map = {};
  for (const t of trades) {
    const sym = (t.symbol || '').trim() || '—';
    if (!map[sym]) map[sym] = { symbol: sym, count: 0, pnl: 0 };
    map[sym].count += 1;
    map[sym].pnl += Number(t.profit) || 0;
  }
  return Object.values(map).sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));
}

function CumulativePnlChart({ cumulativePnl }) {
  const curve = cumulativePnl || [];
  if (curve.length < 2) {
    return (
      <div className="m5dash-empty-chart aa-empty">Not enough trades for a curve (need at least 2).</div>
    );
  }
  const W = 600;
  const H = 140;
  const vals = curve.map((p) => p.cumulative);
  const mn = Math.min(...vals, 0);
  const mx = Math.max(...vals, 0);
  const range = mx - mn || 1;
  const pad = { t: 14, b: 20, l: 8, r: 8 };
  const xs = curve.map((_, i) => pad.l + (i / (curve.length - 1)) * (W - pad.l - pad.r));
  const ys = vals.map((v) => pad.t + (1 - (v - mn) / range) * (H - pad.t - pad.b));
  const linePath = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const isUp = vals[vals.length - 1] >= vals[0];
  const col = isUp ? '#f8c37d' : '#9a8f84';
  const gradId = 'mm-cum';

  return (
    <div className="aa-chart-wrap">
      <div className="aa-chart-title">Cumulative P&amp;L (export order)</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="aa-svg-chart" style={{ height: H }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={col} stopOpacity="0.2" />
            <stop offset="100%" stopColor={col} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d={`${linePath} L${xs[xs.length - 1].toFixed(1)},${H - pad.b} L${xs[0].toFixed(1)},${H - pad.b} Z`}
          fill={`url(#${gradId})`}
        />
        <path d={linePath} fill="none" stroke={col} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function DrawdownChartCsv({ drawdownSeries }) {
  const curve = drawdownSeries || [];
  if (curve.length < 2) return null;
  const W = 600;
  const H = 90;
  const vals = curve.map((p) => p.ddPct || 0);
  const mx = Math.max(...vals, 0.1);
  const pad = { t: 6, b: 18, l: 4, r: 4 };
  const xs = curve.map((_, i) => pad.l + (i / (curve.length - 1)) * (W - pad.l - pad.r));
  const ys = vals.map((v) => pad.t + (v / mx) * (H - pad.t - pad.b));
  const linePath = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${xs[xs.length - 1].toFixed(1)},${H - pad.b} L${xs[0].toFixed(1)},${H - pad.b} Z`;
  return (
    <div className="aa-chart-wrap" style={{ marginTop: 10 }}>
      <div className="aa-chart-title">Drawdown % (from peak equity)</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="aa-svg-chart" style={{ height: H }}>
        <defs>
          <linearGradient id="mm-dd-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9a8f84" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#9a8f84" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#mm-dd-grad)" />
        <path d={linePath} fill="none" stroke="#9a8f84" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function WeekdayBars({ extended }) {
  if (!extended?.weekdayCounts?.length) return null;
  const counts = extended.weekdayCounts;
  const max = Math.max(...counts, 1);
  const labels = extended.weekdayLabels || ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if ((extended.weekdayParsedCount || 0) === 0) {
    return <p className="mm-aura-note">Weekday distribution unavailable — time column not parsed from export.</p>;
  }
  return (
    <div>
      <div className="mm-weekday-bars">
        {counts.map((c, i) => (
          <div key={labels[i]} className="mm-weekday-bar-wrap" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end', minHeight: 80 }}>
              <div className="mm-weekday-bar" style={{ height: `${(c / max) * 100}%`, width: '100%' }} title={`${c} trades`} />
            </div>
            <div className="mm-weekday-lbl">{labels[i]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ManualMetricsDashboardInner() {
  const { token, user } = useAuth();
  const { eligibility, loading: eligibilityLoading } = useReportsEligibility(token);
  const [searchParams] = useSearchParams();
  const yParam = searchParams.get('year');
  const mParam = searchParams.get('month');
  const now = new Date();
  const navYear = yParam ? parseInt(yParam, 10) : now.getFullYear();
  const navMonth = mParam ? parseInt(mParam, 10) : now.getMonth() + 1;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbiddenCode, setForbiddenCode] = useState('');
  const [payload, setPayload] = useState(null);
  const role = (eligibility?.role || '').toLowerCase();
  const canAccessCsvMetrics =
    isSuperAdmin(user) ||
    ['premium', 'pro', 'elite', 'admin', 'super_admin', 'superadmin'].includes(role);
  const load = useCallback(async () => {
    if (!token || eligibilityLoading || !eligibility || !canAccessCsvMetrics) return;
    setLoading(true);
    setError('');
    setForbiddenCode('');
    try {
      const q = new URLSearchParams();
      if (yParam) q.set('year', yParam);
      if (mParam) q.set('month', mParam);
      const res = await fetch(`${BASE_URL}/api/reports/csv-metrics?${q.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        setForbiddenCode(data.code || 'FORBIDDEN');
        setError(data.message || 'Access denied');
        setPayload(null);
        return;
      }
      if (!res.ok || !data.success) {
        throw new Error(data.message || `Failed to load (${res.status})`);
      }
      setPayload(data);
    } catch (e) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, yParam, mParam, eligibilityLoading, eligibility, canAccessCsvMetrics]);

  useEffect(() => {
    load();
  }, [load]);

  const periodLabel = useMemo(() => {
    if (!payload?.period) return '';
    const { year, month } = payload.period;
    return `${MONTH_NAMES[month - 1]} ${year}`;
  }, [payload]);

  const symbolRows = useMemo(() => {
    if (!payload?.hasData || !payload.trades?.length) return [];
    return aggregateBySymbol(payload.trades).slice(0, 12);
  }, [payload]);

  const netPerTrade = useMemo(() => {
    const n = payload?.summary?.tradeCount;
    if (!n || n < 1) return null;
    const t = parseFloat(payload.summary.totalPnl);
    if (!Number.isFinite(t)) return null;
    return (t / n).toFixed(2);
  }, [payload]);

  const insight = useMemo(() => {
    if (symbolRows.length === 0) return null;
    const byPnl = [...symbolRows].sort((a, b) => b.pnl - a.pnl);
    const best = byPnl[0];
    const worst = byPnl[byPnl.length - 1];
    if (best.symbol === worst.symbol) {
      return `Strongest contribution from ${best.symbol} (${best.pnl >= 0 ? '+' : ''}${best.pnl.toFixed(2)}).`;
    }
    return `Best: ${best.symbol} (${best.pnl >= 0 ? '+' : ''}${best.pnl.toFixed(2)}). Weakest: ${worst.symbol} (${worst.pnl >= 0 ? '+' : ''}${worst.pnl.toFixed(2)}).`;
  }, [symbolRows]);

  const subNavYear = payload?.period?.year ?? navYear;
  const subNavMonth = payload?.period?.month ?? navMonth;

  if (loading) {
    return (
      <div className="aa-page journal-glass-panel journal-glass-panel--pad journal-glass-panel--rim">
        <div className="m5dash-loading">Loading manual metrics…</div>
      </div>
    );
  }

  if (!eligibilityLoading && eligibility && !canAccessCsvMetrics) {
    return <Navigate to="/aura-analysis/ai" replace />;
  }

  if (error && forbiddenCode) {
    return (
      <div className="aa-page journal-glass-panel journal-glass-panel--pad journal-glass-panel--rim">
        <div className="m5dash-error">
          <p>{error}</p>
          <p style={{ marginTop: 12, color: 'rgba(200,198,190,0.85)' }}>
            <Link to="/manual-metrics">Manual metrics</Link>
            {' · '}
            <Link to="/subscription">Plans</Link>
            {' · '}
            <Link to="/aura-analysis/ai">Connection Hub</Link>
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="aa-page journal-glass-panel journal-glass-panel--pad journal-glass-panel--rim">
        <div className="m5dash-error">
          <p>{error}</p>
          <Link to="/manual-metrics" className="rp-btn rp-btn--secondary" style={{ marginTop: 16, display: 'inline-block' }}>
            Back to Manual metrics
          </Link>
        </div>
      </div>
    );
  }

  if (!payload?.hasData) {
    const pl = payload?.period
      ? `${MONTH_NAMES[payload.period.month - 1]} ${payload.period.year}`
      : periodLabel || 'this period';
    return (
      <div className="aa-page journal-glass-panel journal-glass-panel--pad journal-glass-panel--rim">
        <div className="m5dash-empty">
          {payload?.periodIsFuture && (
            <div className="mm-dash-banner mm-dash-banner--warn" role="status">
              This calendar period is still in the future. Manual metrics use closed months — pick the month you are reporting.
            </div>
          )}
          <h2 className="m5dash-title" style={{ marginBottom: 12 }}>No CSV for {pl}</h2>
          <p>
            Upload your MT5 trade history for this month (Connection Hub or Manual metrics home).
          </p>
          <Link to={`/manual-metrics?year=${subNavYear}&month=${subNavMonth}`} className="rp-btn rp-btn--primary">
            Upload CSV
          </Link>
        </div>
      </div>
    );
  }

  const s = payload.summary;
  const totalNum = parseFloat(s.totalPnl) || 0;
  const ext = payload.extended || {};
  const meta = payload.meta || {};
  const dataSpan = payload.dataSpan;

  return (
    <div className="aa-page m5dash journal-glass-panel journal-glass-panel--pad journal-glass-panel--rim">
      <div className="m5dash-back-row">
        <Link to="/aura-analysis/ai" className="m5dash-back">← Connection Hub</Link>
        <span className="m5dash-back-sep" aria-hidden>·</span>
        <Link to="/manual-metrics" className="m5dash-back m5dash-back--secondary">Manual metrics home</Link>
      </div>

      <header className="m5dash-head">
        <p className="m5dash-kicker">Manual metrics · CSV snapshot</p>
        <h1 className="m5dash-title">Dashboard — {periodLabel}</h1>
      </header>

      <div className="mm-scope-card">
        <p className="mm-scope-lead">
          <strong>What this is:</strong> a <em>broker CSV snapshot</em> — headline stats, equity curve, symbols, and weekday mix.
          It is not a full trading journal. For live MT5, sessions, execution quality, risk labs, and every metric in depth, use{' '}
          <Link to="/aura-analysis/ai">Aura Analysis</Link> (Elite).
        </p>
        <Link to="/aura-analysis/ai" className="mm-scope-cta">Open Aura Analysis</Link>
      </div>

      {payload.periodIsFuture && (
        <div className="mm-dash-banner mm-dash-banner--warn" role="status">
          You are viewing a future calendar month. Numbers only reflect what you uploaded for this period; prefer closed months for reporting.
        </div>
      )}

      {meta.truncated && (
        <div className="mm-dash-banner mm-dash-banner--info" role="status">
          Metrics reflect the first <strong>{meta.storedTradeCount ?? s.tradeCount}</strong> of <strong>{meta.sourceTradeCount}</strong> trades
          stored from this export (size limits). For a complete snapshot in Manual Metrics, filter to a shorter range in MT5 and re-export.
        </div>
      )}

      <div className="mm-kpi-hero aa-grid-4">
        <div className="mm-kpi-tile mm-kpi-tile--hero">
          <div className="mm-kpi-lbl">Trades (in snapshot)</div>
          <div className="mm-kpi-val">{s.tradeCount}</div>
        </div>
        <div className="mm-kpi-tile mm-kpi-tile--hero">
          <div className="mm-kpi-lbl">Win rate</div>
          <div className="mm-kpi-val">{s.winRate}%</div>
        </div>
        <div className="mm-kpi-tile mm-kpi-tile--hero">
          <div className="mm-kpi-lbl">Net P&amp;L</div>
          <div className={`mm-kpi-val ${totalNum < 0 ? 'm5dash--neg' : ''}`}>{s.totalPnl}</div>
        </div>
        <div className="mm-kpi-tile mm-kpi-tile--hero">
          <div className="mm-kpi-lbl">Profit factor</div>
          <div className="mm-kpi-val">{s.profitFactor}</div>
        </div>
      </div>

      {(dataSpan?.start && dataSpan?.end) && (
        <p className="mm-dash-meta">
          <strong>Trade dates in file (parsed):</strong> {dataSpan.start} → {dataSpan.end}
          <span className="mm-dash-meta-hint"> (best effort from Time column)</span>
        </p>
      )}

      <p className="mm-dash-meta">
        <strong>Outcome split:</strong>{' '}
        {s.wins ?? 0} wins · {s.losses ?? 0} losses · {s.breakevens ?? 0} breakeven
        {netPerTrade != null && (
          <>
            {' · '}
            <strong>Net per trade:</strong> {netPerTrade}
            <span className="mm-dash-meta-hint"> (net P&amp;L ÷ trades in snapshot)</span>
          </>
        )}
      </p>

      <div className="aa-grid-4 mm-kpi-secondary" style={{ marginBottom: 12 }}>
        <div className="mm-kpi-tile">
          <div className="mm-kpi-lbl">Avg win</div>
          <div className="mm-kpi-val aa--green">{ext.avgWin ?? '—'}</div>
        </div>
        <div className="mm-kpi-tile">
          <div className="mm-kpi-lbl">Avg loss</div>
          <div className="mm-kpi-val aa--red">{ext.avgLoss ?? '—'}</div>
        </div>
        <div className="mm-kpi-tile">
          <div className="mm-kpi-lbl">Largest win</div>
          <div className="mm-kpi-val aa--green">{ext.largestWin ?? '—'}</div>
        </div>
        <div className="mm-kpi-tile">
          <div className="mm-kpi-lbl">Largest loss</div>
          <div className="mm-kpi-val aa--red">{ext.largestLoss ?? '—'}</div>
        </div>
        <div className="mm-kpi-tile">
          <div className="mm-kpi-lbl">Max win streak</div>
          <div className="mm-kpi-val">{ext.maxWinStreak ?? '—'}</div>
        </div>
        <div className="mm-kpi-tile">
          <div className="mm-kpi-lbl">Max loss streak</div>
          <div className="mm-kpi-val">{ext.maxLossStreak ?? '—'}</div>
        </div>
        <div className="mm-kpi-tile">
          <div className="mm-kpi-lbl">Max drawdown</div>
          <div className="mm-kpi-val">{ext.maxDrawdown ?? '—'}</div>
        </div>
        <div className="mm-kpi-tile">
          <div className="mm-kpi-lbl">Max DD %</div>
          <div className="mm-kpi-val">{ext.maxDrawdownPct != null ? `${ext.maxDrawdownPct}%` : '—'}</div>
        </div>
      </div>

      {insight && <p className="m5dash-insight">{insight}</p>}

      <div className="aa-grid-2" style={{ marginBottom: 12 }}>
        <div className="m5dash-panel">
          <h2 className="m5dash-panel-title">Equity path</h2>
          <CumulativePnlChart cumulativePnl={payload.cumulativePnl} />
          {payload.drawdownSeries?.length > 1 && (
            <DrawdownChartCsv drawdownSeries={payload.drawdownSeries} />
          )}
        </div>
        <div className="m5dash-panel">
          <h2 className="m5dash-panel-title">By symbol</h2>
          {symbolRows.length === 0 ? (
            <p className="aa-empty" style={{ padding: '20px 0' }}>No symbol breakdown.</p>
          ) : (
            <table className="m5dash-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Trades</th>
                  <th>P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {symbolRows.map((row) => (
                  <tr key={row.symbol}>
                    <td>{row.symbol}</td>
                    <td>{row.count}</td>
                    <td className={row.pnl < 0 ? 'aa--red' : 'aa--green'}>
                      {row.pnl >= 0 ? '+' : ''}{row.pnl.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="aa-grid-2">
        <div className="m5dash-panel">
          <h2 className="m5dash-panel-title">Trades by weekday</h2>
          <WeekdayBars extended={ext} />
        </div>
        <div className="m5dash-panel">
          <h2 className="m5dash-panel-title">Gross</h2>
          <p className="aa-empty" style={{ padding: '8px 0', margin: 0 }}>
            <span className="aa--green">Gross profit: {s.grossProfit}</span>
            <br />
            <span className="aa--red">Gross loss: {s.grossLoss}</span>
          </p>
          <p className="mm-aura-note" style={{ marginTop: 16 }}>
            All figures above match the same stored trade rows (symbols, curve, and KPIs). Re-upload your CSV after changing the export.
          </p>
        </div>
      </div>

      <div className="m5dash-upsell">
        <h3>Aura Analysis (Elite) — separate subscription</h3>
        <ul>
          <li>Live MT5 connection — no manual CSV each month</li>
          <li>Full dashboard: Overview, Performance, Risk Lab, Edge Analyzer, Execution Lab, Calendar, Growth</li>
          <li>Deeper execution and psychology analytics than this snapshot</li>
        </ul>
        <Link to="/aura-analysis/ai">Open Aura Analysis</Link>
        {' · '}
        <Link to="/subscription">View plans</Link>
      </div>
    </div>
  );
}

export default function ManualMetricsDashboardPage() {
  return (
    <AuraTerminalThemeShell>
      <ManualMetricsDashboardInner />
    </AuraTerminalThemeShell>
  );
}
