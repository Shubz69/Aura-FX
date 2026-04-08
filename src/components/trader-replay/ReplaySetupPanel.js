import React, { useEffect, useMemo, useState } from 'react';
import { emptySessionDraft, REPLAY_MODES, REPLAY_STATUSES, SCENARIO_TYPES } from '../../lib/trader-replay/replayDefaults';
import { rankSessionsForScenario, sessionsOnDay } from '../../lib/trader-replay/replayScenarioEngine';
import {
  normalizeReplay,
  computeReplayQualityScore,
  computeReviewCompletenessScore,
} from '../../lib/trader-replay/replayNormalizer';
import { dayReviewShellMarkers } from '../../lib/trader-replay/replayMarkerFactory';
import { deriveCoaching } from '../../lib/trader-replay/replayCoachingEngine';
import { buildReplayIdentitySummary, getReplayLibraryRowHints } from '../../lib/trader-replay/replayIdentityEngine';
import { getLibraryMentorRowAugment } from '../../lib/trader-replay/replayMentorReviewEngine';
import { formatLearningExampleLabel } from '../../lib/trader-replay/replayEntitlements';
import ReplayPremiumNudge from './ReplayPremiumNudge';

function ymdToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Filter presets for coach / mentor review (grounded in stored replay fields). */
const MENTOR_PRESET_DEFS = [
  { id: '', label: 'All' },
  { id: 'needs_attention', label: 'Needs review', title: 'Incomplete replays or completed reviews under 55% depth' },
  { id: 'mentor_queue', label: 'Coach queue', title: 'Completed replays with solid review depth or any learning example' },
  { id: 'models', label: 'Models', title: 'Model learning examples only', needsLearning: true },
  { id: 'cautions', label: 'Cautions', title: 'Caution learning examples only', needsLearning: true },
  { id: 'strong_teaching', label: 'Teaching picks', title: 'Model examples or strong reviewed arcs', needsLearning: true },
  { id: 'recent_cautions', label: 'Recent cautions', title: 'Caution examples from the last 30 days', needsLearning: true },
];

const LIBRARY_SORTS = [
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'best_reviewed', label: 'Best reviewed' },
  { id: 'weakest_execution', label: 'Weakest execution' },
  { id: 'strongest_lesson', label: 'Strongest lesson' },
  { id: 'incomplete', label: 'Incomplete reviews' },
  { id: 'learning_examples', label: 'Learning examples' },
  { id: 'biggest_missed', label: 'Missed opportunity' },
];

