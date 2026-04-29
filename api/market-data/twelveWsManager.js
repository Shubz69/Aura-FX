'use strict';

const { forProvider, toCanonical } = require('../ai/utils/symbol-registry');

let WebSocketImpl = null;
try {
  // Optional in some runtimes; manager falls back gracefully when missing.
  WebSocketImpl = require('ws');
} catch (_) {
  WebSocketImpl = null;
}

const WS_URL = 'wss://ws.twelvedata.com/v1/quotes/price';
const MAX_ACTIVE_SUBSCRIPTIONS = Math.max(
  1,
  Math.min(450, parseInt(process.env.TWELVE_WS_MAX_SUBSCRIPTIONS || '450', 10) || 450)
);
const SUBSCRIPTION_IDLE_MS = Math.max(
  120000,
  parseInt(process.env.TWELVE_WS_IDLE_MS || '180000', 10) || 180000
);
const HEARTBEAT_MS = Math.max(10000, parseInt(process.env.TWELVE_WS_HEARTBEAT_MS || '25000', 10) || 25000);

/** @type {null | import('ws')} */
let ws = null;
let wsReady = false;
let reconnectTimer = null;
let heartbeatTimer = null;

const symbolState = new Map(); // canonical => { providerSymbol, refs, lastTouched, subscribed }
const quotes = new Map(); // canonical => latest quote payload
const listeners = new Set(); // (evt)=>void

const metrics = {
  reconnects: 0,
  messagesReceived: 0,
  connectErrors: 0,
  subscribeOps: 0,
  unsubscribeOps: 0,
  skippedDueToLimit: 0,
  lastDisconnectReason: null,
  lastMessageAt: 0,
  startedAt: Date.now(),
};

function apiKey() {
  return String(process.env.TWELVE_DATA_API_KEY || '').trim();
}

function toProviderSymbol(canonical) {
  return forProvider(canonical, 'twelvedata') || canonical;
}

function providerToCanonical(providerSymbol) {
  return toCanonical(providerSymbol);
}

function emit(event) {
  listeners.forEach((cb) => {
    try {
      cb(event);
    } catch (_) {
      // ignore listener failures
    }
  });
}

function snapshotDiagnostics() {
  let refs = 0;
  let active = 0;
  symbolState.forEach((v) => {
    refs += v.refs;
    if (v.subscribed) active += 1;
  });
  return {
    connected: wsReady,
    hasSocket: Boolean(ws),
    twelveWsActiveSubscriptions: active,
    trackedSymbolRefs: refs,
    trackedSymbols: symbolState.size,
    twelveWsMessagesReceived: metrics.messagesReceived,
    reconnects: metrics.reconnects,
    skippedDueToLimit: metrics.skippedDueToLimit,
    lastMessageAt: metrics.lastMessageAt || null,
    lastDisconnectReason: metrics.lastDisconnectReason,
    uptimeMs: Date.now() - metrics.startedAt,
    maxWsSubscriptions: MAX_ACTIVE_SUBSCRIPTIONS,
    subscriptionIdleMs: SUBSCRIPTION_IDLE_MS,
  };
}

function scheduleReconnect(delayMs = 3000) {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    ensureConnected();
  }, Math.max(250, delayMs));
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (!ws || !wsReady) return;
    try {
      ws.send(JSON.stringify({ action: 'heartbeat' }));
    } catch (_) {
      // onclose handler will reconnect
    }
  }, HEARTBEAT_MS);
}

function sendSubscriptionAction(action, providerSymbols) {
  if (!ws || !wsReady || !Array.isArray(providerSymbols) || providerSymbols.length === 0) return;
  try {
    ws.send(JSON.stringify({ action, params: { symbols: providerSymbols.join(',') } }));
    if (action === 'subscribe') metrics.subscribeOps += providerSymbols.length;
    if (action === 'unsubscribe') metrics.unsubscribeOps += providerSymbols.length;
  } catch (_) {
    // socket error handled by close/reconnect
  }
}

function subscribedProviderSymbols() {
  const out = [];
  symbolState.forEach((v) => {
    if (v.subscribed) out.push(v.providerSymbol);
  });
  return out;
}

function resyncSubscriptions() {
  const all = subscribedProviderSymbols();
  if (all.length === 0) return;
  sendSubscriptionAction('subscribe', all);
}

