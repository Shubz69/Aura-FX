import React from 'react';
import { useLocation } from 'react-router-dom';
import '../../../styles/aura-analysis/AuraTabSection.css';
import '../../../styles/aura-analysis/Overview.css';

export default function Overview() {
  const location = useLocation();
  const fromTransition = location.state?.fromTransition === true;

  const calendarDays = [];
  const daysInMonth = 30;
  const greenDays = [1, 2, 8, 9, 15, 16, 22, 23, 29, 30];
  const purpleDays = [7, 14, 21, 28];
  for (let d = 1; d <= daysInMonth; d++) {
    let type = '';
    if (greenDays.includes(d)) type = 'green';
    else if (purpleDays.includes(d)) type = 'purple';
    calendarDays.push({ day: d, type });
  }

  return (
    <div className={`aura-overview-page ${fromTransition ? 'aura-overview-from-transition' : ''}`}>
      <header className="aura-overview-header">
        <h1 className="aura-overview-title">Overview</h1>
        <p className="aura-overview-sub">Command Center</p>
      </header>

      <div className="aura-overview-grid">
        {/* Left column */}
        <div className="aura-overview-col aura-overview-left">
          <section className="aura-card aura-summary-card">
            <h2 className="aura-card-title">Overview</h2>
            <div className="aura-summary-list">
              <div className="aura-summary-row">
                <span className="aura-summary-label">Equity</span>
                <span className="aura-summary-value">$50,875</span>
                <span className="aura-summary-badge positive">▲ 4.64% today</span>
                <span className="aura-summary-meta">9.29%</span>
              </div>
              <div className="aura-summary-row">
                <span className="aura-summary-label">Net P/L</span>
                <span className="aura-summary-value positive">+$14,250</span>
              </div>
              <div className="aura-summary-row">
                <span className="aura-summary-label">Win Rate</span>
                <span className="aura-summary-value">68%</span>
              </div>
              <div className="aura-summary-row">
                <span className="aura-summary-label">Profit Factor</span>
                <span className="aura-summary-value">2.85</span>
              </div>
              <div className="aura-summary-row">
                <span className="aura-summary-label">Expectancy</span>
                <span className="aura-summary-value positive">+$178 / Trade</span>
              </div>
              <div className="aura-summary-row">
                <span className="aura-summary-label">Risk Score</span>
                <span className="aura-summary-value purple">Low Risk</span>
                <span className="aura-summary-meta">1.5%</span>
              </div>
            </div>
          </section>

          <section className="aura-card aura-calendar-card">
            <h2 className="aura-card-title">Calendar — April 2024</h2>
            <div className="aura-calendar-grid">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                <div key={d} className="aura-calendar-dow">{d}</div>
              ))}
              {calendarDays.map(({ day, type }) => (
                <div key={day} className={`aura-calendar-day ${type}`}>{day}</div>
              ))}
            </div>
            <p className="aura-calendar-note">Ormetown 4.6%</p>
          </section>

          <section className="aura-card aura-key-stats-card">
            <h2 className="aura-card-title">Key Stats</h2>
            <div className="aura-key-stats-list">
              <div className="aura-key-stat"><span>Trade Range</span><span>159</span></div>
              <div className="aura-key-stat"><span>Win Rate</span><span>568.6</span></div>
              <div className="aura-key-stat"><span>Avg RR</span><span>133%</span></div>
              <div className="aura-key-stat"><span>Trade Dace</span><span>101 (0%)</span></div>
              <div className="aura-key-stat"><span>Lots of Trades</span><span>9.7</span></div>
              <div className="aura-key-stat"><span>Sharpe Ratio</span><span>1.24</span></div>
              <div className="aura-key-stat"><span>Trades Posi</span><span>68</span></div>
              <div className="aura-key-stat"><span>Open Trades</span><span>2</span></div>
            </div>
            <div className="aura-key-stats-bar" />
            <div className="aura-key-stats-actions">
              <button type="button" className="aura-btn-ghost">AT IDAN</button>
              <button type="button" className="aura-btn-ghost">LENNO</button>
              <button type="button" className="aura-btn-ghost">Salit</button>
            </div>
          </section>
        </div>

        {/* Middle column */}
        <div className="aura-overview-col aura-overview-middle">
          <section className="aura-card aura-equity-card">
            <div className="aura-card-head">
              <h2 className="aura-card-title">Equity Curve</h2>
              <div className="aura-card-controls">
                <span className="aura-date-range">Apr 1 – 2024</span>
                <select className="aura-select" aria-label="Day"><option>Day</option></select>
                <select className="aura-select" aria-label="Week"><option>Week</option></select>
              </div>
            </div>
            <div className="aura-chart-placeholder aura-equity-chart">
              <div className="aura-chart-line" />
              <span className="aura-chart-y">$50.8k</span>
              <span className="aura-chart-y">$50.6k</span>
              <span className="aura-chart-x">Apr 1</span>
              <span className="aura-chart-x">Apr 9</span>
              <span className="aura-chart-x">Apr 16</span>
              <span className="aura-chart-x">Apr 23</span>
            </div>
          </section>

          <section className="aura-card aura-daily-card">
            <h2 className="aura-card-title">Daily <span className="aura-pct">61%</span> <span className="aura-pct">75%</span></h2>
            <div className="aura-chart-placeholder aura-daily-chart">
              <div className="aura-chart-line" />
              <span className="aura-chart-y">$60.6k</span>
              <span className="aura-chart-y">$30k</span>
            </div>
            <div className="aura-daily-buttons">
              <button type="button" className="aura-btn-ghost">En</button>
              <button type="button" className="aura-btn-ghost">Rook</button>
              <button type="button" className="aura-btn-ghost">Winin</button>
              <button type="button" className="aura-btn-ghost">Ectmonony</button>
            </div>
          </section>

          <section className="aura-card aura-sessions-card">
            <h2 className="aura-card-title">Sessions</h2>
            <div className="aura-sessions-list">
              <div className="aura-session">
                <span className="aura-session-name">Asia</span>
                <span className="aura-session-value positive">$2,280</span>
                <span className="aura-session-meta">Max RR 3.3R · Avg Risk 1.35%</span>
              </div>
              <div className="aura-session">
                <span className="aura-session-name">London</span>
                <span className="aura-session-value positive">$8,675</span>
                <span className="aura-session-meta">Max RR 5.7R · Avg Risk 0.72%</span>
              </div>
              <div className="aura-session">
                <span className="aura-session-name">NY</span>
                <span className="aura-session-value positive">$6,025</span>
                <span className="aura-session-meta">Max RR 3.4R · Avg Risk 1.2%</span>
              </div>
            </div>
            <p className="aura-sessions-meta">24 Trades · GIBPUSD</p>
          </section>
        </div>

        {/* Right column */}
        <div className="aura-overview-col aura-overview-right">
          <section className="aura-card aura-donut-card">
            <h2 className="aura-card-title">Win/Loss Ratio</h2>
            <div className="aura-donut-wrap">
              <div className="aura-donut" aria-hidden="true" />
              <span className="aura-donut-label">68%</span>
            </div>
            <p className="aura-donut-legend"><span className="win">Win</span> <span className="loss">Loss</span></p>
          </section>

          <section className="aura-card aura-best-worst-card">
            <h2 className="aura-card-title">Win/Loss Ratio</h2>
            <div className="aura-donut-wrap aura-donut-sm">
              <div className="aura-donut" aria-hidden="true" />
              <span className="aura-donut-label">68%</span>
            </div>
            <div className="aura-best-worst">
              <p><span className="label">Best Day:</span> <span className="positive">+$4,200</span> Apr 16</p>
              <p><span className="label">Worst Day:</span> <span className="positive">+$1,800</span> Apr 10</p>
            </div>
            <div className="aura-risk-donut">
              <span className="aura-donut-label">84%</span>
              <p className="aura-risk-legend">Risk: Compunce</p>
              <p className="aura-risk-pcts">99% · 50% · 25% · 23%</p>
            </div>
          </section>

          <section className="aura-card aura-distribution-card">
            <h2 className="aura-card-title">Trade Distribution</h2>
            <div className="aura-bar-chart">
              <div className="aura-bar" style={{ height: '60%' }} />
              <div className="aura-bar" style={{ height: '35%' }} />
              <div className="aura-bar" style={{ height: '10%' }} />
              <div className="aura-bar" style={{ height: '45%' }} />
              <div className="aura-bar" style={{ height: '70%' }} />
            </div>
            <div className="aura-bar-labels">
              <span>200</span>
              <span>293</span>
              <span>338</span>
              <span>384</span>
              <span>420</span>
            </div>
          </section>

          <section className="aura-card aura-streaks-card">
            <h2 className="aura-card-title">Streaks</h2>
            <div className="aura-streaks-list">
              <p><span className="aura-streak-label">Plotted reaimiteds:</span> <span className="positive">1ea.34</span></p>
              <p><span className="aura-streak-label">Downnwr treet:</span> <span className="positive">5o,25</span></p>
              <p><span className="aura-streak-label">Eish volllagy excew:</span> <span className="positive">59,20</span></p>
            </div>
          </section>
        </div>
      </div>

      {/* Trade Log - full width */}
      <section className="aura-card aura-trade-log-card">
        <h2 className="aura-card-title">Trade Log</h2>
        <div className="aura-trade-log-wrap">
          <table className="aura-trade-log">
            <thead>
              <tr>
                <th>Date</th>
                <th>Pair</th>
                <th>Setup</th>
                <th>P/L</th>
                <th>RR</th>
                <th>Session</th>
                <th>Risk</th>
                <th></th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>32.24</td>
                <td>Gold</td>
                <td>Breakout</td>
                <td className="positive">+$1,200</td>
                <td>2.3R</td>
                <td>London</td>
                <td>1.5%</td>
                <td><span className="aura-icon" aria-hidden>·</span></td>
                <td><span className="aura-icon" aria-hidden>·</span></td>
                <td><span className="aura-icon" aria-hidden>·</span></td>
              </tr>
              <tr>
                <td>24.25</td>
                <td>NAS100</td>
                <td>Scalping</td>
                <td className="positive">+$600</td>
                <td>2.6R</td>
                <td>New York</td>
                <td>1.2%</td>
                <td><span className="aura-icon" aria-hidden>·</span></td>
                <td><span className="aura-icon" aria-hidden>·</span></td>
                <td><span className="aura-icon" aria-hidden>·</span></td>
              </tr>
              <tr>
                <td>22.23</td>
                <td>GBPUSD</td>
                <td>Tronol</td>
                <td className="negative">-$600</td>
                <td>-3R</td>
                <td>London</td>
                <td>1%</td>
                <td><span className="aura-icon" aria-hidden>·</span></td>
                <td><span className="aura-icon" aria-hidden>·</span></td>
                <td><span className="aura-icon" aria-hidden>·</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
