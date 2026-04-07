import React from 'react';

export default function ReplayTimeline({ markers, activeIndex, onSelect, compact }) {
  if (!markers?.length) return null;

  if (compact) {
    return (
      <div className="aura-tr-timeline aura-tr-timeline--vertical" role="list">
        {markers.map((m, i) => {
          const done = i < activeIndex;
          const active = i === activeIndex;
          return (
            <button
              key={m.id || i}
              type="button"
              role="listitem"
              aria-current={active ? 'step' : undefined}
              className={`aura-tr-tl-node${active ? ' aura-tr-tl-node--active' : ''}${done ? ' aura-tr-tl-node--done' : ''}`}
              title={m.title || m.label || `Go to step ${i + 1}`}
              onClick={() => onSelect(i)}
            >
              <span className="aura-tr-tl-node__idx">{i + 1}</span>
              <span className="aura-tr-tl-node__label">{m.label || m.title || `Step ${i + 1}`}</span>
              <span className="aura-tr-tl-node__time">{m.timestampLabel || '—'}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="aura-tr-timeline aura-tr-timeline--horizontal" role="list">
      <div className="aura-tr-timeline-track" />
      {markers.map((m, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        return (
          <button
            key={m.id || i}
            type="button"
            role="listitem"
            aria-current={active ? 'step' : undefined}
            title={m.title || m.label || `Step ${i + 1}`}
            className={`aura-tr-tl-dot${active ? ' aura-tr-tl-dot--active' : ''}${done ? ' aura-tr-tl-dot--done' : ''}`}
            onClick={() => onSelect(i)}
          >
            <span className="aura-tr-tl-dot__num">{i + 1}</span>
            <span className="aura-tr-tl-dot__lbl">{m.label || m.title || `Step ${i + 1}`}</span>
          </button>
        );
      })}
    </div>
  );
}
