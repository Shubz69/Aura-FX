/**
 * Premium-only MT5 metrics from uploaded CSV (snapshot).
 * Elite users are directed to Aura Analysis (live MT5).
 */
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import AuraTerminalThemeShell from '../../components/AuraTerminalThemeShell';
import ReportsHubSubNav from '../../components/reports/ReportsHubSubNav';
import '../../styles/aura-analysis/AuraShared.css';
import '../../styles/reports/ReportsPage.css';
import '../../styles/reports/Mt5CsvDashboard.css';

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
  const gradId = 'm5dash-cum';

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

function Mt5CsvDashboardInner() {
  const { token } = useAuth();
  const [searchParams] = useSearchParams();
  const yParam = searchParams.get('year');
  const mParam = searchParams.get('month');
  const now = new Date();
  const navYear = yParam ? parseInt(yParam, 10) : now.getFullYear();
  const navMonth = mParam ? parseInt(mParam, 10) : now.getMonth() + 1;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [redirectAura, setRedirectAura] = useState(false);
  const [payload, setPayload] = useState(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    setRedirectAura(false);
    try {
      const q = new URLSearchParams();
      if (yParam) q.set('year', yParam);
      if (mParam) q.set('month', mParam);
      const res = await fetch(`${BASE_URL}/api/reports/csv-metrics?${q.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403 && data.code === 'USE_AURA_ANALYSIS') {
        setRedirectAura(true);
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
  }, [token, yParam, mParam]);

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
    return aggregateBySymbol(payload.trades).slice(0, 8);
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

  if (redirectAura) {
    return <Navigate to="/aura-analysis/ai" replace />;
  }

  const subNavYear = payload?.period?.year ?? navYear;
  const subNavMonth = payload?.period?.month ?? navMonth;

  if (loading) {
    return (
      <div className="aa-page journal-glass-panel journal-glass-panel--pad">
        <ReportsHubSubNav role="premium" year={navYear} month={navMonth} />
        <div className="m5dash-loading">Loading MT5 metrics…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="aa-page journal-glass-panel journal-glass-panel--pad">
        <ReportsHubSubNav role="premium" year={navYear} month={navMonth} />
        <div className="m5dash-error">
          <p>{error}</p>
          <Link to="/reports" className="rp-btn rp-btn--secondary" style={{ marginTop: 16, display: 'inline-block' }}>
            Back to Performance &amp; DNA
          </Link>
        </div>
      </div>
    );
  }

  if (!payload?.hasData) {
    return (
      <div className="aa-page journal-glass-panel journal-glass-panel--pad">
        <ReportsHubSubNav role="premium" year={subNavYear} month={subNavMonth} />
        <div className="m5dash-empty">
          <h2 className="m5dash-title" style={{ marginBottom: 12 }}>No MT5 CSV for {periodLabel || 'this period'}</h2>
          <p>
            Upload your MT5 trade history CSV on Performance &amp; DNA for this month. After upload, your snapshot metrics
            will appear here.
          </p>
          <Link to="/reports" className="rp-btn rp-btn--primary">
            Go to Performance &amp; DNA
          </Link>
        </div>
      </div>
    );
  }

  const s = payload.summary;
  const totalNum = parseFloat(s.totalPnl) || 0;

  return (
    <div className="aa-page m5dash journal-glass-panel journal-glass-panel--pad">
      <ReportsHubSubNav role="premium" year={subNavYear} month={subNavMonth} />
      <Link to="/reports" className="m5dash-back">← Performance &amp; DNA</Link>

      <header className="m5dash-head">
        <p className="m5dash-kicker">MT5 snapshot · Premium</p>
        <h1 className="m5dash-title">MT5 metrics — {periodLabel}</h1>
        <p className="m5dash-sub">
          Based on your uploaded broker export for this month. For live MT5 sync, multi-tab analytics, and execution quality
          tools, upgrade to Elite and use Aura Analysis.
        </p>
      </header>

      <div className="m5dash-kpi-row">
        <div className="m5dash-kpi">
          <div className="m5dash-kpi-lbl">Trades</div>
          <div className="m5dash-kpi-val">{s.tradeCount}</div>
        </div>
        <div className="m5dash-kpi">
          <div className="m5dash-kpi-lbl">Win rate</div>
          <div className="m5dash-kpi-val">{s.winRate}%</div>
        </div>
        <div className="m5dash-kpi">
          <div className="m5dash-kpi-lbl">Net P&amp;L</div>
          <div className={`m5dash-kpi-val ${totalNum < 0 ? 'm5dash--neg' : ''}`}>{s.totalPnl}</div>
        </div>
        <div className="m5dash-kpi">
          <div className="m5dash-kpi-lbl">Profit factor</div>
          <div className="m5dash-kpi-val">{s.profitFactor}</div>
        </div>
      </div>

      {insight && <p className="m5dash-insight">{insight}</p>}

      <div className="m5dash-grid-2">
        <div className="m5dash-panel">
          <h2 className="m5dash-panel-title">Equity path</h2>
          <CumulativePnlChart cumulativePnl={payload.cumulativePnl} />
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

      <div className="m5dash-upsell">
        <h3>Unlock Aura Analysis (Elite)</h3>
        <ul>
          <li>Live MT5 connection — no manual CSV each month</li>
          <li>Full dashboard: Overview, Performance, Risk Lab, Edge Analyzer, Execution Lab, Calendar, Growth</li>
          <li>Deeper execution and psychology analytics than this snapshot</li>
        </ul>
        <Link to="/aura-analysis/ai">Open Aura Analysis</Link>
        {' · '}
        <Link to="/subscription">View Elite plan</Link>
      </div>
    </div>
  );
}

export default function Mt5CsvDashboardPage() {
  return (
    <AuraTerminalThemeShell>
      <Mt5CsvDashboardInner />
    </AuraTerminalThemeShell>
  );
}
