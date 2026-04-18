/**
 * CRA/browser entry: re-exports the pure ESM implementation.
 * Do not use `require()` of the CJS file here — webpack 5 ESM chunks error with
 * "ES Modules may not assign module.exports" when CJS is pulled into an ESM graph.
 */
export {
  stripModelInternalExposition,
  sanitizeTraderDeskPayloadDeep,
  sanitizeAiTradingPriorities,
  sanitizeAiDeskPayloadFields,
} from './sanitizeAiDeskOutput.mjs';
