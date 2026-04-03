import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { isSuperAdmin } from '../utils/roles';
import Api from '../services/Api';
import { useAuth } from './AuthContext';

const AuraConnectionContext = createContext(null);

/** Aura Analysis Connection Hub: MetaTrader 4 & 5 only (read-only investor-password flow). */
export const PLATFORMS = [
  {
    id: 'mt5',
    name: 'MetaTrader 5',
    category: 'MT',
    fields: [
      { key: 'login', label: 'ACCOUNT LOGIN', placeholder: 'e.g. 12345678' },
      { key: 'password', label: 'INVESTOR PASSWORD', placeholder: 'Investor (read-only) password', secret: true },
      { key: 'server', label: 'BROKER SERVER', placeholder: 'e.g. ICMarketsSC-Demo' },
    ],
  },
  {
    id: 'mt4',
    name: 'MetaTrader 4',
    category: 'MT',
    fields: [
      { key: 'login', label: 'ACCOUNT LOGIN', placeholder: 'e.g. 12345678' },
      { key: 'password', label: 'INVESTOR PASSWORD', placeholder: 'Investor (read-only) password', secret: true },
      { key: 'server', label: 'BROKER SERVER', placeholder: 'e.g. ICMarkets-Demo' },
    ],
  },
];

export function AuraConnectionProvider({ children }) {
  const { token, loading: authLoading } = useAuth();
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);

  const mapConnectError = useCallback((err) => {
    const code = err?.response?.data?.code || '';
    const apiError = err?.response?.data?.error || '';
    const missing = err?.response?.data?.missing;

    if (code === 'TERMINALSYNC_CONFIG_MISSING' || code === 'TERMINALSYNC_WORKER_URL_NOT_CONFIGURED') {
      return 'Connection service is not configured yet. Please contact support.';
    }
    if (code === 'TERMINALSYNC_UNAUTHORIZED_SECRET') {
      return 'Connection authentication failed. Please try again shortly.';
    }
    if (code === 'TERMINALSYNC_TIMEOUT') {
      return 'Connection timed out. The MetaTrader bridge may be busy — wait a minute and try again, or verify your broker server name.';
    }
    if (err?.response?.status === 504) {
      return 'Connection timed out before the server could finish. Please try again in a moment; if it keeps happening, check broker server spelling or try off-peak hours.';
    }
    if (code === 'TERMINALSYNC_WORKER_URL_INVALID') {
      return 'Connection configuration is invalid. Please contact support.';
    }
    if (apiError === 'MT5/MT4 credentials are incomplete') {
      if (Array.isArray(missing) && missing.length) {
        return `Please complete required fields: ${missing.join(', ')}`;
      }
      return 'Please provide account login, investor password, and broker server.';
    }
    const msg = String(apiError || '').trim();
    const risky =
      /password|secret|token|bearer|ECONNREFUSED|ENOTFOUND|certificate|SSL|html|undefined|null|stack|at\s+\w+\./i.test(
        msg
      );
    if (msg && !risky && msg.length < 240) return msg;
    if (err?.response?.status === 400) {
      return 'Invalid credentials. Please verify account login, investor password, and broker server.';
    }
    return 'Connection failed. Please verify account login, investor password, and broker server.';
  }, []);

  // Load connections only when authenticated (avoids 401 to platform-connect on public pages like /login)
  useEffect(() => {
    if (authLoading) return;
    if (!token) {
      setConnections([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    Api.getAuraPlatformConnections()
      .then((r) => {
        if (r.data?.success) setConnections(r.data.connections || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, authLoading]);

  /** Connect a platform — calls backend with real credentials */
  const connectPlatform = useCallback(async (platformId, credentials) => {
    const platformType = platformId === 'mt5' ? 'MT5' : platformId === 'mt4' ? 'MT4' : null;
    const payload =
      platformType && credentials && typeof credentials === 'object'
        ? { ...credentials, platformType }
        : credentials;
    let r;
    try {
      r = await Api.connectAuraPlatform(platformId, payload);
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
