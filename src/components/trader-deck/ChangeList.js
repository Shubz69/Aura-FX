import React from 'react';

function isTimelineShape(items) {
  const first = items[0];
  return first && typeof first === 'object' && (first.whatChanged || first.timeLabel);
}

export default function ChangeList({ items = [], variant = 'auto' }) {
  if (!items.length) {
    return (
      <ul className="td-mi-bullets">
        <li className="td-mi-list-empty">No themes yet</li>
      </ul>
    );
  }
  const useTimeline = variant === 'timeline' || (variant === 'auto' && isTimelineShape(items));
  if (useTimeline) {
    return (
      <ol className="mo-change-timeline">
        {items.map((row, i) => {
          const r = typeof row === 'object' && row ? row : { whatChanged: String(row || '') };
          return (
            <li key={i} className="mo-change-timeline__item">
              <span className="mo-change-timeline__time">{r.timeLabel || `T${i + 1}`}</span>
              <div className="mo-change-timeline__body">
                <p className="mo-change-timeline__what">{r.whatChanged || r.title || '—'}</p>
                {Array.isArray(r.assetsAffected) && r.assetsAffected.length > 0 ? (
                  <p className="mo-change-timeline__assets">
                    <span className="mo-change-timeline__k">Affected</span>
                    {r.assetsAffected.join(' · ')}
                  </p>
                ) : null}
                {r.whyItMatters ? (
                  <p className="mo-change-timeline__why">
                    <span className="mo-change-timeline__k">Why it matters</span>
                    {r.whyItMatters}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    );
  }
  return (
    <ul className="td-mi-bullets">
      {items.map((item, i) => (
        <li key={i} className="td-mi-bullet-item">
          {typeof item === 'string' ? item : item.title || item.description || '—'}
        </li>
      ))}
    </ul>
  );
}
