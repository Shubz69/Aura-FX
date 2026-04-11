import React from 'react';

export default function EventDrawer({ event, story, related, onClose, loading, onOpenRelatedId }) {
  if (!event && !loading) return null;

  return (
    <div className="sv-drawer-backdrop" onClick={onClose} role="presentation">
      <aside
        className="sv-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Event detail"
      >
        <div className="sv-drawer-chrome">
          <div className="sv-drawer-chrome-bar" aria-hidden />
          <button type="button" className="sv-drawer-close" onClick={onClose} aria-label="Close">
            <span className="sv-drawer-close-icon" aria-hidden />
          </button>
        </div>
        <div className="sv-drawer-inner">
          {loading && (
            <div className="sv-drawer-loading" aria-busy="true">
              <div className="sv-drawer-loading-pulse" />
              <p>Retrieving intelligence…</p>
            </div>
          )}
          {!loading && event && (
            <>
              <header className="sv-drawer-hero">
                <p className="sv-drawer-source">{event.source}</p>
                <h2 className="sv-drawer-title">{event.title}</h2>
              </header>
              <div className="sv-drawer-matters-wrap">
                <p className="sv-drawer-matters-label">Why it matters</p>
                <p className="sv-drawer-matters">{event.why_it_matters}</p>
              </div>
              <div className="sv-drawer-scores">
                {event.rank_score != null ? (
                  <span className="sv-drawer-chip sv-drawer-chip--rank">
                    Rank {Math.round(event.rank_score)}
                  </span>
                ) : null}
                {event.trust_score != null ? (
                  <span className="sv-drawer-chip">Trust {Math.round(event.trust_score)}</span>
                ) : null}
                {event.risk_bias && event.risk_bias !== 'neutral' ? (
                  <span className={`sv-drawer-chip sv-drawer-chip--bias-${event.risk_bias}`}>
                    {String(event.risk_bias).replace('_', ' ')}
                  </span>
                ) : null}
                {event.corroboration_count > 0 ? (
                  <span className="sv-drawer-chip sv-drawer-chip--corr">
                    Corroborated ×{event.corroboration_count}
                  </span>
                ) : null}
                {event.story_id ? <span className="sv-drawer-chip sv-drawer-chip--story">Storyline</span> : null}
              </div>
              {story && story.siblings?.length > 0 ? (
                <section className="sv-drawer-section sv-drawer-story">
                  <h3>Developing story</h3>
                  <p className="sv-drawer-story-headline">{story.headline}</p>
                  <p className="sv-drawer-story-meta">{story.event_count} linked items</p>
                  <ul className="sv-story-siblings">
                    {story.siblings.map((s) => (
                      <li key={s.id}>
                        <button type="button" className="sv-story-sib-btn" onClick={() => onOpenRelatedId?.(s.id)}>
                          {s.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              <dl className="sv-drawer-meta">
                <div>
                  <dt>Type</dt>
                  <dd>{event.event_type}</dd>
                </div>
                <div>
                  <dt>Severity</dt>
                  <dd>{event.severity}</dd>
                </div>
                <div>
                  <dt>Verification</dt>
                  <dd>{event.verification_state}</dd>
                </div>
                <div>
                  <dt>Published</dt>
                  <dd>{event.published_at || '—'}</dd>
                </div>
                <div>
                  <dt>Detected</dt>
                  <dd>{event.detected_at || '—'}</dd>
                </div>
                <div>
                  <dt>Region</dt>
                  <dd>{event.region || (event.countries || []).join(', ') || '—'}</dd>
                </div>
              </dl>
              {event.impacted_markets && event.impacted_markets.length > 0 && (
                <section className="sv-drawer-section">
                  <h3>Impacted assets</h3>
                  <ul className="sv-asset-list">
                    {event.impacted_markets.map((m) => (
                      <li key={m.symbol}>
                        <strong>{m.symbol}</strong>
                        <span className="sv-asset-score">{Math.round(m.score)}</span>
                        {m.rationale && m.rationale[0] && (
                          <span className="sv-asset-rationale">{m.rationale[0]}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <section className="sv-drawer-section">
                <h3>Source</h3>
                <a href={event.url} target="_blank" rel="noopener noreferrer" className="sv-drawer-link">
                  Open original
                </a>
              </section>
              {related && related.length > 0 && (
                <section className="sv-drawer-section">
                  <h3>Related</h3>
                  <ul className="sv-related-list">
                    {related.map((r) => (
                      <li key={r.id}>
                        <button type="button" className="sv-related-btn" onClick={() => onOpenRelatedId?.(r.id)}>
                          {r.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
