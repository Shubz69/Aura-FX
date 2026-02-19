import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import Api from '../services/Api';
import '../styles/Journal.css';
import { FaPlus, FaEdit, FaTrash, FaTimes } from 'react-icons/fa';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const SESSIONS = ['Asia', 'London', 'NY', ''];

function computeMetrics(trades) {
  const n = trades.length;
  if (n === 0) {
    return {
      totalTrades: 0,
      winningTrades: 0,
      winRatePct: null,
      totalR: 0,
      avgR: null,
      profitFactor: null,
      ruleBreakPct: null,
      maxDrawdownR: null,
      maxDrawdownPct: null,
      totalReturnPct: null,
      runningR: [],
      equity: [],
      drawdownPct: [],
      labels: [],
      sessionBreakdown: [],
      pairBreakdown: [],
      ruleBreakCompare: { follow: { winPct: null, avgR: null }, break: { winPct: null, avgR: null } },
    };
  }

  const winningTrades = trades.filter((t) => Number(t.rResult) > 0).length;
  const totalR = trades.reduce((s, t) => s + Number(t.rResult), 0);
  const avgRScalar = totalR / n;
  const winRatePct = (winningTrades / n) * 100;

  const grossWinR = trades.filter((t) => Number(t.rResult) > 0).reduce((s, t) => s + Number(t.rResult), 0);
  const grossLossR = Math.abs(
    trades.filter((t) => Number(t.rResult) < 0).reduce((s, t) => s + Number(t.rResult), 0)
  );
  const profitFactor = grossLossR === 0 ? Infinity : grossWinR / grossLossR;

  const ruleBreaks = trades.filter((t) => t.followedRules === false).length;
  const ruleBreakPct = (ruleBreaks / n) * 100;

  const sorted = [...trades].sort((a, b) => {
    const d = (a.date || '').localeCompare(b.date || '');
    if (d !== 0) return d;
    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
  });

  let runningR = 0;
  let peakRunningR = 0;
  const runningRSeries = [];
  const drawdownRSeries = [];
  let equity = 1;
  let peakEquity = 1;
  const equitySeries = [];
  const drawdownSeries = [];
  const labels = [];

  for (let i = 0; i < sorted.length; i++) {
    const r = Number(sorted[i].rResult);
    runningR += r;
    peakRunningR = Math.max(peakRunningR, runningR);
    runningRSeries.push(runningR);
    drawdownRSeries.push(runningR - peakRunningR);
    equity = 1 + runningR;
    peakEquity = Math.max(peakEquity, equity);
    equitySeries.push(equity);
    const dd = peakEquity > 0 ? (equity / peakEquity - 1) * 100 : 0;
    drawdownSeries.push(dd);
    labels.push(sorted[i].date || `#${i + 1}`);
  }

  const maxDrawdownR = drawdownRSeries.length ? Math.min(...drawdownRSeries) : null;
  const maxDrawdownPct = drawdownSeries.length ? Math.min(...drawdownSeries) : null;
  const totalReturnPct = totalR !== 0 ? totalR * 100 : 0;

  const bySession = {};
  const byPair = {};
  const followTrades = [];
  const breakTrades = [];

  trades.forEach((t) => {
    const session = t.session || 'Other';
    if (!bySession[session]) bySession[session] = [];
    bySession[session].push(t);

    const pair = t.pair || '—';
    if (!byPair[pair]) byPair[pair] = [];
    byPair[pair].push(t);

    if (t.followedRules) followTrades.push(t);
    else breakTrades.push(t);
  });

  const sessionBreakdown = Object.entries(bySession).map(([name, arr]) => {
    const wins = arr.filter((t) => Number(t.rResult) > 0).length;
    const totalRSession = arr.reduce((s, t) => s + Number(t.rResult), 0);
    return {
      session: name,
      trades: arr.length,
      winPct: arr.length ? ((wins / arr.length) * 100).toFixed(1) : '—',
      totalR: totalRSession.toFixed(2),
      avgR: arr.length ? (totalRSession / arr.length).toFixed(2) : '—',
    };
  });

  const pairBreakdown = Object.entries(byPair).map(([name, arr]) => {
    const wins = arr.filter((t) => Number(t.rResult) > 0).length;
    const totalRPair = arr.reduce((s, t) => s + Number(t.rResult), 0);
    return {
      pair: name,
      trades: arr.length,
      winPct: arr.length ? ((wins / arr.length) * 100).toFixed(1) : '—',
      totalR: totalRPair.toFixed(2),
      avgR: arr.length ? (totalRPair / arr.length).toFixed(2) : '—',
    };
  });

  const winPct = (arr) => (arr.length ? (arr.filter((t) => Number(t.rResult) > 0).length / arr.length) * 100 : null);
  const avgRForArr = (arr) => (arr.length ? arr.reduce((s, t) => s + Number(t.rResult), 0) / arr.length : null);

  const ruleBreakCompare = {
    follow: { winPct: winPct(followTrades), avgR: avgRForArr(followTrades) },
    break: { winPct: winPct(breakTrades), avgR: avgRForArr(breakTrades) },
  };

  return {
    totalTrades: n,
    winningTrades,
    winRatePct,
    totalR,
    avgR: avgRScalar,
    profitFactor,
    ruleBreakPct,
    maxDrawdownR,
    maxDrawdownPct,
    totalReturnPct,
    runningR: runningRSeries,
    equity: equitySeries,
    drawdownPct: drawdownSeries,
    labels,
    sessionBreakdown,
    pairBreakdown,
    ruleBreakCompare,
  };
}

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      mode: 'index',
      intersect: false,
      backgroundColor: 'rgba(0,0,0,0.85)',
      titleColor: '#fff',
      bodyColor: '#fff',
    },
  },
  scales: {
    x: {
      ticks: { color: 'rgba(255,255,255,0.8)', maxTicksLimit: 12 },
      grid: { color: 'rgba(255,255,255,0.08)' },
    },
    y: {
      ticks: { color: 'rgba(255,255,255,0.8)' },
      grid: { color: 'rgba(255,255,255,0.08)' },
    },
  },
};

