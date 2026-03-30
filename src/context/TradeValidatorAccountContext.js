import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import Api from '../services/Api';

const TradeValidatorAccountContext = createContext(null);

export function TradeValidatorAccountProvider({ children }) {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedIdState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const storageKey = user?.id ? `tv-validator-account-${user.id}` : null;

  const refreshAccounts = useCallback(async () => {
    if (!user?.id) {
      setAccounts([]);
      setSelectedIdState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await Api.getValidatorAccounts();
      const accs = res.data?.accounts ?? [];
      setAccounts(accs);
      setSelectedIdState((prev) => {
        if (prev && accs.some((a) => Number(a.id) === Number(prev))) return prev;
        const saved = storageKey ? localStorage.getItem(storageKey) : null;
        const validSaved = saved && accs.some((a) => String(a.id) === String(saved));
        if (validSaved) return Number(saved);
        return accs[0]?.id ?? null;
      });
    } catch (e) {
      setError(e?.response?.data?.message || e.message || 'Failed to load accounts');
      setAccounts([]);
      setSelectedIdState(null);
    } finally {
      setLoading(false);
    }
  }, [user?.id, storageKey]);

  useEffect(() => {
    refreshAccounts();
  }, [refreshAccounts]);

  const setSelectedAccountId = useCallback(
    (id) => {
      const n = id != null ? Number(id) : null;
      setSelectedIdState(n);
      if (storageKey && n != null && Number.isFinite(n)) {
        try {
          localStorage.setItem(storageKey, String(n));
        } catch {
          /* ignore */
        }
      }
    },
    [storageKey]
  );

  const addAccount = useCallback(async (name, accountCurrency = 'USD') => {
    const res = await Api.createValidatorAccount(name, accountCurrency);
    const accs = res.data?.accounts ?? [];
    setAccounts(accs);
    return accs[accs.length - 1] ?? null;
  }, []);

  const patchAccountCurrency = useCallback(async (accountId, accountCurrency) => {
    const res = await Api.patchValidatorAccount(accountId, { id: accountId, accountCurrency });
    const accs = res.data?.accounts ?? [];
    setAccounts(accs);
    return accs;
  }, []);

  const deleteAccount = useCallback(
    async (accountId) => {
      const res = await Api.deleteValidatorAccount(accountId);
      const accs = res.data?.accounts ?? [];
      setAccounts(accs);
      setSelectedIdState((prev) => {
        if (accs.some((a) => Number(a.id) === Number(prev))) return prev;
        const next = accs[0]?.id ?? null;
        if (storageKey && next != null && Number.isFinite(Number(next))) {
          try {
            localStorage.setItem(storageKey, String(next));
          } catch {
            /* ignore */
          }
        }
        return next;
      });
      return accs;
    },
    [storageKey]
  );

  const value = useMemo(
    () => ({
      accounts,
      selectedAccountId,
      setSelectedAccountId,
      loading,
      error,
      refreshAccounts,
      addAccount,
      patchAccountCurrency,
      deleteAccount,
    }),
    [
      accounts,
      selectedAccountId,
      setSelectedAccountId,
      loading,
      error,
      refreshAccounts,
      addAccount,
      patchAccountCurrency,
      deleteAccount,
    ]
  );

  return (
    <TradeValidatorAccountContext.Provider value={value}>{children}</TradeValidatorAccountContext.Provider>
  );
}

export function useTradeValidatorAccount() {
  const ctx = useContext(TradeValidatorAccountContext);
  if (!ctx) {
    return {
      accounts: [],
      selectedAccountId: null,
      setSelectedAccountId: () => {},
      loading: false,
      error: null,
      refreshAccounts: async () => {},
      addAccount: async () => null,
      patchAccountCurrency: async () => [],
      deleteAccount: async () => [],
    };
  }
  return ctx;
}
