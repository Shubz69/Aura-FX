import React from 'react';

function confidenceClass(c) {
  if (c === 'high') return 'sv-mw-conf--high';
  if (c === 'medium') return 'sv-mw-conf--med';
  return 'sv-mw-conf--low';
}

export default function MarketWatchStrip({ narrative, items }) {
  if (narrative && narrative.length) {
    return (
      <div className="sv-strip sv-strip--narrative" role="region" aria-label="Market watch narrative">
        <span className="sv-strip-label">Market watch</span>
        <div className="sv-strip-narrative-rows">
          {narrative.map((g) => (
            <div key={g.groupId} className="sv-mw-row">
              <div className="sv-mw-row-head">
                <strong className="sv-mw-label">{g.label}</strong>
                <span className={`sv-mw-conf ${confidenceClass(g.confidence)}`}>{g.confidence}</span>
              </div>
              <p className="sv-mw-impl">{g.implication}</p>
              {g.reasons?.length ? (
                <ul className="sv-mw-reasons">
                  {g.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!items || !items.length) {
    return (
      <div className="sv-strip sv-strip--empty">
        <span className="sv-strip-label">Market watch</span>
        <span className="sv-strip-muted">Awaiting flow signals from the current tape</span>
      </div>
    );
  }
  return (
    <div className="sv-strip" role="region" aria-label="Market watch impact">
      <span className="sv-strip-label">Market watch</span>
      <div className="sv-strip-chips">
        {items.map((x) => (
          <span key={x.symbol} className="sv-strip-chip" title={`Implied attention: ${x.flowScore}`}>
            <strong>{x.symbol}</strong>
            <span className="sv-strip-score">{x.flowScore}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
