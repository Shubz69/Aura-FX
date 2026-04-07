import { normalizeReplay } from './replayNormalizer';
import { REPLAY_STATUSES } from './replayDefaults';

function ymd(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sessionCompletedDay(s) {
  const raw = s.completedAt || s.updatedAt;
  if (!raw) return null;
  try {
    return ymd(new Date(raw));
  } catch {
    return null;
  }
}

/**
 * Lightweight deterministic habit stats from stored sessions (no extra backend).
 * @returns {{
 *  reviewedToday: boolean,
 *  completedThisWeek: number,
 *  reviewStreakDays: number,
 *  incompleteCount: number,
 *  learningExamplesCount: number,
 *  completedTotal: number,
 *  nudge: string,
 * }}
 */
export function computeReplayHabitStats(sessions = []) {
  const list = sessions.map((r) => normalizeReplay(r));
  const now = new Date();
  const today = ymd(now);
  const weekCut = new Date(now);
  weekCut.setDate(weekCut.getDate() - 6);
  weekCut.setHours(0, 0, 0, 0);

  const completedByDay = new Map();
  let completedThisWeek = 0;
  let completedTotal = 0;

  for (const s of list) {
    if (s.replayStatus !== REPLAY_STATUSES.completed) continue;
    completedTotal += 1;
    const day = sessionCompletedDay(s);
    if (day) completedByDay.set(day, (completedByDay.get(day) || 0) + 1);
    const ts = s.completedAt || s.updatedAt;
    if (ts && new Date(ts) >= weekCut) completedThisWeek += 1;
  }

  const reviewedToday = completedByDay.has(today);

  let reviewStreakDays = 0;
  const check = new Date(now);
  if (!reviewedToday) {
    check.setDate(check.getDate() - 1);
  }
  while (true) {
    const ds = ymd(check);
    if (!ds) break;
    if (completedByDay.has(ds)) {
      reviewStreakDays += 1;
      check.setDate(check.getDate() - 1);
    } else {
      break;
    }
  }

  const incompleteCount = list.filter((s) => s.replayStatus !== REPLAY_STATUSES.completed).length;
  const learningExamplesCount = list.filter((s) => s.learningExample).length;

  let nudge = '';
  if (incompleteCount > 0) {
    nudge = `Close the loop: ${incompleteCount} replay${incompleteCount === 1 ? '' : 's'} still in draft or in progress.`;
  } else if (!reviewedToday && reviewStreakDays > 0) {
    nudge = 'Maintain discipline — a short review today keeps your streak alive.';
  } else if (!reviewedToday && completedTotal > 0) {
    nudge = 'No completed review logged today — queue one loss or one missed opportunity while it is fresh.';
  } else if (learningExamplesCount === 0 && completedTotal >= 2) {
    nudge = 'Archive repeatable behaviour: promote one replay to a learning example.';
  } else if (completedThisWeek < 2 && completedTotal > 0) {
    nudge = 'Aim for two honest reviews this week — consistency beats intensity.';
  } else {
    nudge = 'Strong rhythm — revisit a learning example before the next session.';
  }

  return {
    reviewedToday,
    completedThisWeek,
    reviewStreakDays,
    incompleteCount,
    learningExamplesCount,
    completedTotal,
    nudge,
  };
}
