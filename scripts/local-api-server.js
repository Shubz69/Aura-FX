/* eslint-disable no-console */
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const chartHistoryHandler = require('../api/market/chart-history');
const watchlistHandler = require('../api/market/watchlist');
const snapshotHandler = require('../api/markets/snapshot');
const liveQuotesStreamHandler = require('../api/market/live-quotes-stream');
const internalLiveDiagnosticsHandler = require('../api/market/internal-live-diagnostics');
const candleContextHandler = require('../api/market/candle-context');

const PORT = Number(process.env.LOCAL_API_PORT || 3001);
const QA_REPLAY_TRADE_FULL = {
  replayId: 'csv:qalocal1',
  sourceId: 'qalocal1',
  source: 'csv',
  symbol: 'EURUSD',
  direction: 'buy',
  openTime: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
  closeTime: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
  entry: 1.084,
  exit: 1.0885,
  stopLoss: 1.08,
  takeProfit: 1.092,
  lotSize: 0.5,
  pnl: 125.5,
  durationSeconds: 3600,
};

function toReplayListItem(t) {
  return {
    id: t.replayId,
    replayId: t.replayId,
    sourceId: t.sourceId,
    source: t.source,
    symbol: t.symbol,
    direction: t.direction,
    openTime: t.openTime,
    closeTime: t.closeTime,
    lotSize: t.lotSize,
    pnl: t.pnl,
    durationSeconds: t.durationSeconds,
  };
}

const app = express();

app.use(express.json());
app.use(
  cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000', `http://localhost:${PORT}`],
    credentials: true,
  })
);

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'local-api-server', port: PORT });
});

app.get('/api/me', (_req, res) => {
  res.json({
    success: true,
    user: {
      id: 9001,
      userId: 9001,
      email: 'qa@local.test',
      role: 'admin',
      username: 'qa-admin',
    },
    entitlements: {
      effectiveTier: 'ELITE',
      tier: 'ELITE',
      status: 'active',
      canAccessAI: true,
    },
  });
});

app.get('/api/users/:userId', (req, res) => {
  const id = Number(req.params.userId || 9001);
  res.json({
    id,
    userId: id,
    email: 'qa@local.test',
    role: 'admin',
    username: 'qa-admin',
  });
});

app.get('/api/subscription/status', (_req, res) => {
  res.json({
    success: true,
    hasAccess: true,
    plan: 'elite',
    status: 'active',
  });
});

/** Daily streak — accept any method locally (some clients may probe GET; production is POST-only). */
function dailyLoginStub(_req, res) {
  res.json({
    success: true,
    awarded: false,
    message: 'local-dev daily login bypass',
  });
}
app.post('/api/users/daily-login', dailyLoginStub);
app.get('/api/users/daily-login', dailyLoginStub);

function decodeReplayIdParam(value) {
  if (value == null || value === '') return '';
  let s = String(value).trim();
  try {
    for (let i = 0; i < 4; i += 1) {
      const next = decodeURIComponent(s.replace(/\+/g, ' '));
      if (next === s) break;
      s = next;
    }
  } catch {
    /* keep s */
  }
  return String(s).trim();
}

/** Trader Replay — stubs without DB/JWT so browser QA works against CRA + this server. */
app.get('/api/trader-replay/trades', (req, res) => {
  const replayId = decodeReplayIdParam(req.query?.tradeId);
  if (replayId) {
    if (replayId === QA_REPLAY_TRADE_FULL.replayId || replayId.includes('qalocal')) {
      return res.status(200).json({ success: true, trade: QA_REPLAY_TRADE_FULL });
    }
    return res.status(404).json({ success: false, message: 'Trade not found' });
  }
  const trades = [toReplayListItem(QA_REPLAY_TRADE_FULL)];
  return res.status(200).json({
    success: true,
    source: String(req.query?.source || 'all').toLowerCase(),
    count: trades.length,
    trades,
  });
});

/** Analysis optional — heuristic falls back client-side when null. */
app.post('/api/trader-replay/analysis', (_req, res) => {
  res.status(200).json({ success: true, provider: 'local-stub', analysis: null });
});

