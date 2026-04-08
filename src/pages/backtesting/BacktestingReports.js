import React, { useEffect, useMemo, useState } from 'react';
import Api from '../../services/Api';
import { toast } from 'react-toastify';
import { EquityMiniChart, DrawdownMiniChart, RHistogramBars, CalendarHeatmapMini } from '../../components/backtesting/BacktestingMiniCharts';
import { BacktestingEmptyState } from '../../components/backtesting/BacktestingSharedUi';
import '../../styles/aura-analysis/AuraShared.css';
import '../../styles/backtesting/Backtesting.css';

function fmt(x, d = 2) {
  if (x == null || Number.isNaN(Number(x))) return '—';
  return Number(x).toFixed(d);
}

function fmtPct(x) {
  if (x == null || Number.isNaN(Number(x))) return '—';
  return `${(Number(x) * 100).toFixed(1)}%`;
}

const R_BIN_KEYS = ['under_neg2', 'neg2_neg1', 'neg1_0', 'zero', 'zero_1', 'one_2', 'over_2'];
const R_BIN_LABELS = ['<−2', '−2:−1', '−1:0', '0', '0:1', '1:2', '>2'];

const CONF_LABELS = {
  low_1_3: 'Confidence 1–3',
  mid_4_6: '4–6',
  high_7_10: '7–10',
  '—': 'Unscored',
};

const CHK_LABELS = {
  under_40: 'Checklist <40%',
  '40_70': '40–70%',
  '70_plus': '70%+',
  '—': 'Unscored',
};

const DUR_LABELS = {
  under_5m: '< 5 min',
  under_1h: '< 1 hour',
  under_1d: '< 1 day',
  over_1d: '> 1 day',
  unknown: 'Unknown',
};

function pickExtremes(map, metric = 'expectancy', minTrades = 2) {
  let bestK = null;
  let bestV = null;
  let worstK = null;
  let worstV = null;
  for (const [k, agg] of Object.entries(map || {})) {
    if (!agg || !k || k === '—') continue;
    if (agg.tradeCount < minTrades) continue;
    const v = agg[metric];
    if (v == null || !Number.isFinite(Number(v))) continue;
    const n = Number(v);
    if (bestV == null || n > bestV) {
      bestV = n;
      bestK = k;
    }
    if (worstV == null || n < worstV) {
      worstV = n;
      worstK = k;
    }
  }
  return { bestK, bestV, worstK, worstV };
}

function formatBucketLabel(dim, key) {
  if (dim === 'confidence') return CONF_LABELS[key] || key;
  if (dim === 'checklist') return CHK_LABELS[key] || key;
  if (dim === 'duration') return DUR_LABELS[key] || key;
  return key;
}

