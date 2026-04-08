import {
  evidenceSignalStrength,
  buildReplayIdentitySummary,
  buildReplayCvSnapshot,
  buildDevelopmentGuidanceBlock,
  getReplayLibraryRowHints,
  getReplayFinishPatternCallout,
  extractReplayIdentitySignals,
  bucketMistakeText,
  REPLAY_IDENTITY_MIN_WEAK,
  REPLAY_IDENTITY_MIN_STRONG,
} from '../replayIdentityEngine';
import { REPLAY_STATUSES } from '../replayDefaults';

function localYmdDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Rich reflection text so aggregate evidence is not stuck in “insufficient” tier. */
function richTextFields() {
  return {
    notes: 'Session notes for completeness scoring.',
    whatISaw: 'What I saw on the chart.',
    whatIMissed: 'What I missed relative to plan.',
    emotionalState: 'Calm',
    ruleFollowed: 'Followed the morning checklist.',
    improvementPlan: 'Improve patience on entries next session.',
    lessonSummary: 'One line lesson about the trade.',
    insight:
      'Insight narrative with enough length to satisfy review completeness heuristics and average text length.',
    reviewBiggestMistake: 'late entry chase timing fomo impulse',
    reviewBestMoment: 'Sized correctly after the pullback.',
    verdict: 'Written verdict with enough substance for the score engine.',
    keyDrivers: 'Key drivers narrative longer than thirty characters here.',
  };
}

function completedSession(i, overrides = {}) {
  const day = localYmdDaysAgo(2 + i);
  return {
    id: `replay-${i}`,
    replayStatus: REPLAY_STATUSES.completed,
    completedAt: `${day}T12:00:00.000Z`,
    updatedAt: `${day}T12:00:00.000Z`,
    entryTiming: 7,
    discipline: 7,
    patience: 7,
    stop: '1',
    target: '2',
    outcome: 'win',
    actualR: '1.5',
    missedR: '0.1',
    ...richTextFields(),
    ...overrides,
  };
}

function stripGeneratedAt(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const { generatedAt, ...rest } = obj;
  return rest;
}

