// TradingView Webhook Endpoint (public API route)
// Receives TradingView alerts and stores them for AI access

const tradingViewWebhook = require('./ai/tradingview-webhook');

module.exports = tradingViewWebhook;