function ensureConnected() {
  if (!WebSocketImpl || !apiKey()) return false;
  if (ws && (ws.readyState === WebSocketImpl.OPEN || ws.readyState === WebSocketImpl.CONNECTING)) return true;

  const url = `${WS_URL}?apikey=${encodeURIComponent(apiKey())}`;
  ws = new WebSocketImpl(url);
  wsReady = false;

  ws.on('open', () => {
    wsReady = true;
    metrics.reconnects += 1;
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[twelveWsManager] connected', { reconnects: metrics.reconnects });
    }
    startHeartbeat();
    resyncSubscriptions();
  });

  ws.on('message', (raw) => {
    metrics.messagesReceived += 1;
    metrics.lastMessageAt = Date.now();
    let payload = null;
    try {
      payload = JSON.parse(String(raw || '{}'));
    } catch (_) {
      return;
    }
    const providerSymbol = String(payload?.symbol || '').trim();
    if (!providerSymbol) return;
    const canonical = providerToCanonical(providerSymbol);
    const price = Number(payload?.price);
    if (!Number.isFinite(price) || price <= 0) return;
    const quote = {
      symbol: canonical,
      providerSymbol,
      price,
      timestamp: Date.now(),
      source: 'twelvedata-ws',
      raw: payload,
    };
    quotes.set(canonical, quote);
    emit({ type: 'quote', quote });
  });

  ws.on('close', (code, reason) => {
    wsReady = false;
    metrics.lastDisconnectReason = `${code || ''}:${String(reason || '')}`.trim();
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[twelveWsManager] disconnected', { reason: metrics.lastDisconnectReason });
    }
    stopHeartbeat();
    scheduleReconnect(3000);
  });

  ws.on('error', () => {
    metrics.connectErrors += 1;
  });

  return true;
}

function subscribeSymbols(inputSymbols = []) {
  const now = Date.now();
  const canonicalSymbols = [...new Set((inputSymbols || []).map((s) => toCanonical(String(s || '').toUpperCase())).filter(Boolean))];
  const newlySubscribed = [];

  canonicalSymbols.forEach((canonical) => {
    const existing = symbolState.get(canonical);
    if (existing) {
      existing.refs += 1;
      existing.lastTouched = now;
      return;
    }
    const providerSymbol = toProviderSymbol(canonical);
    if (symbolState.size >= MAX_ACTIVE_SUBSCRIPTIONS) {
      metrics.skippedDueToLimit += 1;
      return;
    }
    symbolState.set(canonical, {
      providerSymbol,
      refs: 1,
      lastTouched: now,
      subscribed: true,
    });
    newlySubscribed.push(providerSymbol);
  });

  ensureConnected();
  if (newlySubscribed.length > 0 && wsReady) {
    sendSubscriptionAction('subscribe', newlySubscribed);
  }
  if (typeof console !== 'undefined' && console.debug) {
    console.debug('[twelveWsManager] subscribe symbols', {
      requested: canonicalSymbols.length,
      newlySubscribed: newlySubscribed.length,
      activeSubscriptions: snapshotDiagnostics().twelveWsActiveSubscriptions,
    });
  }

  return {
    subscribedSymbols: canonicalSymbols,
    activeSubscriptions: snapshotDiagnostics().twelveWsActiveSubscriptions,
  };
}

function releaseSymbols(inputSymbols = []) {
  const now = Date.now();
  const canonicalSymbols = [...new Set((inputSymbols || []).map((s) => toCanonical(String(s || '').toUpperCase())).filter(Boolean))];
  canonicalSymbols.forEach((canonical) => {
    const existing = symbolState.get(canonical);
    if (!existing) return;
    existing.refs = Math.max(0, existing.refs - 1);
    existing.lastTouched = now;
  });
  if (typeof console !== 'undefined' && console.debug) {
    console.debug('[twelveWsManager] release symbols', {
      released: canonicalSymbols.length,
      activeSubscriptions: snapshotDiagnostics().twelveWsActiveSubscriptions,
    });
  }
}

function pruneIdleSubscriptions() {
  const now = Date.now();
  const toUnsubscribe = [];
  symbolState.forEach((entry, canonical) => {
    const idle = now - entry.lastTouched;
    if (entry.refs <= 0 && idle >= SUBSCRIPTION_IDLE_MS) {
      toUnsubscribe.push(entry.providerSymbol);
      symbolState.delete(canonical);
      quotes.delete(canonical);
    }
  });
  if (toUnsubscribe.length > 0 && wsReady) {
    sendSubscriptionAction('unsubscribe', toUnsubscribe);
  }
}

setInterval(pruneIdleSubscriptions, 30000).unref?.();

function getQuoteSnapshot(symbols = []) {
  const out = {};
  const requested = [...new Set((symbols || []).map((s) => toCanonical(String(s || '').toUpperCase())).filter(Boolean))];
  requested.forEach((sym) => {
    if (quotes.has(sym)) out[sym] = quotes.get(sym);
  });
  return out;
}

function onEvent(cb) {
  if (typeof cb !== 'function') return () => {};
  listeners.add(cb);
  return () => listeners.delete(cb);
}

module.exports = {
  subscribeSymbols,
  releaseSymbols,
  getQuoteSnapshot,
  onEvent,
  ensureConnected,
  snapshotDiagnostics,
  _internals: {
    pruneIdleSubscriptions,
    symbolState,
    quotes,
  },
};
