import React from 'react';
import { getMetricDefinition } from './metricDefinitions';

/**
 * Lightweight (i) control; definition panel on hover/focus. Keeps chrome minimal.
 */
export default function MetricTooltip({ metricId, className = '' }) {
  const d = getMetricDefinition(metricId);
  if (!d) return null;

  return (
    <span className={`tp-metric-tip ${className}`.trim()}>
      <button type="button" className="tp-metric-tip__btn" aria-label={`Definition: ${d.title}`} tabIndex={0}>
        i
      </button>
      <span className="tp-metric-tip__panel" role="tooltip">
        <strong className="tp-metric-tip__title">{d.title}</strong>
        {d.measures ? <p className="tp-metric-tip__line">{d.measures}</p> : null}
        {d.calculation ? (
          <p className="tp-metric-tip__line tp-metric-tip__line--muted">
            <span className="tp-metric-tip__k">How it is calculated</span>
            {d.calculation}
          </p>
        ) : null}
        {d.good ? (
          <p className="tp-metric-tip__line tp-metric-tip__line--hint">
            <span className="tp-metric-tip__k">Reading it</span>
            {d.good}
          </p>
        ) : null}
      </span>
    </span>
  );
}

/** Inline label + optional tooltip */
export function MetricLabel({ metricId, children, className = '' }) {
  return (
    <span className={`tp-metric-label ${className}`.trim()}>
      {children}
      {metricId ? <MetricTooltip metricId={metricId} /> : null}
    </span>
  );
}
