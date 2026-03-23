import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { isSuperAdmin } from '../utils/roles';
import Api from '../services/Api';

const AuraConnectionContext = createContext(null);

export const PLATFORMS = [
  { id: 'mt5',       name: 'MetaTrader 5', category: 'MT',       fields: [{ key: 'login', label: 'Account Login', placeholder: 'e.g. 12345678' }, { key: 'password', label: 'Password', placeholder: 'Your MT5 password', secret: true }, { key: 'server', label: 'Broker Server', placeholder: 'e.g. ICMarketsSC-Demo' }] },
  { id: 'mt4',       name: 'MetaTrader 4', category: 'MT',       fields: [{ key: 'login', label: 'Account Login', placeholder: 'e.g. 12345678' }, { key: 'password', label: 'Password', placeholder: 'Your MT4 password', secret: true }, { key: 'server', label: 'Broker Server', placeholder: 'e.g. ICMarketsSC-Demo' }] },
  { id: 'ctrader',   name: 'cTrader',      category: 'Platform', fields: [{ key: 'accountId', label: 'cTrader Account ID', placeholder: 'Your account ID' }, { key: 'accessToken', label: 'Access Token', placeholder: 'OAuth access token', secret: true }] },
  { id: 'dxtrade',   name: 'DXtrade',      category: 'Platform', fields: [{ key: 'server', label: 'Server URL', placeholder: 'https://your-broker.dxtrade.com' }, { key: 'login', label: 'Login', placeholder: 'Account login' }, { key: 'password', label: 'Password', placeholder: 'Account password', secret: true }] },
  { id: 'tradovate', name: 'Tradovate',    category: 'Futures',  fields: [{ key: 'username', label: 'Username', placeholder: 'Tradovate username' }, { key: 'password', label: 'Password', placeholder: 'Tradovate password', secret: true }] },
  { id: 'binance',   name: 'Binance',      category: 'Exchange', fields: [{ key: 'apiKey', label: 'API Key', placeholder: 'Your Binance API key' }, { key: 'apiSecret', label: 'API Secret', placeholder: 'Your Binance secret', secret: true }] },
  { id: 'bybit',     name: 'Bybit',        category: 'Exchange', fields: [{ key: 'apiKey', label: 'API Key', placeholder: 'Your Bybit API key' }, { key: 'apiSecret', label: 'API Secret', placeholder: 'Your Bybit secret', secret: true }] },
  { id: 'kraken',    name: 'Kraken',       category: 'Exchange', fields: [{ key: 'apiKey', label: 'API Key', placeholder: 'Your Kraken API key' }, { key: 'apiSecret', label: 'Private Key (base64)', placeholder: 'Your Kraken private key', secret: true }] },
  { id: 'coinbase',  name: 'Coinbase',     category: 'Exchange', fields: [{ key: 'apiKey', label: 'API Key', placeholder: 'Your Coinbase API key' }, { key: 'apiSecret', label: 'API Secret', placeholder: 'Your Coinbase secret', secret: true }] },
];

export function AuraConnectionProvider({ children }) {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);

  const mapConnectError = useCallback((err) => {
    const code = err?.response?.data?.code || '';
    const apiError = err?.response?.data?.error || '';
    const missing = err?.response?.data?.missing;

    if (code === 'TERMINALSYNC_CONFIG_MISSING' || code === 'TERMINALSYNC_WORKER_URL_NOT_CONFIGURED') {
      return 'MT5 bridge service is not configured yet. Please contact support to enable live MT5 sync.';
    }
    if (code === 'TERMINALSYNC_UNAUTHORIZED_SECRET') {
      return 'MT5 bridge authentication failed. Please try again shortly while we refresh service credentials.';
    }
    if (code === 'TERMINALSYNC_TIMEOUT') {
      return 'MT5 bridge timed out. Please retry in a few moments.';
    }
    if (code === 'TERMINALSYNC_WORKER_URL_INVALID') {
      return 'MT5 bridge configuration is invalid. Please contact support.';
    }
    if (apiError === 'MT5/MT4 credentials are incomplete') {
      if (Array.isArray(missing) && missing.length) {
        return `Please complete required fields: ${missing.join(', ')}`;
      }
      return 'Please provide login, password, and broker server.';
    }
    if (apiError) return apiError;
    if (err?.response?.status === 400) return 'Invalid MT5 credentials. Please verify login, password, and server.';
    return err?.message || 'Connection failed';
  }, []);

  // Load connections from backend on mount
  useEffect(() => {
    Api.getAuraPlatformConnections()
      .then((r) => {
        if (r.data?.success) setConnections(r.data.connections || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  /** Connect a platform — calls backend with real credentials */
  const connectPlatform = useCallback(async (platformId, credentials) => {
    let r;
    try {
      r = await Api.connectAuraPlatform(platformId, credentials);
    } catch (err) {
      throw new Error(mapConnectError(err));
    }
    if (!r.data?.success) throw new Error(r.data?.error || 'Connection failed');
    const accountInfo = r.data.accountInfo || {};
    setConnections((prev) => {
      const next = prev.filter((c) => c.platformId !== platformId);
      const mtLabel = credentials.login ? String(credentials.login) : null;
      next.push({
        platformId,
        label: credentials.accountId || mtLabel || (credentials.apiKey ? `${credentials.apiKey.slice(0, 8)}...` : null) || platformId,
        accountInfo,
        connectedAt: new Date().toISOString(),
        lastSync: new Date().toISOString(),
        status: 'active',
      });
      return next;
    });
    return accountInfo;
  }, [mapConnectError]);

  /** Disconnect a platform */
  const disconnectPlatform = useCallback(async (platformId) => {
    await Api.disconnectAuraPlatform(platformId);
    setConnections((prev) => prev.filter((c) => c.platformId !== platformId));
  }, []);

  const getConnection = useCallback(
    (platformId) => connections.find((c) => c.platformId === platformId),
    [connections]
  );

  const hasAnyConnection = connections.length > 0;

  const value = {
    connections,
    platforms: PLATFORMS,
    hasAnyConnection,
    loading,
    connectPlatform,
    disconnectPlatform,
    getConnection,
  };

  return (
    <AuraConnectionContext.Provider value={value}>
      {children}
    </AuraConnectionContext.Provider>
  );
}

export function useAuraConnection() {
  const ctx = useContext(AuraConnectionContext);
  if (!ctx) throw new Error('useAuraConnection must be used within AuraConnectionProvider');
  return ctx;
}

/** Super Admin can enter dashboard without any connection; others need at least one. */
export function useCanEnterAuraDashboard(user) {
  const { hasAnyConnection } = useAuraConnection();
  const superAdmin = user && isSuperAdmin(user);
  return superAdmin || hasAnyConnection;
}
