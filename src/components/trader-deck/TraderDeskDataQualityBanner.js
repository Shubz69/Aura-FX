import React from 'react';

const COPY = {
  cached: {
    tone: 'info',
    title: 'Cached desk snapshot',
    body: 'Showing a recently cached Trader Deck response. Refresh the page or use “live” refresh where available for the newest bundle.',
  },
  pipeline: {
    tone: 'info',
    title: 'Stored pipeline snapshot',
    body: 'Served from the server’s stored intelligence snapshot; it may lag behind live feeds.',
  },
  fallback: {
    tone: 'warn',
    title: 'Desk engine unavailable',
    body: 'Live intelligence could not be built — placeholder desk content is shown. Check API keys, provider limits, and server logs.',
  },
  client_seed: {
    tone: 'warn',
    title: 'Offline demo content',
    body: 'Could not reach the Trader Desk API from this browser — showing bundled demo data only.',
  },
  local_override: {
    tone: 'info',
    title: 'Showing your saved desk layout',
    body:
      'This dashboard reflects a layout you saved locally (admin edit). Use “Reload live desk” below to discard it and pull fresh server intelligence.',
  },
};

/**
 * Non-blocking banner when desk intelligence is not a fresh live engine response.
 * @param {{ dataQuality?: string, degradedReason?: string|null }} props
 */
export default function TraderDeskDataQualityBanner({ dataQuality = 'live', degradedReason = null }) {
  const q = dataQuality || 'live';
  if (q === 'live') return null;
  const cfg = COPY[q] || {
    tone: 'info',
    title: 'Desk data notice',
    body: `Quality flag: ${q}`,
  };
  const hint = degradedReason && String(degradedReason).trim() ? String(degradedReason).trim() : null;
  return (
    <div
      className={`td-mi-dq-banner td-mi-dq-banner--${cfg.tone}`}
      role="status"
      aria-live="polite"
    >
      <strong className="td-mi-dq-banner__title">{cfg.title}</strong>
      <p className="td-mi-dq-banner__body">{cfg.body}</p>
      {hint ? (
        <p className="td-mi-dq-banner__hint" title={hint}>
          {hint.length > 160 ? `${hint.slice(0, 157)}…` : hint}
        </p>
      ) : null}
    </div>
  );
}
