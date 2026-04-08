/**
 * Centralized Trader Replay → Aura tool handoffs (query params + compact summaries).
 * Destinations may ignore unknown keys; values are clipped to keep URLs safe.
 */
import { normalizeReplay } from './replayNormalizer';
import { computeReplayQualityScore, computeReviewCompletenessScore } from './replayScoreEngine';

export const TR_HANDOFF = {
  origin: 'trFromReplay',
  originValue: '1',
  sessionId: 'replaySessionId',
  returnToReplay: 'returnToReplay',
  journalTab: 'trJournalTab',
  detailTab: 'trDetailTab',
  checklistTab: 'tvChecklistTab',
  scenarioType: 'scenarioType',
  missedR: 'replayMissedR',
};

const CLIP = {
  short: 80,
  med: 160,
  long: 280,
  lesson: 400,
};

function clip(s, max) {
  const t = String(s ?? '').trim();
  if (!t) return '';
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** Map chart interval to Validator checklist tab ids. */
export function inferValidatorChecklistTab(session) {
  const s = normalizeReplay(session);
  const iv = String(s.interval || '').trim();
  if (iv === 'D' || iv === 'W' || Number(iv) >= 240) return 'swing';
  const n = Number(iv);
  if (Number.isFinite(n) && n > 0 && n <= 5) return 'scalp';
  if (Number.isFinite(n) && n > 5 && n < 240) return 'intraDay';
  return 'intraDay';
}

/**
 * Portable summary for cards, CV panels, and future surfaces.
 * @param {object} coaching — from deriveCoaching(session)
 * @returns {object}
 */
export function buildCompactReplaySummary(session, coaching) {
  const s = normalizeReplay(session);
  const c = coaching;
  const { score: replayQuality } = computeReplayQualityScore(s);
  const { score: reviewCompleteness } = computeReviewCompletenessScore(s);
  const date = s.replayDate || s.sourceDate || '';
  return {
    replaySessionId: s.id || null,
    symbol: s.asset || s.symbol || '',
    date: String(date).slice(0, 10),
    status: s.replayStatus || '',
    mainLesson: c?.mainLesson && c.mainLesson !== '—' ? c.mainLesson : '',
    biggestMistake: c?.biggestMistake && c.biggestMistake !== '—' ? c.biggestMistake : '',
    replayQuality,
    reviewCompleteness,
    learningExample: Boolean(s.learningExample),
    learningExampleKind: s.learningExampleKind || null,
    nextBestAction: (c?.nextSessionFocus || '').slice(0, 200),
    bias: s.biasAtTime || '',
    verdict: clip(s.verdict, 200),
  };
}

/**
 * Build integration query params (stable names; backward-compatible keys preserved).
 * @param {object} options
 * @param {string} [options.destination] — 'journal' | 'deckJournal' | 'playbook' | 'validator' | 'checklist' | 'lab' | 'generic'
 * @param {string} [options.returnPath] — path+query to return to Trader Replay (encoded as single param)
 * @param {boolean} [options.openReviewTab] — Playbook: open Refine tab when deep-linking
 */
export function buildReplayIntegrationParams(session, coaching, options = {}) {
  const s = normalizeReplay(session);
  const c = coaching || {};
  const { score: replayQuality } = computeReplayQualityScore(s);
  const { score: reviewCompleteness } = computeReviewCompletenessScore(s);
  const { destination = 'generic', returnPath, openReviewTab } = options;

  const p = new URLSearchParams();

  p.set(TR_HANDOFF.origin, TR_HANDOFF.originValue);
  if (s.id) p.set('replaySessionId', String(s.id));

  const planText = clip(s.improvementPlan || c.nextSessionFocus, CLIP.lesson);
  if (planText) p.set('improvementPlan', planText);
  if (c.nextSessionFocus && clip(c.nextSessionFocus, CLIP.lesson) !== planText) {
    p.set('nextSessionFocus', clip(c.nextSessionFocus, CLIP.lesson));
  }

  if (c.mainLesson && c.mainLesson !== '—') p.set('mainLesson', clip(c.mainLesson, CLIP.lesson));
  if (c.biggestMistake && c.biggestMistake !== '—') p.set('biggestMistake', clip(c.biggestMistake, CLIP.lesson));
  if (s.lessonSummary) p.set('replayLesson', clip(s.lessonSummary, CLIP.long));

  if (s.asset || s.symbol) p.set('symbol', clip(s.asset || s.symbol, 32));
  if (s.biasAtTime) p.set('bias', clip(s.biasAtTime, CLIP.short));
  if (s.verdict) p.set('verdict', clip(s.verdict, 200));
  const d = s.replayDate || s.sourceDate;
  if (d) p.set('replayDate', String(d).slice(0, 10));

  p.set('replayQuality', String(replayQuality));
  p.set('reviewCompleteness', String(reviewCompleteness));

  if (s.emotionalState) p.set('emotionalState', clip(s.emotionalState, 120));
  if (s.whatISaw) p.set('whatISaw', clip(s.whatISaw, CLIP.long));
  if (s.whatIMissed) p.set('whatIMissed', clip(s.whatIMissed, CLIP.long));

  if (s.linkedPlaybook) p.set('replayHint', clip(s.linkedPlaybook, 120));
  if (s.scenarioType) p.set(TR_HANDOFF.scenarioType, clip(s.scenarioType, 80));
  if (s.missedR != null && String(s.missedR).trim()) p.set(TR_HANDOFF.missedR, clip(s.missedR, 32));

  if (c.executionNote) p.set('executionNote', clip(c.executionNote, CLIP.med));
  if (c.disciplineNote) p.set('disciplineNote', clip(c.disciplineNote, CLIP.med));
  if (c.riskNote) p.set('riskNote', clip(c.riskNote, CLIP.med));

  if (s.learningExample) p.set('learningExample', '1');
  if (s.learningExampleKind === 'model' || s.learningExampleKind === 'caution') {
    p.set('learningExampleKind', s.learningExampleKind);
  }

  if (destination === 'journal') {
    p.set(TR_HANDOFF.journalTab, 'reflection');
  }

  if (destination === 'playbook' && openReviewTab) {
    p.set(TR_HANDOFF.detailTab, 'review');
  }

  if (destination === 'checklist') {
    p.set(TR_HANDOFF.checklistTab, inferValidatorChecklistTab(s));
  }

  if (returnPath && String(returnPath).trim()) {
    p.set(TR_HANDOFF.returnToReplay, clip(returnPath, 500));
  }

  return p;
}

/** Merge replay params onto an internal route (preserves existing query). */
export function mergeReplayDestination(href, session, coaching, options = {}) {
  const integration = buildReplayIntegrationParams(session, coaching, options);
  const [path, exist] = href.split('?');
  const m = new URLSearchParams(exist || '');
  integration.forEach((v, k) => {
    if (v != null && String(v) !== '') m.set(k, String(v));
  });
  const q = m.toString();
  return q ? `${path}?${q}` : path;
}

/** Default return path for “back to replay” from Journal / Playbook / Validator. */
export function buildDefaultReturnToReplayPath(session) {
  const s = normalizeReplay(session);
  if (!s.id) return '';
  return `/aura-analysis/dashboard/trader-replay?open=${encodeURIComponent(s.id)}`;
}

/**
 * Build reflection draft for Journal daily notes from current URLSearchParams.
 * @param {URLSearchParams} sp
 */
export function buildJournalDraftFromSearchParams(sp) {
  const lines = [];
  const sym = sp.get('symbol');
  const rd = sp.get('replayDate');
  if (sym || rd) {
    lines.push(`Trader Replay reflection${sym ? ` · ${sym}` : ''}${rd ? ` · ${rd}` : ''}`);
  }
  const add = (label, key) => {
    const v = sp.get(key);
    if (v) lines.push(`${label}: ${v}`);
  };
  add('Lesson', 'mainLesson');
  add('Mistake to avoid', 'biggestMistake');
  add('Plan / next session', 'improvementPlan');
  if (sp.get('nextSessionFocus')) lines.push(`Focus: ${sp.get('nextSessionFocus')}`);
  add('Headspace', 'emotionalState');
  add('What I saw', 'whatISaw');
  add('What I missed', 'whatIMissed');
  add('Bias', 'bias');
  add('Verdict', 'verdict');
  if (sp.get('replayQuality')) lines.push(`Replay quality (score): ${sp.get('replayQuality')}`);
  if (sp.get('reviewCompleteness')) lines.push(`Review completeness: ${sp.get('reviewCompleteness')}%`);
  const lek = sp.get('learningExampleKind');
  if (lek === 'model') lines.push('Learning asset: model — repeat this behaviour.');
  if (lek === 'caution') lines.push('Learning asset: caution — refine or avoid this pattern.');
  const sid = sp.get('replaySessionId');
  if (sid) lines.push(`(replay id: ${sid})`);
  return lines.join('\n');
}

/**
 * Refine-tab prefill for Playbook ReviewPanel ({ noteType, title, body }).
 * @param {URLSearchParams} sp
 */
/** Initial calendar date when landing from Trader Replay (SSR-safe). */
export function readReplayDateFromWindow() {
  if (typeof window === 'undefined') return null;
  try {
    const p = new URLSearchParams(window.location.search);
    const rd = p.get('replayDate');
    if (rd && /^\d{4}-\d{2}-\d{2}$/.test(rd)) return rd;
  } catch {
    /* ignore */
  }
  return null;
}

const STRIP_HANDOFF_KEYS = [
  TR_HANDOFF.origin,
  'replaySessionId',
  'mainLesson',
  'biggestMistake',
  'improvementPlan',
  'nextSessionFocus',
  'emotionalState',
  'whatISaw',
  'whatIMissed',
  'bias',
  'verdict',
  'replayLesson',
  'symbol',
  'replayDate',
  TR_HANDOFF.journalTab,
  'journalTab',
  'learningExample',
  'learningExampleKind',
  'replayQuality',
  'reviewCompleteness',
  'executionNote',
  'disciplineNote',
  'riskNote',
  TR_HANDOFF.missedR,
  TR_HANDOFF.scenarioType,
  'replayHint',
  TR_HANDOFF.returnToReplay,
  TR_HANDOFF.checklistTab,
  TR_HANDOFF.detailTab,
];

/** Remove consumed replay params from URLSearchParams (mutates copy). */
export function stripReplayHandoffParams(searchParams) {
  const next = new URLSearchParams(searchParams);
  STRIP_HANDOFF_KEYS.forEach((k) => next.delete(k));
  return next;
}

export function buildPlaybookReviewPrefillFromSearchParams(sp) {
  const kind = sp.get('learningExampleKind');
  const noteType =
    kind === 'model' ? 'rule_refinement' : kind === 'caution' ? 'lesson' : 'performance';
  const sym = sp.get('symbol') || 'session';
  const title =
    kind === 'model'
      ? `Replay model · ${sym}`
      : kind === 'caution'
        ? `Replay caution · ${sym}`
        : `Replay note · ${sym}`;
  const body = [
    sp.get('mainLesson') && `Lesson: ${sp.get('mainLesson')}`,
    sp.get('biggestMistake') && `Risk / mistake: ${sp.get('biggestMistake')}`,
    sp.get('improvementPlan') && `Plan: ${sp.get('improvementPlan')}`,
    sp.get('replayMissedR') && `Missed R: ${sp.get('replayMissedR')}`,
    sp.get('replayQuality') && `Replay quality: ${sp.get('replayQuality')}`,
    sp.get('reviewCompleteness') && `Review completeness: ${sp.get('reviewCompleteness')}%`,
    sp.get('scenarioType') && `Scenario: ${sp.get('scenarioType')}`,
    sp.get('replayHint') && `Playbook hint: ${sp.get('replayHint')}`,
    kind === 'model' && 'Intent: codify repeatable edge / benchmark behaviour.',
    kind === 'caution' && 'Intent: invalid pattern / refine rule — avoid repetition.',
  ]
    .filter(Boolean)
    .join('\n');
  return { noteType, title, body: body || 'Replay follow-up — add detail from your session.' };
}