function BreakdownCard({ title, rows, formatKey }) {
  if (!rows?.length) {
    return (
      <div className="aa-card">
        <div className="aa-section-title" style={{ marginBottom: 8 }}>
          {title}
        </div>
        <p className="aa--muted" style={{ margin: 0, fontSize: '0.82rem' }}>
          Not enough labeled trades in this slice yet.
        </p>
      </div>
    );
  }
  return (
    <div className="aa-card">
      <div className="aa-section-title" style={{ marginBottom: 8 }}>
        {title}
      </div>
      <div className="bt-breakdown-table-wrap">
        <table className="bt-table bt-table--compact">
          <thead>
            <tr>
              <th>{formatKey ? 'Bucket' : 'Slice'}</th>
              <th>n</th>
              <th>Net</th>
              <th>WR</th>
              <th>PF</th>
              <th>Avg R</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <td>{formatKey ? formatKey(k) : k}</td>
                <td>{v.tradeCount}</td>
                <td>{fmt(v.netPnl)}</td>
                <td>{fmtPct(v.winRate)}</td>
                <td>{fmt(v.profitFactor)}</td>
                <td>{fmt(v.avgR)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function sortBreakdownEntries(obj, minTrades = 1, limit = 8) {
  return Object.entries(obj || {})
    .filter(([k, v]) => k && k !== '—' && v && v.tradeCount >= minTrades)
    .sort((a, b) => (b[1].tradeCount || 0) - (a[1].tradeCount || 0))
    .slice(0, limit);
}

function buildNextFocusParagraph(breakdown, insights, tradeCount = 0) {
  const parts = [];
  const { worstK: wSetup } = pickExtremes(breakdown?.bySetup, 'netPnl', 2);
  if (wSetup) {
    parts.push(`Pressure-test or refine setup “${wSetup}” — it’s the weakest contributor to net P&L in this sample.`);
  }
  const { worstK: wInst } = pickExtremes(breakdown?.byInstrument, 'profitFactor', 2);
  const instAgg = wInst ? breakdown?.byInstrument?.[wInst] : null;
  if (wInst && instAgg?.profitFactor != null && instAgg.profitFactor < 1) {
    parts.push(`Instrument ${wInst} is sub-breakeven on profit factor — validate whether the issue is context or execution.`);
  }
  if (breakdown?.checklistCorrelation != null && tradeCount >= 8 && breakdown.checklistCorrelation < -0.12) {
    parts.push('Checklist scores move opposite to P&L — revisit how you score confluence vs. outcomes.');
  }
  if (breakdown?.confidenceCorrelation != null && tradeCount >= 8 && breakdown.confidenceCorrelation < -0.12) {
    parts.push('High confidence is associating with worse results — watch for overconfidence after wins.');
  }
  if (!parts.length && insights?.lines?.length) {
    parts.push(insights.lines[insights.lines.length - 1]);
  }
  if (!parts.length) {
    parts.push('Keep logging trades with playbook, timeframe, and checklist data — the next insights unlock automatically as sample size grows.');
  }
  return parts.join(' ');
}

export default function BacktestingReports() {
  const [sessionId, setSessionId] = useState('');
  const [overview, setOverview] = useState(null);
  const [breakdown, setBreakdown] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const params = sessionId.trim() ? { sessionId: sessionId.trim() } : {};
      const [ov, bd] = await Promise.all([
        Api.getBacktestingReportsOverview(params),
        Api.getBacktestingReportsBreakdowns(params),
      ]);
      if (ov.data?.success) setOverview(ov.data);
      else setOverview(null);
      if (bd.data?.success) setBreakdown(bd.data.breakdown);
      else setBreakdown(null);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load reports');
      setOverview(null);
      setBreakdown(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const m = overview?.metrics;
  const insights = overview?.insights;
  const calendarMap = overview?.calendar;
  const rHist = overview?.rHistogram;

  const equityPoints = m?.equityPoints;

  const conditionHighlights = useMemo(() => {
    if (!breakdown) return null;
    const inst = pickExtremes(breakdown.byInstrument, 'profitFactor', 2);
    const sess = pickExtremes(breakdown.bySession, 'avgR', 2);
    const tf = pickExtremes(breakdown.byTimeframe, 'expectancy', 2);
    const pb = pickExtremes(breakdown.byPlaybook, 'expectancy', 2);
    return { inst, sess, tf, pb };
  }, [breakdown]);

  const longShort = breakdown?.byDirection || {};
  const longAgg = longShort.long;
  const shortAgg = longShort.short;

  const nextFocus = useMemo(
    () => buildNextFocusParagraph(breakdown, insights, m?.tradeCount || 0),
    [breakdown, insights, m?.tradeCount]
  );

  const hasTrades = m && m.tradeCount > 0;

  return (
    <>
      <header className="bt-page-header">
        <div>
          <h1 className="bt-title">Performance reports</h1>
          <p className="bt-subtitle">Deterministic analytics from your backtest journal — filter one session or review everything.</p>
        </div>
        <button type="button" className="bt-btn bt-btn--primary" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </header>

      <div className="aa-card" style={{ marginBottom: 16 }}>
        <div className="aa-section-title" style={{ marginBottom: 12 }}>
          Scope
        </div>
        <div className="bt-form-grid">
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="bt-label" htmlFor="bt-rep-sid">
              Session ID (optional)
            </label>
            <input
              id="bt-rep-sid"
              className="bt-input"
              style={{ maxWidth: 480 }}
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="Leave empty for all sessions"
            />
            <p className="bt-field-hint">Paste a session UUID to isolate one backtest; otherwise metrics aggregate your full trade log.</p>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="bt-muted">Building analytics…</p>
      ) : !hasTrades ? (
        <BacktestingEmptyState
          title="No closed trades to analyze yet"
          hint="Complete a backtesting session with logged executions, or widen your filter. Charts and breakdowns activate once trades exist."
        />
      ) : (
        <>
          <section style={{ marginBottom: 18 }}>
            <h2 className="aa-section-title" style={{ marginBottom: 12 }}>
              Headline performance
            </h2>
            {m.tradeCount > 0 && m.tradeCount < 8 && (
              <p className="aa--muted" style={{ fontSize: '0.82rem', marginBottom: 14, maxWidth: 720 }}>
                Sample size is still modest ({m.tradeCount} trades) — use breakdowns as directional hints until the log grows.
              </p>
            )}
            <div className="bt-stat-grid">
              <div className="bt-stat-card">
                <div className="bt-stat-label">Net P&amp;L</div>
                <div className="bt-stat-value">{fmt(m.netPnl)}</div>
                <div className="aa--dim" style={{ fontSize: '0.68rem', marginTop: 6 }}>
                  GP {fmt(m.grossProfit)} · GL {fmt(m.grossLoss)}
                </div>
              </div>
              <div className="bt-stat-card">
                <div className="bt-stat-label">Win rate</div>
                <div className="bt-stat-value">{fmtPct(m.winRate)}</div>
              </div>
              <div className="bt-stat-card">
                <div className="bt-stat-label">Profit factor</div>
                <div className="bt-stat-value">{fmt(m.profitFactor)}</div>
              </div>
              <div className="bt-stat-card">
                <div className="bt-stat-label">Avg R</div>
                <div className="bt-stat-value">{fmt(m.avgR)}</div>
              </div>
              <div className="bt-stat-card">
                <div className="bt-stat-label">Max drawdown</div>
                <div className="bt-stat-value">{fmt(m.maxDrawdown)}</div>
              </div>
              <div className="bt-stat-card">
                <div className="bt-stat-label">Trade count</div>
                <div className="bt-stat-value">{m.tradeCount}</div>
                <div className="aa--dim" style={{ fontSize: '0.68rem', marginTop: 6 }}>
                  Exp {fmt(m.expectancy)} / trade
                </div>
              </div>
            </div>
          </section>

          <div className="bt-reports-chart-split" style={{ marginBottom: 16 }}>
            <div className="aa-card">
              <div className="aa-section-title" style={{ marginBottom: 6 }}>
                Equity curve
              </div>
              <p className="aa--muted" style={{ margin: '0 0 12px', fontSize: '0.78rem' }}>
                Cumulative simulated equity after each closed trade (chronological).
              </p>
              <EquityMiniChart points={equityPoints} height={130} />
            </div>
            <div className="aa-card">
              <div className="aa-section-title" style={{ marginBottom: 6 }}>
                Drawdown path
              </div>
              <p className="aa--muted" style={{ margin: '0 0 12px', fontSize: '0.78rem' }}>
                Peak-to-trough distance as trades progress — watch depth and duration.
              </p>
              {equityPoints?.length ? <DrawdownMiniChart points={equityPoints} height={130} /> : null}
            </div>
          </div>

          <div className="bt-reports-chart-split" style={{ marginBottom: 16 }}>
            <div className="aa-card">
              <div className="aa-section-title" style={{ marginBottom: 6 }}>
                R-multiple distribution
              </div>
              <p className="aa--muted" style={{ margin: '0 0 8px', fontSize: '0.78rem' }}>
                Where outcomes cluster in R space (trades without R are omitted).
              </p>
              <RHistogramBars bins={rHist} labels={R_BIN_LABELS} keys={R_BIN_KEYS} />
            </div>
            <div className="aa-card">
              <div className="aa-section-title" style={{ marginBottom: 6 }}>
                P&amp;L calendar
              </div>
              <p className="aa--muted" style={{ margin: '0 0 8px', fontSize: '0.78rem' }}>
                Daily net from close timestamps (recent ~8 weeks shown).
              </p>
              <CalendarHeatmapMini calendarMap={calendarMap} />
            </div>
          </div>

          {breakdown && (
            <>
              <div className="aa-card" style={{ marginBottom: 16 }}>
                <div className="aa-section-title" style={{ marginBottom: 8 }}>
                  Checklist &amp; confidence vs outcomes
                </div>
                <p className="aa--muted" style={{ margin: '0 0 8px', fontSize: '0.82rem' }}>
                  Pearson correlation on your logged scores vs realized P&amp;L (linear relationship — needs sample size).
                </p>
                <div className="bt-corr-strip">
                  <span className="aa-pill aa-pill--dim">
                    Checklist ↔ P&amp;L: {breakdown.checklistCorrelation != null ? breakdown.checklistCorrelation.toFixed(3) : '—'}
                  </span>
                  <span className="aa-pill aa-pill--dim">
                    Confidence ↔ P&amp;L: {breakdown.confidenceCorrelation != null ? breakdown.confidenceCorrelation.toFixed(3) : '—'}
                  </span>
                  <span className="aa-pill aa-pill--accent">{m.tradeCount} trades in scope</span>
                </div>
              </div>

              {conditionHighlights && (
                <div className="aa-card" style={{ marginBottom: 16 }}>
                  <div className="aa-section-title" style={{ marginBottom: 12 }}>
                    Strongest vs weakest conditions
                  </div>
                  <div className="bt-condition-split">
                    <div>
                      <h3 className="bt-drawer-section-title" style={{ marginBottom: 8 }}>
                        Where edge shows up
                      </h3>
                      <ul className="bt-condition-list">
                        {conditionHighlights.inst?.bestK && (
                          <li>
                            <strong>Instrument</strong> {conditionHighlights.inst.bestK}{' '}
                            {conditionHighlights.inst.bestV != null ? `(PF-weighted, PF ${conditionHighlights.inst.bestV.toFixed(2)})` : ''}
                          </li>
                        )}
                        {conditionHighlights.sess?.bestK && (
                          <li>
                            <strong>Session</strong> {conditionHighlights.sess.bestK}{' '}
                            {conditionHighlights.sess.bestV != null ? `(avg R ${conditionHighlights.sess.bestV.toFixed(2)})` : ''}
                          </li>
                        )}
                        {conditionHighlights.tf?.bestK && (
                          <li>
                            <strong>Timeframe</strong> {conditionHighlights.tf.bestK}{' '}
                            {conditionHighlights.tf.bestV != null ? `(expectancy ${conditionHighlights.tf.bestV.toFixed(3)})` : ''}
                          </li>
                        )}
                        {conditionHighlights.pb?.bestK && conditionHighlights.pb.bestK !== '—' && (
                          <li>
                            <strong>Playbook</strong> {conditionHighlights.pb.bestK}{' '}
                            {conditionHighlights.pb.bestV != null ? `(expectancy ${conditionHighlights.pb.bestV.toFixed(3)})` : ''}
                          </li>
                        )}
                      </ul>
                    </div>
                    <div>
                      <h3 className="bt-drawer-section-title" style={{ marginBottom: 8 }}>
                        What to scrutinize
                      </h3>
                      <ul className="bt-condition-list">
                        {conditionHighlights.inst?.worstK && conditionHighlights.inst.worstK !== conditionHighlights.inst.bestK && (
                          <li>
                            <strong>Instrument</strong> {conditionHighlights.inst.worstK}
                            {conditionHighlights.inst.worstV != null ? ` (PF ${conditionHighlights.inst.worstV.toFixed(2)})` : ''}
                          </li>
                        )}
                        {conditionHighlights.sess?.worstK && conditionHighlights.sess.worstK !== conditionHighlights.sess.bestK && (
                          <li>
                            <strong>Session</strong> {conditionHighlights.sess.worstK}
                            {conditionHighlights.sess.worstV != null ? ` (avg R ${conditionHighlights.sess.worstV.toFixed(2)})` : ''}
                          </li>
                        )}
                        {conditionHighlights.tf?.worstK && conditionHighlights.tf.worstK !== conditionHighlights.tf.bestK && (
                          <li>
                            <strong>Timeframe</strong> {conditionHighlights.tf.worstK}
                            {conditionHighlights.tf.worstV != null ? ` (expectancy ${conditionHighlights.tf.worstV.toFixed(3)})` : ''}
                          </li>
                        )}
                        {conditionHighlights.pb?.worstK &&
                          conditionHighlights.pb.worstK !== '—' &&
                          conditionHighlights.pb.worstK !== conditionHighlights.pb.bestK && (
                            <li>
                              <strong>Playbook</strong> {conditionHighlights.pb.worstK}
                            </li>
                          )}
                      </ul>
                    </div>
                  </div>

                  {(longAgg?.tradeCount > 0 || shortAgg?.tradeCount > 0) && (
                    <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <h3 className="bt-drawer-section-title" style={{ marginBottom: 8 }}>
                        Long vs short
                      </h3>
                      <div className="bt-form-grid">
                        {longAgg?.tradeCount > 0 && (
                          <div className="aa-kpi" style={{ padding: '12px 14px' }}>
                            <span className="aa-kpi-label">Long</span>
                            <span className="aa-kpi-value" style={{ fontSize: '0.85rem' }}>
                              n={longAgg.tradeCount} · net {fmt(longAgg.netPnl)} · WR {fmtPct(longAgg.winRate)}
                            </span>
                          </div>
                        )}
                        {shortAgg?.tradeCount > 0 && (
                          <div className="aa-kpi" style={{ padding: '12px 14px' }}>
                            <span className="aa-kpi-label">Short</span>
                            <span className="aa-kpi-value" style={{ fontSize: '0.85rem' }}>
                              n={shortAgg.tradeCount} · net {fmt(shortAgg.netPnl)} · WR {fmtPct(shortAgg.winRate)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {insights?.lines?.length > 0 && (
                <div className="aa-card" style={{ marginBottom: 16 }}>
                  <div className="aa-section-title" style={{ marginBottom: 8 }}>
                    {insights.title || 'Deterministic insights'}
                  </div>
                  <ul className="bt-insight-list">
                    {insights.lines.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="aa-card aa-card--accent" style={{ marginBottom: 20 }}>
                <div className="aa-section-title" style={{ marginBottom: 8 }}>
                  Next focus
                </div>
                <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.55, color: 'rgba(255,248,235,0.88)' }}>{nextFocus}</p>
              </div>

              <h2 className="aa-section-title" style={{ marginBottom: 12 }}>
                Breakdowns
              </h2>
              <div className="bt-reports-breakdown-grid">
                <BreakdownCard title="Instrument" rows={sortBreakdownEntries(breakdown.byInstrument)} />
                <BreakdownCard title="Session window" rows={sortBreakdownEntries(breakdown.bySession)} />
                <BreakdownCard title="Timeframe" rows={sortBreakdownEntries(breakdown.byTimeframe)} />
                <BreakdownCard title="Playbook" rows={sortBreakdownEntries(breakdown.byPlaybook)} />
                <BreakdownCard title="Setup" rows={sortBreakdownEntries(breakdown.bySetup)} />
                <BreakdownCard title="Direction" rows={sortBreakdownEntries(breakdown.byDirection)} />
                <BreakdownCard
                  title="Duration"
                  rows={sortBreakdownEntries(breakdown.byDurationBucket)}
                  formatKey={(k) => formatBucketLabel('duration', k)}
                />
                <BreakdownCard title="Market condition" rows={sortBreakdownEntries(breakdown.byMarketCondition, 1, 6)} />
                <BreakdownCard title="Quality grade" rows={sortBreakdownEntries(breakdown.byQuality)} />
                <BreakdownCard
                  title="Checklist score bucket"
                  rows={sortBreakdownEntries(breakdown.byChecklistBucket)}
                  formatKey={(k) => formatBucketLabel('checklist', k)}
                />
                <BreakdownCard
                  title="Confidence bucket"
                  rows={sortBreakdownEntries(breakdown.byConfidenceBucket)}
                  formatKey={(k) => formatBucketLabel('confidence', k)}
                />
                <BreakdownCard title="Tags (2+ uses)" rows={sortBreakdownEntries(breakdown.byTag, 2, 10)} />
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
