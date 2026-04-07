import { useEffect, useRef } from 'react';
import { normalizeReplay } from '../lib/trader-replay/replayNormalizer';
import { clampPlaybackSpeedMs } from '../lib/trader-replay/replayDefaults';

/**
 * Single-interval playback: clears previous timer whenever deps change or unmounts.
 * Advances replayStep inside setForm; auto-pauses at last marker via microtask (no nested setState in updater).
 */
export function useReplayPlayback(playing, setPlaying, playbackSpeedMs, setForm) {
  const timerRef = useRef(null);

  const clearTimer = () => {
    if (timerRef.current != null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    clearTimer();
    if (!playing) return undefined;

    const tickMs = clampPlaybackSpeedMs(playbackSpeedMs);
    timerRef.current = setInterval(() => {
      setForm((prev) => {
        const n = normalizeReplay(prev);
        const markers = n.replayMarkers || [];
        const maxIdx = Math.max(0, markers.length - 1);
        const cur = Math.min(Math.max(0, Number(prev.replayStep) || 0), maxIdx);
        if (cur >= maxIdx) {
          queueMicrotask(() => setPlaying(false));
          return prev.replayStep === maxIdx ? prev : { ...prev, replayStep: maxIdx };
        }
        return { ...prev, replayStep: cur + 1 };
      });
    }, tickMs);

    return clearTimer;
  }, [playing, playbackSpeedMs, setForm, setPlaying]);
}
