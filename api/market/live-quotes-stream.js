'use strict';

const {
  subscribeSymbols,
  releaseSymbols,
  getQuoteSnapshot,
  onEvent,
  snapshotDiagnostics,
  ensureConnected,
} = require('../market-data/twelveWsManager');
const { stats: tdRestStats } = require('../market-data/tdRateLimiter');

function parseSymbols(queryValue) {
  return String(queryValue || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 150);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const symbols = parseSymbols(req.query.symbols);
  if (symbols.length === 0) {
    return res.status(400).json({ success: false, message: 'symbols query is required' });
  }

  const sub = subscribeSymbols(symbols);
  ensureConnected();

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const boot = {
    type: 'ready',
    symbols,
    quotes: getQuoteSnapshot(symbols),
    diagnostics: {
      ...snapshotDiagnostics(),
      twelveRestCallsThisMinute: tdRestStats().rollingWindowUsedSlots,
      twelveRestBudgetRemaining: Math.max(0, tdRestStats().maxRpm - tdRestStats().rollingWindowUsedSlots),
    },
  };
  res.write(`event: ready\ndata: ${JSON.stringify(boot)}\n\n`);

  const stop = onEvent((evt) => {
    if (!evt || evt.type !== 'quote' || !evt.quote) return;
    if (!symbols.includes(evt.quote.symbol)) return;
    res.write(`event: quote\ndata: ${JSON.stringify(evt.quote)}\n\n`);
  });

  const heartbeat = setInterval(() => {
    const rest = tdRestStats();
    const diag = snapshotDiagnostics();
    res.write(
      `event: diag\ndata: ${JSON.stringify({
        twelveRestCallsThisMinute: rest.rollingWindowUsedSlots,
        twelveRestBudgetRemaining: Math.max(0, rest.maxRpm - rest.rollingWindowUsedSlots),
        twelveWsActiveSubscriptions: diag.twelveWsActiveSubscriptions,
        twelveWsMessagesReceived: diag.twelveWsMessagesReceived,
      })}\n\n`
    );
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    stop();
    releaseSymbols(symbols);
  });
};
