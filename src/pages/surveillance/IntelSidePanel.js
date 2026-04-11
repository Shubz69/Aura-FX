import React from 'react';

export default function IntelSidePanel({ digest, onOpenEvent, handoff }) {
  if (!digest) return null;
  const {
    summary,
    developingStories = [],
    aviationAlerts = [],
    maritimeLogistics = [],
    highMarketImpact = [],
    corroboratedAlerts = [],
    majorRegions = [],
    regionPressure = [],
  } = digest;

  const pressure = regionPressure.length ? regionPressure : majorRegions.map((r, i) => ({ ...r, rank: i + 1, label: i === 0 ? 'Hot' : 'Watch' }));

  return (
    <div className={`sv-intel-dense ${handoff ? 'sv-intel-dense--handoff' : ''}`}>
      {summary ? (
        <div className="sv-intel-kpis" role="status">
          <span>
            Tape <strong>{summary.tape_events}</strong>
          </span>
          <span>
            Stories <strong>{summary.multi_source_stories}</strong>
          </span>
          <span>
            Corr <strong>{summary.corroborated_hits}</strong>
          </span>
        </div>
      ) : null}

      <section className="sv-intel-block">
        <h2 className="sv-panel-title">Developing stories</h2>
        <ul className="sv-intel-list">
          {developingStories.length ? (
            developingStories.map((s) => (
              <li key={s.story_id}>
                <button type="button" className="sv-intel-row" onClick={() => onOpenEvent(s.top_event_id)}>
                  <span className="sv-intel-row-meta">
                    {s.item_count} evt · {s.sources?.length || 0} src · R {s.rank_score != null ? Math.round(s.rank_score) : '—'}
                  </span>
                  <span className="sv-intel-row-title">{s.headline}</span>
                  {s.trade_line ? <span className="sv-intel-row-ledger">{s.trade_line}</span> : null}
                  {s.instruments?.length ? (
                    <span className="sv-intel-chip-row">
                      {s.instruments.slice(0, 6).map((sym) => (
                        <span key={sym} className="sv-intel-chip">
                          {sym}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </button>
              </li>
            ))
          ) : (
            <li className="sv-muted">No multi-source storylines on this slice</li>
          )}
        </ul>
      </section>

      <section className="sv-intel-block sv-intel-block--domain">
        <h2 className="sv-panel-title">Aviation alerts</h2>
        <ul className="sv-intel-list">
          {aviationAlerts.length ? (
            aviationAlerts.map((e) => (
              <li key={e.id}>
                <button type="button" className="sv-intel-row" onClick={() => onOpenEvent(e.id)}>
                  <span className="sv-intel-row-meta">
                    {e.event_type || '—'} · R {e.rank_score != null ? Math.round(e.rank_score) : '—'}
                  </span>
                  <span className="sv-intel-row-title">{e.title}</span>
                  {e.observability ? <span className="sv-intel-row-sub">{e.observability}</span> : null}
                  {e.instruments?.length ? (
                    <span className="sv-intel-chip-row">
                      {e.instruments.map((sym) => (
                        <span key={sym} className="sv-intel-chip">
                          {sym}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </button>
              </li>
            ))
          ) : (
            <li className="sv-muted">No aviation-class hits on this slice</li>
          )}
        </ul>
      </section>

      <section className="sv-intel-block sv-intel-block--domain">
        <h2 className="sv-panel-title">Maritime & logistics</h2>
        <ul className="sv-intel-list">
          {maritimeLogistics.length ? (
            maritimeLogistics.map((e) => (
              <li key={e.id}>
                <button type="button" className="sv-intel-row" onClick={() => onOpenEvent(e.id)}>
                  <span className="sv-intel-row-meta">
                    {e.event_type || '—'} · R {e.rank_score != null ? Math.round(e.rank_score) : '—'}
                  </span>
                  <span className="sv-intel-row-title">{e.title}</span>
                  {e.observability ? <span className="sv-intel-row-sub">{e.observability}</span> : null}
                  {e.instruments?.length ? (
                    <span className="sv-intel-chip-row">
                      {e.instruments.map((sym) => (
                        <span key={sym} className="sv-intel-chip sv-intel-chip--muted">
                          {sym}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </button>
              </li>
            ))
          ) : (
            <li className="sv-muted">No maritime / logistics hits on this slice</li>
          )}
        </ul>
      </section>

      <section className="sv-intel-block">
        <h2 className="sv-panel-title">Market impact</h2>
        <ul className="sv-intel-list">
          {highMarketImpact.length ? (
            highMarketImpact.map((e) => (
              <li key={e.id}>
                <button type="button" className="sv-intel-row" onClick={() => onOpenEvent(e.id)}>
                  <span className="sv-intel-row-meta">
                    MKT {e.market_impact_score != null ? Math.round(e.market_impact_score) : '—'} · R{' '}
                    {e.rank_score != null ? Math.round(e.rank_score) : '—'}
                  </span>
                  <span className="sv-intel-row-title">{e.title}</span>
                  {e.instruments?.length ? (
                    <span className="sv-intel-chip-row">
                      {e.instruments.map((sym) => (
                        <span key={sym} className="sv-intel-chip sv-intel-chip--muted">
                          {sym}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </button>
              </li>
            ))
          ) : (
            <li className="sv-muted">No high market-impact hits</li>
          )}
        </ul>
      </section>

      <section className="sv-intel-block">
        <h2 className="sv-panel-title">Corroborated</h2>
        <ul className="sv-intel-list">
          {corroboratedAlerts.length ? (
            corroboratedAlerts.map((e) => (
              <li key={e.id}>
                <button type="button" className="sv-intel-row" onClick={() => onOpenEvent(e.id)}>
                  <span className="sv-intel-row-meta">✓{e.corroboration_count || 0} corroboration</span>
                  <span className="sv-intel-row-title">{e.title}</span>
                  {e.instruments?.length ? (
                    <span className="sv-intel-chip-row">
                      {e.instruments.map((sym) => (
                        <span key={sym} className="sv-intel-chip sv-intel-chip--muted">
                          {sym}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </button>
              </li>
            ))
          ) : (
            <li className="sv-muted">Awaiting cross-source corroboration</li>
          )}
        </ul>
      </section>

      <section className="sv-intel-block">
        <h2 className="sv-panel-title">Region pressure</h2>
        <ul className="sv-heat-list sv-heat-list--compact sv-heat-list--dense">
          {pressure.length ? (
            pressure.map((r) => (
              <li key={r.region}>
                <span className="sv-heat-region">
                  {r.region}
                  {r.label ? <em className="sv-heat-tag">{r.label}</em> : null}
                </span>
                <span className="sv-heat-score">{r.score}</span>
              </li>
            ))
          ) : (
            <li className="sv-muted">No regional clustering yet</li>
          )}
        </ul>
      </section>
    </div>
  );
}
