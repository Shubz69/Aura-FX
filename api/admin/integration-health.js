/**
 * GET /api/admin/integration-health
 * Live probes + config flags for external dependencies — Admin / Super Admin only.
 * Never returns API keys or secrets; only status, latency, short hints.
 */

'use strict';

const { executeQuery } = require('../db');
const { assertStaffAdminFromRequest } = require('../utils/adminAccess');

const PROBE_MS = Math.min(12000, parseInt(process.env.INTEGRATION_HEALTH_PROBE_MS || '8000', 10) || 8000);

function withTimeout(promise, ms, label = 'timeout') {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(label)), ms)),
  ]);
}

/** Static copy for admins (what breaks if this dependency fails). */
const INTEGRATION_DEFS = [
  {
    id: 'mysql',
    name: 'Primary database (MySQL)',
    category: 'Infrastructure',
    purpose:
      'Authoritative storage for accounts, subscriptions, journals, Trader Deck briefs metadata, community data, and admin actions. If down, most authenticated features fail.',
  },
  {
    id: 'perplexity',
    name: 'Perplexity AI',
    category: 'AI',
    purpose:
      'Premium AI chat, institutional-style reports, DNA/trade tooling, chart checks, and automated Trader Desk brief generation when configured. Outages reduce or disable AI-heavy flows.',
  },
  {
    id: 'twelve_data',
    name: 'Twelve Data',
    category: 'Market data',
    purpose:
      'FX/equity/crypto quotes and OHLC used by Market Decoder, Trader Desk intelligence feeds, watchlists, and caching layers. Failures degrade live pricing and desk panels.',
  },
  {
    id: 'finnhub',
    name: 'Finnhub',
    category: 'Market data',
    purpose:
      'News headlines, quote fallbacks, and adapters in the AI data layer. Downstream news tiles and some quote paths may empty or stale.',
  },
  {
    id: 'fmp',
    name: 'Financial Modeling Prep',
    category: 'Market data',
    purpose:
      'Macro/economic calendar enrichment for Trader Deck calendar views and related desk tooling when keys are present.',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    category: 'Payments',
    purpose:
      'Checkout, subscriptions, webhooks, and referral payout rails. Billing and plan changes depend on Stripe availability.',
  },
  {
    id: 'twilio',
    name: 'Twilio Verify',
    category: 'Communications',
    purpose:
      'SMS-based phone verification where enabled. Users may not complete verify flows when Twilio is unreachable.',
  },
  {
    id: 'pusher',
    name: 'Pusher',
    category: 'Real-time',
    purpose:
      'Optional realtime channels for community/admin features where configured. REST APIs still work; realtime updates may lag.',
  },
  {
    id: 'smtp_email',
    name: 'SMTP / outbound email',
    category: 'Communications',
    purpose:
      'Contact form notifications and transactional email via nodemailer when EMAIL_USER/PASS are set. Failure affects outbound mail only, not API reads.',
  },
];

function mergeResult(def, probe) {
  const { status, latencyMs, detail } = probe;
  return {
    ...def,
    status,
    latencyMs: latencyMs == null ? null : Math.round(latencyMs),
    detail: detail ? String(detail).slice(0, 240) : null,
  };
}

async function probeMysql() {
  const t0 = Date.now();
  try {
    await withTimeout(executeQuery('SELECT 1 AS ok'), PROBE_MS, 'timeout');
    return { status: 'ok', latencyMs: Date.now() - t0, detail: null };
  } catch (e) {
    return {
      status: 'down',
      latencyMs: Date.now() - t0,
      detail: e.message || 'query_failed',
    };
  }
}

async function probePerplexity() {
  const key = String(process.env.PERPLEXITY_API_KEY || '').trim();
  if (!key) return { status: 'not_configured', latencyMs: null, detail: 'PERPLEXITY_API_KEY not set' };
  const t0 = Date.now();
  try {
    const { getPerplexityModelForChat } = require('../ai/perplexity-config');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(6000, PROBE_MS));
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: getPerplexityModelForChat(),
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        temperature: 0,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) {
      return {
        status: 'degraded',
        latencyMs: Date.now() - t0,
        detail: `HTTP ${response.status}`,
      };
    }
    return { status: 'ok', latencyMs: Date.now() - t0, detail: null };
  } catch (e) {
    return {
      status: 'down',
      latencyMs: Date.now() - t0,
      detail: e.name === 'AbortError' ? 'timeout' : e.message || 'failed',
    };
  }
}

