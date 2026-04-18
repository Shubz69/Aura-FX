/**
 * CRA/browser entry: named ESM exports wired to the CommonJS implementation.
 * (Importing `.mjs` or bare CJS named imports can break in lazy chunks.)
 */
'use strict';

const {
  sanitizeTraderDeskPayloadDeep,
  stripModelInternalExposition,
  sanitizeAiTradingPriorities,
  sanitizeAiDeskPayloadFields,
} = require('./sanitizeAiDeskOutput.js');

export {
  sanitizeTraderDeskPayloadDeep,
  stripModelInternalExposition,
  sanitizeAiTradingPriorities,
  sanitizeAiDeskPayloadFields,
};
