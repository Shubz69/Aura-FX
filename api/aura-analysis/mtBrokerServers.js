/**
 * Curated MetaTrader 5 broker/server hints for normalization and safe retry.
 * Edit this map when onboarding popular brokers — never auto-replace user input silently;
 * only suggest ordered fallbacks after a documented failure (see mtSyncProvider).
 */

/** @typedef {{ id: string, displayName: string, serverAliases: string[] }} */

const BROKERS = [
  {
    id: 'ic_markets',
    displayName: 'IC Markets',
    serverAliases: [
      'ICMarketsSC-MT5',
      'ICMarketsSC-MT5-4',
      'ICMarketsSC-MT5-5',
      'ICMarketsSC-MT5-6',
      'ICMarketsSC-Demo',
      'ICMarketsEU-MT5',
      'ICMarketsEU-Demo',
    ],
  },
  {
    id: 'pepperstone',
    displayName: 'Pepperstone',
    serverAliases: [
      'Pepperstone-MT5-Live',
      'Pepperstone-Demo',
      'PepperstoneUK-MT5-Live',
    ],
  },
  {
    id: 'fusion_markets',
    displayName: 'Fusion Markets',
    serverAliases: ['FusionMarkets-MT5', 'FusionMarkets-Demo', 'Fusion-MT5'],
  },
  {
    id: 'oanda',
    displayName: 'OANDA',
    serverAliases: ['OANDA-v20 Live', 'OANDA-v20 Practice', 'OANDA-MT5'],
  },
  {
    id: 'vantage',
    displayName: 'Vantage',
    serverAliases: ['VantageInternational-MT5', 'VantageFX-MT5', 'Vantage-Demo'],
  },
  {
    id: 'fxcm',
    displayName: 'FXCM',
    serverAliases: ['FXCM-MT5', 'FXCM-USDDemo01'],
  },
  {
    id: 'xm',
    displayName: 'XM',
    serverAliases: ['XMGlobal-MT5', 'XMGlobal-MT5 2', 'XMTrading-MT5', 'XM.com-Demo'],
  },
  {
    id: 'exness',
    displayName: 'Exness',
    serverAliases: ['Exness-MT5Real', 'Exness-MT5Trial'],
  },
];

/** Normalize user/server text for comparison (no silent value replacement). */
function normalizeServerKey(server) {
  return String(server || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Validate MT5 server string after trim.
 * @returns {{ ok: boolean, server: string, error?: string }}
 */
function validateMt5ServerInput(raw) {
  const server = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!server) {
    return { ok: false, server: '', error: 'Broker server name is required.' };
  }
  if (server.length > 160) {
    return { ok: false, server, error: 'Broker server name is too long.' };
  }
  if (/[\r\n\x00]/.test(server) || /[<>]/.test(server)) {
    return { ok: false, server, error: 'Broker server name contains invalid characters.' };
  }
  return { ok: true, server };
}

function findBrokerMetaByServer(serverNorm) {
  if (!serverNorm) return null;
  for (const b of BROKERS) {
    for (const a of b.serverAliases) {
      if (normalizeServerKey(a) === serverNorm) {
        return { broker: b, matchedAlias: a };
      }
    }
  }
  for (const b of BROKERS) {
    for (const a of b.serverAliases) {
      const an = normalizeServerKey(a);
      if (serverNorm.includes(an) || an.includes(serverNorm)) {
        return { broker: b, matchedAlias: a };
      }
    }
  }
  return null;
}

/**
 * Display name + id for connection metadata (best effort).
 */
function resolveBrokerDisplayInfo(serverTrimmed) {
  const v = validateMt5ServerInput(serverTrimmed);
  if (!v.ok) {
    return { brokerId: null, brokerName: null, serverName: serverTrimmed || '' };
  }
  const meta = findBrokerMetaByServer(normalizeServerKey(v.server));
  if (!meta) {
    return { brokerId: null, brokerName: null, serverName: v.server };
  }
  return {
    brokerId: meta.broker.id,
    brokerName: meta.broker.displayName,
    serverName: v.server,
  };
}

/**
 * Ordered distinct server names to try (original first, then curated aliases from same broker).
 * @param {string} serverTrimmed
 * @returns {string[]}
 */
function buildServerAttemptList(serverTrimmed) {
  const v = validateMt5ServerInput(serverTrimmed);
  if (!v.ok) return [];
  const primary = v.server;
  const out = [primary];
  const seen = new Set([normalizeServerKey(primary)]);
  const meta = findBrokerMetaByServer(normalizeServerKey(primary));
  if (meta && Array.isArray(meta.broker.serverAliases)) {
    for (const alt of meta.broker.serverAliases) {
      const t = alt.trim();
      const kn = normalizeServerKey(t);
      if (!kn || seen.has(kn)) continue;
      seen.add(kn);
      out.push(t);
    }
  }
  return out;
}

/**
 * Whether an error code / worker message may benefit from a guarded alternate server attempt.
 */
function shouldAttemptServerFallback(workerCode, messageText) {
  const code = String(workerCode || '');
  const msg = String(messageText || '').toLowerCase();
  if (code === 'MT5_SERVER_INVALID') return true;
  if (code === 'MT5_INIT_FAILED' && /dns|host|connect|unreachable|server|network|common/i.test(msg)) {
    return true;
  }
  if (code === 'MT5_LOGIN_FAILED') return false;
  return false;
}

module.exports = {
  BROKERS,
  validateMt5ServerInput,
  normalizeServerKey,
  resolveBrokerDisplayInfo,
  buildServerAttemptList,
  shouldAttemptServerFallback,
};
