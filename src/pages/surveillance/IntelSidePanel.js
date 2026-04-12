import React from 'react';
import { normalizeRegionKey } from './surveillanceRegionUtils';

function Section({ title, kicker, children }) {
  return (
    <section className="sv-rail-section">
      <header className="sv-rail-section-head">
        <h2 className="sv-rail-section-title">{title}</h2>
        {kicker ? <span className="sv-rail-section-kicker">{kicker}</span> : null}
      </header>
      {children}
    </section>
  );
}

export default function IntelSidePanel({
  digest,
  onOpenEvent,
  handoff,
  focusRegion,
  focusSummary,
  tapeCount,
  onClearFocus,
  onSetFocusRegion,
}) {
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

  const pressure = regionPressure.length
    ? regionPressure
    : majorRegions.map((r, i) => ({ ...r, rank: i + 1, label: i === 0 ? 'Hot' : 'Watch' }));

  const lensActive = !!focusRegion;

  return (
    <div
      className={`sv-intel-rail ${handoff ? 'sv-intel-rail--handoff' : ''} ${
        lensActive ? 'sv-intel-rail--lensed' : ''
      }`}
    >
      {lensActive && focusSummary ? (
        <div
          className={`sv-rail-focus ${focusSummary.isoHint ? 'sv-rail-focus--geo' : ''}`}
          role="region"
          aria-label="Geography focus"
        >
          <div className="sv-rail-focus-top">
            <span className="sv-rail-focus-label">Geography focus</span>
            {focusSummary.isoHint ? (
              <span className="sv-rail-focus-iso" title="Country code">
                {focusSummary.isoHint}
              </span>
            ) : null}
            <button type="button" className="sv-rail-focus-clear" onClick={onClearFocus}>
              Clear
            </button>
          </div>
          <p className="sv-rail-focus-name">{focusSummary.label}</p>
          <p className="sv-rail-focus-scope">
            Tape + rail filtered
            {typeof tapeCount === 'number' ? ` · ${tapeCount} row${tapeCount === 1 ? '' : 's'} on tape` : ''}
          </p>
          <dl className="sv-rail-focus-stats">
            <div>
              <dt>Nodes</dt>
              <dd>{focusSummary.count}</dd>
            </div>
            <div>
              <dt>Peak R</dt>
              <dd>{focusSummary.maxRank ? Math.round(focusSummary.maxRank) : '—'}</dd>
            </div>
            <div>
              <dt>Sev</dt>
              <dd>{focusSummary.maxSev || '—'}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      {summary ? (
        <div className="sv-rail-kpis" role="status">
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

      <Section title="Developing" kicker="Storylines">
        <ul className="sv-rail-list">
          {developingStories.length ? (
            developingStories.map((s) => (
              <li key={s.story_id}>
                <button type="button" className="sv-rail-row" onClick={() => onOpenEvent(s.top_event_id)}>
                  <span className="sv-rail-row-title">{s.headline}</span>
                  <span className="sv-rail-row-meta">
                    {s.item_count} evt · {s.sources?.length || 0} src · R{' '}
                    {s.rank_score != null ? Math.round(s.rank_score) : '—'}
                  </span>
                  {s.trade_line ? <span className="sv-rail-row-ledger">{s.trade_line}</span> : null}
                </button>
              </li>
            ))
          ) : (
            <li className="sv-rail-empty">{lensActive ? 'No storylines in this sector' : 'No multi-source storylines'}</li>
          )}
        </ul>
      </Section>

      <Section title="High impact" kicker="Tape">
        <ul className="sv-rail-list">
          {highMarketImpact.length ? (
            highMarketImpact.map((e) => (
              <li key={e.id}>
                <button type="button" className="sv-rail-row" onClick={() => onOpenEvent(e.id)}>
                  <span className="sv-rail-row-eyebrow">
                    MKT {e.market_impact_score != null ? Math.round(e.market_impact_score) : '—'}
                  </span>
                  <span className="sv-rail-row-title">{e.title}</span>
                </button>
              </li>
            ))
          ) : (
            <li className="sv-rail-empty">{lensActive ? 'No high-impact items here' : 'No high market-impact hits'}</li>
          )}
        </ul>
      </Section>

      <Section title="Aviation" kicker="Ops">
        <ul className="sv-rail-list">
          {aviationAlerts.length ? (
            aviationAlerts.map((e) => (
              <li key={e.id}>
                <button type="button" className="sv-rail-row" onClick={() => onOpenEvent(e.id)}>
                  <span className="sv-rail-row-eyebrow">{e.event_type || 'aviation'}</span>
                  <span className="sv-rail-row-title">{e.title}</span>
                  {e.observability ? <span className="sv-rail-row-note">{e.observability}</span> : null}
                </button>
              </li>
            ))
          ) : (
            <li className="sv-rail-empty">No aviation-class hits</li>
          )}
        </ul>
      </Section>

      <Section title="Maritime & logistics" kicker="Flow">
        <ul className="sv-rail-list">
          {maritimeLogistics.length ? (
            maritimeLogistics.map((e) => (
              <li key={e.id}>
                <button type="button" className="sv-rail-row" onClick={() => onOpenEvent(e.id)}>
                  <span className="sv-rail-row-eyebrow">{e.event_type || 'maritime'}</span>
                  <span className="sv-rail-row-title">{e.title}</span>
                  {e.observability ? <span className="sv-rail-row-note">{e.observability}</span> : null}
                </button>
              </li>
            ))
          ) : (
            <li className="sv-rail-empty">No maritime / logistics hits</li>
          )}
        </ul>
      </Section>

      <Section title="Corroborated" kicker="Cross-source">
        <ul className="sv-rail-list">
          {corroboratedAlerts.length ? (
            corroboratedAlerts.map((e) => (
              <li key={e.id}>
                <button type="button" className="sv-rail-row" onClick={() => onOpenEvent(e.id)}>
                  <span className="sv-rail-row-eyebrow">✓{e.corroboration_count || 0}</span>
                  <span className="sv-rail-row-title">{e.title}</span>
                </button>
              </li>
            ))
          ) : (
            <li className="sv-rail-empty">Awaiting corroboration</li>
          )}
        </ul>
      </Section>

      <Section title="Region pressure" kicker="Heat">
        <ul className="sv-rail-heat">
          {pressure.length ? (
            pressure.map((r) => {
              const active =
                focusRegion && normalizeRegionKey(r.region) === normalizeRegionKey(focusRegion);
              return (
                <li key={r.region}>
                  <button
                    type="button"
                    className={`sv-rail-heat-row ${active ? 'sv-rail-heat-row--active' : ''}`}
                    onClick={() => onSetFocusRegion?.(r.region)}
                  >
                    <span className="sv-rail-heat-name">
                      {r.region}
                      {r.label ? <span className="sv-rail-heat-tag">{r.label}</span> : null}
                    </span>
                    <span className="sv-rail-heat-score">{r.score}</span>
                  </button>
                </li>
              );
            })
          ) : (
            <li className="sv-rail-empty">No regional clustering</li>
          )}
        </ul>
      </Section>
    </div>
  );
}
