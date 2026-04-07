import React from 'react';
import { Link } from 'react-router-dom';
import { CHOOSE_PLAN_PATH } from '../../lib/trader-replay/replayEntitlements';

/** Tasteful upgrade line — Aura tone, not a banner farm. */
export default function ReplayPremiumNudge({ children, tierLabel = 'Premium' }) {
  return (
    <p className="aura-tr-premium-nudge">
      <Link to={CHOOSE_PLAN_PATH} className="aura-tr-premium-nudge-link">
        {tierLabel}
      </Link>
      <span className="aura-tr-premium-nudge-copy">{children}</span>
    </p>
  );
}