async function probeTwelveData() {
  const hasKey = String(process.env.TWELVE_DATA_API_KEY || '').trim().length > 0;
  if (!hasKey) return { status: 'not_configured', latencyMs: null, detail: 'TWELVE_DATA_API_KEY not set' };
  const t0 = Date.now();
  try {
    const td = require('../market-data/providers/twelveDataClient');
    const { runWithTdRequestMeta } = require('../market-data/tdRequestContext');
    const sym = String(process.env.TWELVE_DATA_HEALTH_SYMBOL || 'EUR/USD').trim() || 'EUR/USD';
    const r = await withTimeout(
      runWithTdRequestMeta({ trafficClass: 'background', throttleFeature: 'integration-health' }, () =>
        td.fetchPrice(sym)
      ),
      PROBE_MS,
      'timeout'
    );
    const body = r.data && typeof r.data === 'object' ? r.data : null;
    const tdApiError =
      body && (body.status === 'error' || (body.code != null && Number(body.code) >= 400));
    const priceOk = body && !tdApiError && (body.price != null || body.close != null);
    if (r.ok && priceOk) return { status: 'ok', latencyMs: Date.now() - t0, detail: null };
    if (r.status === 429) return { status: 'degraded', latencyMs: Date.now() - t0, detail: 'rate_limited' };
    if (r.status === 402) return { status: 'degraded', latencyMs: Date.now() - t0, detail: 'plan_or_credits' };
    return {
      status: 'degraded',
      latencyMs: Date.now() - t0,
      detail: (body && body.message) || `http_${r.status || 0}`,
    };
  } catch (e) {
    return {
      status: 'down',
      latencyMs: Date.now() - t0,
      detail: e.message || 'probe_failed',
    };
  }
}

async function probeFinnhub() {
  const key = String(process.env.FINNHUB_API_KEY || '').trim();
  if (!key) return { status: 'not_configured', latencyMs: null, detail: 'FINNHUB_API_KEY not set' };
  const t0 = Date.now();
  try {
    const u = `https://finnhub.io/api/v1/quote?symbol=MSFT&token=${encodeURIComponent(key)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(7000, PROBE_MS));
    const r = await fetch(u, { signal: controller.signal });
    clearTimeout(timer);
    if (!r.ok) return { status: 'degraded', latencyMs: Date.now() - t0, detail: `HTTP ${r.status}` };
    const j = await r.json();
    if (j && j.error) return { status: 'degraded', latencyMs: Date.now() - t0, detail: String(j.error).slice(0, 120) };
    return { status: 'ok', latencyMs: Date.now() - t0, detail: null };
  } catch (e) {
    return {
      status: 'down',
      latencyMs: Date.now() - t0,
      detail: e.name === 'AbortError' ? 'timeout' : e.message || 'failed',
    };
  }
}

async function probeFmp() {
  const key = String(process.env.FMP_API_KEY || '').trim();
  if (!key) return { status: 'not_configured', latencyMs: null, detail: 'FMP_API_KEY not set' };
  const t0 = Date.now();
  try {
    const u = `https://financialmodelingprep.com/api/v3/is-the-market-open?exchange=NYSE&apikey=${encodeURIComponent(key)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(7000, PROBE_MS));
    const r = await fetch(u, { signal: controller.signal });
    clearTimeout(timer);
    if (!r.ok) return { status: 'degraded', latencyMs: Date.now() - t0, detail: `HTTP ${r.status}` };
    return { status: 'ok', latencyMs: Date.now() - t0, detail: null };
  } catch (e) {
    return {
      status: 'down',
      latencyMs: Date.now() - t0,
      detail: e.name === 'AbortError' ? 'timeout' : e.message || 'failed',
    };
  }
}

async function probeStripe() {
  const key = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!key) return { status: 'not_configured', latencyMs: null, detail: 'STRIPE_SECRET_KEY not set' };
  const t0 = Date.now();
  try {
    const stripe = require('stripe')(key, { maxNetworkRetries: 0, timeout: Math.min(10000, PROBE_MS) });
    await withTimeout(stripe.balance.retrieve(), PROBE_MS, 'timeout');
    return { status: 'ok', latencyMs: Date.now() - t0, detail: null };
  } catch (e) {
    return {
      status: 'down',
      latencyMs: Date.now() - t0,
      detail: e.message || 'stripe_failed',
    };
  }
}

