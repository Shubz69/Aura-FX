import React from 'react';
import {
  eventFreshnessTimestamp,
  formatIsoDisplayFriendly,
  salienceHint,
  trustQualityPresentation,
  verificationPresentation,
} from './surveillancePresentation';
import { formatRecencyLabel } from './surveillanceRegionUtils';

const VERIFICATION_LABEL = {
  unverified: 'Single publisher',
  official_source: 'Official publisher feed',
  corroborated: 'Cross-publisher corroboration',
};

function verificationCopy(state) {
  const s = String(state || '').toLowerCase();
  if (VERIFICATION_LABEL[s]) return VERIFICATION_LABEL[s];
  return verificationPresentation(state);
}

function publisherKindLabel(sourceType) {
  const t = String(sourceType || '').toLowerCase();
  if (t === 'official_html' || t === 'official') return 'Public institutional statement';
  if (t === 'wire' || t === 'newswire') return 'Institutional newswire';
  return 'Published report';
}

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
                <div className="sv-drawer-provenance">
                  <p className="sv-drawer-trust-tier">{trustQualityPresentation(event.trust_score).label}</p>
                  <p className="sv-drawer-source-channel">{publisherKindLabel(event.source_type)}</p>
                  {eventFreshnessTimestamp(event) ? (
                    <p className="sv-drawer-recency" title="Most recent timestamp on this intelligence row">
                      Updated {formatRecencyLabel(eventFreshnessTimestamp(event))}
                    </p>
                  ) : null}
                </div>
                <h2 className="sv-drawer-title">{event.title}</h2>
              </header>
              <div className="sv-drawer-matters-wrap">
                <p className="sv-drawer-matters-label">Why it matters</p>
                <p className="sv-drawer-matters">{event.why_it_matters}</p>
              </div>
              <div className="sv-drawer-scores" aria-label="Salience, sourcing, and risk">
                {event.rank_score != null ? (
                  <span className="sv-drawer-chip sv-drawer-chip--rank" title={salienceHint()}>
                    Salience {Math.round(event.rank_score)}
                  </span>
                ) : null}
                {event.trust_score != null ? (
                  <span
                    className="sv-drawer-chip sv-drawer-chip--trust"
                    title={trustQualityPresentation(event.trust_score).detail}
                  >
                    {trustQualityPresentation(event.trust_score).short}
                  </span>
                ) : null}
                {event.risk_bias && event.risk_bias !== 'neutral' ? (
                  <span
                    className={`sv-drawer-chip sv-drawer-chip--bias-${event.risk_bias}`}
                    title="Implied lean from impacted markets"
                  >
                    Risk: {String(event.risk_bias).replace(/_/g, ' ')}
                  </span>
                ) : null}
                {event.corroboration_count > 0 ? (
                  <span className="sv-drawer-chip sv-drawer-chip--corr" title="Other publishers on the same storyline">
                    Corroboration ×{event.corroboration_count}
                  </span>
                ) : null}
                {event.story_id ? (
                  <span className="sv-drawer-chip sv-drawer-chip--story" title="Linked narrative cluster">
                    Storyline
                  </span>
                ) : null}
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
                  <dd title="Editorial urgency, 1 (routine) to 5 (critical)">{event.severity}</dd>
                </div>
                <div>
                  <dt>Verification</dt>
                  <dd>{verificationCopy(event.verification_state)}</dd>
                </div>
                <div>
                  <dt>Published</dt>
                  <dd>{formatIsoDisplayFriendly(event.published_at)}</dd>
                </div>
                <div>
                  <dt>Detected</dt>
                  <dd>{formatIsoDisplayFriendly(event.detected_at)}</dd>
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
                <h3>Original publisher</h3>
                <p className="sv-drawer-source-note">
                  Open the publisher&apos;s page to verify wording, timing, and primary attribution.
                </p>
                <a href={event.url} target="_blank" rel="noopener noreferrer" className="sv-drawer-link">
                  Open source page
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
