import React from 'react';

/** Quality grade — Aura dash chip styling */
export function GradeBadge({ grade }) {
  if (!grade) return <span className="aa--muted">—</span>;
  const g = String(grade).toUpperCase();
  let mod = 'bt-grade--b';
  if (g === 'A+' || g === 'A') mod = 'bt-grade--a';
  if (g === 'C') mod = 'bt-grade--c';
  if (g === 'D') mod = 'bt-grade--d';
  return <span className={`bt-grade-badge ${mod}`}>{grade}</span>;
}

export function TagPills({ tags, max = 12 }) {
  const list = Array.isArray(tags) ? tags : [];
  const shown = list.filter(Boolean).slice(0, max);
  const more = list.length - shown.length;
  if (!shown.length) return <span className="aa--muted">—</span>;
  return (
    <span className="bt-tag-row">
      {shown.map((t) => (
        <span key={t} className="bt-tag-pill">
          {t}
        </span>
      ))}
      {more > 0 && <span className="aa--dim bt-tag-more">+{more}</span>}
    </span>
  );
}

export function BacktestingEmptyState({ title, hint, action }) {
  return (
    <div className="aa-card aa-card--accent bt-empty-state">
      <h2 className="aa-section-title" style={{ marginBottom: 8 }}>
        {title}
      </h2>
      {hint && (
        <p className="aa--muted" style={{ margin: '0 0 16px', fontSize: '0.88rem', maxWidth: 520 }}>
          {hint}
        </p>
      )}
      {action}
    </div>
  );
}
