/**
 * Development-only Aura Analysis pipeline timings.
 * Enable: localStorage.setItem('AURA_ANALYSIS_PERF', '1') and refresh (dev builds only).
 * Inspect: window.__AURA_ANALYSIS_PERF__
 */

export const AURA_ANALYSIS_PERF_LS = 'AURA_ANALYSIS_PERF';

/** @returns {boolean} */
export function isAuraAnalysisDevPerfEnabled() {
  try {
    return (
      typeof process !== 'undefined' &&
      process.env.NODE_ENV === 'development' &&
      typeof localStorage !== 'undefined' &&
      localStorage.getItem(AURA_ANALYSIS_PERF_LS) === '1'
    );
  } catch {
    return false;
  }
}

let runSeq = 0;
/** @type {{ id: number, t0: number, stages: Record<string, number | Record<string, unknown>>, chartMounts: Array<{ name: string, ms: number }>, render: Record<string, unknown> } | null} */
let activePipeline = null;

let lastAnalyticsStages = /** @type {Record<string, unknown> | null} */ (null);

function roundMs(ms) {
  return Math.round(ms * 10) / 10;
}

/** Start a new pipeline (e.g. user refresh / filter change — non-background fetch). */
export function auraAnalysisDevPerfPipelineBegin(meta = {}) {
  if (!isAuraAnalysisDevPerfEnabled()) return;
  runSeq += 1;
  activePipeline = {
    id: runSeq,
    t0: typeof performance !== 'undefined' ? performance.now() : 0,
    stages: { ...meta },
    chartMounts: [],
    render: {},
  };
}

/** Record a stage duration in ms (already computed). */
export function auraAnalysisDevPerfPipelineStageMs(label, ms, extra = undefined) {
  if (!isAuraAnalysisDevPerfEnabled() || !activePipeline || ms == null) return;
  activePipeline.stages[label] = roundMs(ms);
  if (extra && typeof extra === 'object') {
    activePipeline.stages[`${label}.meta`] = extra;
  }
}

/** Elapsed ms from pipeline t0 to now. */
export function auraAnalysisDevPerfPipelineElapsed(label) {
  if (!isAuraAnalysisDevPerfEnabled() || !activePipeline) return;
  activePipeline.stages[label] = roundMs(performance.now() - activePipeline.t0);
}

/** Attach render-only marks (once per pipeline is caller responsibility). */
export function auraAnalysisDevPerfRenderMark(label, detail = undefined) {
  if (!isAuraAnalysisDevPerfEnabled() || !activePipeline) return;
  activePipeline.render[label] =
    detail !== undefined
      ? { ms: roundMs(performance.now() - activePipeline.t0), ...detail }
      : roundMs(performance.now() - activePipeline.t0);
}

/** Same as renderMark but ignores duplicate labels for this pipeline (e.g. strict mode). */
export function auraAnalysisDevPerfRenderMarkOnce(label, detail = undefined) {
  if (!isAuraAnalysisDevPerfEnabled() || !activePipeline) return;
  if (Object.prototype.hasOwnProperty.call(activePipeline.render, label)) return;
  auraAnalysisDevPerfRenderMark(label, detail);
}

/** Start a pipeline if none is active (e.g. filter-only recompute with no new fetch). */
export function auraAnalysisDevPerfEnsurePipeline(meta = {}) {
  if (!isAuraAnalysisDevPerfEnabled()) return;
  if (!activePipeline) auraAnalysisDevPerfPipelineBegin(meta);
}

export function auraAnalysisDevPerfIsPipelineActive() {
  return !!activePipeline;
}

export function auraAnalysisDevPerfNoteChartMount(name, ms) {
  if (!isAuraAnalysisDevPerfEnabled() || !activePipeline) return;
  activePipeline.chartMounts.push({ name, ms: roundMs(ms) });
}

/** Called from computeAnalytics before resolving (incl. cache hit). */
export function auraAnalysisDevPerfSetLastAnalyticsStages(stages) {
  if (!isAuraAnalysisDevPerfEnabled()) return;
  lastAnalyticsStages = stages && typeof stages === 'object' ? { ...stages } : null;
}

function consumeLastAnalyticsStages() {
  const s = lastAnalyticsStages;
  lastAnalyticsStages = null;
  return s;
}

/** After analytics commit: merge stages, log, expose on window, clear pipeline. */
export function auraAnalysisDevPerfPipelineFlushAfterAnalytics() {
  if (!isAuraAnalysisDevPerfEnabled() || !activePipeline) return;

  const run = activePipeline;
  const analyticsStages = consumeLastAnalyticsStages();
  if (analyticsStages) {
    Object.assign(run.stages, analyticsStages);
  }
  run.stages['pipeline.total'] = roundMs(performance.now() - run.t0);

  const summary = {
    id: run.id,
    stages: { ...run.stages },
    render: { ...run.render },
    chartMounts: run.chartMounts.length ? [...run.chartMounts] : undefined,
  };

  if (typeof window !== 'undefined') {
    window.__AURA_ANALYSIS_PERF__ = window.__AURA_ANALYSIS_PERF__ || { runs: [] };
    window.__AURA_ANALYSIS_PERF__.last = summary;
    const prev = window.__AURA_ANALYSIS_PERF__.runs || [];
    window.__AURA_ANALYSIS_PERF__.runs = [summary, ...prev].slice(0, 16);
  }

  // eslint-disable-next-line no-console
  console.groupCollapsed(
    `[aura-analysis-perf] pipeline #${run.id} · total ${summary.stages['pipeline.total']}ms`
  );
  const order = [
    'fetch.account',
    'fetch.history',
    'fetch.parallel',
    'normalize.trades',
    'analytics.path',
    'analytics.cacheHit',
    'analytics.sync',
    'analytics.monteCarlo',
    'analytics.institutional',
    'analytics.compute',
    'render.firstUsable',
    'render.activeTab',
    'pipeline.total',
  ];
  const seen = new Set();
  for (const k of order) {
    if (summary.stages[k] === undefined || seen.has(k)) continue;
    seen.add(k);
    const v = summary.stages[k];
    // eslint-disable-next-line no-console
    console.log(typeof v === 'number' ? `  ${k}: ${v}ms` : `  ${k}: ${JSON.stringify(v)}`);
  }
  for (const k of Object.keys(summary.stages).sort()) {
    if (seen.has(k)) continue;
    // eslint-disable-next-line no-console
    console.log(`  ${k}: ${JSON.stringify(summary.stages[k])}`);
  }
  if (Object.keys(summary.render).length) {
    // eslint-disable-next-line no-console
    console.log('  render:', summary.render);
  }
  if (summary.chartMounts?.length) {
    // eslint-disable-next-line no-console
    console.log(
      '  chartMounts:',
      summary.chartMounts.map((c) => `${c.name}:${c.ms}ms`).join(', ')
    );
  }
  // eslint-disable-next-line no-console
  console.groupEnd();

  activePipeline = null;
}
