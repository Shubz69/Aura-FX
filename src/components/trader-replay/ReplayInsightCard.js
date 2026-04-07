import React from 'react';

export default function ReplayInsightCard({ marker, showLesson, sessionInsight, coaching }) {
  if (!marker) {
    return (
      <section className="trader-suite-panel aura-tr-insight">
        <div className="trader-suite-kicker">Step insight</div>
        <p className="aura-tr-muted">Select a replay session to begin walking markers.</p>
      </section>
    );
  }

  const metaParts = [];
  if (marker.reviewCategory) metaParts.push(marker.reviewCategory.replace(/_/g, ' '));
  if (marker.coachingTone && marker.coachingTone !== 'neutral') metaParts.push(marker.coachingTone);
  if (marker.severity != null && marker.severity > 1) metaParts.push(`severity ${marker.severity}`);
  if (marker.qualityTag) metaParts.push(marker.qualityTag.replace(/_/g, ' '));

  return (
    <section className="trader-suite-panel aura-tr-insight">
      <div className="aura-tr-insight-head">
        <div className="trader-suite-kicker">Step insight</div>
        <span className={`aura-tr-badge aura-tr-badge--${marker.type || 'lesson'}`}>{marker.type || 'note'}</span>
      </div>
      {metaParts.length ? (
        <div className="aura-tr-insight-meta">{metaParts.join(' · ')}</div>
      ) : null}
      <div className="aura-tr-insight-time">{marker.timestampLabel ? `Time focus · ${marker.timestampLabel}` : 'Time focus · session marker'}</div>
      <h3 className="aura-tr-insight-title">{marker.title || marker.label}</h3>
      <p className="aura-tr-insight-body">{marker.body || sessionInsight || 'Add context in the marker body when you author replays.'}</p>
      {showLesson && marker.lesson ? (
        <div className="aura-tr-callout">
          <strong>Coach note</strong>
          <p>{marker.lesson}</p>
        </div>
      ) : null}
      {coaching?.mainLesson && coaching.mainLesson !== '—' && marker.reviewCategory === 'lesson' ? (
        <div className="aura-tr-callout aura-tr-callout--soft">
          <strong>Session lesson</strong>
          <p>{coaching.mainLesson}</p>
        </div>
      ) : null}
      <div className="aura-tr-insight-foot">
        <span className="aura-tr-muted">What you should have noticed</span>
        <p>{marker.body ? 'Structure, tempo, and whether liquidity was honestly repaired — not just spiked.' : 'Define what evidence you require before risk increases.'}</p>
        <span className="aura-tr-muted">Why it mattered</span>
        <p>{marker.scoreImpact != null ? `Marker impact weight · ${marker.scoreImpact}` : 'Small decisions compound into session quality and long-run expectancy.'}</p>
        {marker.confidence != null ? (
          <p className="aura-tr-confidence">Conviction at step · {marker.confidence}%</p>
        ) : null}
        {marker.tags?.length ? (
          <div className="aura-tr-tags">
            {marker.tags.map((t) => (
              <span key={t} className="aura-tr-chip">{t}</span>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
