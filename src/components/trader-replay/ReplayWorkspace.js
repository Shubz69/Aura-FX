import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import LightweightInstrumentChart from '../charts/LightweightInstrumentChart';
import ReplayControls from './ReplayControls';
import ReplayTimeline from './ReplayTimeline';
import ReplayInsightCard from './ReplayInsightCard';
import ReplayNotesCard from './ReplayNotesCard';
import {
  normalizeReplay,
  computeReplayQualityScore,
  computeReviewCompletenessScore,
} from '../../lib/trader-replay/replayNormalizer';
import { REPLAY_STATUSES } from '../../lib/trader-replay/replayDefaults';
import { deriveCoaching } from '../../lib/trader-replay/replayCoachingEngine';
import { mergeReplayDestination, buildDefaultReturnToReplayPath } from '../../lib/trader-replay/replayToolHandoff';
import { buildFollowUpActions } from '../../lib/trader-replay/replayFollowup';
import { buildMentorCoachContext, getLearningExampleMentorFraming } from '../../lib/trader-replay/replayMentorReviewEngine';
import { formatLearningExampleLabel } from '../../lib/trader-replay/replayEntitlements';
import ReplayPremiumNudge from './ReplayPremiumNudge';
import ReplayCopyExportBar from './ReplayCopyExportBar';
import ReplayPackagePrep from './ReplayPackagePrep';
import ReplayNarrativePrep from './ReplayNarrativePrep';

function executionAverage(s) {
  const a = Number(s.entryTiming) || 0;
  const b = Number(s.discipline) || 0;
  const c = Number(s.patience) || 0;
  if (!a && !b && !c) return '—';
  return `${Math.round((a + b + c) / 3)}/10`;
}

