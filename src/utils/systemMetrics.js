/**
 * Client-side lightweight metrics (calculator). Server MT5/chart metrics live in api/utils/systemMetrics.js.
 */

import { logWarn } from './systemLogger';

let calculations_run = 0;
let calculations_blocked = 0;
/** @type {{ blocked: boolean, t: number }[]} */
const recentOutcomes = [];
const WINDOW = 40;
const BLOCK_ALERT_MIN = 20;
const BLOCK_ALERT_RATIO = 0.5;
let lastBlockAlertAt = 0;
const BLOCK_ALERT_COOLDOWN_MS = 60000;

export function recordCalculationOutcome(blocked) {
  calculations_run += 1;
  if (blocked) calculations_blocked += 1;
  recentOutcomes.push({ blocked, t: Date.now() });
  while (recentOutcomes.length > WINDOW) recentOutcomes.shift();

  if (recentOutcomes.length < BLOCK_ALERT_MIN) return;
  const blocks = recentOutcomes.filter((r) => r.blocked).length;
  const rate = blocks / recentOutcomes.length;
  const now = Date.now();
  if (rate >= BLOCK_ALERT_RATIO && now - lastBlockAlertAt > BLOCK_ALERT_COOLDOWN_MS) {
    lastBlockAlertAt = now;
    logWarn('metrics', 'alert_high_calculation_block_rate', {
      blocked: blocks,
      window: recentOutcomes.length,
      rate: Math.round(rate * 100) / 100,
    });
  }
}

export function getClientMetricsSnapshot() {
  return {
    calculations_run,
    calculations_blocked,
    recentWindowSize: recentOutcomes.length,
    ts: new Date().toISOString(),
  };
}
