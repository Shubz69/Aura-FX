/**
 * Coaching packs — mentor/admin + trader reflections (weekly, monthly, long-horizon).
 * All composed from existing replay engines; no duplicate scoring.
 */
import { normalizeReplay } from './replayNormalizer';
import { REPLAY_STATUSES } from './replayDefaults';
import { computeReplayHabitStats } from './replayHabit';
import {
  filterCompletedSessions,
  aggregateReplayPatterns,
  sessionActivityDate,
  buildReplayIdentitySummary,
} from './replayIdentityEngine';
import { buildReplayContributionProfile } from './replayContributionEngine';
import {
  buildReplayMonthlyPackage,
  buildReplayMentorPrepPackage,
  buildReplayWeeklyPackage,
  pickLearningExamples,
  pickWeeklyLearningExamples,
} from './replayPackageEngine';
import { buildMonthlyReplayReview, buildWeeklyReplayBrief } from './replayNarrativeEngine';
import { buildReplayBehaviorArchetypeProfile } from './replayBehaviorArchetypeEngine';
import { deriveCoaching } from './replayCoachingEngine';

function ymdToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(ymd, delta) {
  const [y, m, day] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

function completedInRange(sessions, fromYmd, toYmd) {
  return filterCompletedSessions(sessions).filter((s) => {
    const day = sessionActivityDate(s);
    return day && day >= fromYmd && day <= toYmd;
  });
}

/** Deterministic preset windows for long-horizon / season review (no freeform dates). */
export const REPLAY_REVIEW_PRESET = {
  ALL_TIME: 'all_time',
  LAST_90D: 'last_90d',
  YTD: 'ytd',
  LAST_180D: 'last_180d',
};

/**
 * @param {string} [preset]
 * @returns {{ preset: string, fromYmd: string | null, toYmd: string | null, label: string }}
 */
export function resolveReplayReviewWindow(preset) {
  const p = preset || REPLAY_REVIEW_PRESET.ALL_TIME;
  const today = ymdToday();
  if (p === REPLAY_REVIEW_PRESET.ALL_TIME) {
    return { preset: p, fromYmd: null, toYmd: null, label: 'all_time' };
  }
  if (p === REPLAY_REVIEW_PRESET.LAST_90D) {
    return { preset: p, fromYmd: addDays(today, -89), toYmd: today, label: 'last_90d' };
  }
  if (p === REPLAY_REVIEW_PRESET.LAST_180D) {
    return { preset: p, fromYmd: addDays(today, -179), toYmd: today, label: 'last_180d' };
  }
  if (p === REPLAY_REVIEW_PRESET.YTD) {
    const y = new Date().getFullYear();
    return { preset: p, fromYmd: `${y}-01-01`, toYmd: today, label: 'ytd' };
  }
  return resolveReplayReviewWindow(REPLAY_REVIEW_PRESET.ALL_TIME);
}

export function getReplayWindowLabel(preset) {
  switch (preset || REPLAY_REVIEW_PRESET.ALL_TIME) {
    case REPLAY_REVIEW_PRESET.LAST_90D:
      return 'Last 90 days';
    case REPLAY_REVIEW_PRESET.LAST_180D:
      return 'Last 180 days';
    case REPLAY_REVIEW_PRESET.YTD:
      return 'Year to date';
    default:
      return 'All time';
  }
}

/**
 * @param {object[]} normalizedSessions
 * @param {{ fromYmd: string | null, toYmd: string | null }} window
 */
export function filterReplaySessionsForWindow(normalizedSessions, window) {
  if (!window?.fromYmd || !window?.toYmd) return normalizedSessions || [];
  return (normalizedSessions || []).filter((s) => {
    const day = sessionActivityDate(s);
    if (!day) return false;
    return day >= window.fromYmd && day <= window.toYmd;
  });
}

function windowReviewTitle(preset) {
  switch (preset || REPLAY_REVIEW_PRESET.ALL_TIME) {
    case REPLAY_REVIEW_PRESET.LAST_90D:
      return 'quarter / season review (last 90 days)';
    case REPLAY_REVIEW_PRESET.LAST_180D:
      return 'half-year window review (last 180 days)';
    case REPLAY_REVIEW_PRESET.YTD:
      return 'year-to-date process review';
    default:
      return 'long-horizon review (all-time archive)';
  }
}

function improvedSectionHeading(preset) {
  if (preset === REPLAY_REVIEW_PRESET.ALL_TIME) {
    return '[WHAT IMPROVED OVER TIME (~30d VS PRIOR)]';
  }
  return '[WHAT IMPROVED IN THIS WINDOW]';
}

function nextPeriodSectionTitle(preset) {
  switch (preset) {
    case REPLAY_REVIEW_PRESET.YTD:
      return '[REST OF YEAR — ONE LINE]';
    case REPLAY_REVIEW_PRESET.LAST_90D:
    case REPLAY_REVIEW_PRESET.LAST_180D:
      return '[NEXT PHASE — ONE LINE]';
    default:
      return '[NEXT QUARTER / PHASE — ONE LINE]';
  }
}

function longHorizonShareTag(preset) {
  switch (preset) {
    case REPLAY_REVIEW_PRESET.LAST_90D:
      return '[Aura · 90d review]';
    case REPLAY_REVIEW_PRESET.LAST_180D:
      return '[Aura · 180d review]';
    case REPLAY_REVIEW_PRESET.YTD:
      return '[Aura · YTD review]';
    default:
      return '[Aura · long-horizon review]';
  }
}

function coachReviewShareTag(preset) {
  if (preset == null) return '[Aura · monthly coaching pack]';
  switch (preset) {
    case REPLAY_REVIEW_PRESET.LAST_90D:
      return '[Aura · coach review · 90d]';
    case REPLAY_REVIEW_PRESET.LAST_180D:
      return '[Aura · coach review · 180d]';
    case REPLAY_REVIEW_PRESET.YTD:
      return '[Aura · coach review · YTD]';
    case REPLAY_REVIEW_PRESET.ALL_TIME:
      return '[Aura · coach review · all-time]';
    default:
      return '[Aura · monthly coaching pack]';
  }
}

/** Coach/admin picks: newest-heavy for short windows; pattern/quality-weighted for YTD and all-time. */
function pickCoachWindowLearningExamples(completed, kind, limit, patterns, preset) {
  if (!limit || !completed.length) return [];
  const useRecency =
    preset === REPLAY_REVIEW_PRESET.LAST_90D || preset === REPLAY_REVIEW_PRESET.LAST_180D;
  if (useRecency) {
    return pickWeeklyLearningExamples(completed, kind, limit, patterns);
  }
  return pickLearningExamples(completed, kind, limit, patterns);
}

/**
 * Archive coach review: pattern/recurrence-weighted picks (pickLearningExamples), not recency-first.
 * Centralized deterministic selection for mentor-facing all-history packs.
 */
function pickArchiveCoachLearningExamples(completed, kind, limit, patterns) {
  if (!limit || !completed.length) return [];
  return pickLearningExamples(completed, kind, limit, patterns);
}

function archiveExampleCoachLine(kind, patterns, contrib, index) {
  const rec = patterns?.recurringMistakeTheme;
  const established = rec?.level === 'established';
  const slip = contrib.discipline?.replayDisciplineTrend === 'slipping';
  if (kind === 'model') {
    return index === 0
      ? 'Reinforce this as part of the trader’s stronger process — use as a benchmark case in mentor reviews.'
      : 'Secondary model anchor — lock in what “good execution” looks like for this trader across cycles.';
  }
  if (established || slip) {
    return index === 0
      ? 'This caution pattern is still surviving across the archive — correct before it hardens into a ceiling.'
      : 'Supporting caution anchor — assign explicit correction work; follow-through is the risk.';
  }
  return index === 0
    ? 'Name this behaviour on the next call; correct before it becomes part of the trader’s default.'
    : 'Pair with the primary caution line — keep the trader honest on repeat process breaks.';
}

function exampleRowArchiveCoach(s, kind, patterns, contrib, index) {
  return {
    ...exampleRow(s),
    archiveCoachLine: archiveExampleCoachLine(kind, patterns, contrib, index),
  };
}

function trimT(text, max = 220) {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  if (!t) return '';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function sessionOneLiner(s) {
  const coach = deriveCoaching(s);
  const bit = coach.mainLesson && coach.mainLesson !== '—' ? coach.mainLesson : s.title || 'Replay';
  return trimT(bit, 140);
}

function exampleRow(s) {
  return {
    id: s.id,
    title: s.title || '—',
    symbol: s.asset || s.symbol || '—',
    date: s.replayDate || s.sourceDate || '—',
    line: sessionOneLiner(s),
  };
}

function strongestLessonFromMonth(monthList) {
  if (!monthList.length) return '—';
  const coachLines = monthList
    .map((s) => {
      const c = deriveCoaching(s);
      return c.mainLesson && c.mainLesson !== '—' ? c.mainLesson : '';
    })
    .filter(Boolean);
  if (!coachLines.length) return '—';
  const freq = {};
  coachLines.forEach((l) => {
    const k = trimT(l, 80);
    freq[k] = (freq[k] || 0) + 1;
  });
  return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
}

/** Same frequency logic as monthly window, over full completed history. */
function strongestLessonAllTime(completedList) {
  return strongestLessonFromMonth(completedList);
}

function longRunImprovementLine(d30, preset) {
  const parts = [];
  if (d30?.reviewCompleteness === 'improving') parts.push('Review completeness up vs the prior ~30d window.');
  if (d30?.modelShare === 'improving') parts.push('More model-tagged replays vs prior window — archiving improved.');
  if (d30?.cautionShare === 'improving') parts.push('Caution-share down vs prior window — fewer poor-process cases tagged.');
  if (d30?.lateEntryTheme === 'improving') parts.push('Late-entry theme less frequent vs prior window.');
  if (!parts.length) {
    return preset === REPLAY_REVIEW_PRESET.ALL_TIME
      ? '— Not enough overlapping history for a clean long-run trend read — keep closing reviews.'
      : '— Not enough sessions in this window vs the prior slice for a clean trend — widen the window or close more reviews.';
  }
  return parts.filter((x, i, a) => a.indexOf(x) === i).join(' ');
}

/**
 * Anchor examples inside the selected window — pickLearningExamples (pattern-weighted), window-specific framing.
 */
function pickLongHorizonAnchorEntries(completed, patterns, contrib, preset) {
  if (!completed.length) return [];
  const c = pickLearningExamples(completed, 'caution', 1, patterns)[0];
  const m = pickLearningExamples(completed, 'model', 1, patterns)[0];
  const n = completed.length;
  const rec = patterns?.recurringMistakeTheme;
  const established = rec?.level === 'established';
  const slip = contrib.discipline?.replayDisciplineTrend === 'slipping';
  const thresholdTwo =
    preset === REPLAY_REVIEW_PRESET.ALL_TIME ? 8 : preset === REPLAY_REVIEW_PRESET.LAST_90D ? 5 : 6;
  const wantTwo = n >= thresholdTwo && m && c && m.id !== c.id;

  const cautionAnchor = () => {
    if (preset === REPLAY_REVIEW_PRESET.LAST_90D) {
      if (established) {
        return 'Correct this pattern in this 90-day window before it carries into the next quarter — playbook + validator.';
      }
      return 'Season caution anchor — eliminate the repeat in this period, then re-open next quarter.';
    }
    if (preset === REPLAY_REVIEW_PRESET.YTD) {
      if (established) {
        return 'YTD leak — eliminate this pattern before year-end; validate rules on the next plans.';
      }
      return 'Year-to-date caution — watch this across the rest of the year before scaling confidence.';
    }
    if (preset === REPLAY_REVIEW_PRESET.LAST_180D) {
      if (established) {
        return 'Half-year anchor: this mistake thread survived the window — refine the rule before the next cycle.';
      }
      return 'Persistent in this 180d slice — correct before it becomes long-run identity.';
    }
    if (established) {
      return 'Anchor caution: the mistake pattern that survives across months — eliminate it in your playbook, then validate on the next plans.';
    }
    if (rec?.level === 'emerging') {
      return 'Refine this before it becomes a ceiling — revisit while the pattern is still movable at the rule level.';
    }
    return 'Persistent caution in the archive — review before you scale confidence on size or frequency.';
  };

  const modelAnchor = () => {
    if (preset === REPLAY_REVIEW_PRESET.LAST_90D) {
      return 'Benchmark this quarter — carry forward what worked; reopen when discipline slips.';
    }
    if (preset === REPLAY_REVIEW_PRESET.YTD) {
      return 'YTD model anchor — proof of what held up in your process this year.';
    }
    if (preset === REPLAY_REVIEW_PRESET.LAST_180D) {
      return 'Half-year benchmark replay — model of the process you want on the next cycle.';
    }
    return 'Benchmark model: keep this replay as proof of the process you want repeatable — carry it into your playbook.';
  };

  if (!wantTwo) {
    if (c && (established || slip)) return [{ session: c, kind: 'caution', anchorLine: cautionAnchor() }];
    if (m) return [{ session: m, kind: 'model', anchorLine: modelAnchor() }];
    if (c) return [{ session: c, kind: 'caution', anchorLine: cautionAnchor() }];
    return [];
  }
  const out = [];
  if (c) out.push({ session: c, kind: 'caution', anchorLine: cautionAnchor() });
  if (m) out.push({ session: m, kind: 'model', anchorLine: modelAnchor() });
  return out.slice(0, 2);
}

function longHorizonStrategicNudge(contrib, patterns, d30, guidance, preset) {
  if (patterns?.recurringMistakeTheme?.level === 'established') {
    const tail =
      preset === REPLAY_REVIEW_PRESET.YTD
        ? 'before you size up into the rest of the year.'
        : preset === REPLAY_REVIEW_PRESET.LAST_90D
          ? 'before the next quarter.'
          : 'before scaling.';
    return `Eliminate: one non-negotiable rule targeting “${trimT(patterns.recurringMistakeTheme.label, 70)}” — validate it on the next several plans ${tail}`;
  }
  const rv = d30?.reviewCompleteness;
  const mod = d30?.modelShare;
  if (rv === 'improving' && mod === 'improving') {
    if (preset === REPLAY_REVIEW_PRESET.YTD) {
      return 'Replay: review depth and model tags rose vs the prior 30d slice — carry that cadence through the rest of the year.';
    }
    if (preset === REPLAY_REVIEW_PRESET.LAST_90D) {
      return 'Replay: discipline in reviews and archiving improved vs the prior month-long slice — hold this through the next season.';
    }
    return 'Replay: review depth and model archiving both rose vs prior 30d — carry that cadence into the next quarter.';
  }
  if (guidance?.topGrowthPriority?.stopDoing) {
    return trimT(`Journal why this keeps resurfacing: ${guidance.topGrowthPriority.stopDoing}`, 220);
  }
  return trimT(
    guidance?.topGrowthPriority?.practiceNext
      || contrib.developmentActions?.[0]
      || 'Quarter focus: one fewer repeated leak, one clearer model in the vault.',
    220
  );
}

function mapPriority(mentorPrep, contrib) {
  const p = String(mentorPrep.reviewPriority || '').toLowerCase();
  if (p === 'high' || contrib.discipline?.replayDisciplineTrend === 'slipping') return 'high';
  if (p === 'medium' || p === 'standard') return 'medium';
  return 'low';
}

function mapWeeklyPriority(weeklyPkg, contrib) {
  const p = String(weeklyPkg.reviewPriority || '').toLowerCase();
  if (p === 'high' || contrib.discipline?.replayDisciplineTrend === 'slipping') return 'high';
  if (p === 'low') return 'low';
  return 'medium';
}

function weeklyMovementLines(d7, weeklyBrief, weeklyPkg) {
  const parts = [];
  if (weeklyPkg.improvementSignal && !String(weeklyPkg.improvementSignal).startsWith('Insufficient overlap')) {
    parts.push(trimT(weeklyPkg.improvementSignal, 180));
  }
  const rv = d7?.reviewCompleteness;
  const disc = d7?.disciplineSelfScore;
  const caut = d7?.cautionShare;
  const late = d7?.lateEntryTheme;
  const mod = d7?.modelShare;
  if (rv === 'improving') parts.push('Review completeness up vs prior week.');
  if (rv === 'slipping') parts.push('Review completeness down vs prior week.');
  if (disc === 'improving') parts.push('Self-rated discipline up vs prior week.');
  if (disc === 'slipping') parts.push('Self-rated discipline softer vs prior week.');
  if (caut === 'slipping') parts.push('More caution-tagged replays vs prior week — watch process.');
  if (caut === 'improving') parts.push('Fewer caution-tagged replays vs prior week.');
  if (late === 'slipping') parts.push('Late-entry theme more frequent vs last week.');
  if (late === 'improving') parts.push('Late-entry theme less frequent vs last week.');
  if (mod === 'improving') parts.push('More model tags vs prior week.');
  if (mod === 'slipping') parts.push('Fewer model tags vs prior week — reinforce clean execution.');
  if (rv === 'improving' && mod === 'slipping') {
    parts.push('Reviews improved; model tags lag — depth may be ahead of archived good-process examples.');
  }
  if (rv === 'slipping' && disc === 'improving') {
    parts.push('Mixed: self-discipline up but review completeness slipped — close open reviews.');
  }
  const merged = parts.filter(Boolean);
  if (!merged.length) return trimT(weeklyBrief.improvedThisWeek || weeklyPkg.improvementSignal, 220) || '—';
  return merged.filter((x, i, a) => a.indexOf(x) === i).join(' ');
}

function classifyWeeklyIssueScope(weekList, echoedThisWeek, patterns) {
  if (!weekList.length) {
    return { label: 'insufficient_evidence', line: 'No completed replays in the 7d window yet.' };
  }
  if (!echoedThisWeek) {
    return {
      label: 'isolated',
      line: 'Theme not clearly repeated inside this week — monitor next sessions.',
    };
  }
  if (patterns?.recurringMistakeTheme?.level === 'established') {
    return {
      label: 'recurring',
      line: 'Aligns with an established vault pattern — recurring, not a one-off.',
    };
  }
  return {
    label: 'emerging',
    line: 'Repeated inside this week — emerging; correct before it compounds.',
  };
}

/**
 * @param {object[]} sessions
 * @param {object|null} habitStats
 * @param {{ internalNote?: boolean }} [options]
 */
export function buildReplayWeeklyReviewPack(sessions = [], habitStats = null, options = {}) {
  const normalized = (sessions || []).map((s) => normalizeReplay(s));
  const h = habitStats ?? computeReplayHabitStats(normalized);
  const contrib = buildReplayContributionProfile(normalized, h);
  const d7 = contrib.directional?.last7VsPrev7 || {};
  const today = ymdToday();
  const weekList = completedInRange(normalized, addDays(today, -6), today);
  const patterns = aggregateReplayPatterns(normalized);

  const weeklyPkg = buildReplayWeeklyPackage(sessions, h);
  const weeklyBrief = buildWeeklyReplayBrief(sessions, h);
  const mentorPrep = buildReplayMentorPrepPackage(sessions, h);

  const wkN = weekList.length;
  const exLimit = wkN >= 4 ? 2 : wkN >= 2 ? 1 : 0;
  const pool = weekList;
  const modelSessions = exLimit && pool.length ? pickWeeklyLearningExamples(pool, 'model', exLimit, patterns) : [];
  const cautionSessions = exLimit && pool.length ? pickWeeklyLearningExamples(pool, 'caution', exLimit, patterns) : [];

  const modelExamplesToDiscuss = modelSessions.map(exampleRow);
  const cautionExamplesToDiscuss = cautionSessions.map(exampleRow);

  const strongestModelThisWeek =
    modelExamplesToDiscuss[0]?.line && modelExamplesToDiscuss[0]?.title
      ? `${modelExamplesToDiscuss[0].title} — ${modelExamplesToDiscuss[0].line}`
      : weeklyPkg.modelPicks?.[0]
        ? `${weeklyPkg.modelPicks[0].title} — ${weeklyPkg.modelPicks[0].line}`
        : '— Tag a model replay when execution matches plan.';

  const strongestCautionThisWeek =
    cautionExamplesToDiscuss[0]?.line && cautionExamplesToDiscuss[0]?.title
      ? `${cautionExamplesToDiscuss[0].title} — ${cautionExamplesToDiscuss[0].line}`
      : weeklyPkg.cautionPicks?.[0]
        ? `${weeklyPkg.cautionPicks[0].title} — ${weeklyPkg.cautionPicks[0].line}`
        : trimT(weeklyPkg.repeatedCaution, 220);

  const whatChangedThisWeek = weeklyMovementLines(d7, weeklyBrief, weeklyPkg);

  const improvingThisWeek = trimT(weeklyBrief.improvedThisWeek, 200);
  const stillRepeatingThisWeek = weeklyPkg.echoedThisWeek
    ? trimT(`Same caution theme echoed in-window: ${weeklyPkg.repeatedCaution}`, 200)
    : null;
  let slippedThisWeek = '';
  if (d7.reviewCompleteness === 'slipping' || d7.disciplineSelfScore === 'slipping') {
    slippedThisWeek = 'Review or self-discipline slipped vs prior week — prioritise closure.';
  } else if (d7.cautionShare === 'slipping') {
    slippedThisWeek = 'Process quality slipped — more caution-tagged cases vs last week.';
  }

  const issueScope = classifyWeeklyIssueScope(weekList, weeklyPkg.echoedThisWeek, patterns);

  const reviewPriority = mapWeeklyPriority(weeklyPkg, contrib);

  let coachFocusFirst = '';
  if (reviewPriority === 'high') {
    coachFocusFirst = trimT(
      `This week: stabilise reviews and address ${trimT(weeklyPkg.repeatedCaution, 140) || 'the slipping signal'} before adding risk.`,
      240
    );
  } else {
    coachFocusFirst = trimT(
      weeklyBrief.stillNeedsCorrection || mentorPrep.topIssueFirst || weeklyPkg.developmentFocus,
      240
    );
  }

  const disciplineSignalWeek =
    trimT(contrib.discipline?.replayDisciplineExplanation || contrib.scoreContributionExplanations?.[0], 200) || '—';
  const disciplineTrendLabel = contrib.discipline?.replayDisciplineTrend || '—';

  const immediateNextActions = [
    trimT(weeklyBrief.nextWeekFocus, 200),
    mentorPrep.nextActions?.[0],
    contrib.developmentActions?.[0],
  ]
    .filter(Boolean)
    .filter((x, i, a) => a.indexOf(x) === i)
    .slice(0, 3);

  const replaysWorthDiscussing = [...modelExamplesToDiscuss, ...cautionExamplesToDiscuss]
    .filter((e) => e.id)
    .map((e) => `${e.title} (${e.symbol})`);

  const evidenceNote =
    wkN < 2
      ? 'Thin weekly sample — use as directional prep for the review, not a verdict.'
      : wkN < 4
        ? 'Light week — weight movement lines; add completes for sharper next-week contrast.'
        : null;

  const plainSections = [
    '── Aura Trader Replay · weekly mentor / admin review pack ──',
    '',
    '[WEEKLY SNAPSHOT]',
    `7d · ${weeklyPkg.completedCount} completed · tactical · immediate correction / reinforcement`,
    weeklyPkg.avgReplayQuality != null && weeklyPkg.avgReviewCompleteness != null
      ? `Avg Q ~${weeklyPkg.avgReplayQuality} · Rv ~${weeklyPkg.avgReviewCompleteness}% (replay fields)`
      : 'Averages: thin in-window — still use focus + movement below.',
    `[REVIEW PRIORITY] ${reviewPriority.toUpperCase()}`,
    `[ISSUE CHARACTER] ${issueScope.label.replace(/_/g, ' ')} — ${issueScope.line}`,
    '',
    '[COACH FOCUS FIRST]',
    coachFocusFirst,
    '',
    '[WHAT CHANGED VS PRIOR WEEK]',
    whatChangedThisWeek,
    '',
    '[MOVEMENT — THIS WEEK]',
    improvingThisWeek ? `Improving: ${improvingThisWeek}` : '',
    slippedThisWeek ? `Slipped: ${slippedThisWeek}` : '',
    stillRepeatingThisWeek ? `Repeating: ${stillRepeatingThisWeek}` : '',
    '',
    '[DISCIPLINE SIGNAL — THIS WEEK]',
    disciplineSignalWeek,
    `Trend: ${disciplineTrendLabel}`,
    '',
    '[STRONGEST CAUTION — ADDRESS NOW]',
    strongestCautionThisWeek,
    '',
    '[STRONGEST MODEL — REINFORCE NOW]',
    strongestModelThisWeek,
    '',
    '[DISCUSS IN NEXT REVIEW — EXAMPLES]',
    modelExamplesToDiscuss.length || cautionExamplesToDiscuss.length
      ? [...modelExamplesToDiscuss, ...cautionExamplesToDiscuss]
          .map((e, i) => `  ${i + 1}. ${e.title} · ${e.symbol} · ${e.date} — ${e.line}`)
          .join('\n')
      : '— Add model/caution tags on the next completes.',
    ...(replaysWorthDiscussing.length
      ? ['[Replay titles to open]', ...replaysWorthDiscussing.map((t) => `  · ${t}`)]
      : []),
    '',
    '[IMMEDIATE NEXT ACTIONS — THIS WEEK]',
    ...immediateNextActions.map((a, i) => `  ${i + 1}. ${a}`),
    '',
    '[BEFORE NEXT REVIEW]',
    'Skim movement vs monthly pattern; open 1 discuss example in vault if tagged.',
    evidenceNote ? `\n[EVIDENCE]\n${evidenceNote}` : '',
    '',
    options.internalNote
      ? '[INTERNAL]\nWeekly pack is replay-sourced — pair with live risk and desk context.'
      : '',
    '── end ──',
  ].filter(Boolean);

  const plainText = plainSections.join('\n');

  const compactShare = [
    '[Aura · weekly review pack]',
    `Priority: ${reviewPriority} · ${trimT(coachFocusFirst, 95)}`,
    `Changed: ${trimT(whatChangedThisWeek, 100)}`,
    immediateNextActions[0] ? `Next: ${trimT(immediateNextActions[0], 100)}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    kind: 'aura.replayCoachingPack.weekly',
    generatedAt: new Date().toISOString(),
    reviewPriority,
    coachFocusFirst,
    weeklySnapshot: `7d · ${weeklyPkg.completedCount} completes`,
    whatChangedThisWeek,
    improvingThisWeek,
    slippedThisWeek: slippedThisWeek || null,
    stillRepeatingThisWeek,
    strongestCautionThisWeek,
    strongestModelThisWeek,
    disciplineSignalWeek,
    disciplineTrendLabel,
    issueScope,
    modelExamplesToDiscuss,
    cautionExamplesToDiscuss,
    replaysWorthDiscussing,
    immediateNextActions,
    evidenceNote,
    plainText,
    compactShare,
  };
}

export function formatReplayWeeklyReviewPackPlain(pack) {
  if (!pack?.plainText) return '';
  return pack.plainText;
}

/**
 * Pick 1–2 sessions from the 7d pool for self-review revisit (not mentor discussion order).
 * Deterministic: reflection usefulness — caution when echoed/slipping, else balance model/caution; thin sample → one pick.
 */
function pickReflectionRevisitEntries(weekList, patterns, weeklyPkg, contrib) {
  const wkN = weekList.length;
  if (wkN < 1) return [];
  const c = pickWeeklyLearningExamples(weekList, 'caution', 1, patterns)[0];
  const m = pickWeeklyLearningExamples(weekList, 'model', 1, patterns)[0];
  const slip = contrib.discipline?.replayDisciplineTrend === 'slipping';
  const echoed = weeklyPkg.echoedThisWeek;
  const wantTwo = wkN >= 3 && c && m && c.id !== m.id;

  if (!wantTwo) {
    if (c && (echoed || slip)) {
      return [
        {
          session: c,
          kind: 'caution',
          revisitLine: 'Revisit this replay — correct this mistake pattern before the next trading week.',
        },
      ];
    }
    if (m) {
      return [
        {
          session: m,
          kind: 'model',
          revisitLine: 'Revisit this replay — rehearse this setup; keep doing what worked.',
        },
      ];
    }
    if (c) {
      return [
        {
          session: c,
          kind: 'caution',
          revisitLine: 'Revisit this replay — watch this behaviour carefully next week.',
        },
      ];
    }
    return [];
  }

  const out = [];
  if (echoed && c) {
    out.push({
      session: c,
      kind: 'caution',
      revisitLine: 'Correct this next week — same theme showed up in your reviews.',
    });
  } else if (c) {
    out.push({
      session: c,
      kind: 'caution',
      revisitLine: 'Correct this next week — stop repeating this pattern.',
    });
  }
  if (m) {
    out.push({
      session: m,
      kind: 'model',
      revisitLine: 'Rehearse this next week — repeat this process on purpose.',
    });
  }
  return out.slice(0, 2);
}

function reflectionJournalValidatorNudge(contrib, patterns, d7) {
  const rv = d7?.reviewCompleteness;
  if (rv === 'slipping') {
    return 'Journal: one line on why reviews stayed open — before the next session.';
  }
  if (patterns?.recurringMistakeTheme?.bucket === 'late_entry') {
    return 'Validate: re-check entry timing against your plan before the next chase or impulse entry.';
  }
  if (contrib.discipline?.replayDisciplineTrend === 'improving') {
    return 'Playbook: add one rule line you kept this week — carry it into next week’s checklist.';
  }
  return trimT(
    contrib.developmentActions?.[0] || 'Journal: what I repeat vs stop next week — one paragraph max.',
    220
  );
}

/**
 * Trader-facing weekly self-review — lighter than mentor weekly review; same engines, different framing.
 */
export function buildReplayWeeklyReflectionPack(sessions = [], habitStats = null, options = {}) {
  const normalized = (sessions || []).map((s) => normalizeReplay(s));
  const h = habitStats ?? computeReplayHabitStats(normalized);
  const contrib = buildReplayContributionProfile(normalized, h);
  const archetype = buildReplayBehaviorArchetypeProfile(sessions, h, contrib);
  const d7 = contrib.directional?.last7VsPrev7 || {};
  const today = ymdToday();
  const weekList = completedInRange(normalized, addDays(today, -6), today);
  const patterns = aggregateReplayPatterns(normalized);

  const weeklyPkg = buildReplayWeeklyPackage(sessions, h);
  const weeklyBrief = buildWeeklyReplayBrief(sessions, h);

  const wkN = weekList.length;
  const mainLessonThisWeek = trimT(weeklyPkg.strongestLesson, 240) || '— Log more completed replays so a lesson thread can form.';

  const modelPick = pickWeeklyLearningExamples(weekList, 'model', 1, patterns)[0];
  const cautionPick = pickWeeklyLearningExamples(weekList, 'caution', 1, patterns)[0];

  const strongestModelSelf = modelPick
    ? `${modelPick.title || 'Replay'} — ${sessionOneLiner(modelPick)}`
    : trimT(contrib.behavior?.strengths?.[0] || weeklyPkg.modelPicks?.[0]?.line || '— Tag your next clean execution as a model.', 220);

  const strongestCautionSelf = cautionPick
    ? `${cautionPick.title || 'Replay'} — ${sessionOneLiner(cautionPick)}`
    : trimT(
        weeklyPkg.repeatedCaution || contrib.behavior?.cautions?.[0] || '— Tag the next costly mistake as a caution.',
        220
      );

  const repeatNextWeek = modelPick
    ? trimT(`Keep: ${sessionOneLiner(modelPick)}`, 200)
    : trimT(
        contrib.behavior?.strengths?.[0] || 'Repeat: complete reviews while the trade is still fresh.',
        200
      );

  const stopCorrectNextWeek = cautionPick
    ? trimT(`Stop: repeating the pattern in “${cautionPick.title || 'this replay'}” — ${sessionOneLiner(cautionPick)}`, 220)
    : trimT(weeklyPkg.repeatedCaution || contrib.behavior?.cautions?.[0] || 'Stop: trading without a written plan checkpoint.', 220);

  let improvedThisWeek = trimT(weeklyBrief.improvedThisWeek, 220);
  if (/^insufficient overlap/i.test(improvedThisWeek)) improvedThisWeek = '';

  const stillNeedsAttention = trimT(
    weeklyBrief.stillNeedsCorrection || contrib.behavior?.cautions?.[0] || weeklyPkg.repeatedCaution,
    240
  );

  const revisitEntries = pickReflectionRevisitEntries(weekList, patterns, weeklyPkg, contrib);
  const examplesToRevisit = revisitEntries.map(({ session, kind, revisitLine }) => ({
    id: session.id,
    kind,
    title: session.title || '—',
    symbol: session.asset || session.symbol || '—',
    date: session.replayDate || session.sourceDate || '—',
    line: sessionOneLiner(session),
    revisitLine,
  }));

  const journalValidatorNudge = reflectionJournalValidatorNudge(contrib, patterns, d7);

  const nextWeekFocusOneLine = trimT(
    weeklyBrief.nextWeekFocus
      ? `Next week: ${weeklyBrief.nextWeekFocus}`
      : `Next week: ${repeatNextWeek.split(':').slice(1).join(':').trim() || 'hold plan + one review closure per day.'}`,
    240
  );

  const archetypeHint =
    archetype.showArchetypeLabel && archetype.primaryReplayArchetype
      ? `Pattern note: ${archetype.primaryReplayArchetype.label} — ${trimT(archetype.psychologyLines?.patternLine || '', 120)}`
      : null;

  const evidenceNote =
    wkN < 2
      ? 'Thin week — use this as a prompt, not a full read on your edge.'
      : wkN < 4
        ? 'Light sample — add a few more completes for sharper repeat/stop lines.'
        : null;

  const plainSections = [
    '── Aura Trader Replay · weekly reflection (self-review) ──',
    '',
    '[YOUR WEEK IN REPLAYS]',
    `7d · ${weeklyPkg.completedCount} completed · self-review · not a mentor brief`,
    weeklyPkg.avgReplayQuality != null && weeklyPkg.avgReviewCompleteness != null
      ? `Avg Q ~${weeklyPkg.avgReplayQuality} · Rv ~${weeklyPkg.avgReviewCompleteness}%`
      : 'Rollups thin in-window — still use the lines below.',
    '',
    '[WHAT MY REPLAYS TAUGHT ME THIS WEEK]',
    mainLessonThisWeek,
    '',
    '[WHAT TO REPEAT NEXT WEEK]',
    `Keep doing: ${repeatNextWeek}`,
    strongestModelSelf ? `Strongest model signal: ${strongestModelSelf}` : '',
    '',
    '[WHAT TO STOP / CORRECT NEXT WEEK]',
    stopCorrectNextWeek,
    strongestCautionSelf ? `Strongest caution signal: ${strongestCautionSelf}` : '',
    '',
    '[WHAT IMPROVED]',
    improvedThisWeek || '— Not enough contrast vs last week yet — keep closing reviews.',
    '',
    '[WHAT STILL NEEDS ATTENTION]',
    stillNeedsAttention,
    '',
    '[REVISIT BEFORE NEXT WEEK]',
    examplesToRevisit.length
      ? examplesToRevisit
          .map(
            (e, i) =>
              `  ${i + 1}. [${e.kind.toUpperCase()}] ${e.title} · ${e.symbol} · ${e.date}\n     ${e.line}\n     → ${e.revisitLine}`
          )
          .join('\n')
      : '— Tag model/caution examples on completes so you have something concrete to reopen.',
    '',
    '[JOURNAL · VALIDATOR · PLAYBOOK]',
    journalValidatorNudge,
    archetypeHint || '',
    '',
    '[MY FOCUS NEXT WEEK — ONE LINE]',
    nextWeekFocusOneLine,
    evidenceNote ? `\n[EVIDENCE]\n${evidenceNote}` : '',
    '',
    options.internalNote ? '[INTERNAL]\nReflection is replay-sourced — combine with live results and risk limits.' : '',
    '── end ──',
  ].filter(Boolean);

  const plainText = plainSections.join('\n');

  const compactShare = [
    '[Aura · weekly reflection]',
    `Learned: ${trimT(mainLessonThisWeek, 95)}`,
    `Repeat: ${trimT(repeatNextWeek, 90)}`,
    `Stop: ${trimT(stopCorrectNextWeek, 90)}`,
    nextWeekFocusOneLine ? `Focus: ${trimT(nextWeekFocusOneLine, 100)}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    kind: 'aura.replayCoachingPack.weeklyReflection',
    generatedAt: new Date().toISOString(),
    weeklySnapshot: `7d · ${weeklyPkg.completedCount} completes`,
    mainLessonThisWeek,
    repeatNextWeek,
    stopCorrectNextWeek,
    improvedThisWeek: improvedThisWeek || null,
    stillNeedsAttention,
    strongestModelSelf,
    strongestCautionSelf,
    examplesToRevisit,
    journalValidatorNudge,
    nextWeekFocusOneLine,
    archetypeHint,
    evidenceNote,
    plainText,
    compactShare,
  };
}

export function formatReplayWeeklyReflectionPackPlain(pack) {
  if (!pack?.plainText) return '';
  return pack.plainText;
}

/**
 * 1–2 monthly-window examples for personal revisit — pickLearningExamples (pattern-weighted), trader framing.
 */
function pickMonthlyReflectionRevisitEntries(pool, patterns, contrib) {
  if (!pool.length) return [];
  const c = pickLearningExamples(pool, 'caution', 1, patterns)[0];
  const m = pickLearningExamples(pool, 'model', 1, patterns)[0];
  const pmN = pool.length;
  const recurring = patterns?.recurringMistakeTheme;
  const established = recurring?.level === 'established';
  const emerging = recurring?.level === 'emerging';
  const slip = contrib.discipline?.replayDisciplineTrend === 'slipping';
  const wantTwo = pmN >= 4 && c && m && c.id !== m.id;

  const cautionLine = () => {
    if (established) return 'Revisit this replay before next month — correct this before it compounds into habit.';
    if (emerging) return 'Watch this carefully next month — refine it in your playbook if it shows again.';
    if (slip) return 'Validate your plan against this replay before scaling risk back in.';
    return 'Correct this pattern next month — reopen the notes you logged here.';
  };
  const modelLine = () =>
    'Keep reinforcing this next month — reopen when you doubt whether your process still holds.';

  if (!wantTwo) {
    if (c && (established || emerging || slip)) return [{ session: c, kind: 'caution', revisitLine: cautionLine() }];
    if (m) return [{ session: m, kind: 'model', revisitLine: modelLine() }];
    if (c) return [{ session: c, kind: 'caution', revisitLine: cautionLine() }];
    return [];
  }
  const out = [];
  if (c) out.push({ session: c, kind: 'caution', revisitLine: cautionLine() });
  if (m) out.push({ session: m, kind: 'model', revisitLine: modelLine() });
  return out.slice(0, 2);
}

function reflectionMonthlyJournalNudge(contrib, patterns, d30) {
  const rv = d30?.reviewCompleteness;
  const caut = d30?.cautionShare;
  if (rv === 'slipping') {
    return 'Journal: why review depth slipped vs last month — short note before you add size.';
  }
  if (caut === 'slipping') {
    return 'Validator: tighten pre-trade checks next month — caution-tagged replays rose vs the prior month.';
  }
  if (patterns?.recurringMistakeTheme?.level === 'established') {
    return `Playbook: write one executable rule that blocks “${trimT(patterns.recurringMistakeTheme.label, 70)}” — refine until you can obey it cold.`;
  }
  return trimT(
    contrib.developmentActions?.[0]
      || 'Journal: what became part of your process this month vs what you will not carry forward — one paragraph.',
    220
  );
}

/**
 * Trader-facing monthly self-review — broader than weekly reflection; lighter than mentor monthly coaching pack.
 */
export function buildReplayMonthlyReflectionPack(sessions = [], habitStats = null, options = {}) {
  const normalized = (sessions || []).map((s) => normalizeReplay(s));
  const n = normalized.filter((s) => s.replayStatus === REPLAY_STATUSES.completed).length;
  const h = habitStats ?? computeReplayHabitStats(normalized);
  const contrib = buildReplayContributionProfile(normalized, h);
  const archetype = buildReplayBehaviorArchetypeProfile(sessions, h, contrib);
  const d30 = contrib.directional?.last30VsPrev30 || {};
  const today = ymdToday();
  const monthList = completedInRange(normalized, addDays(today, -29), today);
  const patterns = aggregateReplayPatterns(normalized);
  const completed = filterCompletedSessions(normalized);
  const pool = monthList.length ? monthList : completed;

  const monthlyPkg = buildReplayMonthlyPackage(sessions, h);
  const monthlyNarr = buildMonthlyReplayReview(sessions, h);

  const mainLessonThisMonth = strongestLessonFromMonth(monthList.length ? monthList : completed);

  const modelPick = pickLearningExamples(pool, 'model', 1, patterns)[0];
  const cautionPick = pickLearningExamples(pool, 'caution', 1, patterns)[0];

  const strongestModelSelf = modelPick
    ? `${modelPick.title || 'Replay'} — ${sessionOneLiner(modelPick)}`
    : trimT(monthlyNarr.strongestStrength || patterns.recurringStrengthTheme?.detail || '— Tag a model replay when you follow the plan cleanly.', 220);

  const strongestCautionSelf = cautionPick
    ? `${cautionPick.title || 'Replay'} — ${sessionOneLiner(cautionPick)}`
    : trimT(monthlyNarr.biggestWeakness || monthlyPkg.weaknessSignal || '— Tag your next costly mistake as a caution.', 220);

  const keepNextMonth = modelPick
    ? trimT(`Keep reinforcing: ${sessionOneLiner(modelPick)}`, 220)
    : trimT(monthlyNarr.strongestStrength || 'Keep: closing replays with honest mistake + lesson text.', 200);

  const correctNextMonth = cautionPick
    ? trimT(
        `Correct next month: the pattern in “${cautionPick.title || 'this replay'}” — ${sessionOneLiner(cautionPick)}`,
        240
      )
    : trimT(monthlyNarr.biggestWeakness || monthlyPkg.correctionFocus || 'Correct: drifting from plan without a written checkpoint.', 240);

  const processBecoming = trimT(monthlyNarr.identityPatternLine, 260);

  let patternBeforeHabit = '';
  if (patterns?.recurringMistakeTheme?.level === 'emerging') {
    patternBeforeHabit = trimT(
      `Emerging in your replay text: ${patterns.recurringMistakeTheme.label} — address it now before it hardens into habit.`,
      220
    );
  } else if (patterns?.recurringMistakeTheme?.level === 'established') {
    patternBeforeHabit = trimT(
      `Established in the vault: ${patterns.recurringMistakeTheme.label} — this is already part of the written record; treat it as process debt to clear.`,
      220
    );
  } else {
    patternBeforeHabit = trimT(
      contrib.behavior?.riskSignals?.[0] || 'No strong recurrence label yet — keep tagging mistakes so next month has sharper contrast.',
      200
    );
  }

  const improvedThisMonth = trimT(monthlyNarr.reviewCompletenessTrend, 220);
  const stillNeedsAttention = trimT(
    monthlyNarr.biggestWeakness || monthlyPkg.weaknessSignal || monthlyPkg.correctionFocus,
    240
  );

  const revisitEntries = pickMonthlyReflectionRevisitEntries(pool, patterns, contrib);
  const examplesToRevisit = revisitEntries.map(({ session, kind, revisitLine }) => ({
    id: session.id,
    kind,
    title: session.title || '—',
    symbol: session.asset || session.symbol || '—',
    date: session.replayDate || session.sourceDate || '—',
    line: sessionOneLiner(session),
    revisitLine,
  }));

  const journalValidatorNudge = reflectionMonthlyJournalNudge(contrib, patterns, d30);

  const nextMonthFocusOneLine = trimT(
    monthlyNarr.monthlyDevelopmentFocus
      ? `Next month: ${monthlyNarr.monthlyDevelopmentFocus}`
      : `Next month: ${trimT(keepNextMonth.replace(/^Keep reinforcing:\s*/i, ''), 200) || 'one model tag, one honest caution, reviews closed same day.'}`,
    260
  );

  const archetypeHint =
    archetype.showArchetypeLabel && archetype.primaryReplayArchetype
      ? `How it shows up (soft): ${archetype.primaryReplayArchetype.label} — ${trimT(archetype.psychologyLines?.patternLine || '', 140)}`
      : null;

  const evidenceNote =
    n < 3
      ? 'Thin month — treat this as direction, not a verdict on your edge.'
      : n < 8
        ? 'Moderate sample — weight recurring themes over one-off sessions.'
        : null;

  const plainSections = [
    '── Aura Trader Replay · monthly reflection (self-review) ──',
    '',
    '[YOUR MONTH IN REPLAYS]',
    `~30d · ${monthlyPkg.completedApprox30d} completed · self-review · not a mentor/admin pack`,
    monthlyPkg.vaultDistribution ? `Vault: ${monthlyPkg.vaultDistribution}` : '',
    '',
    '[WHAT MY REPLAYS TAUGHT ME THIS MONTH]',
    mainLessonThisMonth,
    '',
    '[WHAT IS BECOMING PART OF MY PROCESS]',
    processBecoming,
    '',
    '[WHAT TO KEEP DOING NEXT MONTH]',
    keepNextMonth,
    strongestModelSelf ? `Strongest model read: ${strongestModelSelf}` : '',
    '',
    '[WHAT TO CORRECT NEXT MONTH]',
    correctNextMonth,
    strongestCautionSelf ? `Strongest caution read: ${strongestCautionSelf}` : '',
    '',
    '[PATTERN — BEFORE IT BECOMES HABIT]',
    patternBeforeHabit,
    '',
    '[WHAT IMPROVED THIS MONTH]',
    improvedThisMonth || '— Keep logging completes for a clearer month-over-month read.',
    '',
    '[WHAT STILL NEEDS ATTENTION]',
    stillNeedsAttention,
    '',
    '[REVISIT BEFORE NEXT MONTH]',
    examplesToRevisit.length
      ? examplesToRevisit
          .map(
            (e, i) =>
              `  ${i + 1}. [${e.kind.toUpperCase()}] ${e.title} · ${e.symbol} · ${e.date}\n     ${e.line}\n     → ${e.revisitLine}`
          )
          .join('\n')
      : '— Tag model/caution examples in-window so you have concrete replays to reopen.',
    '',
    '[JOURNAL · PLAYBOOK · VALIDATOR — NEXT MONTH]',
    journalValidatorNudge,
    archetypeHint || '',
    '',
    '[MY FOCUS NEXT MONTH — ONE LINE]',
    nextMonthFocusOneLine,
    evidenceNote ? `\n[EVIDENCE]\n${evidenceNote}` : '',
    '',
    options.internalNote
      ? '[INTERNAL]\nMonthly reflection is replay-sourced — pair with live P&L and risk limits.'
      : '',
    '── end ──',
  ].filter(Boolean);

  const plainText = plainSections.join('\n');

  const compactShare = [
    '[Aura · monthly reflection]',
    `Learned: ${trimT(mainLessonThisMonth, 90)}`,
    `Keep: ${trimT(keepNextMonth, 85)}`,
    `Correct: ${trimT(correctNextMonth, 85)}`,
    nextMonthFocusOneLine ? `Focus: ${trimT(nextMonthFocusOneLine, 100)}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    kind: 'aura.replayCoachingPack.monthlyReflection',
    generatedAt: new Date().toISOString(),
    monthlySnapshot: `~30d · ${monthlyPkg.completedApprox30d} completes`,
    mainLessonThisMonth,
    processBecoming,
    keepNextMonth,
    correctNextMonth,
    patternBeforeHabit,
    improvedThisMonth,
    stillNeedsAttention,
    strongestModelSelf,
    strongestCautionSelf,
    examplesToRevisit,
    journalValidatorNudge,
    nextMonthFocusOneLine,
    archetypeHint,
    evidenceNote,
    plainText,
    compactShare,
  };
}

export function formatReplayMonthlyReflectionPackPlain(pack) {
  if (!pack?.plainText) return '';
  return pack.plainText;
}

/**
 * Trader-facing long-horizon review — strategic process identity; optional preset windows (90d, YTD, …).
 */
export function buildReplayLongHorizonReviewPack(sessions = [], habitStats = null, options = {}) {
  const preset = options.presetWindow || options.reviewPreset || REPLAY_REVIEW_PRESET.ALL_TIME;
  const win = resolveReplayReviewWindow(preset);
  const windowLabel = getReplayWindowLabel(preset);

  const normalizedFull = (sessions || []).map((s) => normalizeReplay(s));
  const normalized =
    win.fromYmd && win.toYmd ? filterReplaySessionsForWindow(normalizedFull, win) : normalizedFull;
  const idSet = new Set((normalized || []).map((s) => s.id));
  const sessionsForEngines =
    win.fromYmd && win.toYmd ? (sessions || []).filter((s) => idSet.has(s.id)) : sessions || [];

  const completed = filterCompletedSessions(normalized);
  const n = completed.length;

  const h = habitStats ?? computeReplayHabitStats(normalized);
  const contrib = buildReplayContributionProfile(normalized, h);
  const archetype = buildReplayBehaviorArchetypeProfile(sessionsForEngines, h, contrib);
  const identity = buildReplayIdentitySummary(sessionsForEngines);
  const patterns = identity.patterns || aggregateReplayPatterns(normalized);
  const d30 = contrib.directional?.last30VsPrev30 || {};
  const guidance = identity.developmentGuidance;

  const enduringLesson = strongestLessonAllTime(completed);

  const processEmerging = trimT(
    identity.developmentFocus?.detail
      || `${identity.developmentFocus?.label || 'Process read'}${identity.developmentFocus?.rationale ? ` — ${identity.developmentFocus.rationale}` : ''}`,
    280
  );

  const repeatableStrength = trimT(
    patterns?.recurringStrengthTheme?.detail
      || guidance?.strengths?.[0]?.maintain
      || contrib.behavior?.strengths?.[0]
      || '— Tag model examples so a repeatable strength shows up in the vault.',
    260
  );

  const persistentCaution = patterns?.recurringMistakeTheme
    ? `${patterns.recurringMistakeTheme.label} (${patterns.recurringMistakeTheme.level})`
    : trimT(contrib.behavior?.cautions?.[0] || '— No labelled recurrence yet — keep honest mistake text on completes.', 220);

  const improvedLongRun = longRunImprovementLine(d30, preset);

  const stillLeaking = trimT(
    patterns?.recurringMistakeTheme?.label
      ? preset === REPLAY_REVIEW_PRESET.ALL_TIME
        ? `Same theme keeps surfacing: ${patterns.recurringMistakeTheme.label} — treat as elimination work, not noise.`
        : preset === REPLAY_REVIEW_PRESET.YTD
          ? `Year to date this theme keeps appearing: ${patterns.recurringMistakeTheme.label} — eliminate it before you size up later in the year.`
          : `In ${windowLabel.toLowerCase()}, the stubborn pattern is: ${patterns.recurringMistakeTheme.label} — correct it before the next phase.`
      : contrib.behavior?.cautions?.[0] || contrib.behavior?.riskSignals?.[0] || '— Insufficient recurrence label — watch the next month of reviews for a stubborn leak.',
    260
  );

  const modelPick = pickLearningExamples(completed, 'model', 1, patterns)[0];
  const cautionPick = pickLearningExamples(completed, 'caution', 1, patterns)[0];

  const strongestModelLongRun = modelPick
    ? `${modelPick.title || 'Replay'} — ${sessionOneLiner(modelPick)}`
    : trimT(repeatableStrength, 220);

  const strongestCautionLongRun = cautionPick
    ? `${cautionPick.title || 'Replay'} — ${sessionOneLiner(cautionPick)}`
    : persistentCaution;

  const keepInProcess = trimT(
    guidance?.strengths?.[0]?.headline
      ? `Keep: ${guidance.strengths[0].headline} — ${trimT(guidance.strengths[0].maintain, 180)}`
      : `Keep: ${repeatableStrength}`,
    260
  );

  const refineBeforeCeiling = trimT(
    patterns?.recurringMistakeTheme?.level === 'emerging'
      ? preset === REPLAY_REVIEW_PRESET.ALL_TIME
        ? `Refine: ${patterns.recurringMistakeTheme.label} — tighten one playbook rule before it locks in as identity.`
        : `Refine in this window: ${patterns.recurringMistakeTheme.label} — tighten one rule before the next phase.`
      : archetype.psychologyLines?.patternLine
        ? `Refine: ${trimT(archetype.psychologyLines.patternLine, 220)}`
        : 'Refine: review depth and written lessons — short reflections cap how much identity can sharpen.',
    260
  );

  const eliminateLeak = trimT(
    guidance?.topGrowthPriority?.stopDoing
      ? `Eliminate: ${guidance.topGrowthPriority.stopDoing}`
      : patterns?.recurringMistakeTheme
        ? `Eliminate: repeating “${trimT(patterns.recurringMistakeTheme.label, 100)}” without a written counter-rule.`
        : 'Eliminate: unnamed process drift — tag cautions when you break plan so the archive can name the leak.',
    260
  );

  const anchorEntries = pickLongHorizonAnchorEntries(completed, patterns, contrib, preset);
  const anchorExamples = anchorEntries.map(({ session, kind, anchorLine }) => ({
    id: session.id,
    kind,
    title: session.title || '—',
    symbol: session.asset || session.symbol || '—',
    date: session.replayDate || session.sourceDate || '—',
    line: sessionOneLiner(session),
    anchorLine,
  }));

  const strategicNudge = longHorizonStrategicNudge(contrib, patterns, d30, guidance, preset);

  const nextPrefix =
    preset === REPLAY_REVIEW_PRESET.YTD
      ? 'Rest of year'
      : preset === REPLAY_REVIEW_PRESET.LAST_90D || preset === REPLAY_REVIEW_PRESET.LAST_180D
        ? 'Next phase'
        : 'Next quarter / phase';

  const nextQuarterFocusOneLine = trimT(
    guidance?.topGrowthPriority?.practiceNext
      ? `${nextPrefix}: ${guidance.topGrowthPriority.practiceNext}`
      : `${nextPrefix}: ${trimT(eliminateLeak.replace(/^Eliminate:\s*/i, ''), 200) || 'one fewer leak, one anchored model replay.'}`,
    280
  );

  const archetypeProcessLine =
    archetype.showArchetypeLabel && archetype.primaryReplayArchetype
      ? `Archetype read (soft): ${archetype.primaryReplayArchetype.label} — ${trimT(archetype.psychologyLines?.patternLine || '', 140)}`
      : null;

  const scopeLine =
    win.fromYmd && win.toYmd
      ? `${windowLabel} · ${win.fromYmd} → ${win.toYmd} · ${n} completed`
      : `All-time · ${n} completed`;

  const longHorizonSnapshot = `${scopeLine} · identity confidence: ${identity.evidence?.confidence || '—'} · vault: models ${patterns?.modelExampleCount ?? 0} · cautions ${patterns?.cautionExampleCount ?? 0}`;

  const thinN = preset === REPLAY_REVIEW_PRESET.ALL_TIME ? 5 : 4;
  const modN = preset === REPLAY_REVIEW_PRESET.ALL_TIME ? 12 : 8;
  const evidenceNote =
    n < thinN
      ? preset === REPLAY_REVIEW_PRESET.ALL_TIME
        ? 'Thin history — long-horizon read is directional; add completes before treating this as core identity.'
        : `Thin sample in ${windowLabel.toLowerCase()} — directional only; widen the window or add more completed replays.`
      : n < modN
        ? preset === REPLAY_REVIEW_PRESET.ALL_TIME
          ? 'Moderate archive — favour recurring themes over single sessions when you decide what to keep or eliminate.'
          : 'Moderate sample in this window — weight recurring themes over one-off sessions before you change playbook rules.'
        : null;

  const lessonSection =
    preset === REPLAY_REVIEW_PRESET.ALL_TIME ? '[STRONGEST ENDURING LESSON]' : '[STRONGEST LESSON IN THIS WINDOW]';
  const strengthSection =
    preset === REPLAY_REVIEW_PRESET.ALL_TIME
      ? '[REPEATABLE STRENGTH — WHAT HELD UP]'
      : '[REPEATABLE STRENGTH IN THIS WINDOW]';
  const cautionSection =
    preset === REPLAY_REVIEW_PRESET.ALL_TIME
      ? '[PERSISTENT CAUTION — WHAT KEEPS REPEATING]'
      : '[PERSISTENT CAUTION IN THIS WINDOW]';

  const plainSections = [
    `── Aura Trader Replay · ${windowReviewTitle(preset)} (self-review) ──`,
    '',
    '[LONG-HORIZON SNAPSHOT]',
    longHorizonSnapshot,
    identity.evidence?.uncertaintyNotes?.[0] ? `Note: ${trimT(identity.evidence.uncertaintyNotes[0], 200)}` : '',
    '',
    '[PROCESS EMERGING FROM MY REPLAYS]',
    processEmerging,
    '',
    lessonSection,
    enduringLesson,
    '',
    strengthSection,
    repeatableStrength,
    strongestModelLongRun ? `Strongest model thread: ${strongestModelLongRun}` : '',
    '',
    cautionSection,
    persistentCaution,
    strongestCautionLongRun ? `Strongest caution thread: ${strongestCautionLongRun}` : '',
    '',
    improvedSectionHeading(preset),
    improvedLongRun,
    '',
    '[WHAT STILL LEAKS]',
    stillLeaking,
    '',
    '[KEEP · REFINE · ELIMINATE]',
    keepInProcess,
    refineBeforeCeiling,
    eliminateLeak,
    '',
    '[ANCHOR REPLAYS TO REVISIT]',
    anchorExamples.length
      ? anchorExamples
          .map(
            (e, i) =>
              `  ${i + 1}. [${e.kind.toUpperCase()}] ${e.title} · ${e.symbol} · ${e.date}\n     ${e.line}\n     → ${e.anchorLine}`
          )
          .join('\n')
      : preset === REPLAY_REVIEW_PRESET.ALL_TIME
        ? '— Tag model and caution examples over time so you have anchor replays to reopen.'
        : `— Not enough tagged examples in ${windowLabel.toLowerCase()} — close reviews with model/caution tags in this period.`,
    '',
    '[JOURNAL · PLAYBOOK · VALIDATOR · REPLAY]',
    strategicNudge,
    archetypeProcessLine || '',
    '',
    nextPeriodSectionTitle(preset),
    nextQuarterFocusOneLine,
    evidenceNote ? `\n[EVIDENCE]\n${evidenceNote}` : '',
    '',
    options.internalNote
      ? '[INTERNAL]\nLong-horizon pack is replay-sourced — reconcile with live results, risk limits, and desk reality.'
      : '',
    '── end ──',
  ].filter(Boolean);

  const plainText = plainSections.join('\n');

  const compactShare = [
    longHorizonShareTag(preset),
    `Window: ${windowLabel}`,
    `Process: ${trimT(processEmerging, 95)}`,
    `Keep: ${trimT(keepInProcess, 85)}`,
    `Eliminate: ${trimT(eliminateLeak, 85)}`,
    nextQuarterFocusOneLine ? `Focus: ${trimT(nextQuarterFocusOneLine, 100)}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    kind: 'aura.replayCoachingPack.longHorizon',
    generatedAt: new Date().toISOString(),
    presetWindow: preset,
    windowLabel,
    windowFromYmd: win.fromYmd,
    windowToYmd: win.toYmd,
    longHorizonSnapshot,
    processEmerging,
    enduringLesson,
    repeatableStrength,
    persistentCaution,
    improvedLongRun,
    stillLeaking,
    keepInProcess,
    refineBeforeCeiling,
    eliminateLeak,
    strongestModelLongRun,
    strongestCautionLongRun,
    anchorExamples,
    strategicNudge,
    nextQuarterFocusOneLine,
    archetypeProcessLine,
    evidenceNote,
    plainText,
    compactShare,
    uiLabels: {
      processEmerging: preset === REPLAY_REVIEW_PRESET.ALL_TIME ? 'Process emerging' : 'Process in this window',
      enduringLesson: preset === REPLAY_REVIEW_PRESET.ALL_TIME ? 'Enduring lesson' : 'Strongest lesson (this window)',
      strengthHeld: preset === REPLAY_REVIEW_PRESET.ALL_TIME ? 'Strength that held' : 'Strength in this window',
      cautionRepeats: preset === REPLAY_REVIEW_PRESET.ALL_TIME ? 'Caution that repeats' : 'Caution persisting here',
      improved: preset === REPLAY_REVIEW_PRESET.ALL_TIME ? 'Improved (long run)' : 'Improved in this window',
      nextFocus:
        preset === REPLAY_REVIEW_PRESET.YTD
          ? 'Rest of year'
          : preset === REPLAY_REVIEW_PRESET.ALL_TIME
            ? 'Next quarter / phase'
            : 'Next phase',
    },
  };
}

export function formatReplayLongHorizonReviewPackPlain(pack) {
  if (!pack?.plainText) return '';
  return pack.plainText;
}

/** Trader self-review — weekly + monthly + long-horizon reflection text. */
export function buildReplayReflectionPackBundle(sessions, habitStats, options) {
  const o = options || {};
  return {
    generatedAt: new Date().toISOString(),
    weeklyReflection: buildReplayWeeklyReflectionPack(sessions, habitStats, options),
    monthlyReflection: buildReplayMonthlyReflectionPack(sessions, habitStats, options),
    longHorizonReview: buildReplayLongHorizonReviewPack(sessions, habitStats, {
      ...o,
      presetWindow: REPLAY_REVIEW_PRESET.ALL_TIME,
    }),
  };
}

export function formatReplayReflectionPackBundlePlain(sessions, habitStats, options) {
  const b = buildReplayReflectionPackBundle(sessions, habitStats, options);
  return [
    '=== TRADER WEEKLY REFLECTION ===',
    '\n',
    b.weeklyReflection.plainText,
    '\n\n',
    '=== TRADER MONTHLY REFLECTION ===',
    '\n',
    b.monthlyReflection.plainText,
    '\n\n',
    '=== TRADER LONG-HORIZON REVIEW ===',
    '\n',
    b.longHorizonReview.plainText,
  ].join('');
}

/**
 * @param {object[]} sessions
 * @param {object|null} habitStats
 * @param {{ internalNote?: boolean, presetWindow?: string, reviewPreset?: string }} [options]
 *   — omit preset for legacy rolling ~30d coach pack (default, backward compatible).
 */
export function buildReplayMonthlyCoachingPack(sessions = [], habitStats = null, options = {}) {
  const explicitPreset = options.presetWindow || options.reviewPreset;
  const legacyMode = !explicitPreset;
  const preset = explicitPreset || REPLAY_REVIEW_PRESET.ALL_TIME;

  const normalizedFull = (sessions || []).map((s) => normalizeReplay(s));
  let normalized;
  let sessionsForEngines;
  if (legacyMode) {
    normalized = normalizedFull;
    sessionsForEngines = sessions || [];
  } else {
    const win = resolveReplayReviewWindow(preset);
    normalized =
      win.fromYmd && win.toYmd ? filterReplaySessionsForWindow(normalizedFull, win) : normalizedFull;
    const idSet = new Set((normalized || []).map((s) => s.id));
    sessionsForEngines =
      win.fromYmd && win.toYmd ? (sessions || []).filter((s) => idSet.has(s.id)) : sessions || [];
  }

  const n = normalized.filter((s) => s.replayStatus === REPLAY_STATUSES.completed).length;
  const h = habitStats ?? computeReplayHabitStats(normalized);
  const contrib = buildReplayContributionProfile(normalized, h);
  const today = ymdToday();
  const monthList = completedInRange(normalized, addDays(today, -29), today);
  const patterns = aggregateReplayPatterns(normalized);

  const monthlyPkg = buildReplayMonthlyPackage(sessionsForEngines, h);
  const monthlyNarr = buildMonthlyReplayReview(sessionsForEngines, h);
  const mentorPrep = buildReplayMentorPrepPackage(sessionsForEngines, h);
  const archetype = buildReplayBehaviorArchetypeProfile(sessionsForEngines, h, contrib);

  const exLimit = n >= 8 ? 2 : n >= 4 ? 2 : n >= 3 ? 1 : 0;
  const completed = filterCompletedSessions(normalized);

  let modelSessions = [];
  let cautionSessions = [];
  if (exLimit) {
    if (legacyMode) {
      const pool = monthList.length ? monthList : completed;
      modelSessions = pool.length ? pickLearningExamples(pool, 'model', exLimit, patterns) : [];
      cautionSessions = pool.length ? pickLearningExamples(pool, 'caution', exLimit, patterns) : [];
    } else {
      const pool = completed.length ? completed : [];
      modelSessions = pool.length
        ? pickCoachWindowLearningExamples(pool, 'model', exLimit, patterns, preset)
        : [];
      cautionSessions = pool.length
        ? pickCoachWindowLearningExamples(pool, 'caution', exLimit, patterns, preset)
        : [];
    }
  }

  const modelExamplesToReinforce = modelSessions.map(exampleRow);
  const cautionExamplesToCorrect = cautionSessions.map(exampleRow);

  const recurringLesson = legacyMode
    ? strongestLessonFromMonth(monthList.length ? monthList : completed)
    : strongestLessonFromMonth(completed.length ? completed : monthList);

  const improvedThisMonth = trimT(monthlyNarr.reviewCompletenessTrend, 200);
  const stillNeedsCorrection = trimT(monthlyNarr.biggestWeakness || monthlyPkg.correctionFocus, 220);

  const coachFocusFirst = trimT(
    mentorPrep.topIssueFirst || monthlyPkg.correctionFocus || contrib.developmentActions?.[0],
    240
  );

  const nextCoachingActions = [
    mentorPrep.nextActions?.[0],
    mentorPrep.nextActions?.[1],
    contrib.developmentActions?.[0],
    contrib.developmentActions?.[1],
  ]
    .filter(Boolean)
    .filter((x, i, a) => a.indexOf(x) === i)
    .slice(0, 4);

  const reviewPriority = mapPriority(mentorPrep, contrib);

  const winMeta = legacyMode
    ? { fromYmd: addDays(today, -29), toYmd: today, preset: 'rolling' }
    : resolveReplayReviewWindow(preset);
  const windowLabel = legacyMode ? 'Rolling (~30d)' : getReplayWindowLabel(preset);

  const thinN = legacyMode ? 3 : preset === REPLAY_REVIEW_PRESET.ALL_TIME ? 5 : 4;
  const modN = legacyMode ? 6 : preset === REPLAY_REVIEW_PRESET.ALL_TIME ? 8 : 6;
  const evidenceNote =
    n < thinN
      ? legacyMode
        ? 'Thin replay sample — use this pack as directional prep, not a verdict.'
        : `Thin sample in ${windowLabel.toLowerCase()} — assign actions cautiously; widen the window if needed.`
      : n < modN
        ? legacyMode
          ? 'Moderate sample — weight recurring themes more than one-off sessions.'
          : 'Moderate sample in this window — anchor the next call on repeats, not single sessions.'
        : null;

  const monthlySnapshot = legacyMode
    ? `~30d · ${monthlyPkg.completedApprox30d} completed replays · vault: ${monthlyPkg.vaultDistribution}`
    : winMeta.fromYmd && winMeta.toYmd
      ? `${windowLabel} · ${winMeta.fromYmd} → ${winMeta.toYmd} · ${n} completed · vault: models ${patterns?.modelExampleCount ?? 0} · cautions ${patterns?.cautionExampleCount ?? 0}`
      : `${windowLabel} · ${n} completed · vault: models ${patterns?.modelExampleCount ?? 0} · cautions ${patterns?.cautionExampleCount ?? 0}`;

  const disciplineSignal =
    trimT(contrib.scoreContributionExplanations?.[0] || contrib.discipline?.replayDisciplineExplanation, 200) ||
    '—';

  const strongestRepeatedCaution = patterns.recurringMistakeTheme
    ? `${patterns.recurringMistakeTheme.label} (${patterns.recurringMistakeTheme.level})`
    : trimT(monthlyNarr.biggestWeakness, 180);

  const strongestModelBehaviour = trimT(monthlyNarr.strongestStrength || patterns.recurringStrengthTheme?.detail, 200);

  const behaviourPatternLine = archetype.psychologyLines?.patternLine || null;
  const archetypeLabel = archetype.showArchetypeLabel && archetype.primaryReplayArchetype
    ? archetype.primaryReplayArchetype.label
    : null;

  const headerLine = legacyMode
    ? '── Aura Trader Replay · monthly coaching pack ──'
    : `── Aura Trader Replay · coach review (${windowLabel}) ──`;
  const snapshotSection = legacyMode ? '[MONTHLY SNAPSHOT]' : '[COACHING WINDOW SNAPSHOT]';
  const improvedSection = legacyMode ? '[IMPROVED THIS MONTH]' : '[WHAT IMPROVED IN THIS COACHING WINDOW]';
  const stillSection = legacyMode
    ? '[STILL NEEDS CORRECTION]'
    : '[STILL NEEDS CORRECTION BEFORE NEXT REVIEW]';
  const beforeSessionLine = legacyMode
    ? 'Skim reinforce vs correct lines; open 1 model + 1 caution in the vault if tagged.'
    : 'Assign one reinforce + one correct from the examples; reopen them on the next review call.';

  const cautionSectionHeader = legacyMode
    ? '[STRONGEST REPEATED CAUTION]'
    : '[STRONGEST REPEATED CAUTION — COACH TO THIS]';
  const modelSectionHeader = legacyMode
    ? '[STRONGEST MODEL BEHAVIOUR]'
    : '[STRONGEST MODEL BEHAVIOUR — REINFORCE THIS]';

  const plainSections = [
    headerLine,
    '',
    snapshotSection,
    monthlySnapshot,
    `[REVIEW PRIORITY] ${reviewPriority.toUpperCase()}`,
    '',
    '[COACH FOCUS FIRST]',
    coachFocusFirst,
    '',
    '[PATTERN]',
    archetypeLabel ? `Behaviour archetype (soft): ${archetypeLabel}` : 'Archetype: not labelled — see pattern line.',
    behaviourPatternLine || trimT(patterns.recurringMistakeTheme?.label || '—', 160),
    '',
    '[DISCIPLINE / CONTRIBUTION SIGNAL]',
    disciplineSignal,
    `Discipline trend (indices): ${monthlyPkg.disciplineTrendLabel || '—'}`,
    '',
    cautionSectionHeader,
    strongestRepeatedCaution,
    '',
    modelSectionHeader,
    strongestModelBehaviour,
    '',
    '[REINFORCE — MODEL EXAMPLES]',
    modelExamplesToReinforce.length
      ? modelExamplesToReinforce.map((e, i) => `  ${i + 1}. ${e.title} · ${e.symbol} · ${e.date} — ${e.line}`).join('\n')
      : '— No model-tagged examples in window — tag the next clean execution.',
    '',
    '[CORRECT — CAUTION EXAMPLES]',
    cautionExamplesToCorrect.length
      ? cautionExamplesToCorrect.map((e, i) => `  ${i + 1}. ${e.title} · ${e.symbol} · ${e.date} — ${e.line}`).join('\n')
      : '— No caution-tagged examples in window — tag the next costly mistake.',
    '',
    '[RECURRING LESSON THREAD]',
    recurringLesson,
    '',
    improvedSection,
    improvedThisMonth,
    '',
    stillSection,
    stillNeedsCorrection,
    '',
    '[NEXT COACHING ACTIONS]',
    ...nextCoachingActions.map((a, i) => `  ${i + 1}. ${a}`),
    '',
    '[BEFORE NEXT SESSION]',
    beforeSessionLine,
    evidenceNote ? `\n[EVIDENCE]\n${evidenceNote}` : '',
    '',
    options.internalNote
      ? '[INTERNAL]\nPack is replay-sourced only — combine with live risk rules and desk context.'
      : '',
    '── end ──',
  ].filter(Boolean);

  const plainText = plainSections.join('\n');

  const compactShare = [
    coachReviewShareTag(legacyMode ? null : preset),
    !legacyMode ? `Window: ${windowLabel}` : '',
    `Priority: ${reviewPriority} · ${trimT(coachFocusFirst, 100)}`,
    `Reinforce: ${trimT(strongestModelBehaviour, 90)}`,
    `Correct: ${trimT(strongestRepeatedCaution, 90)}`,
    nextCoachingActions[0] ? `Next: ${trimT(nextCoachingActions[0], 100)}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    kind: 'aura.replayCoachingPack.monthly',
    generatedAt: new Date().toISOString(),
    coachPackLegacyRolling: legacyMode,
    presetWindow: legacyMode ? null : preset,
    windowLabel,
    windowFromYmd: winMeta.fromYmd,
    windowToYmd: winMeta.toYmd,
    reviewPriority,
    coachFocusFirst,
    monthlySnapshot,
    strongestRepeatedCaution,
    strongestModelBehaviour,
    disciplineSignal,
    disciplineTrendLabel: monthlyPkg.disciplineTrendLabel,
    behaviourPatternLine,
    archetypeLabel,
    archetypeConfidence: archetype.archetypeConfidence,
    modelExamplesToReinforce,
    cautionExamplesToCorrect,
    recurringLesson,
    improvedThisMonth,
    stillNeedsCorrection,
    nextCoachingActions,
    evidenceNote,
    mentorPrepSnapshot: {
      reviewPriority: mentorPrep.reviewPriority,
      recurrence: mentorPrep.recurrence,
    },
    plainText,
    compactShare,
    uiLabels: {
      snapshot: legacyMode ? 'Snapshot (~30d)' : `Coaching window · ${windowLabel}`,
      coachFirst: 'Coach focus first',
      reinforce: 'Reinforce (model thread)',
      correct: 'Correct (caution thread)',
      improved: legacyMode ? 'Improved (~30d trend)' : 'Improved in this window',
      still: legacyMode ? 'Still needs correction' : 'Still needs correction before next review',
    },
  };
}

/**
 * Mentor/admin archive-scale review — full replay history, action-oriented (not trader self-reflection).
 * @param {{ internalNote?: boolean }} [options]
 */
export function buildReplayArchiveCoachingPack(sessions = [], habitStats = null, options = {}) {
  const normalized = (sessions || []).map((s) => normalizeReplay(s));
  const n = normalized.filter((s) => s.replayStatus === REPLAY_STATUSES.completed).length;
  const h = habitStats ?? computeReplayHabitStats(normalized);
  const contrib = buildReplayContributionProfile(normalized, h);
  const identity = buildReplayIdentitySummary(sessions || []);
  const guidance = identity.developmentGuidance;
  const patterns = identity.patterns || aggregateReplayPatterns(normalized);
  const monthlyPkg = buildReplayMonthlyPackage(sessions || [], h);
  const monthlyNarr = buildMonthlyReplayReview(sessions || [], h);
  const mentorPrep = buildReplayMentorPrepPackage(sessions || [], h);
  const archetype = buildReplayBehaviorArchetypeProfile(sessions || [], h, contrib);

  const completed = filterCompletedSessions(normalized);
  const exLimit = n >= 8 ? 2 : n >= 4 ? 2 : n >= 3 ? 1 : 0;

  const modelSessions = exLimit ? pickArchiveCoachLearningExamples(completed, 'model', exLimit, patterns) : [];
  const cautionSessions = exLimit ? pickArchiveCoachLearningExamples(completed, 'caution', exLimit, patterns) : [];
  const modelExamplesToReinforce = modelSessions.map((s, i) =>
    exampleRowArchiveCoach(s, 'model', patterns, contrib, i)
  );
  const cautionExamplesToCorrect = cautionSessions.map((s, i) =>
    exampleRowArchiveCoach(s, 'caution', patterns, contrib, i)
  );

  const recurringLesson = strongestLessonAllTime(completed);
  const d30 = contrib.directional?.last30VsPrev30 || {};
  const improvedLongArc = longRunImprovementLine(d30, REPLAY_REVIEW_PRESET.ALL_TIME);

  const strongestRepeatedCaution = patterns.recurringMistakeTheme
    ? `${patterns.recurringMistakeTheme.label} (${patterns.recurringMistakeTheme.level})`
    : trimT(monthlyNarr.biggestWeakness, 180);

  const strongestModelBehaviour = trimT(
    monthlyNarr.strongestStrength || patterns.recurringStrengthTheme?.detail,
    200
  );

  const stillNeedsCorrection = trimT(
    patterns?.recurringMistakeTheme?.label
      ? `Still correct with this trader: ${patterns.recurringMistakeTheme.label} — improvement may show in places; follow-through on this thread remains weak.`
      : monthlyNarr.biggestWeakness || monthlyPkg.correctionFocus,
    260
  );

  const eliminateBeforeCeiling = trimT(
    guidance?.topGrowthPriority?.stopDoing
      ? `Eliminate / hard-rule: ${guidance.topGrowthPriority.stopDoing} — before it becomes a non-negotiable ceiling.`
      : patterns?.recurringMistakeTheme
        ? `Eliminate repeat of “${trimT(patterns.recurringMistakeTheme.label, 90)}” without a written counter-rule — coach this explicitly.`
        : '— No labelled elimination thread yet — watch completes for a stubborn leak to name with the trader.',
    260
  );

  const coachFocusFirst = trimT(
    mentorPrep.topIssueFirst ||
      monthlyPkg.correctionFocus ||
      contrib.developmentActions?.[0] ||
      'Anchor the next mentor review on plan discipline and honest mistake labelling.',
    260
  );

  const nextCoachingActions = [
    mentorPrep.nextActions?.[0],
    mentorPrep.nextActions?.[1],
    `Carry ${trimT(strongestModelBehaviour, 80) || 'model standards'} into the next review cycle as the reinforce line.`,
    contrib.developmentActions?.[0],
    contrib.developmentActions?.[1],
  ]
    .filter(Boolean)
    .filter((x, i, a) => a.indexOf(x) === i)
    .slice(0, 4);

  const reviewPriority = mapPriority(mentorPrep, contrib);

  const disciplineSignal =
    trimT(contrib.scoreContributionExplanations?.[0] || contrib.discipline?.replayDisciplineExplanation, 220) ||
    '—';

  const behaviourPatternLine = archetype.psychologyLines?.patternLine || null;
  const archetypeLabel = archetype.showArchetypeLabel && archetype.primaryReplayArchetype
    ? archetype.primaryReplayArchetype.label
    : null;

  const archiveSnapshot = `Archive (all-time) · ${n} completed · vault: models ${patterns?.modelExampleCount ?? 0} · cautions ${patterns?.cautionExampleCount ?? 0} · identity confidence: ${identity.evidence?.confidence || '—'}`;

  const evidenceNote =
    n < 5
      ? 'Thin archive — treat as directional mentor prep until completes accumulate.'
      : n < 12
        ? 'Moderate archive — weight recurring themes; avoid over-weighting single sessions in annual-style reviews.'
        : null;

  const nextPhaseLine = trimT(
    guidance?.topGrowthPriority?.practiceNext ||
      nextCoachingActions[0] ||
      'Assign one reinforce and one correct from the anchors; reopen on the next coaching cycle.',
    220
  );

  const plainSections = [
    '── Aura Trader Replay · archive coach review (mentor/admin) ──',
    '',
    '[ARCHIVE SNAPSHOT]',
    archiveSnapshot,
    identity.evidence?.uncertaintyNotes?.[0] ? `Note: ${trimT(identity.evidence.uncertaintyNotes[0], 200)}` : '',
    '',
    `[REVIEW PRIORITY] ${reviewPriority.toUpperCase()}`,
    '',
    '[COACH FOCUS — ADDRESS WITH THIS TRADER]',
    coachFocusFirst,
    '',
    '[PATTERN / ARCHETYPE]',
    archetypeLabel ? `Behaviour archetype (soft): ${archetypeLabel}` : 'Archetype: not labelled — use pattern line below.',
    behaviourPatternLine || trimT(patterns.recurringMistakeTheme?.label || '—', 160),
    '',
    '[DISCIPLINE & CONTRIBUTION — LONG RUN]',
    disciplineSignal,
    `Discipline trend (indices): ${monthlyPkg.disciplineTrendLabel || '—'}`,
    '',
    '[MOST PERSISTENT CAUTION — ACROSS ARCHIVE]',
    strongestRepeatedCaution,
    '',
    '[ENDURING MODEL STRENGTH — REINFORCE LONG-TERM]',
    strongestModelBehaviour,
    '',
    '[ANCHOR — MODEL REPLAYS TO REINFORCE]',
    modelExamplesToReinforce.length
      ? modelExamplesToReinforce
          .map(
            (e, i) =>
              `  ${i + 1}. ${e.title} · ${e.symbol} · ${e.date} — ${e.line}\n     → ${e.archiveCoachLine}`
          )
          .join('\n')
      : '— No model-tagged examples in archive — have the trader tag the next clean execution.',
    '',
    '[ANCHOR — CAUTION REPLAYS TO CORRECT]',
    cautionExamplesToCorrect.length
      ? cautionExamplesToCorrect
          .map(
            (e, i) =>
              `  ${i + 1}. ${e.title} · ${e.symbol} · ${e.date} — ${e.line}\n     → ${e.archiveCoachLine}`
          )
          .join('\n')
      : '— No caution-tagged examples — have the trader tag the next costly mistake.',
    '',
    '[RECURRING LESSON THEME — ACROSS HISTORY]',
    recurringLesson,
    '',
    '[IMPROVED OVER THE LONGER ARC]',
    improvedLongArc,
    '',
    '[CORRECT / ELIMINATE BEFORE CEILING]',
    stillNeedsCorrection,
    eliminateBeforeCeiling,
    '',
    '[NEXT COACHING CYCLE — ACTIONS]',
    ...nextCoachingActions.map((a, i) => `  ${i + 1}. ${a}`),
    '',
    '[NEXT PHASE / QUARTER — ONE LINE]',
    nextPhaseLine,
    evidenceNote ? `\n[EVIDENCE]\n${evidenceNote}` : '',
    '',
    options.internalNote
      ? '[INTERNAL]\nArchive coach pack is replay-sourced — reconcile with live risk, size, and desk reality.'
      : '',
    '── end ──',
  ].filter(Boolean);

  const plainText = plainSections.join('\n');

  const compactShare = [
    '[Aura · archive coach review]',
    'Scope: full replay archive (mentor/admin)',
    `Priority: ${reviewPriority} · ${trimT(coachFocusFirst, 100)}`,
    `Reinforce long-term: ${trimT(strongestModelBehaviour, 90)}`,
    `Persistent caution: ${trimT(strongestRepeatedCaution, 90)}`,
    nextCoachingActions[0] ? `Next cycle: ${trimT(nextCoachingActions[0], 100)}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    kind: 'aura.replayCoachingPack.archiveCoach',
    isArchiveCoachPack: true,
    generatedAt: new Date().toISOString(),
    presetWindow: REPLAY_REVIEW_PRESET.ALL_TIME,
    windowLabel: 'Archive (all-time)',
    windowFromYmd: null,
    windowToYmd: null,
    coachPackLegacyRolling: false,
    reviewPriority,
    coachFocusFirst,
    monthlySnapshot: archiveSnapshot,
    archiveSnapshot,
    strongestRepeatedCaution,
    strongestModelBehaviour,
    disciplineSignal,
    disciplineTrendLabel: monthlyPkg.disciplineTrendLabel,
    behaviourPatternLine,
    archetypeLabel,
    archetypeConfidence: archetype.archetypeConfidence,
    modelExamplesToReinforce,
    cautionExamplesToCorrect,
    recurringLesson,
    improvedThisMonth: improvedLongArc,
    improvedLongArc,
    stillNeedsCorrection,
    eliminateBeforeCeiling,
    nextPhaseLine,
    nextCoachingActions,
    evidenceNote,
    mentorPrepSnapshot: {
      reviewPriority: mentorPrep.reviewPriority,
      recurrence: mentorPrep.recurrence,
    },
    plainText,
    compactShare,
    uiLabels: {
      snapshot: 'Archive snapshot (mentor)',
      coachFirst: 'Coach focus — address with trader',
      reinforce: 'Enduring strength to reinforce',
      correct: 'Persistent caution to correct',
      improved: 'Improved over longer arc',
      still: 'Correct / eliminate before ceiling',
    },
  };
}

export function formatReplayArchiveCoachingPackPlain(pack) {
  if (!pack?.plainText) return '';
  return pack.plainText;
}

export function formatReplayMonthlyCoachingPackPlain(pack) {
  if (!pack?.plainText) return '';
  return pack.plainText;
}

/** Alias — windowed coach pack uses the same plain-text shape as monthly coaching. */
export function formatReplayWindowedCoachingPackPlain(pack) {
  return formatReplayMonthlyCoachingPackPlain(pack);
}

/** Alias — coach/admin quarter window pack; same builder as monthly with `presetWindow` set. */
export function buildReplayWindowedCoachingPack(sessions, habitStats, options = {}) {
  return buildReplayMonthlyCoachingPack(sessions, habitStats, options);
}

/** Combined weekly (tactical) + monthly (pattern) coaching text for export surfaces. */
export function buildReplayCoachingPackBundle(sessions, habitStats, options) {
  const o = options || {};
  const { presetWindow, reviewPreset, ...monthlyOpts } = o;
  return {
    generatedAt: new Date().toISOString(),
    weekly: buildReplayWeeklyReviewPack(sessions, habitStats, options),
    monthly: buildReplayMonthlyCoachingPack(sessions, habitStats, monthlyOpts),
  };
}

export function formatReplayCoachingPackBundlePlain(sessions, habitStats, options) {
  const b = buildReplayCoachingPackBundle(sessions, habitStats, options);
  return [
    '=== WEEKLY REVIEW PACK ===',
    '\n',
    b.weekly.plainText,
    '\n\n',
    '=== MONTHLY COACHING PACK ===',
    '\n',
    b.monthly.plainText,
  ].join('');
}
