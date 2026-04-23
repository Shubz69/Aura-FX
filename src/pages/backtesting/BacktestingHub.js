import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Api from '../../services/Api';
import { toast } from 'react-toastify';

function fmtPct(x) {
  if (x == null || Number.isNaN(Number(x))) return 'â€”';
  return `${(Number(x) * 100).toFixed(1)}%`;
}

function fmtNum(x, d = 2) {
  if (x == null || Number.isNaN(Number(x))) return 'â€”';
  return Number(x).toFixed(d);
}

export default function BacktestingHub() {
  const [summary, setSummary] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [sRes, listRes] = await Promise.all([
        Api.getBacktestingSummary(),
        Api.getBacktestingSessions({}),
      ]);
      if (sRes.data?.success) setSummary(sRes.data.summary);
      if (listRes.data?.success) setSessions(listRes.data.sessions || []);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not load backtesting data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const recent = sessions.slice(0, 8);
  const hub = summary?.hubDetail;

  const playbookSnapshot = useMemo(() => {
    const map = new Map();
    for (const s of sessions) {
      const key = s.playbookName || s.playbookId || 'No playbook';
      if (!map.has(key)) map.set(key, { name: key, sessions: 0, net: 0, trades: 0, wins: 0 });
      const row = map.get(key);
      row.sessions += 1;
      row.net += Number(s.netPnl || 0);
      row.trades += Number(s.totalTrades || 0);
      row.wins += Number(s.totalWins || 0);
    }
    return [...map.values()]
      .map((r) => ({
        ...r,
        winRate: r.trades > 0 ? r.wins / r.trades : null,
      }))
      .sort((a, b) => b.net - a.net)
      .slice(0, 6);
  }, [sessions]);

  const resumeId =
    summary?.activeSession?.id ||
    sessions.find((s) => s.status === 'active' || s.status === 'paused')?.id;

  const hasData = (summary?.totalTrades ?? 0) > 0;

  return (
    <>
      <header className="bt-hero">
        <p className="bt-hero-kicker">Aura Terminal™</p>
        <h1 className="bt-hero-title">Backtesting</h1>
        <p className="bt-hero-sub">
          Measure edge on historical data: execution quality, playbook performance, and discipline signals â€” before capital hits the market.
        </p>
        <div className="bt-hero-actions">
          <Link to="/backtesting/new" className="bt-btn bt-btn--primary">
            New session
          </Link>
          {resumeId ? (
            <Link to={`/backtesting/session/${resumeId}`} className="bt-btn">
              Resume session
            </Link>
          ) : (
            <button type="button" className="bt-btn bt-btn--ghost" disabled title="No active or paused session">
              Resume session
            </button>
          )}
          <Link to="/backtesting/reports" className="bt-btn bt-btn--ghost">
            Full reports
          </Link>
          <Link to="/trader-deck/trade-validator/trader-playbook" className="bt-btn bt-btn--ghost">
            Playbooks
          </Link>
        </div>
      </header>

      {loading ? (
        <div className="aa-loading" style={{ padding: '48px 0' }}>
          <span className="aa-spinner" aria-hidden />
          Loading backtesting intelligenceâ€¦
        </div>
      ) : !hasData ? (
        <div className="aa-card aa-card--accent" style={{ marginBottom: 20 }}>
          <h2 className="aa-section-title-lg">
            <span className="aa-title-dot" aria-hidden />
            Start your first run
          </h2>
          <p className="aa--muted" style={{ fontSize: '0.88rem', lineHeight: 1.55, margin: '0 0 16px' }}>
            You have not logged backtest trades yet. Create a session, step through replay, and record trades with checklist and playbook metadata â€”
            your hub will populate with win rate, profit factor, session edge, and deterministic insights tied to real outcomes.
          </p>
          <Link to="/backtesting/new" className="bt-btn bt-btn--primary">
            Create first session
          </Link>
        </div>
      ) : null}

      {!loading && hasData && (
        <>
          <div className="bt-kpi-grid">
            {[
              ['Total sessions', summary?.totalSessions ?? 0],
              ['Backtested trades', summary?.totalTrades ?? 0],
              ['Win rate', fmtPct(summary?.winRate)],
              ['Profit factor', fmtNum(summary?.profitFactor)],
              ['Avg R', fmtNum(summary?.avgR)],
              ['Expectancy / trade', fmtNum(summary?.expectancy)],
              ['Net PnL (all)', fmtNum(summary?.netPnl)],
              ['Max drawdown', fmtNum(summary?.maxDrawdown)],
              ['Best instrument', summary?.bestInstrument || 'â€”'],
              ['Best session', summary?.bestSession || 'â€”'],
              ['Win streak', `${summary?.currentStreak ?? 0}W`],
              ['Hours in sim', fmtNum(summary?.totalBacktestingHours, 1)],
            ].map(([label, val]) => (
              <div key={label} className="aa-kpi">
                <span className="aa-kpi-label">{label}</span>
                <span className="aa-kpi-value">{val}</span>
              </div>
            ))}
          </div>

          {summary?.activeSession && (
            <div className="aa-card aa-card--accent" style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
                <div>
                  <h2 className="aa-section-title" style={{ marginBottom: 8 }}>
                    Active workspace
                  </h2>
                  <p className="aa--muted" style={{ margin: 0, fontSize: '0.88rem' }}>
                    <strong className="aa--accent">{summary.activeSession.sessionName}</strong>
                    <span className="aa-pill aa-pill--accent" style={{ marginLeft: 10 }}>
                      {summary.activeSession.status}
                    </span>
                  </p>
                  <p className="aa--muted" style={{ margin: '8px 0 0', fontSize: '0.8rem' }}>
                    Replay position and notebook auto-save stay attached â€” open the workspace to continue.
                  </p>
                </div>
                <Link className="bt-btn bt-btn--primary" to={`/backtesting/session/${summary.activeSession.id}`}>
                  Open workspace
                </Link>
              </div>
            </div>
          )}

          {hub?.narrativeLines?.length > 0 && (
            <div className="aa-card" style={{ marginBottom: 18 }}>
              <h2 className="aa-section-title-lg">
                <span className="aa-title-dot" aria-hidden />
                What your data says
              </h2>
              <ul className="bt-insight-list">
                {hub.narrativeLines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
              {hub.insights?.lines?.length > 0 && (
                <>
                  <p className="aa-section-title" style={{ marginTop: 16 }}>
                    Additional signals
                  </p>
                  <ul className="bt-insight-list">
                    {hub.insights.lines.map((line, i) => (
                      <li key={`d-${i}`}>{line}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          <div className="bt-two-col" style={{ marginBottom: 18 }}>
            <div className="aa-card">
              <h2 className="aa-section-title-lg">
                <span className="aa-title-dot" />
                Top setups
              </h2>
              {!hub?.topSetups?.length ? (
                <p className="aa-empty" style={{ padding: 24 }}>
                  Log setups on trades to rank edge by playbook structure.
                </p>
              ) : (
                hub.topSetups.map((r) => (
                  <div key={r.name} className="aa-bar-row">
                    <span className="aa-bar-label aa-bar-label--wide">{r.name}</span>
                    <div className="aa-bar-track">
                      <div
                        className="aa-bar-fill aa-bar-fill--accent"
                        style={{ width: `${Math.min(100, 15 + Math.max(0, Number(r.expectancy) || 0) * 40)}%` }}
                      />
                    </div>
                    <span className="aa-bar-val">{fmtNum(r.expectancy)} E</span>
                    <span className="aa-bar-meta">{r.tradeCount}t</span>
                  </div>
                ))
              )}
            </div>
            <div className="aa-card">
              <h2 className="aa-section-title-lg">
                <span className="aa-title-dot" />
                Top tags
              </h2>
              {!hub?.topTags?.length ? (
                <p className="aa-empty" style={{ padding: 24 }}>
                  Add comma-separated tags on trades; combos need at least two occurrences.
                </p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {hub.topTags.map((t) => (
                    <span key={t.name} className="aa-pill aa-pill--dim" title={`Expectancy ${fmtNum(t.expectancy)}`}>
                      {t.name} Â· {t.tradeCount}t
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bt-two-col" style={{ marginBottom: 18 }}>
            <div className="aa-card">
              <h2 className="aa-section-title-lg">
                <span className="aa-title-dot" />
                Profitability by hour
              </h2>
              {!hub?.topHours?.length ? (
                <p className="aa--muted" style={{ fontSize: '0.82rem' }}>
                  Close times with enough trades will surface best hours.
                </p>
              ) : (
                hub.topHours.map((h) => (
                  <div key={h.hour} className="aa-bar-row">
                    <span className="aa-bar-label">{h.hour} UTC</span>
                    <div className="aa-bar-track">
                      <div
                        className="aa-bar-fill aa-bar-fill--green"
                        style={{ width: `${Math.min(100, 20 + Math.max(0, Number(h.expectancy) || 0) * 35)}%` }}
                      />
                    </div>
                    <span className="aa-bar-val">{fmtNum(h.expectancy)}</span>
                  </div>
                ))
              )}
            </div>
            <div className="aa-card">
              <h2 className="aa-section-title-lg">
                <span className="aa-title-dot" />
                Long vs short
              </h2>
              <div className="bt-stat-mini">
                <span>Longs</span>
                <strong>
                  {hub?.longVsShort?.long
                    ? `${hub.longVsShort.long.trades} Â· ${fmtNum(hub.longVsShort.long.netPnl)} Â· ${fmtPct(hub.longVsShort.long.winRate)} WR`
                    : 'â€”'}
                </strong>
              </div>
              <div className="bt-stat-mini">
                <span>Shorts</span>
                <strong>
                  {hub?.longVsShort?.short
                    ? `${hub.longVsShort.short.trades} Â· ${fmtNum(hub.longVsShort.short.netPnl)} Â· ${fmtPct(hub.longVsShort.short.winRate)} WR`
                    : 'â€”'}
                </strong>
              </div>
              {hub?.weakestSetup && (
                <p className="aa--muted" style={{ fontSize: '0.8rem', marginTop: 12 }}>
                  Weakest setup by expectancy: <span className="aa--amber">{hub.weakestSetup.name}</span> (
                  {fmtNum(hub.weakestSetup.expectancy)} over {hub.weakestSetup.tradeCount} trades)
                </p>
              )}
            </div>
          </div>

          <div className="aa-card" style={{ marginBottom: 18 }}>
            <h2 className="aa-section-title-lg">
              <span className="aa-title-dot" />
              Recent sessions
            </h2>
            {recent.length === 0 ? (
              <p className="aa--muted">No sessions listed.</p>
            ) : (
              <div className="aa-table-wrap">
                <table className="aa-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Status</th>
                      <th>Trades</th>
                      <th>Win rate</th>
                      <th>PF</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((s) => (
                      <tr key={s.id}>
                        <td>{s.sessionName}</td>
                        <td>
                          <span className="aa-pill aa-pill--dim">{s.status}</span>
                        </td>
                        <td className="aa-table-num">{s.totalTrades}</td>
                        <td className="aa-table-num">{fmtPct(s.winRate)}</td>
                        <td className="aa-table-num">{fmtNum(s.profitFactor)}</td>
                        <td>
                          <Link className="bt-btn bt-btn--ghost bt-btn--sm" to={`/backtesting/session/${s.id}`}>
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {playbookSnapshot.length > 0 && (
            <div className="aa-card" style={{ marginBottom: 18 }}>
              <h2 className="aa-section-title-lg">
                <span className="aa-title-dot" />
                Playbook performance
              </h2>
              <div className="aa-table-wrap">
                <table className="aa-table">
                  <thead>
                    <tr>
                      <th>Playbook</th>
                      <th>Sessions</th>
                      <th>Trades</th>
                      <th>Win rate</th>
                      <th>Net PnL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playbookSnapshot.map((p) => (
                      <tr key={p.name}>
                        <td>{p.name}</td>
                        <td className="aa-table-num">{p.sessions}</td>
                        <td className="aa-table-num">{p.trades}</td>
                        <td className="aa-table-num">{p.winRate != null ? fmtPct(p.winRate) : 'â€”'}</td>
                        <td className="aa-table-num">{p.net.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="aa-card">
            <h2 className="aa-section-title-lg">
              <span className="aa-title-dot" />
              Quick links
            </h2>
            <div className="bt-hero-actions" style={{ marginTop: 0 }}>
              <Link to="/backtesting/trades" className="bt-btn bt-btn--ghost">
                Trade log
              </Link>
              <Link to="/backtesting/sessions" className="bt-btn bt-btn--ghost">
                Session manager
              </Link>
              <Link to="/backtesting/reports" className="bt-btn bt-btn--ghost">
                Analytics lab
              </Link>
            </div>
          </div>
        </>
      )}
    </>
  );
}