async function probeTwilio() {
  const sid = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
  const token = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
  if (!sid || !token) {
    return { status: 'not_configured', latencyMs: null, detail: 'Twilio SMS env not set' };
  }
  const t0 = Date.now();
  try {
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const u = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}.json`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(7000, PROBE_MS));
    const r = await fetch(u, { headers: { Authorization: `Basic ${auth}` }, signal: controller.signal });
    clearTimeout(timer);
    if (!r.ok) return { status: 'degraded', latencyMs: Date.now() - t0, detail: `HTTP ${r.status}` };
    return { status: 'ok', latencyMs: Date.now() - t0, detail: null };
  } catch (e) {
    return {
      status: 'down',
      latencyMs: Date.now() - t0,
      detail: e.name === 'AbortError' ? 'timeout' : e.message || 'failed',
    };
  }
}

async function probePusher() {
  const appId = String(process.env.PUSHER_APP_ID || '').trim();
  const key = String(process.env.PUSHER_KEY || '').trim();
  const secret = String(process.env.PUSHER_SECRET || '').trim();
  if (!appId || !key || !secret) {
    return { status: 'not_configured', latencyMs: null, detail: 'Pusher env not set' };
  }
  const t0 = Date.now();
  try {
    const auth = Buffer.from(`${key}:${secret}`).toString('base64');
    const u = `https://api.pusher.com/apps/${encodeURIComponent(appId)}/channels`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(7000, PROBE_MS));
    const r = await fetch(u, { headers: { Authorization: `Basic ${auth}` }, signal: controller.signal });
    clearTimeout(timer);
    if (r.status === 401 || r.status === 403) {
      return { status: 'degraded', latencyMs: Date.now() - t0, detail: 'auth rejected' };
    }
    if (!r.ok) return { status: 'degraded', latencyMs: Date.now() - t0, detail: `HTTP ${r.status}` };
    return { status: 'ok', latencyMs: Date.now() - t0, detail: null };
  } catch (e) {
    return {
      status: 'down',
      latencyMs: Date.now() - t0,
      detail: e.name === 'AbortError' ? 'timeout' : e.message || 'failed',
    };
  }
}

async function probeSmtp() {
  const user = String(process.env.EMAIL_USER || '').trim();
  const pass = String(process.env.EMAIL_PASS || '').trim();
  if (!user || !pass) {
    return { status: 'not_configured', latencyMs: null, detail: 'EMAIL_USER/PASS not set' };
  }
  const t0 = Date.now();
  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: process.env.EMAIL_PORT ? parseInt(process.env.EMAIL_PORT, 10) : 587,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: { user, pass },
      connectionTimeout: Math.min(8000, PROBE_MS),
      greetingTimeout: Math.min(8000, PROBE_MS),
    });
    await withTimeout(
      new Promise((resolve, reject) => {
        transporter.verify((err, success) => (err ? reject(err) : resolve(success)));
      }),
      PROBE_MS,
      'timeout'
    );
    return { status: 'ok', latencyMs: Date.now() - t0, detail: null };
  } catch (e) {
    return {
      status: 'degraded',
      latencyMs: Date.now() - t0,
      detail: e.message || 'verify_failed',
    };
  }
}

function overallFrom(integrations) {
  if (integrations.some((i) => i.status === 'down')) return 'critical';
  if (integrations.some((i) => i.status === 'degraded')) return 'degraded';
  const configured = integrations.filter((i) => i.status !== 'not_configured');
  if (configured.length === 0) return 'not_configured';
  return 'healthy';
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const admin = await assertStaffAdminFromRequest(req);
  if (!admin.ok) return res.status(admin.status).json({ success: false, message: admin.message });

  const started = Date.now();
  const byId = Object.fromEntries(INTEGRATION_DEFS.map((d) => [d.id, d]));

  try {
    const [
      mysqlR,
      perplexityR,
      twelveR,
      finnhubR,
      fmpR,
      stripeR,
      twilioR,
      pusherR,
      smtpR,
    ] = await Promise.all([
      probeMysql(),
      probePerplexity(),
      probeTwelveData(),
      probeFinnhub(),
      probeFmp(),
      probeStripe(),
      probeTwilio(),
      probePusher(),
      probeSmtp(),
    ]);

    const integrations = [
      mergeResult(byId.mysql, mysqlR),
      mergeResult(byId.perplexity, perplexityR),
      mergeResult(byId.twelve_data, twelveR),
      mergeResult(byId.finnhub, finnhubR),
      mergeResult(byId.fmp, fmpR),
      mergeResult(byId.stripe, stripeR),
      mergeResult(byId.twilio, twilioR),
      mergeResult(byId.pusher, pusherR),
      mergeResult(byId.smtp_email, smtpR),
    ];

    const overall = overallFrom(integrations.map((x) => ({ status: x.status })));

    return res.status(200).json({
      success: true,
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      overall,
      integrations,
    });
  } catch (e) {
    console.error('[admin/integration-health]', e);
    return res.status(500).json({ success: false, message: e.message || 'health_failed' });
  }
};
