import { clamp } from '../../utils/traderSuite';
import { REPLAY_STATUSES } from './replayDefaults';

function parseR(val) {
  if (val == null) return null;
  const m = String(val).trim().match(/-?[\d.]+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function parseRatioField(s) {
  const r = parseR(s);
  return r;
}

function outcomeBucket(outcome) {
  const o = String(outcome || '').toLowerCase();
  if (/win|profit|green/.test(o)) return 'win';
  if (/loss|lose|red/.test(o)) return 'loss';
  if (/be|breakeven|flat|scratch/.test(o)) return 'be';
  return 'unknown';
}

function managementAvg(s) {
  const e = Number(s.entryTiming) || 0;
  const d = Number(s.discipline) || 0;
  const p = Number(s.patience) || 0;
  if (!e && !d && !p) return null;
  return (e + d + p) / 3;
}

function riskDefined(s) {
  return Boolean(
    String(s.stop || s.stopLoss || '').trim() && String(s.target || s.takeProfit || '').trim()
  );
}

function ruleBrokenHeuristic(s) {
  const t = `${s.ruleFollowed || ''} ${s.verdict || ''} ${s.whatIMissed || ''}`.toLowerCase();
  return /broke|broken|ignored|violated|revenge|overtrad|fomo|no plan/i.test(t);
}

/**
 * Replay Quality Score (0–100): how strong the underlying execution data looks — not how complete the user's review is.
 * @returns {{ score: number, signals: string[] }}
 */
export function computeReplayQualityScore(session) {
  const s = session || {};
  const signals = [];
  let acc = 52;

  const mg = managementAvg(s);
  if (mg != null) {
    const dev = mg - 5;
    acc += dev * 4.2;
    if (mg >= 7) signals.push('Solid self-rated execution metrics');
    if (mg <= 4) signals.push('Weak entry / discipline / patience stack');
  }

  if (riskDefined(s)) {
    acc += 6;
    signals.push('Risk framework was defined (stop + target)');
  } else {
    acc -= 10;
    signals.push('Incomplete risk definition on record');
  }

  const ob = outcomeBucket(s.outcome);
  const r = parseR(s.actualR || s.resultR || s.rResult);
  const missed = parseR(s.missedR) ?? 0;
  const mfe = parseRatioField(s.mfe);
  const mae = parseRatioField(s.mae);

  if (r != null) {
    if (r >= 1.5) {
      acc += 8;
      signals.push('Strong realised R');
    } else if (r <= -1) {
      acc -= 12;
      signals.push('Large realised draw on record');
    } else if (r > 0) acc += 3;
    else acc -= 4;
  } else if (ob === 'win') acc += 4;
  else if (ob === 'loss') acc -= 6;

  if (missed >= 0.75) {
    acc -= 8;
    signals.push('High missed-R — exit left money on table');
  } else if (missed >= 0.35) {
    acc -= 4;
    signals.push('Meaningful missed R relative to plan');
  }

  if (mfe != null && mae != null && mfe > 0) {
    if (mfe >= mae * 1.8) {
      acc += 4;
      signals.push('Favourable excursion shape (MFE vs MAE)');
    } else if (mae > mfe * 1.2) {
      acc -= 5;
      signals.push('Trade worked against you structurally (MAE heavy)');
    }
  }

  if (ruleBrokenHeuristic(s)) {
    acc -= 8;
    signals.push('Signals of rule lapse or emotional slip in notes');
  }

  const bias = String(s.biasAtTime || '').trim();
  const insight = String(s.insight || '').trim();
  if (bias && insight.length > 40) {
    acc += 3;
    signals.push('Rich bias + written insight');
  }

  const score = clamp(Math.round(acc), 0, 100);
  const trimmed = signals.slice(0, 4);
  return { score, signals: trimmed.length ? trimmed : ['Limited fields on file — score is a soft read'] };
}

/**
 * Review Completeness (0–100): depth of the user's replay work — distinct from trade quality.
 * @returns {{ score: number, signals: string[], missingHints: string[] }}
 */
export function computeReviewCompletenessScore(session) {
  const s = session || {};
  const markers = Array.isArray(s.replayMarkers) ? s.replayMarkers : [];
  const markerCount = markers.length || 1;
  const step = Number(s.replayStep) || 0;
  const progressed = markerCount <= 1 ? 1 : step / Math.max(1, markerCount - 1);

  let pts = 0;
  const maxPts = 18;
  const missingHints = [];
  const signals = [];

  const add = (cond, weight, hint, okMsg) => {
    if (cond) {
      pts += weight;
      if (okMsg) signals.push(okMsg);
    } else if (hint) missingHints.push(hint);
  };

  add(s.notes?.trim(), 1.5, 'Add session notes', null);
  add(s.whatISaw?.trim(), 1.5, 'Capture what you saw', null);
  add(s.whatIMissed?.trim(), 2, 'Note what you missed', null);
  add(s.emotionalState?.trim(), 1.5, 'Label emotional state', null);
  add(s.ruleFollowed?.trim(), 1.5, 'Record rule followed / broken', null);
  add(s.improvementPlan?.trim(), 2, 'Write one improvement you will apply', null);
  add(s.lessonSummary?.trim() || s.insight?.trim(), 2, 'Add a one-line lesson', null);
  add(s.reviewBiggestMistake?.trim(), 1, 'Biggest mistake (finish block)', null);
  add(s.reviewBestMoment?.trim(), 1, 'Best execution moment (finish block)', null);

  if (s.replayStatus === REPLAY_STATUSES.completed) {
    pts += 3;
    signals.push('Replay marked complete');
  } else {
    missingHints.push('Finish replay to lock the review arc');
  }

  if (progressed >= 0.85) {
    pts += 2;
    signals.push('Walked most markers');
  } else if (progressed < 0.35) {
    missingHints.push('Step through more markers before closing');
  } else {
    pts += 1;
  }

  if (String(s.keyDrivers || '').trim().length > 30 || String(s.verdict || '').trim().length > 20) {
    pts += 1;
    signals.push('Written thesis / verdict present');
  }

  const score = clamp(Math.round((pts / maxPts) * 100), 0, 100);
  return {
    score,
    signals: signals.slice(0, 4),
    missingHints: missingHints.slice(0, 5),
  };
}

/** @deprecated use computeReviewCompletenessScore — kept for imports expecting single number */
export function replayCompletenessScore(session) {
  return computeReviewCompletenessScore(session).score;
}
