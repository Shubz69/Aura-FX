import React from 'react';
import { trustQualityPresentation } from './surveillancePresentation';
import { formatRecencyLabel, normalizeRegionKey, severityUrgencyClass, severityUrgencySlug } from './surveillanceRegionUtils';

function Section({ title, kicker, children, priority }) {
  return (
    <section className={`sv-rail-section ${priority ? 'sv-rail-section--priority' : ''}`}>
      <header className="sv-rail-section-head">
        <h2 className="sv-rail-section-title">{title}</h2>
        {kicker ? <span className="sv-rail-section-kicker">{kicker}</span> : null}
      </header>
      {children}
    </section>
  );
}

function IntelSidePanel({
  digest,
  situationHeadline,
  onOpenEvent,
  handoff,
  focusRegion,
  focusSummary,
  tapeCount,
  eventsById,
  topTapeSeverity,
  leadTapeUpdatedAt,
  onClearFocus,
  onSetFocusRegion,
}) {
  const d = digest || {};
  const {
    summary,
    developingStories = [],
    aviationAlerts = [],
    maritimeLogistics = [],
    highMarketImpact = [],
    corroboratedAlerts = [],
    majorRegions = [],
    regionPressure = [],
  } = d;

  const pressure = regionPressure.length
    ? regionPressure
    : majorRegions.map((r, i) => ({ ...r, rank: i + 1, label: i === 0 ? 'Hot' : 'Watch' }));

  const lensActive = !!focusRegion;
  const idLookup = eventsById instanceof Map ? eventsById : null;

  return (
    <div
      className={`sv-intel-rail ${handoff ? 'sv-intel-rail--handoff' : ''} ${
        lensActive ? 'sv-intel-rail--lensed' : ''
      }`}
    >
      <header className="sv-rail-masthead">
        <div className="sv-rail-masthead-titles">
          <span className="sv-rail-masthead-eyebrow">Side intelligence</span>
          <p className="sv-rail-masthead-title">Situation rail</p>
          <p className="sv-rail-masthead-sub">Latest activity first · market impact · cross-checks · regional heat</p>
        </div>
      </header>

      {situationHeadline ? (
        <div
          className="sv-rail-situation"
          role="status"
          data-signal-urgency={
            topTapeSeverity != null && topTapeSeverity !== '' ? severityUrgencySlug(topTapeSeverity) : undefined
          }
        >
          <div className="sv-rail-situation-top">
            <span className="sv-rail-situation-label">Top signal</span>
            {topTapeSeverity != null && topTapeSeverity !== '' ? (
              <span
                className={`sv-rail-situation-sev ${severityUrgencyClass(topTapeSeverity)}`}
                title="Severity on the current lead tape row (1–5 editorial urgency)"
              >
                Severity {topTapeSeverity}
              </span>
            ) : null}
          </div>
          <p className="sv-rail-situation-text">{situationHeadline}</p>
          {leadTapeUpdatedAt ? (
            <p className="sv-rail-situation-fresh" title="Most recent update on the current lead tape row">
              Lead tape · {formatRecencyLabel(leadTapeUpdatedAt)}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="sv-rail-situation sv-rail-situation--empty" role="status">
          <span className="sv-rail-situation-label">Top signal</span>
          <p className="sv-rail-situation-text">Waiting for the next lead item from the live tape.</p>
        </div>
      )}

      {lensActive && focusSummary ? (
        <div
          className={`sv-rail-focus ${focusSummary.isoHint ? 'sv-rail-focus--geo' : ''}`}
          role="region"
          aria-label="Geography focus"
          data-lens-urgency={severityUrgencySlug(focusSummary.maxSev)}
        >
          <div className="sv-rail-focus-top">
            <span className="sv-rail-focus-label">Active lens</span>
            {focusSummary.isoHint ? (
              <span className="sv-rail-focus-iso" title="Country code">
                {focusSummary.isoHint}
              </span>
            ) : null}
            <button type="button" className="sv-rail-focus-clear" onClick={onClearFocus}>
              Clear
            </button>
          </div>
          <p className="sv-rail-focus-name">{focusSummary.label || focusRegion}</p>
          <p className="sv-rail-focus-scope">
            Tape + digest filtered to this geography
            {typeof tapeCount === 'number' ? ` · ${tapeCount} row${tapeCount === 1 ? '' : 's'} on tape` : ''}
          </p>
          <dl className="sv-rail-focus-stats">
            <div>
              <dt>Nodes</dt>
              <dd>{focusSummary.count}</dd>
            </div>
            <div>
              <dt>Peak salience</dt>
              <dd title="Strongest tape salience among nodes in this lens">
                {focusSummary.maxRank ? Math.round(focusSummary.maxRank) : '—'}
              </dd>
            </div>
            <div>
              <dt>Severity</dt>
              <dd>
                <span className={focusSummary.urgencyClass || severityUrgencyClass(focusSummary.maxSev)}>
                  {focusSummary.maxSev || '—'}
                </span>
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      {summary ? (
        <div className="sv-rail-kpi-grid" role="status" aria-label="Digest summary">
          <div className="sv-rail-kpi">
            <span className="sv-rail-kpi-label">Tape</span>
            <span className="sv-rail-kpi-value">{summary.tape_events}</span>
            <span className="sv-rail-kpi-hint">live nodes</span>
          </div>
          <div className="sv-rail-kpi">
            <span className="sv-rail-kpi-label">Stories</span>
            <span className="sv-rail-kpi-value">{summary.multi_source_stories}</span>
            <span className="sv-rail-kpi-hint">multi-source</span>
          </div>
          <div className="sv-rail-kpi">
            <span className="sv-rail-kpi-label">Verify</span>
            <span className="sv-rail-kpi-value">{summary.corroborated_hits}</span>
            <span className="sv-rail-kpi-hint">corroborated</span>
          </div>
        </div>
      ) : (
        <div className="sv-rail-kpi-grid sv-rail-kpi-grid--empty" role="status">
          <p className="sv-rail-empty-summary">Summary metrics will populate after the first ingest pass.</p>
        </div>
      )}

      <Section title="Developing" kicker="Latest first" priority>
        <p className="sv-rail-section-hint">
          Each line is a storyline sorted by the newest material in the cluster, then salience. Salience is how strongly
          the terminal surfaces the cluster on the tape — not a market price.
        </p>
        <ul className="sv-rail-list">
          {developingStories.length ? (
            developingStories.map((s) => {
              const leadSev = idLookup?.get(String(s.top_event_id))?.severity;
              const pubCount = s.publisher_count != null ? s.publisher_count : 0;
              const trustLine =
                s.trust_band && String(s.trust_band).trim()
                  ? s.trust_band
                  : trustQualityPresentation(s.trust_max).label;
              return (
                <li key={s.story_id}>
                  <button
                    type="button"
                    className="sv-rail-row"
                    data-urgency={severityUrgencySlug(leadSev)}
                    onClick={() => onOpenEvent(s.top_event_id)}
                  >
                    <span className="sv-rail-row-title">{s.headline}</span>
                    <span className="sv-rail-row-meta">
                      {s.latest_at ? (
                        <>
                          <span className="sv-rail-row-fresh" title="Latest activity in this storyline">
                            {formatRecencyLabel(s.latest_at)}
                          </span>
                          <span aria-hidden> · </span>
                        </>
                      ) : null}
                      {s.item_count} update{s.item_count === 1 ? '' : 's'}
                      {pubCount > 0 ? (
                        <>
                          <span aria-hidden> · </span>
                          {pubCount} publisher{pubCount === 1 ? '' : 's'}
                        </>
                      ) : null}
                      <span aria-hidden> · </span>
                      salience {s.rank_score != null ? Math.round(s.rank_score) : '—'}
                    </span>
                    <span className="sv-rail-row-trust">{trustLine}</span>
                    {s.trade_line ? <span className="sv-rail-row-ledger">{s.trade_line}</span> : null}
                  </button>
                </li>
              );
            })
          ) : (
            <li className="sv-rail-empty">{lensActive ? 'No storylines in this sector' : 'No multi-source storylines yet'}</li>
          )}
        </ul>
      </Section>

      <Section title="High impact" kicker="Tape">
        <ul className="sv-rail-list">
          {highMarketImpact.length ? (
            highMarketImpact.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  className="sv-rail-row"
                  data-urgency={severityUrgencySlug(e.severity)}
                  onClick={() => onOpenEvent(e.id)}
                >
                  <span
                    className="sv-rail-row-eyebrow"
                    title="Estimated market attention score from the current tape"
                  >
                    Impact {e.market_impact_score != null ? Math.round(e.market_impact_score) : '—'}
                  </span>
                  <span className="sv-rail-row-title">{e.title}</span>
                </button>
              </li>
            ))
          ) : (
            <li className="sv-rail-empty">{lensActive ? 'No high-impact items in this lens' : 'No high market-impact hits'}</li>
          )}
        </ul>
      </Section>

      <Section title="Aviation" kicker="Ops">
        <ul className="sv-rail-list">
          {aviationAlerts.length ? (
            aviationAlerts.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  className="sv-rail-row"
                  data-urgency={severityUrgencySlug(e.severity)}
                  onClick={() => onOpenEvent(e.id)}
                >
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
                <button
                  type="button"
                  className="sv-rail-row"
                  data-urgency={severityUrgencySlug(e.severity)}
                  onClick={() => onOpenEvent(e.id)}
                >
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
                <button
                  type="button"
                  className="sv-rail-row"
                  data-urgency={severityUrgencySlug(e.severity)}
                  onClick={() => onOpenEvent(e.id)}
                >
                  <span className="sv-rail-row-eyebrow" title="Independent coverage overlap on this item">
                    Corr ×{e.corroboration_count || 0}
                  </span>
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
              const active = focusRegion && normalizeRegionKey(r.region) === normalizeRegionKey(focusRegion);
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

export default React.memo(IntelSidePanel);
