import React, { createContext, useContext, useState, useCallback } from 'react';
import { isSuperAdmin } from '../utils/roles';

const AuraConnectionContext = createContext(null);

const STORAGE_KEY = 'aura_connections';

const PLATFORMS = [
  { id: 'mt5', name: 'MetaTrader 5', category: 'MT' },
  { id: 'mt4', name: 'MetaTrader 4', category: 'MT' },
  { id: 'ctrader', name: 'cTrader', category: 'Platform' },
  { id: 'dxtrade', name: 'DXtrade', category: 'Platform' },
  { id: 'tradovate', name: 'Tradovate', category: 'Futures' },
  { id: 'binance', name: 'Binance', category: 'Exchange' },
  { id: 'bybit', name: 'Bybit', category: 'Exchange' },
  { id: 'kraken', name: 'Kraken', category: 'Exchange' },
  { id: 'coinbase', name: 'Coinbase', category: 'Exchange' },
];

function loadConnections() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveConnections(connections) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(connections));
  } catch (e) {
    console.warn('AuraConnectionContext: save failed', e);
  }
}

export function AuraConnectionProvider({ children }) {
  const [connections, setConnections] = useState(loadConnections);

  const addConnection = useCallback((platformId, data = {}) => {
    setConnections((prev) => {
      const next = prev.filter((c) => c.platformId !== platformId);
      next.push({
        platformId,
        connectedAt: new Date().toISOString(),
        lastSync: new Date().toISOString(),
        balance: data.balance ?? 0,
        currency: data.currency ?? 'USD',
        health: data.health ?? 'ok',
        ...data,
      });
      saveConnections(next);
      return next;
    });
  }, []);

  const removeConnection = useCallback((platformId) => {
    setConnections((prev) => {
      const next = prev.filter((c) => c.platformId !== platformId);
      saveConnections(next);
      return next;
    });
  }, []);

  const hasAnyConnection = connections.length > 0;

  const getConnection = useCallback(
    (platformId) => connections.find((c) => c.platformId === platformId),
    [connections]
  );

  const value = {
    connections,
    platforms: PLATFORMS,
    hasAnyConnection,
    addConnection,
    removeConnection,
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
