import React from 'react';
import { CHART_INTERVAL_OPTIONS, PLAYBACK_SPEED_OPTIONS, clampPlaybackSpeedMs } from '../../lib/trader-replay/replayDefaults';

export default function ReplayControls({
  playing,
  onPlay,
  onPause,
  onRestart,
  onBackStep,
  onNextStep,
  onJumpEnd,
  onStepSelect,
  replayStep,
  stepCount,
  playbackSpeedMs,
  onPlaybackSpeedMs,
  interval,
  onInterval,
  autoFocusNotes,
  onAutoFocusNotes,
  showLessons,
  onShowLessons,
}) {
  const maxStep = Math.max(0, stepCount - 1);
  const resolvedMs = clampPlaybackSpeedMs(playbackSpeedMs);
  const speedSelectValue = PLAYBACK_SPEED_OPTIONS.some((o) => o.ms === resolvedMs)
    ? resolvedMs
    : PLAYBACK_SPEED_OPTIONS[1].ms;
  const intervalValue = CHART_INTERVAL_OPTIONS.some((o) => o.value === String(interval))
    ? String(interval)
    : (interval ? String(interval) : CHART_INTERVAL_OPTIONS[2].value);

  return (
    <div className="trader-suite-panel aura-tr-controls" role="region" aria-label="Replay controls">
      <div
        className="aura-tr-transport"
        role="group"
        aria-label="Playback"
      >
        <button type="button" className="trader-suite-btn" onClick={onRestart} aria-label="Restart replay from first step">
          Restart
        </button>
        <button type="button" className="trader-suite-btn" onClick={onBackStep} disabled={replayStep <= 0} aria-label="Previous step">
          Back
        </button>
        {playing ? (
          <button type="button" className="trader-suite-btn trader-suite-btn--primary" onClick={onPause} aria-pressed="true" aria-label="Pause playback">
            Pause
          </button>
        ) : (
          <button type="button" className="trader-suite-btn trader-suite-btn--primary" onClick={onPlay} aria-pressed="false" aria-label="Start playback">
            Play
          </button>
        )}
        <button type="button" className="trader-suite-btn" onClick={onNextStep} disabled={replayStep >= maxStep} aria-label="Next step">
          Next
        </button>
        <button
          type="button"
          className="trader-suite-btn"
          onClick={onJumpEnd}
          disabled={maxStep <= 0}
          aria-label="Jump to last step"
        >
          Jump to end
        </button>
      </div>
      <div className="aura-tr-controls-row">
        <label className="aura-tr-control-field">
          <span className="aura-tr-muted" id="tr-replay-step-label">Step</span>
          <select
            className="trader-suite-select"
            aria-labelledby="tr-replay-step-label"
            value={replayStep}
            onChange={(e) => {
              const v = Number(e.target.value);
              onPause();
              onStepSelect(v);
            }}
          >
            {Array.from({ length: stepCount }, (_, i) => (
              <option key={i} value={i}>{i + 1} / {stepCount}</option>
            ))}
          </select>
        </label>
        <label className="aura-tr-control-field">
          <span className="aura-tr-muted" id="tr-replay-speed-label">Playback speed</span>
          <select
            className="trader-suite-select"
            aria-labelledby="tr-replay-speed-label"
            value={speedSelectValue}
            onChange={(e) => onPlaybackSpeedMs(Number(e.target.value))}
          >
            {PLAYBACK_SPEED_OPTIONS.map((o) => (
              <option key={o.ms} value={o.ms}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="aura-tr-control-field">
          <span className="aura-tr-muted" id="tr-replay-interval-label">Chart timeframe</span>
          <select
            className="trader-suite-select"
            aria-labelledby="tr-replay-interval-label"
            value={intervalValue}
            onChange={(e) => onInterval(e.target.value)}
          >
            {CHART_INTERVAL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="aura-tr-toggles">
        <label className="aura-tr-toggle">
          <input type="checkbox" checked={autoFocusNotes} onChange={(e) => onAutoFocusNotes(e.target.checked)} />
          <span>Auto-focus notes</span>
        </label>
        <label className="aura-tr-toggle">
          <input type="checkbox" checked={showLessons} onChange={(e) => onShowLessons(e.target.checked)} />
          <span>Show lessons</span>
        </label>
      </div>
    </div>
  );
}
