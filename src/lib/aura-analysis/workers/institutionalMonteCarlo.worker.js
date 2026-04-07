/* eslint-disable no-restricted-globals */
import { monteCarloRiskFixed, MC_DEFAULT_RUNS } from '../analytics/monteCarloRisk';

self.onmessage = (e) => {
  const { pnls, startBalance, runs = MC_DEFAULT_RUNS } = e.data || {};
  if (!Array.isArray(pnls)) {
    self.postMessage({ mc: null, error: 'invalid_pnls' });
    return;
  }
  try {
    const mc = monteCarloRiskFixed(pnls, startBalance, runs);
    self.postMessage({ mc });
  } catch (err) {
    self.postMessage({ mc: null, error: String(err?.message || err) });
  }
};
