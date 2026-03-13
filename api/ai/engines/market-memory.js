/**
 * Market Memory – simple event memory: recent macro events, large price moves.
 * Enables AI to say e.g. "Gold dropped earlier today after stronger US economic data."
 */

const MAX_MACRO_ENTRIES = 20;
const MAX_MOVES_ENTRIES = 30;
const MOVE_THRESHOLD_PCT = 0.5;

const macroMemory = [];
const moveMemory = [];

/**
 * Record a macro event (call when processing calendar or news).
 */
function recordMacroEvent(event) {
  const entry = {
    time: new Date().toISOString(),
    event: event.event || event.name,
    currency: event.currency,
    impact: event.impact,
    actual: event.actual,
    forecast: event.forecast
  };
  macroMemory.unshift(entry);
  if (macroMemory.length > MAX_MACRO_ENTRIES) macroMemory.pop();
}

/**
 * Record a significant price move (call when OHLC shows large change).
 */
function recordPriceMove(symbol, description, pctChange, direction) {
  const entry = {
    time: new Date().toISOString(),
    symbol,
    description,
    pctChange,
    direction
  };
  moveMemory.unshift(entry);
  if (moveMemory.length > MAX_MOVES_ENTRIES) moveMemory.pop();
}

/**
 * Get recent macro events (e.g. last 24h by count).
 */
function getRecentMacroEvents(limit = 10) {
  return macroMemory.slice(0, limit);
}

/**
 * Get recent large moves for a symbol or all.
 */
function getRecentMoves(symbol = null, limit = 10) {
  const list = symbol ? moveMemory.filter(m => m.symbol === symbol) : moveMemory;
  return list.slice(0, limit);
}

/**
 * Summarize for AI context: "Recent context: ..."
 */
function getSummaryForContext(symbol = null) {
  const macro = getRecentMacroEvents(5);
  const moves = getRecentMoves(symbol, 5);
  const lines = [];
  if (macro.length) lines.push('Recent macro: ' + macro.map(e => e.event).join('; '));
  if (moves.length) lines.push('Recent moves: ' + moves.map(m => `${m.symbol} ${m.direction} ${m.description}`).join('; '));
  return lines.length ? lines.join('\n') : null;
}

/**
 * Check if we should record a move (e.g. from quote change %).
 */
function maybeRecordMove(symbol, previousClose, currentPrice, triggerPct = MOVE_THRESHOLD_PCT) {
  if (previousClose == null || currentPrice == null || previousClose === 0) return;
  const pct = ((currentPrice - previousClose) / previousClose) * 100;
  if (Math.abs(pct) >= triggerPct) {
    recordPriceMove(symbol, `${pct.toFixed(2)}%`, pct, pct > 0 ? 'up' : 'down');
  }
}

module.exports = {
  recordMacroEvent,
  recordPriceMove,
  getRecentMacroEvents,
  getRecentMoves,
  getSummaryForContext,
  maybeRecordMove
};