function parseR(val) {
  if (val == null) return null;
  const m = String(val).trim().match(/-?[\d.]+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function lessonStrength(s) {
  const a = String(s.lessonSummary || '').length;
  const b = String(s.insight || '').length;
  return a + b * 0.6;
}

function tieBreakSessions(a, b) {
  const u = String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
  if (u !== 0) return u;
  return String(b.id || '').localeCompare(String(a.id || ''));
}

export default function ReplaySetupPanel({
  mode,
  sessions,
  onBack,
  onCreateFromDraft,
  onOpenSession,
  replayFlags,
  replayTier = 'ACCESS',
  initialLearningExamplesFilter = false,
  onConsumedLearningExamplesFilter,
}) {
  const [scenarioType, setScenarioType] = useState(SCENARIO_TYPES[0].id);
  const [scenarioSymbol, setScenarioSymbol] = useState('');
  const [dayPick, setDayPick] = useState(ymdToday());
  const [tradeQuery, setTradeQuery] = useState('');
  const [tradeOutcome, setTradeOutcome] = useState('');
  const [tradeVerdict, setTradeVerdict] = useState('');
  const [librarySort, setLibrarySort] = useState('newest');
  const [filterMode, setFilterMode] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterLearningOnly, setFilterLearningOnly] = useState(false);
  const [filterSymbol, setFilterSymbol] = useState('');
  const [filterScenarioType, setFilterScenarioType] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [groupByMode, setGroupByMode] = useState(false);
  const [mentorLibraryPreset, setMentorLibraryPreset] = useState('');

  const advancedLib = replayFlags?.libraryAdvancedFilters === true;
  const premiumSorts = replayFlags?.libraryPremiumSorts === true;
  const canScenario = replayFlags?.scenarioReplay === true;

  useEffect(() => {
    if (initialLearningExamplesFilter) {
      setFilterLearningOnly(true);
      onConsumedLearningExamplesFilter?.();
    }
  }, [initialLearningExamplesFilter, onConsumedLearningExamplesFilter]);

  const librarySortOptions = useMemo(() => {
    if (!premiumSorts) {
      return LIBRARY_SORTS.filter((o) => !['learning_examples', 'biggest_missed'].includes(o.id));
    }
    return LIBRARY_SORTS;
  }, [premiumSorts]);

  const scenarioRanked = useMemo(() => {
    const ranked = rankSessionsForScenario(sessions, scenarioType);
    if (!scenarioSymbol.trim()) return ranked;
    const q = scenarioSymbol.trim().toLowerCase();
    return ranked.filter((row) =>
      `${row.session.asset || ''} ${row.session.symbol || ''} ${row.session.title || ''}`.toLowerCase().includes(q)
    );
  }, [sessions, scenarioType, scenarioSymbol]);

  const dayMatches = useMemo(() => sessionsOnDay(sessions, dayPick), [sessions, dayPick]);

  const tradeFiltered = useMemo(() => {
    let list = sessions.map((s) => normalizeReplay(s));
    const q = tradeQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((s) =>
        `${s.title} ${s.asset} ${s.symbol} ${s.verdict} ${s.tradeRef || ''}`.toLowerCase().includes(q)
      );
    }
    if (tradeOutcome) {
      list = list.filter((s) => String(s.outcome || '').toLowerCase() === tradeOutcome.toLowerCase());
    }
    if (tradeVerdict) {
      list = list.filter((s) => String(s.verdict || '').toLowerCase().includes(tradeVerdict.toLowerCase()));
    }
    if (filterLearningOnly) {
      list = list.filter((s) => s.learningExample);
    }
    if (advancedLib && filterMode) {
      list = list.filter((s) => String(s.mode || 'trade') === filterMode);
    }
    if (advancedLib && filterStatus) {
      list = list.filter((s) => String(s.replayStatus || '') === filterStatus);
    }
    if (advancedLib && filterSymbol.trim()) {
      const fs = filterSymbol.trim().toLowerCase();
      list = list.filter((s) => `${s.asset || ''} ${s.symbol || ''}`.toLowerCase().includes(fs));
    }
    if (advancedLib && filterScenarioType.trim()) {
      const st = filterScenarioType.trim().toLowerCase();
      list = list.filter((s) => String(s.scenarioType || '').toLowerCase().includes(st));
    }
    if (advancedLib && filterDateFrom) {
      list = list.filter((s) => {
        const d = s.replayDate || s.sourceDate || (s.updatedAt ? String(s.updatedAt).slice(0, 10) : '');
        return d && d >= filterDateFrom;
      });
    }
    if (advancedLib && filterDateTo) {
      list = list.filter((s) => {
        const d = s.replayDate || s.sourceDate || (s.updatedAt ? String(s.updatedAt).slice(0, 10) : '');
        return d && d <= filterDateTo;
      });
    }

    if (mentorLibraryPreset === 'needs_attention') {
      list = list.filter((s) => {
        const rv = computeReviewCompletenessScore(s).score;
        return s.replayStatus !== REPLAY_STATUSES.completed || rv < 55;
      });
    } else if (mentorLibraryPreset === 'mentor_queue') {
      list = list.filter((s) => {
        if (s.replayStatus !== REPLAY_STATUSES.completed) return false;
        const rv = computeReviewCompletenessScore(s).score;
        return rv >= 55 || Boolean(s.learningExample);
      });
    } else if (mentorLibraryPreset === 'models') {
      list = list.filter((s) => s.learningExample && s.learningExampleKind === 'model');
    } else if (mentorLibraryPreset === 'cautions') {
      list = list.filter((s) => s.learningExample && s.learningExampleKind === 'caution');
    } else if (mentorLibraryPreset === 'strong_teaching') {
      list = list.filter((s) => {
        if (s.replayStatus !== REPLAY_STATUSES.completed || !s.learningExample) return false;
        const rv = computeReviewCompletenessScore(s).score;
        const ex = computeReplayQualityScore(s).score;
        if (s.learningExampleKind === 'model') return true;
        return rv >= 65 && ex >= 50;
      });
    } else if (mentorLibraryPreset === 'recent_cautions') {
      const lim = new Date();
      lim.setDate(lim.getDate() - 29);
      const limY = lim.toISOString().slice(0, 10);
      list = list.filter((s) => {
        if (!s.learningExample || s.learningExampleKind !== 'caution') return false;
        const d = s.replayDate || s.sourceDate || (s.updatedAt ? String(s.updatedAt).slice(0, 10) : '');
        return d && d >= limY;
      });
    }

    const scored = list.map((s) => ({
      s,
      exec: computeReplayQualityScore(s).score,
      rev: computeReviewCompletenessScore(s).score,
      lesson: lessonStrength(s),
      missed: parseR(s.missedR) ?? 0,
      learning: s.learningExample ? 1 : 0,
    }));

    scored.sort((a, b) => {
      switch (librarySort) {
        case 'oldest':
          return String(a.s.updatedAt || '').localeCompare(String(b.s.updatedAt || '')) || String(a.s.id || '').localeCompare(String(b.s.id || ''));
        case 'best_reviewed':
          return b.rev - a.rev || tieBreakSessions(a.s, b.s);
        case 'weakest_execution':
          return a.exec - b.exec || tieBreakSessions(a.s, b.s);
        case 'strongest_lesson':
          return b.lesson - a.lesson || b.rev - a.rev || tieBreakSessions(a.s, b.s);
        case 'incomplete':
          return a.rev - b.rev || tieBreakSessions(a.s, b.s);
        case 'learning_examples':
          return b.learning - a.learning || tieBreakSessions(b.s, a.s);
        case 'biggest_missed':
          return b.missed - a.missed || tieBreakSessions(b.s, a.s);
        case 'newest':
        default:
          return tieBreakSessions(b.s, a.s);
      }
    });

    return scored.map((x) => x.s);
  }, [
    sessions,
    tradeQuery,
    tradeOutcome,
    tradeVerdict,
    librarySort,
    filterLearningOnly,
    advancedLib,
    filterMode,
    filterStatus,
    filterSymbol,
    filterScenarioType,
    filterDateFrom,
    filterDateTo,
    mentorLibraryPreset,
  ]);

  const identitySummary = useMemo(() => buildReplayIdentitySummary(sessions || []), [sessions]);

  const tradeGrouped = useMemo(() => {
    if (!advancedLib || !groupByMode || !tradeFiltered.length) return null;
    const buckets = { trade: [], day: [], scenario: [], other: [] };
    tradeFiltered.forEach((s) => {
      const m = s.mode || 'trade';
      if (buckets[m]) buckets[m].push(s);
      else buckets.other.push(s);
    });
    return buckets;
  }, [tradeFiltered, groupByMode, advancedLib]);

  const startBlankDayReplay = () => {
    const markers = dayReviewShellMarkers(dayPick);
    onCreateFromDraft({
      mode: REPLAY_MODES.day,
      title: `Day review · ${dayPick}`,
      replayDate: dayPick,
      sourceDate: dayPick,
      replayStatus: 'in_progress',
      replayMarkers: markers,
      replayStep: 0,
      marketState: 'Full session review',
    });
  };

  if (mode === REPLAY_MODES.scenario) {
    if (!canScenario) {
      return (
        <div className="aura-tr-setup">
          <header className="aura-tr-setup-head">
            <button type="button" className="trader-suite-btn" onClick={onBack}>Back</button>
            <h2 className="aura-tr-setup-title">Scenario replay</h2>
          </header>
          <p className="aura-tr-muted">Ranked scenario drills connect losses, discipline tells, and missed R into repeatable review.</p>
          <ReplayPremiumNudge>Premium unlocks the full scenario catalogue and ranking.</ReplayPremiumNudge>
        </div>
      );
    }
    return (
      <div className="aura-tr-setup">
        <header className="aura-tr-setup-head">
          <button type="button" className="trader-suite-btn" onClick={onBack}>Back</button>
          <h2 className="aura-tr-setup-title">Scenario replay</h2>
        </header>
        {replayFlags?.scenarioElitePositioning && replayTier === 'ELITE' ? (
          <p className="aura-tr-elite-hint">Elite · full pattern packs and mentor-ready context on each result.</p>
        ) : null}
        <div className="aura-tr-setup-grid">
          <label className="aura-tr-field">
            <span>Scenario</span>
            <select className="trader-suite-select" value={scenarioType} onChange={(e) => setScenarioType(e.target.value)}>
              {SCENARIO_TYPES.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
            <small className="aura-tr-field-hint">{SCENARIO_TYPES.find((x) => x.id === scenarioType)?.hint}</small>
          </label>
          <label className="aura-tr-field">
            <span>Symbol contains</span>
            <input className="trader-suite-select" value={scenarioSymbol} onChange={(e) => setScenarioSymbol(e.target.value)} placeholder="e.g. EUR,XAU" />
          </label>
        </div>
        <p className="aura-tr-muted">Ranked from your history — each row shows why it surfaced.</p>
        <ul className="aura-tr-setup-list">
          {scenarioRanked.slice(0, 12).map(({ session: s, reasons, chips }) => (
            <li key={s.id}>
              <button type="button" className="aura-tr-setup-item" onClick={() => onOpenSession({ ...s, mode: REPLAY_MODES.scenario, scenarioType })}>
                <strong>{s.title}</strong>
                <span>{s.asset} · {s.outcome} · {s.actualR || s.rResult || '—'}</span>
                {reasons[0] ? <p className="aura-tr-setup-why">{reasons[0]}</p> : null}
                {chips?.length ? (
                  <div className="aura-tr-scenario-chips">
                    {chips.map((c) => (
                      <span key={c} className="aura-tr-chip subtle">{c}</span>
                    ))}
                  </div>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
        {!scenarioRanked.length ? <p className="aura-tr-empty">No matches — widen filters or save more replays from real trades.</p> : null}
      </div>
    );
  }

  if (mode === REPLAY_MODES.day) {
    return (
      <div className="aura-tr-setup">
        <header className="aura-tr-setup-head">
          <button type="button" className="trader-suite-btn" onClick={onBack}>Back</button>
          <h2 className="aura-tr-setup-title">Daily replay</h2>
        </header>
        <label className="aura-tr-field aura-tr-field--inline">
          <span>Session date</span>
          <input type="date" className="trader-suite-select" value={dayPick} max={ymdToday()} onChange={(e) => setDayPick(e.target.value)} />
        </label>
        <p className="aura-tr-muted">Sessions tagged for this day (from replay date, source, or created timestamp).</p>
        <ul className="aura-tr-setup-list">
          {dayMatches.map((s) => (
            <li key={s.id}>
              <button type="button" className="aura-tr-setup-item" onClick={() => onOpenSession({ ...normalizeReplay(s), mode: REPLAY_MODES.day, replayDate: dayPick })}>
                <strong>{s.title}</strong>
                <span>{s.asset} · updated {s.updatedAt ? String(s.updatedAt).slice(0, 16).replace('T', ' ') : '—'}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="aura-tr-setup-actions">
          <button type="button" className="trader-suite-btn trader-suite-btn--primary" onClick={startBlankDayReplay}>
            Create day review shell
          </button>
          {!dayMatches.length ? (
            <p className="aura-tr-empty">No saved sessions on this day yet — the shell adds a structured marker path you can fill in.</p>
          ) : null}
        </div>
      </div>
    );
  }

  const renderLibraryRow = (s) => {
    const ex = computeReplayQualityScore(s).score;
    const rv = computeReviewCompletenessScore(s).score;
    const coach = deriveCoaching(s);
    const lessonSnip = (s.lessonSummary || s.insight || '').slice(0, 72);
    const exLabel = formatLearningExampleLabel(s.learningExample, s.learningExampleKind);
    const hints = getReplayLibraryRowHints(s, identitySummary);
    const setupHint =
      s.replayStatus === REPLAY_STATUSES.completed && (Number(s.entryTiming) || 0) >= 7
        ? 'Setup read: strong self-rated timing'
        : (Number(s.discipline) || 0) >= 7
          ? 'Discipline stack: solid on record'
          : null;
    return (
      <li key={s.id}>
        <button type="button" className="aura-tr-setup-item" onClick={() => onOpenSession({ ...s, mode: REPLAY_MODES.trade })}>
          <strong>{s.title}</strong>
          <span>
            {s.mode || 'trade'} · {s.asset} · {s.outcome || '—'} · Q{ex} · Rv{rv}
            {exLabel ? ` · ${exLabel}` : ''}
          </span>
          {rowChips.length ? (
            <div className="aura-tr-library-hint-chips">
              {rowChips.map((c) => (
                <span key={c} className="aura-tr-chip subtle aura-tr-chip--identity-hint">{c}</span>
              ))}
            </div>
          ) : null}
          {s.learningExample ? (
            <>
              {coach.mainLesson && coach.mainLesson !== '—' ? (
                <p className="aura-tr-setup-why">Lesson · {coach.mainLesson.slice(0, 100)}{coach.mainLesson.length > 100 ? '…' : ''}</p>
              ) : null}
              {coach.bestMoment && coach.bestMoment !== '—' ? (
                <p className="aura-tr-setup-meta">Best · {coach.bestMoment.slice(0, 90)}{coach.bestMoment.length > 90 ? '…' : ''}</p>
              ) : null}
              {coach.repeatThis ? (
                <p className="aura-tr-setup-meta">Repeat · {coach.repeatThis.slice(0, 90)}{coach.repeatThis.length > 90 ? '…' : ''}</p>
              ) : null}
              {setupHint ? <p className="aura-tr-setup-meta">{setupHint}</p> : null}
            </>
          ) : (
            lessonSnip ? <p className="aura-tr-setup-why">{lessonSnip}{((s.lessonSummary || s.insight || '').length > 72) ? '…' : ''}</p> : null
          )}
          {hints.footline ? <p className="aura-tr-setup-meta aura-tr-setup-meta--identity">{hints.footline}</p> : null}
          {augment.reviewCue ? <p className="aura-tr-setup-meta aura-tr-setup-meta--mentor-cue">{augment.reviewCue}</p> : null}
        </button>
      </li>
    );
  };

  return (
    <div className="aura-tr-setup">
      <header className="aura-tr-setup-head">
        <button type="button" className="trader-suite-btn" onClick={onBack}>Back</button>
        <h2 className="aura-tr-setup-title">Trade library</h2>
      </header>
      {!advancedLib ? (
        <ReplayPremiumNudge>
          Advanced filters, example vault sort, and missed-R ranking ship with Premium.
        </ReplayPremiumNudge>
      ) : null}
      <div className="aura-tr-mentor-presets" role="group" aria-label="Coach and review filters">
        <span className="aura-tr-mentor-presets-kicker">Review focus</span>
        <div className="aura-tr-mentor-presets-row">
          {MENTOR_PRESET_DEFS.map((p) => {
            const disabled = p.needsLearning && !replayFlags?.learningExamples;
            const active = mentorLibraryPreset === p.id;
            return (
              <button
                key={p.id || 'all'}
                type="button"
                className={`aura-tr-preset-pill${active ? ' aura-tr-preset-pill--active' : ''}`}
                disabled={disabled}
                title={disabled ? 'Learning examples require Premium' : (p.title || p.label)}
                onClick={() => setMentorLibraryPreset(p.id)}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="aura-tr-setup-grid">
        <label className="aura-tr-field">
          <span>Search</span>
          <input className="trader-suite-select" value={tradeQuery} onChange={(e) => setTradeQuery(e.target.value)} placeholder="Title, symbol, verdict..." />
        </label>
        <label className="aura-tr-field">
          <span>Outcome</span>
          <select className="trader-suite-select" value={tradeOutcome} onChange={(e) => setTradeOutcome(e.target.value)}>
            <option value="">Any</option>
            <option value="Win">Win</option>
            <option value="Loss">Loss</option>
            <option value="BE">Break-even</option>
          </select>
        </label>
        <label className="aura-tr-field">
          <span>Verdict contains</span>
          <input className="trader-suite-select" value={tradeVerdict} onChange={(e) => setTradeVerdict(e.target.value)} placeholder="Keyword" />
        </label>
        <label className="aura-tr-field">
          <span>Sort</span>
          <select className="trader-suite-select" value={librarySort} onChange={(e) => setLibrarySort(e.target.value)}>
            {librarySortOptions.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </label>
        {advancedLib ? (
          <>
            <label className="aura-tr-field">
              <span>Mode</span>
              <select className="trader-suite-select" value={filterMode} onChange={(e) => setFilterMode(e.target.value)}>
                <option value="">Any</option>
                <option value="trade">Trade</option>
                <option value="day">Day</option>
                <option value="scenario">Scenario</option>
              </select>
            </label>
            <label className="aura-tr-field">
              <span>Status</span>
              <select className="trader-suite-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">Any</option>
                <option value="draft">Draft</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
              </select>
            </label>
            <label className="aura-tr-field">
              <span>Symbol</span>
              <input className="trader-suite-select" value={filterSymbol} onChange={(e) => setFilterSymbol(e.target.value)} placeholder="Asset / pair" />
            </label>
            <label className="aura-tr-field">
              <span>Scenario tag</span>
              <input className="trader-suite-select" value={filterScenarioType} onChange={(e) => setFilterScenarioType(e.target.value)} placeholder="e.g. worst_trades" />
            </label>
            <label className="aura-tr-field">
              <span>Replay date from</span>
              <input type="date" className="trader-suite-select" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
            </label>
            <label className="aura-tr-field">
              <span>Replay date to</span>
              <input type="date" className="trader-suite-select" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} />
            </label>
            <label className="aura-tr-field aura-tr-field--check">
              <input type="checkbox" checked={filterLearningOnly} onChange={(e) => setFilterLearningOnly(e.target.checked)} />
              <span>Learning examples only</span>
            </label>
            <label className="aura-tr-field aura-tr-field--check">
              <input type="checkbox" checked={groupByMode} onChange={(e) => setGroupByMode(e.target.checked)} />
              <span>Group by mode</span>
            </label>
          </>
        ) : (
          <label className="aura-tr-field aura-tr-field--check">
            <input
              type="checkbox"
              checked={filterLearningOnly}
              onChange={(e) => setFilterLearningOnly(e.target.checked)}
              disabled={!replayFlags?.learningExamples}
            />
            <span>Learning examples only {!replayFlags?.learningExamples ? '(Premium)' : ''}</span>
          </label>
        )}
      </div>
      <ul className="aura-tr-setup-list aura-tr-setup-list--scroll">
        {tradeGrouped
          ? ['trade', 'day', 'scenario', 'other'].map((key) =>
              tradeGrouped[key]?.length ? (
                <React.Fragment key={key}>
                  <li className="aura-tr-setup-group-label" aria-hidden="true">{key}</li>
                  {tradeGrouped[key].slice(0, 24).map((s) => renderLibraryRow(s))}
                </React.Fragment>
              ) : null
            )
          : tradeFiltered.slice(0, 40).map((s) => renderLibraryRow(s))}
      </ul>
      <div className="aura-tr-setup-actions">
        <button
          type="button"
          className="trader-suite-btn trader-suite-btn--primary"
          onClick={() =>
            onCreateFromDraft(
              emptySessionDraft({
                mode: REPLAY_MODES.trade,
                replayStatus: REPLAY_STATUSES.inProgress,
                title: `Trade replay · ${new Date().toLocaleString()}`,
              })
            )
          }
        >
          Start blank trade replay
        </button>
      </div>
      {!tradeFiltered.length ? <p className="aura-tr-empty">Nothing in range — adjust filters or start a blank replay.</p> : null}
    </div>
  );
}