export default function ReplayWorkspace({
  form,
  setForm,
  activeId,
  dirty = false,
  playing,
  setPlaying,
  onSave,
  saving,
  sessions = [],
  habitStats = null,
  replayFlags = {},
  onPersistFields,
}) {
  const [compactTimeline, setCompactTimeline] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 960 : false
  );

  useEffect(() => {
    const onR = () => setCompactTimeline(window.innerWidth < 960);
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);

  const session = useMemo(() => normalizeReplay(form), [form]);
  const coaching = useMemo(() => deriveCoaching(session), [session]);
  const qualitySignals = useMemo(() => computeReplayQualityScore(session), [session]);
  const reviewMeta = useMemo(() => computeReviewCompletenessScore(session), [session]);
  const markers = session.replayMarkers || [];
  const idx = Math.min(Math.max(0, session.replayStep || 0), Math.max(0, markers.length - 1));
  const marker = markers[idx];

  const setStep = (step) => {
    setForm((prev) => {
      const m = normalizeReplay(prev).replayMarkers || [];
      const max = Math.max(0, m.length - 1);
      return { ...prev, replayStep: Math.min(max, Math.max(0, step)) };
    });
  };

  const changeField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const isLiveSession = Boolean(activeId);
  const saveDisabled = saving || (Boolean(activeId) && !dirty);
  const sessionForLinks = useMemo(
    () => ({ ...session, id: activeId || session.id }),
    [session, activeId]
  );
  const returnReplay = buildDefaultReturnToReplayPath(sessionForLinks);
  const hb = returnReplay ? { returnPath: returnReplay } : {};
  const playbookTo = mergeReplayDestination(
    '/trader-deck/trade-validator/trader-playbook',
    sessionForLinks,
    coaching,
    { destination: 'playbook', ...hb }
  );
  const labHref = session.linkedLabDate
    ? `/trader-deck/trade-validator/trader-lab?date=${encodeURIComponent(session.linkedLabDate)}`
    : null;
  const labTo = labHref ? mergeReplayDestination(labHref, sessionForLinks, coaching, hb) : null;
  const journalTo = mergeReplayDestination('/journal', sessionForLinks, coaching, { destination: 'journal', ...hb });
  const tradeJournalTo = mergeReplayDestination(
    '/trader-deck/trade-validator/journal',
    sessionForLinks,
    coaching,
    hb
  );
  const validatorTo = mergeReplayDestination('/trader-deck/trade-validator/overview', sessionForLinks, coaching, hb);
  const checklistTo = mergeReplayDestination(
    '/trader-deck/trade-validator/checklist',
    sessionForLinks,
    coaching,
    { destination: 'checklist', ...hb }
  );

  const signalDepth = replayFlags.coachingSignalDepth ?? 1;
  const qualityLines = qualitySignals.signals.slice(0, signalDepth);
  const followUps = useMemo(() => {
    const all = buildFollowUpActions(session, sessions);
    const max = replayFlags.followUpExpanded ? 6 : 2;
    return all.slice(0, max);
  }, [session, sessions, replayFlags.followUpExpanded]);

  const exampleLabel = formatLearningExampleLabel(session.learningExample, session.learningExampleKind);
  const mentorCoachCtx = useMemo(() => buildMentorCoachContext(session, sessions), [session, sessions]);
  const exampleMentorFrame = useMemo(() => getLearningExampleMentorFraming(session), [session]);

  return (
    <div className="aura-tr-workspace">
      <div className="aura-tr-workspace-main">
        <section className="trader-suite-panel aura-tr-chart-card">
          <div className="aura-tr-chart-head">
            <div className="aura-tr-chip-row">
              <span className="aura-tr-chip">{session.symbol || 'Symbol'}</span>
              <span className="aura-tr-chip muted">
                {session.interval === 'D' ? 'Daily' : session.interval === '240' ? '4H' : `${session.interval || '—'}m`} chart
              </span>
              {marker?.timestampLabel ? (
                <span className="aura-tr-chip gold">Marker · {marker.timestampLabel}</span>
              ) : null}
              {exampleLabel ? (
                <span className="aura-tr-chip subtle aura-tr-chip--example" title="Learning asset">{exampleLabel}</span>
              ) : null}
            </div>
            {session.replayStatus === REPLAY_STATUSES.completed ? (
              <span className="aura-tr-status-pill done">Completed</span>
            ) : (
              <span className="aura-tr-status-pill live">In progress</span>
            )}
          </div>
          <div className="aura-tr-chart-frame">
            <LightweightInstrumentChart
              symbol={session.symbol || 'OANDA:EURUSD'}
              interval={session.interval || '15'}
              range={session.chartRange || '3M'}
              height={compactTimeline ? 300 : 420}
              className="trader-suite-chart-frame"
            />
          </div>
          <ReplayControls
            playing={playing}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onRestart={() => { setPlaying(false); setStep(0); }}
            onBackStep={() => { setPlaying(false); setStep(idx - 1); }}
            onNextStep={() => { setPlaying(false); setStep(idx + 1); }}
            onJumpEnd={() => {
              setPlaying(false);
              setStep(Math.max(0, markers.length - 1));
            }}
            onStepSelect={(v) => setStep(v)}
            replayStep={idx}
            stepCount={Math.max(1, markers.length)}
            playbackSpeedMs={session.playbackSpeedMs}
            onPlaybackSpeedMs={(ms) => changeField('playbackSpeedMs', ms)}
            interval={session.interval}
            onInterval={(v) => changeField('interval', v)}
            chartRange={session.chartRange || '3M'}
            onChartRange={(v) => changeField('chartRange', v)}
            autoFocusNotes={session.autoFocusNotes}
            onAutoFocusNotes={(v) => changeField('autoFocusNotes', v)}
            showLessons={session.showLessons}
            onShowLessons={(v) => changeField('showLessons', v)}
          />
        </section>

        <ReplayTimeline
          markers={markers}
          activeIndex={idx}
          onSelect={(i) => { setPlaying(false); setStep(i); }}
          compact={compactTimeline}
        />

        <ReplayInsightCard
          marker={marker}
          showLesson={session.showLessons}
          sessionInsight={session.insight}
          coaching={coaching}
        />

        <ReplayNotesCard
          notes={session.notes}
          emotionalState={session.emotionalState}
          whatISaw={session.whatISaw}
          whatIMissed={session.whatIMissed}
          improvementPlan={session.improvementPlan}
          ruleFollowed={session.ruleFollowed}
          lessonSummary={session.lessonSummary}
          autoFocus={session.autoFocusNotes}
          onChangeField={changeField}
        />
      </div>

      <aside className="aura-tr-workspace-rail">
        <section className="trader-suite-panel aura-tr-rail-block">
          <div className="trader-suite-kicker">Live context</div>
          <div className="aura-tr-rail-hero">
            <strong>{session.asset || '—'} · {session.direction || '—'}</strong>
            <p>{session.rResult || session.actualR || '—'} · {session.outcome || '—'}</p>
            <p className="aura-tr-muted small">Entry {session.entry || '—'} · Stop {session.stop || '—'} · TP {session.target || '—'}</p>
          </div>
          {!isLiveSession ? (
            <p className="aura-tr-demo-banner">Local preview — save to persist this replay to your account.</p>
          ) : null}
          <button
            type="button"
            className="trader-suite-btn trader-suite-btn--primary"
            onClick={onSave}
            disabled={saveDisabled}
            title={saveDisabled && activeId && !dirty ? 'Nothing new to save' : 'Save replay'}
          >
            {saving ? 'Saving…' : activeId && !dirty ? 'Saved' : 'Save now'}
          </button>
        </section>

        <section className="trader-suite-panel aura-tr-rail-block">
          <div className="trader-suite-kicker">Replay intelligence</div>
          <div className="aura-tr-rail-scores">
            <div>
              <span>Replay quality</span>
              <strong>{qualitySignals.score}</strong>
              {qualityLines.length ? (
                <ul className="aura-tr-rail-signals">
                  {qualityLines.map((ln) => (
                    <li key={ln.slice(0, 48)}>{ln}</li>
                  ))}
                </ul>
              ) : (
                <small className="aura-tr-rail-hint">Soft read if fields are thin.</small>
              )}
            </div>
            <div>
              <span>Review completeness</span>
              <strong>{reviewMeta.score}%</strong>
              {reviewMeta.missingHints[0] ? (
                <small className="aura-tr-rail-gap">Missing: {reviewMeta.missingHints[0]}</small>
              ) : (
                <small className="aura-tr-rail-hint">{reviewMeta.signals[0] || 'Walk markers and finish fields.'}</small>
              )}
            </div>
          </div>
          <div className="trader-suite-kicker">Scores</div>
          <div className="aura-tr-metric-grid">
            <div><span>Execution quality</span><strong>{executionAverage(session)}</strong></div>
            <div><span>Entry timing</span><strong>{session.entryTiming}/10</strong></div>
            <div><span>Patience</span><strong>{session.patience}/10</strong></div>
            <div><span>Discipline</span><strong>{session.discipline}/10</strong></div>
            <div><span>Bias alignment</span><strong>{session.biasAtTime || '—'}</strong></div>
            <div><span>Risk read</span><strong>{session.stop && session.target ? 'Defined' : 'Incomplete'}</strong></div>
            <div><span>Management</span><strong>{Math.round(((Number(session.discipline) || 0) + (Number(session.patience) || 0)) / 2)}/10</strong></div>
            <div><span>Exit quality</span><strong>{session.missedR ? `Missed ${session.missedR}` : '—'}</strong></div>
            <div><span>MFE</span><strong>{session.mfe || '—'}</strong></div>
            <div><span>MAE</span><strong>{session.mae || '—'}</strong></div>
            <div><span>Missed R</span><strong>{session.missedR || '—'}</strong></div>
            <div><span>Verdict</span><strong className="aura-tr-metric-verdict">{session.verdict ? session.verdict.slice(0, 40) : '—'}{session.verdict?.length > 40 ? '…' : ''}</strong></div>
          </div>
        </section>

        {isLiveSession ? (
          <section className="trader-suite-panel aura-tr-rail-block aura-tr-copy-bar-wrap" aria-label="Copy and share replay">
            <ReplayCopyExportBar
              session={session}
              allSessions={sessions}
              replayFlags={replayFlags}
              variant="rail"
              librarySessions={sessions}
              habitStats={habitStats}
            />
            <ReplayPackagePrep sessions={sessions} habitStats={habitStats} variant="compact" />
            <ReplayNarrativePrep sessions={sessions} habitStats={habitStats} variant="compact" />
          </section>
        ) : null}

        {isLiveSession && replayFlags.mentorSummaryCopy ? (
          <section className="trader-suite-panel aura-tr-rail-block aura-tr-coach-context-block" aria-label="Coach review context">
            <div className="trader-suite-kicker">Coach review</div>
            <p className="aura-tr-coach-priority-line aura-tr-coach-priority-line--rail">
              <span className="aura-tr-chip subtle aura-tr-chip--priority">{mentorCoachCtx.reviewPriority}</span>
              {mentorCoachCtx.priorityHint}
            </p>
            <ul className="aura-tr-coach-bullet-list aura-tr-coach-bullet-list--rail">
              {mentorCoachCtx.bullets.slice(0, 3).map((b) => (
                <li key={b.key}>{b.text}</li>
              ))}
            </ul>
            <p className="aura-tr-coach-next-rail">
              <span className="aura-tr-muted">Next · </span>
              {mentorCoachCtx.nextAction.label}
            </p>
          </section>
        ) : null}

        {session.replayStatus === REPLAY_STATUSES.completed && replayFlags.mentorSummaryCopy ? (
          <section className={`trader-suite-panel aura-tr-rail-block aura-tr-mentor-block ${replayFlags.mentorFullLayout ? 'aura-tr-mentor-block--elite' : ''}`}>
            <div className="trader-suite-kicker">Mentor summary</div>
            <p className="aura-tr-muted small">
              {session.asset || session.symbol} · {session.replayDate || session.sourceDate || '—'} · {session.mode || 'trade'}
            </p>
            {replayFlags.mentorFullLayout ? (
              <div className="aura-tr-mentor-grid">
                <div><span className="aura-tr-muted">Lesson</span><p>{coaching.mainLesson}</p></div>
                <div><span className="aura-tr-muted">Mistake</span><p>{coaching.biggestMistake}</p></div>
                <div><span className="aura-tr-muted">Best</span><p>{coaching.bestMoment}</p></div>
                <div><span className="aura-tr-muted">Plan</span><p>{session.improvementPlan || coaching.nextSessionFocus}</p></div>
              </div>
            ) : (
              <p className="aura-tr-mentor-tight">{coaching.mainLesson}</p>
            )}
            <p className="aura-tr-muted small">Desk copy: use Copy / share → Mentor or .txt bundle.</p>
          </section>
        ) : null}

        {isLiveSession && replayFlags.learningExamples && onPersistFields ? (
          <section className="trader-suite-panel aura-tr-rail-block" id="aura-tr-learning-asset">
            <div className="trader-suite-kicker">Learning asset</div>
            <p className="aura-tr-muted small">Model tapes reinforce process; caution tapes sharpen risk IQ.</p>
            {!session.learningExample ? (
              <div className="aura-tr-learning-actions">
                <button
                  type="button"
                  className="trader-suite-btn"
                  onClick={() => onPersistFields({ learningExample: true, learningExampleKind: 'model' })}
                >
                  Save as model
                </button>
                <button
                  type="button"
                  className="trader-suite-btn"
                  onClick={() => onPersistFields({ learningExample: true, learningExampleKind: 'caution' })}
                >
                  Save as caution
                </button>
              </div>
            ) : (
              <div className="aura-tr-learning-actions">
                <span className="aura-tr-chip subtle aura-tr-chip--example">{exampleLabel}</span>
                {exampleMentorFrame.headline && exampleMentorFrame.mentorLine ? (
                  <p className="aura-tr-learning-mentor-frame">
                    <strong className={session.learningExampleKind === 'caution' ? 'aura-tr-example--caution' : 'aura-tr-example--model'}>
                      {exampleMentorFrame.headline}
                    </strong>
                    <span>{exampleMentorFrame.mentorLine}</span>
                  </p>
                ) : null}
                <button
                  type="button"
                  className="trader-suite-btn"
                  onClick={() => onPersistFields({ learningExample: false, learningExampleKind: null })}
                >
                  Remove from vault
                </button>
              </div>
            )}
          </section>
        ) : isLiveSession && !replayFlags.learningExamples ? (
          <section className="trader-suite-panel aura-tr-rail-block">
            <ReplayPremiumNudge>Save model & caution examples to build a premium replay vault.</ReplayPremiumNudge>
          </section>
        ) : null}

        <section className="trader-suite-panel aura-tr-rail-block">
          <div className="trader-suite-kicker">Next best actions</div>
          <ul className="aura-tr-followup-list">
            {followUps.map((a) => (
              <li key={a.key}>
                <Link to={a.to} className="aura-tr-followup-link">{a.label}</Link>
                <span className="aura-tr-followup-reason">{a.reason}</span>
              </li>
            ))}
          </ul>
          {!replayFlags.followUpExpanded ? (
            <ReplayPremiumNudge>Deeper follow-up routing — similar trades & management loops — on Premium.</ReplayPremiumNudge>
          ) : null}
        </section>

        <section className="trader-suite-panel aura-tr-rail-block">
          <div className="trader-suite-kicker">Related actions</div>
          <div className="aura-tr-related">
            <Link
              to={playbookTo}
              className="trader-suite-btn"
            >
              Open Playbook
            </Link>
            {labTo ? (
              <Link to={labTo} className="trader-suite-btn">
                Linked Lab session
              </Link>
            ) : (
              <span className="trader-suite-btn aura-tr-btn--disabled" title="Set a Lab date on this replay to enable" aria-disabled="true">
                Linked Lab session
              </span>
            )}
            <Link to={journalTo} className="trader-suite-btn">
              {session.lessonSummary ? 'Daily Journal · lesson' : 'Daily Journal'}
            </Link>
            <Link to={tradeJournalTo} className="trader-suite-btn">
              Trade Journal
            </Link>
            <Link to={validatorTo} className="trader-suite-btn">
              The Operator
            </Link>
            <Link to={checklistTo} className="trader-suite-btn">
              Follow-up checklist
            </Link>
          </div>
        </section>
      </aside>
    </div>
  );
}
