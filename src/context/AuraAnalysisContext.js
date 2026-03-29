/**
 * AuraAnalysisContext — Single source of truth for all Aura Analysis data.
 * Manages linked MetaTrader (MT4/MT5) account data, trade history, analytics, filters, and 10-min auto-refresh.
 */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Api from '../services/Api';
import { useAuraConnection } from './AuraConnectionContext';
import { computeAnalytics } from '../lib/aura-analysis/analytics';

const AuraAnalysisContext = createContext(null);

const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

const DATE_RANGE_OPTIONS = [
  { label: '1D',  days: 1   },
  { label: '1W',  days: 7   },
  { label: '1M',  days: 30  },
  { label: '3M',  days: 90  },
  { label: '6M',  days: 180 },
  { label: '1Y',  days: 365 },
];

export { DATE_RANGE_OPTIONS };

export function AuraAnalysisProvider({ children }) {
  const { connections } = useAuraConnection();

  // ── Active platform ───────────────────────────────────────────────────────
  const defaultPlatformId = useRef(null);
  const [activePlatformId, setActivePlatformId] = useState(() => {
    const mt5 = connections.find(c => c.platformId === 'mt5' || c.platformId === 'mt4');
    return mt5?.platformId || connections[0]?.platformId || null;
  });

  // Sync when connections load
  useEffect(() => {
    if (!activePlatformId && connections.length > 0) {
      const mt5 = connections.find(c => c.platformId === 'mt5' || c.platformId === 'mt4');
      const id  = mt5?.platformId || connections[0]?.platformId;
      setActivePlatformId(id);
      defaultPlatformId.current = id;
    }
  }, [connections, activePlatformId]);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [daysFilter,   setDaysFilter]   = useState(30);
  const [symbolFilter, setSymbolFilter] = useState('ALL');
  const [sessionFilter, setSessionFilter] = useState('ALL');
  const [dirFilter,    setDirFilter]    = useState('ALL');

  // ── Raw data ──────────────────────────────────────────────────────────────
  const [account,   setAccount]   = useState(null);
  const [rawTrades, setRawTrades] = useState([]);

  // ── State ─────────────────────────────────────────────────────────────────
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshing,  setRefreshing]  = useState(false);
  /** True when last successful history response used DB cache (worker failed). */
  const [historyStale, setHistoryStale] = useState(false);
  /** 'live' | 'cache' | null — from platform-history API. */
  const [historyDataSource, setHistoryDataSource] = useState(null);
  /** True when last successful account response used cached account_info (live fetch failed). */
  const [accountStale, setAccountStale] = useState(false);
  /** 'live' | 'cache' | null — from platform-account API. */
  const [accountDataSource, setAccountDataSource] = useState(null);

  const isFetching = useRef(false);
  const intervalRef = useRef(null);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async (background = false) => {
    if (!activePlatformId) return;
    if (isFetching.current) return;
    isFetching.current = true;

    if (background) setRefreshing(true);
    else { setLoading(true); setError(null); }

    try {
      const [accSettled, histSettled] = await Promise.allSettled([
        Api.getAuraPlatformAccount(activePlatformId),
        Api.getAuraPlatformHistory(activePlatformId, daysFilter),
      ]);

      let gotAccount = false;
      let gotTrades = false;

      if (accSettled.status === 'fulfilled') {
        const accRes = accSettled.value;
        if (accRes?.data?.success || accRes?.data?.account) {
          setAccount(accRes.data.account || null);
          setAccountStale(!!accRes.data.stale);
          setAccountDataSource(
            accRes.data.dataSource === 'cache' ? 'cache' : accRes.data.dataSource === 'live' ? 'live' : null
          );
          gotAccount = true;
        }
      }

      if (histSettled.status === 'fulfilled') {
        const payload = histSettled.value?.data;
        const trades = payload?.trades;
        if (Array.isArray(trades)) {
          setRawTrades(trades);
          gotTrades = true;
          const fromCache = !!payload?.stale || !!payload?.cacheServedStale;
          setHistoryStale(fromCache);
          setHistoryDataSource(payload?.dataSource === 'cache' ? 'cache' : payload?.dataSource === 'live' ? 'live' : null);
        }
      }

      setLastUpdated(new Date());

      if (!background) {
        if (!gotAccount && !gotTrades) {
          setError('Unable to load account data. Check your connection.');
        } else {
          setError(null);
        }
      }
    } catch {
      if (!background) setError('Unable to load account data. Check your connection.');
    } finally {
      isFetching.current = false;
      if (background) setRefreshing(false);
      else setLoading(false);
    }
  }, [activePlatformId, daysFilter]);

  // Initial + days/platform change
  useEffect(() => {
    if (activePlatformId) fetchData(false);
  }, [activePlatformId, daysFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // 10-min auto-refresh — clean up on unmount
  useEffect(() => {
    if (!activePlatformId) return;
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => fetchData(true), REFRESH_INTERVAL_MS);
    return () => clearInterval(intervalRef.current);
  }, [activePlatformId, fetchData]);

  // ── Filtered trades ───────────────────────────────────────────────────────
  const trades = useMemo(() => {
    let t = rawTrades;
    if (symbolFilter  !== 'ALL') t = t.filter(x => (x.pair || x.symbol) === symbolFilter);
    if (sessionFilter !== 'ALL') t = t.filter(x => x.session === sessionFilter);
    if (dirFilter     !== 'ALL') t = t.filter(x => (x.direction || '').toLowerCase() === dirFilter.toLowerCase());
    return t;
  }, [rawTrades, symbolFilter, sessionFilter, dirFilter]);

  // ── Symbols list for filter dropdown ─────────────────────────────────────
  const symbolOptions = useMemo(() => {
    const s = new Set(rawTrades.map(t => t.pair || t.symbol).filter(Boolean));
    return ['ALL', ...Array.from(s).sort()];
  }, [rawTrades]);

  // ── Analytics (recomputed on filter change) ───────────────────────────────
  const analytics = useMemo(() => computeAnalytics(trades, account), [trades, account]);

  // ── Last-updated display string ───────────────────────────────────────────
  const lastUpdatedStr = useMemo(() => {
    if (!lastUpdated) return null;
    const diff = Math.floor((Date.now() - lastUpdated.getTime()) / 60000);
    if (diff < 1) return 'Just now';
    if (diff === 1) return '1 min ago';
    return `${diff} min ago`;
  }, [lastUpdated]); // will be recalculated on each render but that's fine for display

  const value = {
    // Platform
    activePlatformId,
    setActivePlatformId,
    connections,

    // Raw data
    account,
    rawTrades,

    // Filtered data + analytics
    trades,
    analytics,

    // Filters
    daysFilter,    setDaysFilter,
    symbolFilter,  setSymbolFilter,
    sessionFilter, setSessionFilter,
    dirFilter,     setDirFilter,
    symbolOptions,
    dateRangeOptions: DATE_RANGE_OPTIONS,

    // State
    loading,
    error,
    refreshing,
    lastUpdated,
    lastUpdatedStr,
    historyStale,
    historyDataSource,
    accountStale,
    accountDataSource,
    refresh: () => fetchData(false),
  };

  return (
    <AuraAnalysisContext.Provider value={value}>
      {children}
    </AuraAnalysisContext.Provider>
  );
}

export function useAuraAnalysis() {
  const ctx = useContext(AuraAnalysisContext);
  if (!ctx) throw new Error('useAuraAnalysis must be used inside AuraAnalysisProvider');
  return ctx;
}
