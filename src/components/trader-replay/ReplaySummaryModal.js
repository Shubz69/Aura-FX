import React, { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  computeReplayQualityScore,
  computeReviewCompletenessScore,
} from '../../lib/trader-replay/replayNormalizer';
import {
  deriveCoaching,
  deriveSuggestedNextAction,
  mergeReplayDestination,
} from '../../lib/trader-replay/replayCoachingEngine';
import { buildFollowUpActions } from '../../lib/trader-replay/replayFollowup';
import { buildMentorSummaryText } from '../../lib/trader-replay/replayMentorSummary';
import { formatLearningExampleLabel } from '../../lib/trader-replay/replayEntitlements';
import ReplayPremiumNudge from './ReplayPremiumNudge';

export default function ReplaySummaryModal({
  session,
  onClose,
  onReplayAnother,
  onApplyLearningExample,
  onClearLearningExample,
  replayFlags = {},
  allSessions = [],
}) {
  const closeBtnRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => closeBtnRef.current?.focus(), 50);
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const coaching = useMemo(() => deriveCoaching(session), [session]);
  const suggested = useMemo(() => deriveSuggestedNextAction(session), [session]);
  const followUps = useMemo(() => buildFollowUpActions(session, allSessions).slice(0, replayFlags.followUpExpanded ? 6 : 3), [session, allSessions, replayFlags.followUpExpanded]);

  if (!session) return null;

  const { score: execQuality, signals: execSignals } = computeReplayQualityScore(session);
  const { score: reviewDepth, missingHints, signals: reviewSignals } = computeReviewCompletenessScore(session);
  const signalDepth = replayFlags.coachingSignalDepth ?? 1;
  const execShown = execSignals.slice(0, signalDepth);
  const reviewShown = reviewSignals.slice(0, signalDepth);

  const playbookTo = mergeReplayDestination('/trader-deck/trade-validator/trader-playbook', session, coaching);
  const journalTo = mergeReplayDestination('/trader-deck/trade-validator/journal', session, coaching);
  const validatorTo = mergeReplayDestination('/trader-deck/trade-validator/overview', session, coaching);
  const checklistTo = mergeReplayDestination('/trader-deck/trade-validator/checklist', session, coaching);
  const suggestedTo = mergeReplayDestination(suggested.href, session, coaching);

  const exLabel = formatLearningExampleLabel(session.learningExample, session.learningExampleKind);
  const showMentor = replayFlags.mentorSummaryCopy;
  const showLearning = replayFlags.learningExamples && onApplyLearningExample;

  return (
    <div
      className="aura-tr-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tr-replay-summary-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="trader-suite-panel aura-tr-modal" onClick={(e) => e.stopPropagation()}>
        <header className="aura-tr-modal-head">
          <h2 id="tr-replay-summary-title">Replay complete</h2>
          <button ref={closeBtnRef} type="button" className="trader-suite-btn" onClick={onClose} aria-label="Close summary">
            ×
          </button>
        </header>
        <p className="aura-tr-modal-title">{session.title}</p>

        <div className="aura-tr-modal-scores aura-tr-modal-scores--dual">
          <div>
            <span>Replay quality</span>
            <strong aria-label={`Replay quality score ${execQuality}`}>{execQuality}</strong>
            <small className="aura-tr-modal-score-hint">Execution read from saved metrics — not your review depth.</small>
            {execShown.map((t) => (
              <small key={t} className="aura-tr-modal-score-signal">{t}</small>
            ))}
          </div>
          <div>
            <span>Review completeness</span>
            <strong aria-label={`Review completeness ${reviewDepth} percent`}>{reviewDepth}%</strong>
            <small className="aura-tr-modal-score-hint">How thorough this replay review is.</small>
            {missingHints[0] ? <small className="aura-tr-modal-score-gap">Gap: {missingHints[0]}</small> : null}
            {!missingHints[0] && reviewShown.map((t) => (
              <small key={t} className="aura-tr-modal-score-signal">{t}</small>
            ))}
          </div>
        </div>

        {showMentor ? (
          <div className="aura-tr-modal-mentor">
            <span className="aura-tr-muted">Mentor / desk handoff</span>
            <div className={replayFlags.mentorFullLayout ? 'aura-tr-modal-mentor-grid' : ''}>
              <p><strong>Lesson</strong> · {coaching.mainLesson}</p>
              <p><strong>Mistake</strong> · {coaching.biggestMistake}</p>
              <p><strong>Best moment</strong> · {coaching.bestMoment}</p>
              <p><strong>Plan</strong> · {session.improvementPlan || coaching.nextSessionFocus || '—'}</p>
              <p><strong>Learning asset</strong> · {exLabel || 'Not flagged'}</p>
            </div>
            <button
              type="button"
              className="trader-suite-btn"
              onClick={() => {
                navigator.clipboard.writeText(buildMentorSummaryText(session)).then(
                  () => toast.success('Copied summary'),
                  () => toast.error('Copy failed')
                );
              }}
            >
              Copy summary text
            </button>
          </div>
        ) : null}

        <div className="aura-tr-modal-grid">
          <div>
            <span className="aura-tr-muted">Key lesson</span>
            <p>{coaching.mainLesson}</p>
          </div>
          <div>
            <span className="aura-tr-muted">Biggest mistake</span>
            <p>{coaching.biggestMistake}</p>
          </div>
          <div>
            <span className="aura-tr-muted">Best execution moment</span>
            <p>{coaching.bestMoment}</p>
          </div>
          <div>
            <span className="aura-tr-muted">Improvement plan</span>
            <p>{session.improvementPlan || coaching.nextSessionFocus || '—'}</p>
          </div>
        </div>

        {coaching.takeaways?.length ? (
          <div className="aura-tr-modal-takeaways">
            <span className="aura-tr-muted">Takeaways</span>
            <ul>
              {coaching.takeaways.slice(0, 4).map((t) => (
                <li key={t.slice(0, 48)}>{t}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="aura-tr-modal-followups">
          <span className="aura-tr-muted">Follow-up</span>
          <ul>
            {followUps.map((a) => (
              <li key={a.key}>
                <Link to={a.to}>{a.label}</Link>
                <span className="aura-tr-followup-reason">{a.reason}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="aura-tr-modal-next-action">
          <span className="aura-tr-muted">Suggested next step</span>
          <p className="aura-tr-modal-next-reason">{suggested.reason}</p>
          <Link to={suggestedTo} className="trader-suite-btn trader-suite-btn--primary">
            {suggested.label}
          </Link>
        </div>

        <div className="aura-tr-modal-actions">
          <Link to={playbookTo} className="trader-suite-btn">
            Playbook
          </Link>
          <Link to={journalTo} className="trader-suite-btn">
            Journal
          </Link>
          <Link to={validatorTo} className="trader-suite-btn">
            Trade Validator
          </Link>
          <Link to={checklistTo} className="trader-suite-btn">
            Checklist
          </Link>
          {showLearning && !session.learningExample ? (
            <>
              <button type="button" className="trader-suite-btn" onClick={() => onApplyLearningExample('model')}>
                Save as model example
              </button>
              <button type="button" className="trader-suite-btn" onClick={() => onApplyLearningExample('caution')}>
                Save as caution example
              </button>
            </>
          ) : null}
          {showLearning && session.learningExample && onClearLearningExample ? (
            <>
              <span className="aura-tr-learning-badge">{exLabel}</span>
              <button type="button" className="trader-suite-btn" onClick={onClearLearningExample}>
                Remove from vault
              </button>
            </>
          ) : null}
          {!replayFlags.learningExamples ? (
            <ReplayPremiumNudge>Learning vault & dual-type examples ship with Premium.</ReplayPremiumNudge>
          ) : null}
          <button type="button" className="trader-suite-btn" onClick={onReplayAnother}>
            Replay another
          </button>
          <button type="button" className="trader-suite-btn" onClick={onClose}>
            Back&nbsp;to workspace
          </button>
        </div>

        {!replayFlags.scenarioReplay ? (
          <div className="aura-tr-modal-upsell">
            <ReplayPremiumNudge>
              Upgrade for scenario drills, richer library control, and habit analytics.
            </ReplayPremiumNudge>
          </div>
        ) : null}
      </div>
    </div>
  );
}
