import { normalizeReplay } from './replayNormalizer';

function parseR(val) {
  if (val == null) return null;
  const s = String(val).trim();
  const m = s.match(/-?[\d.]+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function outcomeBucket(outcome) {
  const o = String(outcome || '').toLowerCase();
  if (/win|profit|green/.test(o)) return 'win';
  if (/loss|lose|red/.test(o)) return 'loss';
  if (/be|breakeven|flat|scratch/.test(o)) return 'be';
  return 'unknown';
}

function tieBreakSessions(a, b) {
  const u = String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
  if (u !== 0) return u;
  return String(b.id || '').localeCompare(String(a.id || ''));
}

function chaseHeuristic(s) {
  const t = `${s.verdict || ''} ${s.insight || ''} ${s.whatIMissed || ''}`.toLowerCase();
  return /chase|late|fomo|impulse|too tight|too soon/i.test(t);
}

function disciplineSignals(s) {
  const t = `${s.verdict || ''} ${s.ruleFollowed || ''} ${s.emotionalState || ''}`.toLowerCase();
  const broke = /broke|broken|ignored|violated|revenge|bored|fomo|overtrad/i.test(t);
  return broke;
}

function frustratingBE(s) {
  const t = `${s.verdict || ''} ${s.insight || ''}`.toLowerCase();
  const r = parseR(s.actualR || s.rResult || s.resultR);
  const missed = parseR(s.missedR) ?? 0;
  return /gave back|frustrat|annoyed|should have|left on|chopped/i.test(t) || missed >= 0.35 || (r != null && r > 0 && r < 0.35 && missed >= 0.2);
}

/** @returns {{ rankScore: number, reasons: string[], chips: string[] }} */
export function buildScenarioRank(session, scenarioType) {
  const s = session;
  const r = parseR(s.actualR || s.rResult || s.resultR);
  const ob = outcomeBucket(s.outcome);
  const entry = Number(s.entryTiming) || 0;
  const disc = Number(s.discipline) || 0;
  const pat = Number(s.patience) || 0;
  const missed = parseR(s.missedR) ?? 0;
  const mfe = parseR(s.mfe);
  const mae = parseR(s.mae);
  const mg = entry && disc && pat ? (entry + disc + pat) / 3 : null;

  const reasons = [];
  const chips = [];

  switch (scenarioType) {
    case 'best_trades': {
      let score = 0;
      if (r != null) score += r * 12;
      else if (ob === 'win') score += 4;
      score += entry * 0.85 + disc * 0.85 + pat * 0.65;
      score -= Math.min(4, missed * 3.5);
      if (mg != null && mg >= 6.5) {
        score += 3;
        reasons.push('Solid self-rated execution stack');
        chips.push('clean process');
      }
      if (disciplineSignals(s)) {
        score -= 4;
        reasons.push('Some discipline tells in notes — still surfaced as “best” due to outcome metrics');
        chips.push('mixed discipline');
      }
      if (r != null && r >= 1.5) {
        reasons.push('Meaningful positive R');
        chips.push(`${r.toFixed(1)}R`);
      }
      if (missed <= 0.2 && r != null && r > 0.5) {
        reasons.push('Low missed R relative to capture');
        chips.push('efficient exit');
      }
      if (!reasons.length) reasons.push('Ranked by outcome + execution averages');
      if (!chips.length) chips.push('best fit');
      return { rankScore: score, reasons: reasons.slice(0, 3), chips: chips.slice(0, 3) };
    }
    case 'worst_trades': {
      let score = 0;
      if (r != null) score += Math.max(0, -r) * 14;
      else if (ob === 'loss') score += 6;
      score += (10 - entry) * 0.55;
      score += (10 - disc) * 0.55;
      score += missed * 5;
      if (disciplineSignals(s)) {
        score += 4;
        reasons.push('Rule / emotional lapse signals in notes');
        chips.push('discipline');
      }
      if (chaseHeuristic(s)) {
        score += 2;
        reasons.push('Language suggests chase or impulse');
        chips.push('timing');
      }
      if (r != null && r <= -1) {
        reasons.push('Large negative R');
        chips.push('draw');
      }
      if (!reasons.length) reasons.push('Composite of loss depth + soft execution metrics');
      chips.push('worst fit');
      return { rankScore: score, reasons: reasons.slice(0, 3), chips: [...new Set(chips)].slice(0, 3) };
    }
    case 'losing_trades': {
      const score = (r != null ? Math.max(0, -r) * 10 : 0) + (ob === 'loss' ? 5 : 0) + (10 - disc) * 0.3;
      if (ob === 'loss') reasons.push('Booked loss outcome');
      if (r != null && r < 0) reasons.push(`Negative R (${r})`);
      if (!reasons.length) reasons.push('Filtered losing / underwater outcomes');
      chips.push('loss review');
      return { rankScore: score, reasons: reasons.slice(0, 3), chips: chips.slice(0, 3) };
    }
    case 'breakeven_trades': {
      const fr = frustratingBE(s);
      let score = fr ? 6 : 2;
      score += missed * 4;
      if (fr) {
        reasons.push('Scratch with frustration, give-back, or high missed R');
        chips.push('messy BE');
      } else {
        reasons.push('Cleaner structural scratch — still worth process review');
        chips.push('clean BE');
      }
      if (mfe != null && mae != null && mfe > mae * 2) {
        reasons.push('Trade had favourable excursion — BE may be exit policy, not thesis');
        chips.push('MFE>MAE');
      }
      chips.push('BE');
      return { rankScore: score, reasons: reasons.slice(0, 3), chips: [...new Set(chips)].slice(0, 3) };
    }
    case 'poor_entry_timing': {
      let score = (10 - entry) * 2.4;
      if (chaseHeuristic(s)) {
        score += 5;
        reasons.push('Narrative hints at chase / impulse');
        chips.push('chase risk');
      }
      if (entry <= 4) {
        reasons.push(`Self-rated entry timing ${entry}/10`);
        chips.push('weak timing');
      }
      if (missed >= 0.3) {
        score += 1.5;
        reasons.push('High missed R often correlates with poor entry location');
        chips.push('missed R');
      }
      if (!reasons.length) reasons.push('Weak entry timing score');
      return { rankScore: score, reasons: reasons.slice(0, 3), chips: chips.slice(0, 3) };
    }
    case 'poor_discipline': {
      let score = (10 - disc) * 2.2;
      if (disciplineSignals(s)) {
        score += 6;
        reasons.push('Explicit rule / emotional breach language');
        chips.push('rule break');
      }
      if (entry <= 4) {
        score += 1;
        chips.push('soft timing');
      }
      if (!reasons.length) reasons.push('Low discipline score on file');
      return { rankScore: score, reasons: reasons.slice(0, 3), chips: chips.slice(0, 3) };
    }
    case 'poor_exits': {
      let score = missed * 8;
      if (ob === 'win' && missed >= 0.25) {
        score += 4;
        reasons.push('Winner with meaningful missed R — exit policy review');
        chips.push('left on table');
      }
      if (missed >= 0.45) {
        reasons.push('Large gap between potential and booked result');
        chips.push('high missed R');
      }
      if (!reasons.length) reasons.push('Elevated missed R vs plan');
      return { rankScore: score, reasons: reasons.slice(0, 3), chips: chips.slice(0, 3) };
    }
    case 'high_missed_r': {
      let score = missed * 9;
      if (r != null && r + missed < 1 && missed >= 0.35) {
        score += 3;
        reasons.push('Low realised vs leave-behind — classic missed opportunity');
        chips.push('opportunity cost');
      }
      if (r != null) {
        reasons.push(`Booked ${r}R with ~${missed} missed`);
        chips.push('R gap');
      } else {
        reasons.push(`Missed R ≈ ${missed}`);
        chips.push('missed R');
      }
      return { rankScore: score, reasons: reasons.slice(0, 3), chips: chips.slice(0, 3) };
    }
    case 'custom':
    default:
      return { rankScore: 0, reasons: ['Manual pick from your library'], chips: ['library'] };
  }
}

function matchesScenarioFilter(session, scenarioType) {
  const s = session;
  const r = parseR(s.actualR || s.rResult || s.resultR);
  const ob = outcomeBucket(s.outcome);
  const entry = Number(s.entryTiming) || 0;
  const disc = Number(s.discipline) || 0;
  const missed = parseR(s.missedR) ?? 0;

  switch (scenarioType) {
    case 'best_trades':
      return ob === 'win' || (r != null && r > 0.35) || (r == null && ob !== 'loss' && entry >= 7 && disc >= 7 && (parseR(s.missedR) ?? 0) <= 0.35);
    case 'worst_trades':
      return (
        ob === 'loss' ||
        (r != null && r < -0.25) ||
        (disc <= 4 && entry <= 5 && missed >= 0.25) ||
        (missed >= 0.55 && missed > (r ?? 0))
      );
    case 'losing_trades':
      return ob === 'loss' || (r != null && r < 0);
    case 'breakeven_trades':
      return ob === 'be' || (r != null && Math.abs(r) < 0.2);
    case 'poor_entry_timing':
      return entry <= 6 || chaseHeuristic(s);
    case 'poor_discipline':
      return disc <= 6 || disciplineSignals(s);
    case 'poor_exits':
      return missed >= 0.28 || (ob === 'win' && missed >= 0.22);
    case 'high_missed_r':
      return missed >= 0.35 || (missed >= 0.22 && r != null && r < 1);
    case 'custom':
    default:
      return true;
  }
}

/**
 * Ranked scenario results with explainability.
 * @returns {{ session: object, rankScore: number, reasons: string[], chips: string[] }[]}
 */
export function rankSessionsForScenario(sessions, scenarioType) {
  const list = sessions.map((sess) => normalizeReplay(sess));
  if (scenarioType === 'custom') {
    return list
      .map((session) => ({
        session,
        ...buildScenarioRank(session, scenarioType),
      }))
      .sort((a, b) => tieBreakSessions(a.session, b.session));
  }

  const filtered = list.filter((s) => matchesScenarioFilter(s, scenarioType));
  const ranked = filtered.map((session) => {
    const { rankScore, reasons, chips } = buildScenarioRank(session, scenarioType);
    return { session, rankScore, reasons, chips };
  });

  ranked.sort((a, b) => {
    if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
    return tieBreakSessions(a.session, b.session);
  });

  return ranked;
}

/** @deprecated Prefer rankSessionsForScenario for UI chips — kept for compatibility */
export function scoreSessionForScenario(session, scenarioType) {
  return buildScenarioRank(normalizeReplay(session), scenarioType).rankScore;
}

export function filterSessionsForScenario(sessions, scenarioType) {
  return rankSessionsForScenario(sessions, scenarioType).map((x) => x.session);
}

export function sessionsOnDay(sessions, ymd) {
  if (!ymd) return [];
  return sessions.filter((s) => {
    const n = normalizeReplay(s);
    const d =
      n.replayDate ||
      n.sourceDate ||
      (n.createdAt && String(n.createdAt).slice(0, 10)) ||
      (n.updatedAt && String(n.updatedAt).slice(0, 10));
    return d === ymd;
  });
}

export function findContinueLastSession(sessions) {
  const inProg = sessions
    .filter((s) => normalizeReplay(s).replayStatus === 'in_progress')
    .sort((a, b) => {
      const byUpd = String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
      if (byUpd !== 0) return byUpd;
      return String(b.id || '').localeCompare(String(a.id || ''));
    });
  if (inProg.length) return normalizeReplay(inProg[0]);
  return null;
}
