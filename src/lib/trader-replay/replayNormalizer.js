import { clamp } from '../../utils/traderSuite';
import {
  DEMO_REPLAY_TEMPLATE,
  emptySessionDraft,
  REPLAY_STATUSES,
  clampPlaybackSpeedMs,
} from './replayDefaults';
import { buildFallbackMarkersFromSession, normalizeMarkerOrder } from './replayMarkerFactory';

function buildBaseSession(session) {
  const hasPersistedId = Boolean(session.id);
  const isDemoLocal = Boolean(session._isDemoLocal);
  if (hasPersistedId) return { ...emptySessionDraft(), ...session };
  if (isDemoLocal) return { ...emptySessionDraft(), ...DEMO_REPLAY_TEMPLATE, ...session };
  return { ...emptySessionDraft(), ...session };
}

function coalesceMarkers(session) {
  const raw = session.replayMarkers;
  if (Array.isArray(raw) && raw.length > 0) {
    const norm = normalizeMarkerOrder(raw);
    if (norm.length > 0) return norm;
  }
  return buildFallbackMarkersFromSession(session);
}

/**
 * @param {object} session — API row or local draft
 * @param {{ forApi?: boolean }} opts — strip local-only flags for saves
 */
export function normalizeReplay(session = {}, opts = {}) {
  const { forApi = false } = opts;
  const base = buildBaseSession(session);

  const markers = coalesceMarkers(base);
  const maxStep = Math.max(0, markers.length - 1);
  const step = clamp(Number(base.replayStep) || 0, 0, maxStep);

  const next = {
    ...base,
    replayMarkers: markers,
    replayStep: step,
    entryTiming: Number(base.entryTiming) || 0,
    discipline: Number(base.discipline) || 0,
    patience: Number(base.patience) || 0,
    playbackSpeedMs: clampPlaybackSpeedMs(base.playbackSpeedMs),
    replayStatus: base.replayStatus || REPLAY_STATUSES.draft,
    mode: base.mode || 'trade',
    autoFocusNotes: base.autoFocusNotes !== false,
    showLessons: base.showLessons !== false,
    learningExample: Boolean(base.learningExample),
    learningExampleKind:
      base.learningExample &&
      (base.learningExampleKind === 'model' || base.learningExampleKind === 'caution')
        ? base.learningExampleKind
        : null,
  };

  if (forApi) {
    delete next._isDemoLocal;
    delete next.playbookLink;
    delete next.labLink;
    delete next.resultR;
    delete next.stopLoss;
    delete next.takeProfit;
    delete next.id;
    delete next.userId;
    delete next.createdAt;
    delete next.updatedAt;
  }

  return next;
}

export function sessionFingerprint(session) {
  const s = normalizeReplay(session);
  const { _isDemoLocal, ...rest } = s;
  return JSON.stringify(rest);
}

export {
  computeReplayQualityScore,
  computeReviewCompletenessScore,
  replayCompletenessScore,
} from './replayScoreEngine';
