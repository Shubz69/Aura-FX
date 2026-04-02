/**
 * Environment toggles for instrument resolution / calculator safety.
 * Browser builds: use REACT_APP_* (CRA). Server/tests: INSTRUMENT_STRICT_MODE.
 */

function truthyEnv(v) {
  if (v == null || v === '') return false;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

/**
 * When true: unknown symbols are rejected (no heuristic fallback) for calculator specs.
 */
export function isInstrumentStrictMode() {
  if (typeof process === 'undefined' || !process.env) return false;
  const v = process.env.INSTRUMENT_STRICT_MODE ?? process.env.REACT_APP_INSTRUMENT_STRICT_MODE;
  return truthyEnv(v);
}

/**
 * Console logging for broker/MT5 override application.
 * Off when INSTRUMENT_OVERRIDE_LOG=0. On when INSTRUMENT_OVERRIDE_LOG=1/true or in non-production.
 */
export function shouldLogInstrumentOverridesToConsole() {
  if (typeof process === 'undefined' || !process.env) return false;
  if (process.env.INSTRUMENT_OVERRIDE_LOG === '0') return false;
  if (truthyEnv(process.env.INSTRUMENT_OVERRIDE_LOG)) return true;
  return process.env.NODE_ENV !== 'production';
}

/**
 * Debug fields (_debugTrace, _debugCalculation) and verbose traces.
 * Production: only when DEBUG_MODE / REACT_APP_DEBUG_MODE / INSTRUMENT_DEBUG_TRACE is truthy.
 * Non-production: on unless DEBUG_MODE=0.
 */
export function isInstrumentDebugEnabled() {
  if (typeof process === 'undefined' || !process.env) return false;
  if (process.env.DEBUG_MODE === '0' || process.env.REACT_APP_DEBUG_MODE === '0') return false;
  const v =
    process.env.DEBUG_MODE ??
    process.env.REACT_APP_DEBUG_MODE ??
    process.env.INSTRUMENT_DEBUG_TRACE;
  if (truthyEnv(v)) return true;
  if (process.env.NODE_ENV === 'production') return false;
  return true;
}