app.get('/api/trader-replay/candles', async (req, res) => {
  try {
    const tradeId = decodeReplayIdParam(req.query?.tradeId);
    const interval = String(req.query?.interval || '15');
    if (!tradeId) {
      return res.status(400).json({ success: false, message: 'tradeId is required' });
    }
    if (tradeId !== QA_REPLAY_TRADE_FULL.replayId && !tradeId.includes('qalocal')) {
      return res.status(404).json({ success: false, message: 'Trade not found' });
    }
    const sym = QA_REPLAY_TRADE_FULL.symbol;
    const origin = `http://127.0.0.1:${PORT}`;
    const { data } = await axios.get(`${origin}/api/market/chart-history`, {
      params: { symbol: sym, interval },
      timeout: 25000,
    });
    return res.status(200).json({
      success: true,
      tradeId,
      symbol: sym,
      interval,
      bars: Array.isArray(data?.bars) ? data.bars : [],
      source: data?.source || 'market-chart-history',
    });
  } catch (e) {
    console.error('[local-api-server] trader-replay/candles error:', e?.message || e);
    return res.status(500).json({ success: false, message: 'Could not load replay candles' });
  }
});

/** Candle context aggregator — empty feeds are fine (fallback copy in handler). */
app.get('/api/trader-deck/economic-calendar', (_req, res) => {
  res.json({ success: true, events: [] });
});

app.get('/api/trader-deck/news', (_req, res) => {
  res.json({ success: true, articles: [] });
});

app.get('/api/market/chart-history', async (req, res) => {
  try {
    await chartHistoryHandler(req, res);
  } catch (e) {
    console.error('[local-api-server] chart-history error:', e);
    res.status(500).json({
      success: false,
      message: 'Local API wrapper failed',
      error: String(e?.message || e),
    });
  }
});

app.get('/api/market/watchlist', async (req, res) => {
  try {
    await watchlistHandler(req, res);
  } catch (e) {
    console.error('[local-api-server] watchlist error:', e);
    res.status(500).json({
      success: false,
      message: 'Local API wrapper failed',
      error: String(e?.message || e),
    });
  }
});

app.get('/api/markets/snapshot', async (req, res) => {
  try {
    await snapshotHandler(req, res);
  } catch (e) {
    console.error('[local-api-server] snapshot error:', e);
    res.status(500).json({
      success: false,
      message: 'Local API wrapper failed',
      error: String(e?.message || e),
    });
  }
});

app.get('/api/market/live-quotes-stream', async (req, res) => {
  try {
    await liveQuotesStreamHandler(req, res);
  } catch (e) {
    console.error('[local-api-server] live-quotes-stream error:', e);
    res.status(500).json({
      success: false,
      message: 'Local API wrapper failed',
      error: String(e?.message || e),
    });
  }
});

app.get('/api/market/internal-live-diagnostics', async (req, res) => {
  try {
    await internalLiveDiagnosticsHandler(req, res);
  } catch (e) {
    console.error('[local-api-server] internal-live-diagnostics error:', e);
    res.status(500).json({
      success: false,
      message: 'Local API wrapper failed',
      error: String(e?.message || e),
    });
  }
});

app.get('/api/market/candle-context', async (req, res) => {
  try {
    await candleContextHandler(req, res);
  } catch (e) {
    console.error('[local-api-server] candle-context error:', e);
    res.status(500).json({
      success: false,
      message: 'Local API wrapper failed',
      error: String(e?.message || e),
    });
  }
});

app.listen(PORT, () => {
  console.log(`[local-api-server] listening on http://localhost:${PORT}`);
  console.log(`[local-api-server] chart endpoint: http://localhost:${PORT}/api/market/chart-history`);
  console.log(`[local-api-server] snapshot endpoint: http://localhost:${PORT}/api/markets/snapshot`);
  console.log(`[local-api-server] live endpoint: http://localhost:${PORT}/api/market/live-quotes-stream`);
  console.log('[local-api-server] trader-replay stubs: /api/trader-replay/trades, /api/trader-replay/candles');
});
