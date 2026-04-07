/**
 * Dev-only helpers for Aura Analysis tab performance (staged mounts, in-view deferral, optional logging).
 * Enable logs: localStorage.setItem('AURA_TAB_PERF', '1') then refresh.
 * Heavy block timing (pipeline group): localStorage.setItem('AURA_ANALYSIS_PERF', '1') (dev only).
 */
import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import {
  isAuraAnalysisDevPerfEnabled,
  auraAnalysisDevPerfNoteChartMount,
} from '../../lib/aura-analysis/auraAnalysisDevPerf';

export const AURA_TAB_PERF =
  typeof process !== 'undefined' &&
  process.env.NODE_ENV === 'development' &&
  typeof localStorage !== 'undefined' &&
  localStorage.getItem('AURA_TAB_PERF') === '1';

/** Log once when a memo section mounts (opt-in via AURA_TAB_PERF). */
export function useAuraPerfSection(name) {
  useEffect(() => {
    if (!AURA_TAB_PERF || typeof console === 'undefined' || !console.info) return undefined;
    const t0 = performance.now();
    console.info(`[aura-tab-perf] mount ${name}`);
    return () => {
      console.info(`[aura-tab-perf] unmount ${name} (+${(performance.now() - t0).toFixed(0)}ms)`);
    };
  }, [name]);

  useLayoutEffect(() => {
    if (!isAuraAnalysisDevPerfEnabled()) return undefined;
    const t0 = performance.now();
    const id = requestAnimationFrame(() => {
      auraAnalysisDevPerfNoteChartMount(`chart.${name}`, performance.now() - t0);
    });
    return () => cancelAnimationFrame(id);
  }, [name]);
}

/** Reset when `resetKey` changes; becomes true after idle (or short timeout fallback). */
export function useIdleDeferredReady(resetKey, idleTimeoutMs = 420) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    let cancelled = false;
    const done = () => {
      if (!cancelled) setReady(true);
    };
    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(done, { timeout: idleTimeoutMs });
      return () => {
        cancelled = true;
        cancelIdleCallback(id);
      };
    }
    const t = setTimeout(done, 32);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [resetKey, idleTimeoutMs]);
  return ready;
}

/**
 * Callback ref + one-shot visibility: content can wait until near viewport.
 * Returns [setElementRef, isVisible].
 */
export function useInViewOnce(options = {}) {
  const { rootMargin = '180px', threshold = 0 } = options;
  const [node, setNode] = useState(null);
  const [visible, setVisible] = useState(false);

  const setRef = useCallback((el) => {
    setNode(el || null);
  }, []);

  useEffect(() => {
    if (visible || !node) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return undefined;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true);
      },
      { root: null, rootMargin, threshold }
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [node, visible, rootMargin, threshold]);

  return [setRef, visible];
}