describe('replayIdentityEngine', () => {
  describe('evidenceSignalStrength', () => {
    it('returns none for zero sessions', () => {
      expect(evidenceSignalStrength(0)).toBe('none');
    });

    it('returns insufficient below minimum weak threshold', () => {
      expect(evidenceSignalStrength(1)).toBe('insufficient');
      expect(evidenceSignalStrength(2)).toBe('insufficient');
    });

    it('upgrades with longer average reflection text', () => {
      expect(evidenceSignalStrength(3, 0)).toBe('insufficient');
      expect(evidenceSignalStrength(3, 100)).toBe('limited');
      expect(evidenceSignalStrength(3, 250)).toBe('limited');
    });

    it('ramps to moderate and strong with enough completed sessions', () => {
      expect(evidenceSignalStrength(6, 120)).toBe('moderate');
      expect(evidenceSignalStrength(12, 120)).toBe('strong');
    });
  });

  describe('bucketMistakeText', () => {
    it('maps stable buckets from keywords', () => {
      expect(bucketMistakeText('I chased a late entry')).toBe('late_entry');
      expect(bucketMistakeText('')).toBeNull();
    });
  });

  describe('buildReplayIdentitySummary', () => {
    it('is deterministic for the same sessions (ignoring generatedAt)', () => {
      const sessions = [completedSession(0), completedSession(1), completedSession(2)];
      const a = stripGeneratedAt(buildReplayIdentitySummary(sessions));
      const b = stripGeneratedAt(buildReplayIdentitySummary(sessions));
      expect(a).toEqual(b);
    });

    it('handles empty history with low confidence and no patterns', () => {
      const s = buildReplayIdentitySummary([]);
      expect(s.evidence.completedCount).toBe(0);
      expect(s.evidence.signalStrength).toBe('none');
      expect(s.patterns.recurringMistakeTheme).toBeNull();
      expect(s.developmentFocus.label).toMatch(/baseline/i);
      expect(s.developmentGuidance.guidanceMode).toBe('gather_evidence');
      expect(s.developmentGuidance.focusAreas).toEqual([]);
      expect(s.developmentGuidance.topGrowthPriority.practiceNext).toBeTruthy();
    });

    it('stays provisional with fewer than weak minimum completed replays', () => {
      const sessions = [completedSession(0), completedSession(1)];
      const s = buildReplayIdentitySummary(sessions);
      expect(s.evidence.completedCount).toBe(2);
      expect(s.evidence.signalStrength).toBe('insufficient');
      expect(s.developmentFocus.label).toMatch(/sample/i);
      expect(s.evidence.uncertaintyNotes.length).toBeGreaterThan(0);
    });

    it('surfaces an emerging recurring theme after weak minimum with repetition', () => {
      const sessions = Array.from({ length: REPLAY_IDENTITY_MIN_WEAK }, (_, i) =>
        completedSession(i, {
          reviewBiggestMistake: 'late chase entry fomo impulse',
        }),
      );
      const s = buildReplayIdentitySummary(sessions);
      expect(s.patterns.recurringMistakeTheme).not.toBeNull();
      expect(s.patterns.recurringMistakeTheme.level).toBe('emerging');
      expect(s.patterns.recurringMistakeTheme.bucket).toBe('late_entry');
    });

    it('promotes to established recurring theme with enough sessions and bucket mass', () => {
      const sessions = Array.from({ length: REPLAY_IDENTITY_MIN_STRONG }, (_, i) =>
        completedSession(i, {
          reviewBiggestMistake: 'late chase entry fomo impulse',
        }),
      );
      const s = buildReplayIdentitySummary(sessions);
      expect(s.patterns.recurringMistakeTheme.level).toBe('established');
      expect(s.developmentFocus.label.toLowerCase()).toContain('theme');
    });

    it('flags contradiction when execution reads strong but reviews stay thin', () => {
      const thin = {
        notes: '',
        whatISaw: '',
        whatIMissed: '',
        emotionalState: '',
        ruleFollowed: '',
        improvementPlan: '',
        lessonSummary: '',
        insight: 'short',
        reviewBiggestMistake: 'x',
        reviewBestMoment: 'y',
        verdict: '',
        keyDrivers: '',
      };
      const sessions = Array.from({ length: REPLAY_IDENTITY_MIN_WEAK }, (_, i) =>
        completedSession(i, {
          entryTiming: 9,
          discipline: 9,
          patience: 9,
          ...thin,
        }),
      );
      const s = buildReplayIdentitySummary(sessions);
      expect(s.evidence.contradictionFlags.thinWrittenReflection).toBe(true);
      expect(s.developmentFocus.label.toLowerCase()).toMatch(/deepen|reflection|align/i);
    });

    it('separates strengths from weaknesses in development guidance', () => {
      const sessions = Array.from({ length: REPLAY_IDENTITY_MIN_STRONG }, (_, i) =>
        completedSession(i, {
          discipline: 8,
          entryTiming: 4,
          reviewBiggestMistake: 'late chase entry fomo impulse',
        }),
      );
      const s = buildReplayIdentitySummary(sessions);
      expect(s.patterns.recurringStrengthTheme).toBeTruthy();
      expect(s.patterns.recurringMistakeTheme).toBeTruthy();
      expect(s.developmentGuidance.strengths.length).toBeGreaterThan(0);
      expect(s.developmentGuidance.topGrowthPriority.headline).toBeTruthy();
      expect(s.developmentGuidance.coaching.repeatedlyLimiting).toBeTruthy();
    });

    it('ranks primary growth priority before secondary focus areas', () => {
      const sessions = Array.from({ length: REPLAY_IDENTITY_MIN_STRONG }, (_, i) =>
        completedSession(i, {
          discipline: 7,
          entryTiming: i < 3 ? 7 : 4,
          reviewBiggestMistake: 'late chase fomo',
        }),
      );
      const s = buildReplayIdentitySummary(sessions);
      expect(s.developmentFocus.focusKey).toBe('pressure_test_theme');
      expect(s.developmentGuidance.focusAreas.length).toBeGreaterThanOrEqual(1);
      expect(s.developmentGuidance.focusAreas[0].rank).toBeGreaterThanOrEqual(2);
    });
  });

  describe('buildDevelopmentGuidanceBlock', () => {
    it('returns conservative coaching when evidence is thin', () => {
      const summary = buildReplayIdentitySummary([completedSession(0), completedSession(1)]);
      const g = buildDevelopmentGuidanceBlock({
        developmentFocus: summary.developmentFocus,
        patterns: summary.patterns,
        contradictions: summary.evidence.contradictionFlags,
        signalStrength: summary.evidence.signalStrength,
        n: summary.evidence.completedCount,
        avgQ: summary.averages.replayQuality,
        avgRv: summary.averages.reviewCompleteness,
        reviewDisciplineTrend: summary.reviewDisciplineTrend,
      });
      expect(g.guidanceMode).toBe('gather_evidence');
      expect(g.focusAreas).toEqual([]);
      expect(g.coaching.futureReplayChecks.length).toBeLessThanOrEqual(2);
    });
  });

  describe('buildReplayCvSnapshot', () => {
    it('includes schema revision and explainability-friendly fields', () => {
      const sessions = Array.from({ length: REPLAY_IDENTITY_MIN_WEAK }, (_, i) => completedSession(i));
      const snap = buildReplayCvSnapshot(sessions);
      expect(snap.schemaRevision).toBe(3);
      expect(snap.kind).toBe('aura.replayIdentity.v1');
      expect(snap.evidenceLabel).toBeTruthy();
      expect(snap.explainabilitySummary).toBeTruthy();
      expect(Array.isArray(snap.uncertaintyNotes)).toBe(true);
      expect(Array.isArray(snap.primaryDrivers)).toBe(true);
      expect(snap.signalStrength).toBeTruthy();
      expect(snap.developmentProfile).toBeTruthy();
      expect(snap.developmentProfile.developmentPriority).toBeTruthy();
      expect(snap.developmentProfile.evidenceConfidenceLine).toBeTruthy();
      expect(snap.developmentGuidance.coaching.practiceNext).toBeTruthy();
    });
  });

  describe('extractReplayIdentitySignals', () => {
    it('returns bounded 0–1 tendencies for a completed session', () => {
      const sig = extractReplayIdentitySignals(
        completedSession(0, { entryTiming: 2, missedR: '0.8', verdict: 'chased late' }),
      );
      expect(sig.completed).toBe(true);
      expect(sig.lateEntryTendency).toBeGreaterThanOrEqual(0);
      expect(sig.lateEntryTendency).toBeLessThanOrEqual(1);
      expect(sig.replayQualityScore).toBeGreaterThanOrEqual(0);
      expect(sig.replayQualityScore).toBeLessThanOrEqual(1);
    });
  });

  describe('getReplayLibraryRowHints', () => {
    it('returns chips only when aggregate evidence is sufficient', () => {
      const sessions = Array.from({ length: REPLAY_IDENTITY_MIN_WEAK }, (_, i) => completedSession(i));
      const summary = buildReplayIdentitySummary(sessions);
      const row = completedSession(99, {
        entryTiming: 2,
        discipline: 2,
        patience: 2,
        stop: '',
        target: '',
        outcome: 'loss',
        actualR: '-1.2',
      });
      const hints = getReplayLibraryRowHints(row, summary);
      expect(Array.isArray(hints.chips)).toBe(true);
      expect(hints.chips.length).toBeLessThanOrEqual(3);
    });

    it('stays empty for insufficient history', () => {
      const summary = buildReplayIdentitySummary([completedSession(0)]);
      const hints = getReplayLibraryRowHints(completedSession(1), summary);
      expect(hints.chips).toEqual([]);
    });
  });

  describe('getReplayFinishPatternCallout', () => {
    it('returns uncertainty when no completed history', () => {
      const finished = completedSession(0);
      const c = getReplayFinishPatternCallout(finished, []);
      expect(c.line).toBeNull();
      expect(c.uncertaintyNote).toBeTruthy();
      expect(c.wrapUpTone).toBe('gather_evidence');
      expect(c.nextReplayFocus).toBeTruthy();
    });

    it('includes a line when weak minimum is met', () => {
      const all = Array.from({ length: REPLAY_IDENTITY_MIN_WEAK }, (_, i) => completedSession(i));
      const c = getReplayFinishPatternCallout(all[0], all);
      expect(c.line).toBeTruthy();
      expect(c.confidence).toBeTruthy();
      expect(c.nextReplayFocus).toBeTruthy();
      expect(['maintain', 'address', 'gather_evidence']).toContain(c.wrapUpTone);
    });

    it('flags established theme alignment with address tone', () => {
      const all = Array.from({ length: REPLAY_IDENTITY_MIN_STRONG }, (_, i) =>
        completedSession(i, { reviewBiggestMistake: 'late chase fomo impulse' }),
      );
      const c = getReplayFinishPatternCallout(all[0], all);
      expect(c.line).toContain('established pattern');
      expect(c.wrapUpTone).toBe('address');
      expect(c.weaknessLine).toBeTruthy();
    });
  });
});