export default function Journal() {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', pair: '', session: '', followedRules: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState(null);
  const [formData, setFormData] = useState({
    date: '',
    pair: '',
    tradeType: '',
    session: '',
    riskPct: '',
    rResult: '',
    dollarResult: '',
    followedRules: true,
    notes: '',
    emotional: '',
  });
  const [submitError, setSubmitError] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchTrades = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const params = {};
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;
      if (filters.pair) params.pair = filters.pair;
      if (filters.session) params.session = filters.session;
      if (filters.followedRules === 'true' || filters.followedRules === 'false') params.followedRules = filters.followedRules;

      const res = await Api.getJournalTrades(params);
      const list = res.data?.trades ?? [];
      setTrades(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('Journal fetch error:', err);
      setError(err.response?.data?.message || 'Failed to load journal.');
      setTrades([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [filters.dateFrom, filters.dateTo, filters.pair, filters.session, filters.followedRules]);

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  const metrics = useMemo(() => computeMetrics(trades), [trades]);

  const openAdd = () => {
    setEditingTrade(null);
    setFormData({
      date: new Date().toISOString().slice(0, 10),
      pair: '',
      tradeType: '',
      session: '',
      riskPct: '',
      rResult: '',
      dollarResult: '',
      followedRules: true,
      notes: '',
      emotional: '',
    });
    setSubmitError(null);
    setModalOpen(true);
  };

  const openEdit = (t) => {
    setEditingTrade(t);
    setFormData({
      date: t.date ? String(t.date).slice(0, 10) : '',
      pair: t.pair || '',
      tradeType: t.tradeType || '',
      session: t.session || '',
      riskPct: t.riskPct != null ? String(t.riskPct) : '',
      rResult: t.rResult != null ? String(t.rResult) : '',
      dollarResult: t.dollarResult != null ? String(t.dollarResult) : '',
      followedRules: t.followedRules !== false,
      notes: t.notes || '',
      emotional: t.emotional != null ? String(t.emotional) : '',
    });
    setSubmitError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingTrade(null);
    setSubmitError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    const date = formData.date?.trim();
    const pair = formData.pair?.trim();
    const rResult = formData.rResult?.trim();
    if (!date || !pair) {
      setSubmitError('Date and pair are required.');
      return;
    }
    const rNum = Number(rResult);
    if (rResult === '' || Number.isNaN(rNum)) {
      setSubmitError('R Result must be a number.');
      return;
    }
    const emotional = formData.emotional === '' ? undefined : Number(formData.emotional);
    if (emotional != null && (Number.isNaN(emotional) || emotional < 1 || emotional > 10)) {
      setSubmitError('Emotional (1–10) must be between 1 and 10 if provided.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        date,
        pair,
        tradeType: formData.tradeType || undefined,
        session: formData.session || undefined,
        riskPct: formData.riskPct === '' ? undefined : Number(formData.riskPct),
        rResult: rNum,
        dollarResult: formData.dollarResult === '' ? undefined : Number(formData.dollarResult),
        followedRules: formData.followedRules,
        notes: formData.notes || undefined,
        emotional,
      };

      if (editingTrade) {
        await Api.updateJournalTrade(editingTrade.id, payload);
      } else {
        await Api.createJournalTrade(payload);
      }
      closeModal();
      await fetchTrades(true);
    } catch (err) {
      setSubmitError(err.response?.data?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this trade?')) return;
    try {
      await Api.deleteJournalTrade(id);
      await fetchTrades(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Delete failed.');
    }
  };

  const hasChartData = metrics.labels.length > 0;

  return (
    <div className="journal-container">
      <header className="journal-header">
        <h1 className="journal-title">Trading Journal</h1>
        <p className="journal-subtitle">Track performance, R-metrics, and drawdown</p>
      </header>

      {error && (
        <div className="journal-error" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="journal-loading">Loading journal…</div>
      ) : (
        <>
          <section className="journal-kpis">
            <div className="journal-kpi">
              <div className="journal-kpi-label">Total Trades</div>
              <div className="journal-kpi-value">{metrics.totalTrades}</div>
            </div>
            <div className="journal-kpi">
              <div className="journal-kpi-label">Winning Trades</div>
              <div className="journal-kpi-value">{metrics.winningTrades}</div>
            </div>
            <div className="journal-kpi">
              <div className="journal-kpi-label">Win Rate %</div>
              <div className="journal-kpi-value">
                {metrics.winRatePct != null ? `${metrics.winRatePct.toFixed(1)}%` : '—'}
              </div>
            </div>
            <div className="journal-kpi">
              <div className="journal-kpi-label">Total R</div>
              <div className={`journal-kpi-value ${metrics.totalR >= 0 ? 'positive' : 'negative'}`}>
                {metrics.totalR.toFixed(2)}
              </div>
            </div>
            <div className="journal-kpi">
              <div className="journal-kpi-label">Average R</div>
              <div className="journal-kpi-value">
                {metrics.avgR != null ? metrics.avgR.toFixed(2) : '—'}
              </div>
            </div>
            <div className="journal-kpi">
              <div className="journal-kpi-label">Profit Factor</div>
              <div className="journal-kpi-value">
                {metrics.profitFactor === Infinity ? '∞' : metrics.profitFactor != null ? metrics.profitFactor.toFixed(2) : '—'}
              </div>
            </div>
            <div className="journal-kpi">
              <div className="journal-kpi-label">Rule Break %</div>
              <div className="journal-kpi-value">
                {metrics.ruleBreakPct != null ? `${metrics.ruleBreakPct.toFixed(1)}%` : '—'}
              </div>
            </div>
            <div className="journal-kpi">
              <div className="journal-kpi-label">Max DD (R)</div>
              <div className="journal-kpi-value negative">
                {metrics.maxDrawdownR != null ? metrics.maxDrawdownR.toFixed(2) : '—'}
              </div>
            </div>
            <div className="journal-kpi">
              <div className="journal-kpi-label">Max DD %</div>
              <div className="journal-kpi-value negative">
                {metrics.maxDrawdownPct != null ? `${metrics.maxDrawdownPct.toFixed(1)}%` : '—'}
              </div>
            </div>
            <div className="journal-kpi">
              <div className="journal-kpi-label">Total Return %</div>
              <div className={`journal-kpi-value ${metrics.totalReturnPct >= 0 ? 'positive' : 'negative'}`}>
                {metrics.totalReturnPct != null ? `${metrics.totalReturnPct.toFixed(1)}%` : '—'}
              </div>
            </div>
          </section>

          {hasChartData && (
            <section className="journal-charts">
              <div className="journal-chart-card">
                <h3 className="journal-chart-title">Running R</h3>
                <div className="journal-chart-wrap">
                  <Line
                    data={{
                      labels: metrics.labels,
                      datasets: [
                        {
                          label: 'Running R',
                          data: metrics.runningR,
                          borderColor: 'rgba(59, 130, 246, 1)',
                          backgroundColor: 'rgba(59, 130, 246, 0.1)',
                          fill: true,
                          tension: 0.3,
                          pointRadius: 2,
                          pointHoverRadius: 6,
                        },
                      ],
                    }}
                    options={chartOptions}
                  />
                </div>
              </div>
              <div className="journal-chart-card">
                <h3 className="journal-chart-title">Equity (1 + ΣR)</h3>
                <div className="journal-chart-wrap">
                  <Line
                    data={{
                      labels: metrics.labels,
                      datasets: [
                        {
                          label: 'Equity',
                          data: metrics.equity,
                          borderColor: 'rgba(34, 197, 94, 0.9)',
                          backgroundColor: 'rgba(34, 197, 94, 0.1)',
                          fill: true,
                          tension: 0.3,
                          pointRadius: 2,
                          pointHoverRadius: 6,
                        },
                      ],
                    }}
                    options={chartOptions}
                  />
                </div>
              </div>
              <div className="journal-chart-card">
                <h3 className="journal-chart-title">Drawdown %</h3>
                <div className="journal-chart-wrap">
                  <Line
                    data={{
                      labels: metrics.labels,
                      datasets: [
                        {
                          label: 'Drawdown %',
                          data: metrics.drawdownPct,
                          borderColor: 'rgba(239, 68, 68, 0.9)',
                          backgroundColor: 'rgba(239, 68, 68, 0.1)',
                          fill: true,
                          tension: 0.3,
                          pointRadius: 2,
                          pointHoverRadius: 6,
                        },
                      ],
                    }}
                    options={chartOptions}
                  />
                </div>
              </div>
            </section>
          )}

          <section className="journal-breakdowns">
            <div className="journal-breakdown">
              <h3>By Session</h3>
              <table>
                <thead>
                  <tr>
                    <th>Session</th>
                    <th>Trades</th>
                    <th>Win%</th>
                    <th>Total R</th>
                    <th>Avg R</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.sessionBreakdown.map((row) => (
                    <tr key={row.session}>
                      <td>{row.session}</td>
                      <td>{row.trades}</td>
                      <td>{row.winPct}</td>
                      <td>{row.totalR}</td>
                      <td>{row.avgR}</td>
                    </tr>
                  ))}
                  {metrics.sessionBreakdown.length === 0 && (
                    <tr>
                      <td colSpan={5}>No data</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="journal-breakdown">
              <h3>By Pair</h3>
              <table>
                <thead>
                  <tr>
                    <th>Pair</th>
                    <th>Trades</th>
                    <th>Win%</th>
                    <th>Total R</th>
                    <th>Avg R</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.pairBreakdown.map((row) => (
                    <tr key={row.pair}>
                      <td>{row.pair}</td>
                      <td>{row.trades}</td>
                      <td>{row.winPct}</td>
                      <td>{row.totalR}</td>
                      <td>{row.avgR}</td>
                    </tr>
                  ))}
                  {metrics.pairBreakdown.length === 0 && (
                    <tr>
                      <td colSpan={5}>No data</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="journal-breakdown">
              <h3>Rules: Follow vs Break</h3>
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>Win%</th>
                    <th>Avg R</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Followed</td>
                    <td>
                      {metrics.ruleBreakCompare.follow.winPct != null
                        ? `${metrics.ruleBreakCompare.follow.winPct.toFixed(1)}%`
                        : '—'}
                    </td>
                    <td>
                      {metrics.ruleBreakCompare.follow.avgR != null
                        ? metrics.ruleBreakCompare.follow.avgR.toFixed(2)
                        : '—'}
                    </td>
                  </tr>
                  <tr>
                    <td>Broke</td>
                    <td>
                      {metrics.ruleBreakCompare.break.winPct != null
                        ? `${metrics.ruleBreakCompare.break.winPct.toFixed(1)}%`
                        : '—'}
                    </td>
                    <td>
                      {metrics.ruleBreakCompare.break.avgR != null
                        ? metrics.ruleBreakCompare.break.avgR.toFixed(2)
                        : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="journal-trades-section">
            <div className="journal-trades-header">
              <h2>Trades</h2>
              <div className="journal-filters">
                <label>
                  From
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                  />
                </label>
                <label>
                  To
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                  />
                </label>
                <label>
                  Pair
                  <select
                    value={filters.pair}
                    onChange={(e) => setFilters((f) => ({ ...f, pair: e.target.value }))}
                  >
                    <option value="">All</option>
                    {[...new Set(trades.map((t) => t.pair).filter(Boolean))].sort().map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Session
                  <select
                    value={filters.session}
                    onChange={(e) => setFilters((f) => ({ ...f, session: e.target.value }))}
                  >
                    <option value="">All</option>
                    {SESSIONS.filter(Boolean).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Rules
                  <select
                    value={filters.followedRules}
                    onChange={(e) => setFilters((f) => ({ ...f, followedRules: e.target.value }))}
                  >
                    <option value="">All</option>
                    <option value="true">Followed</option>
                    <option value="false">Broke</option>
                  </select>
                </label>
                <button type="button" className="journal-btn journal-btn-primary" onClick={openAdd}>
                  <FaPlus style={{ marginRight: 6, verticalAlign: 'middle' }} /> Add Trade
                </button>
              </div>
            </div>

            <div className="journal-trades-table-wrap">
              {trades.length === 0 ? (
                <div className="journal-empty">
                  No trades yet. Click &quot;Add Trade&quot; to log your first trade.
                </div>
              ) : (
                <table className="journal-trades-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Pair</th>
                      <th>Type</th>
                      <th>Session</th>
                      <th>R</th>
                      <th>Rules</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((t) => (
                      <tr key={t.id}>
                        <td>{t.date ? String(t.date).slice(0, 10) : '—'}</td>
                        <td>{t.pair || '—'}</td>
                        <td>{t.tradeType || '—'}</td>
                        <td>{t.session || '—'}</td>
                        <td className={Number(t.rResult) >= 0 ? 'r-positive' : 'r-negative'}>
                          {Number(t.rResult).toFixed(2)}
                        </td>
                        <td>{t.followedRules ? 'Yes' : 'No'}</td>
                        <td>
                          <div className="journal-actions-cell">
                            <button type="button" onClick={() => openEdit(t)} aria-label="Edit">
                              <FaEdit />
                            </button>
                            <button type="button" onClick={() => handleDelete(t.id)} aria-label="Delete">
                              <FaTrash />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </>
      )}

      {modalOpen && (
        <div className="journal-modal-overlay" onClick={closeModal} role="dialog" aria-modal="true">
          <div className="journal-modal" onClick={(e) => e.stopPropagation()}>
            <div className="journal-modal-header">
              <h3>{editingTrade ? 'Edit Trade' : 'Add Trade'}</h3>
              <button type="button" className="journal-modal-close" onClick={closeModal} aria-label="Close">
                <FaTimes />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="journal-modal-body">
                {submitError && (
                  <div className="journal-error" role="alert">
                    {submitError}
                  </div>
                )}
                <div className="journal-form-row">
                  <div className="journal-form-group">
                    <label>Date *</label>
                    <input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData((f) => ({ ...f, date: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="journal-form-group">
                    <label>Pair *</label>
                    <input
                      type="text"
                      value={formData.pair}
                      onChange={(e) => setFormData((f) => ({ ...f, pair: e.target.value }))}
                      placeholder="e.g. XAUUSD"
                      required
                    />
                  </div>
                </div>
                <div className="journal-form-row">
                  <div className="journal-form-group">
                    <label>Trade Type / Setup</label>
                    <input
                      type="text"
                      value={formData.tradeType}
                      onChange={(e) => setFormData((f) => ({ ...f, tradeType: e.target.value }))}
                      placeholder="Long / Short / Setup"
                    />
                  </div>
                  <div className="journal-form-group">
                    <label>Session</label>
                    <select
                      value={formData.session}
                      onChange={(e) => setFormData((f) => ({ ...f, session: e.target.value }))}
                    >
                      <option value="">—</option>
                      {SESSIONS.filter(Boolean).map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="journal-form-row">
                  <div className="journal-form-group">
                    <label>R Result *</label>
                    <input
                      type="number"
                      step="any"
                      value={formData.rResult}
                      onChange={(e) => setFormData((f) => ({ ...f, rResult: e.target.value }))}
                      placeholder="e.g. 1.5 or -0.5"
                      required
                    />
                  </div>
                  <div className="journal-form-group">
                    <label>Risk %</label>
                    <input
                      type="number"
                      step="any"
                      value={formData.riskPct}
                      onChange={(e) => setFormData((f) => ({ ...f, riskPct: e.target.value }))}
                      placeholder="Optional"
                    />
                  </div>
                </div>
                <div className="journal-form-row">
                  <div className="journal-form-group">
                    <label>Dollar Result</label>
                    <input
                      type="number"
                      step="any"
                      value={formData.dollarResult}
                      onChange={(e) => setFormData((f) => ({ ...f, dollarResult: e.target.value }))}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="journal-form-group">
                    <label>Emotional (1–10)</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={formData.emotional}
                      onChange={(e) => setFormData((f) => ({ ...f, emotional: e.target.value }))}
                      placeholder="Optional"
                    />
                  </div>
                </div>
                <div className="journal-form-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={formData.followedRules}
                      onChange={(e) => setFormData((f) => ({ ...f, followedRules: e.target.checked }))}
                    />{' '}
                    Followed rules
                  </label>
                </div>
                <div className="journal-form-group">
                  <label>Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Optional notes"
                  />
                </div>
              </div>
              <div className="journal-modal-footer">
                <button type="button" className="journal-btn" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="journal-btn journal-btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : editingTrade ? 'Update' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
