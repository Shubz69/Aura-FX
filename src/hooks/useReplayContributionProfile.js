import { useState, useEffect, useMemo } from 'react';
import Api from '../services/Api';
import { normalizeReplay } from '../lib/trader-replay/replayNormalizer';
import { computeReplayHabitStats } from '../lib/trader-replay/replayHabit';
import {
  buildReplayContributionProfile,
  getCompactReplayScoreSurfaceSummary,
} from '../lib/trader-replay/replayContributionEngine';
import { buildReplayNarrativeBridgeForUi } from '../lib/trader-replay/replayNarrativeBridge';

let cache = { at: 0, profile: null, normalizedSessions: [], habitStats: null };
let inflight = null;
const TTL_MS = 90 * 1000;

function loadReplayProfile() {
  const now = Date.now();
  if (cache.profile && now - cache.at < TTL_MS) {
    return Promise.resolve({
      profile: cache.profile,
      normalizedSessions: cache.normalizedSessions,
      habitStats: cache.habitStats,
    });
  }
  if (inflight) return inflight;
  inflight = Api.getTraderReplaySessions()
    .then((res) => {
      const rs = res?.data?.sessions ?? res?.data?.data;
      const sessions = Array.isArray(rs) ? rs : [];
      const normalizedSessions = sessions.map(normalizeReplay);
      const habitStats = computeReplayHabitStats(normalizedSessions);
      const profile = buildReplayContributionProfile(normalizedSessions, habitStats);
      cache = { at: Date.now(), profile, normalizedSessions, habitStats };
      inflight = null;
      return { profile, normalizedSessions, habitStats };
    })
    .catch(() => {
      const normalizedSessions = [];
      const habitStats = computeReplayHabitStats(normalizedSessions);
      const profile = buildReplayContributionProfile(normalizedSessions, habitStats);
      cache = { at: Date.now(), profile, normalizedSessions, habitStats };
      inflight = null;
      return { profile, normalizedSessions, habitStats };
    });
  return inflight;
}

/**
 * Shared replay contribution payload + compact score-surface summary + narrative bridge.
 * Cached briefly so Overview + Psychology tabs do not double-fetch.
 */
export function useReplayContributionProfile() {
  const [bundle, setBundle] = useState({
    profile: null,
    normalizedSessions: [],
    habitStats: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    loadReplayProfile().then((b) => {
      if (!cancelled) {
        setBundle({ ...b, loading: false });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const scoreSurface = useMemo(
    () => (bundle.profile ? getCompactReplayScoreSurfaceSummary(bundle.profile) : { visible: false }),
    [bundle.profile]
  );

  const narrativeBridge = useMemo(
    () =>
      buildReplayNarrativeBridgeForUi(
        bundle.normalizedSessions,
        bundle.habitStats,
        bundle.profile
      ),
    [bundle.normalizedSessions, bundle.habitStats, bundle.profile]
  );

  return {
    profile: bundle.profile,
    loading: bundle.loading,
    scoreSurface,
    narrativeBridge,
  };
}
