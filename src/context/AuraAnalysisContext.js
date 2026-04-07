/**
 * AuraAnalysisContext — Single source of truth for all Aura Analysis data.
 * Manages linked MetaTrader (MT4/MT5) account data, trade history, analytics, filters, and 10-min auto-refresh.
 *
 * Performance: split data vs analytics contexts (filter bar avoids rerender on analytics-only updates);
 * skip noop history/account sets; memoized provider values; computeAnalytics result cache in analytics.js.
 */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import Api from '../services/Api';
import { useAuraConnection } from './AuraConnectionContext';
import {
  computeAnalytics,
  auraAnalysisClosedDataKey,
  emptyAnalytics,
  invalidateAuraAnalyticsCache,
} from '../lib/aura-analysis/analytics';
import {
  isAuraAnalysisDevPerfEnabled,
  auraAnalysisDevPerfPipelineBegin,
  auraAnalysisDevPerfPipelineStageMs,
  auraAnalysisDevPerfEnsurePipeline,
  auraAnalysisDevPerfPipelineFlushAfterAnalytics,
  auraAnalysisDevPerfIsPipelineActive,
} from '../lib/aura-analysis/auraAnalysisDevPerf';

const AuraAnalysisDataContext = createContext(null);
const AuraAnalysisAnalyticsContext = createContext(null);

const AuraAnalysisContext = createContext(null);

const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

/** Keep in sync with api/aura-analysis/mtTradeNormalize.js MAX_HISTORY_LOOKBACK_DAYS */
const ALL_TIME_LOOKBACK_DAYS = 3650;

const DATE_RANGE_OPTIONS = [
  { label: '1D',  days: 1   },
  { label: '1W',  days: 7   },
  { label: '1M',  days: 30  },
  { label: '3M',  days: 90  },
  { label: '6M',  days: 180 },
  { label: '1Y',  days: 365 },
  { label: 'ALL', days: ALL_TIME_LOOKBACK_DAYS },
];

export { DATE_RANGE_OPTIONS, ALL_TIME_LOOKBACK_DAYS };

/** Cheap fingerprint so polling that returns identical rows does not touch React state. */
function tradesPayloadFingerprint(arr) {
  const n = arr?.length ?? 0;
  if (n === 0) return '0';
  const first = arr[0];
  const last = arr[n - 1];
  let rot = 0;
  const cap = Math.min(n, 48);
  for (let i = 0; i < cap; i++) {
    const t = arr[i];
    const s = `${t?.id ?? ''}\n${t?.netPnl ?? t?.pnl ?? ''}\n${t?.closeTime ?? ''}`;
    for (let j = 0; j < s.length; j++) rot = ((rot << 5) - rot + s.charCodeAt(j)) | 0;
  }
  return `${n}|${first?.id ?? ''}|${last?.id ?? ''}|${last?.closeTime ?? ''}|${rot}`;
}

function accountPayloadFingerprint(acc) {
  if (!acc) return '';
  return `${acc.balance}|${acc.equity}|${acc.currency}|${acc.marginLevel ?? ''}`;
}

/**
 * Runs after the dashboard subtree layout so heavy tab bodies can record chart timings before flush.
 * Uses a tick bumped on every compute settlement (including cache hits) so identical analytics refs still flush.
 */
function AuraAnalysisPerfFlushBridge() {
  const { analyticsFlushTick, loading, refreshing } = useAuraAnalysis();
  // useEffect: after paint so rAF chart timings run first; wait for fetch to avoid partial fetch.* stages.
  useEffect(() => {
    if (!isAuraAnalysisDevPerfEnabled() || analyticsFlushTick === 0) return;
    if (loading || refreshing) return;
    auraAnalysisDevPerfPipelineFlushAfterAnalytics();
  }, [analyticsFlushTick, loading, refreshing]);
  return null;
}

export function AuraAnalysisProvider({ children }) {
  const { connections } = useAuraConnection();

  const defaultPlatformId = useRef(null);
  const [activePlatformId, setActivePlatformId] = useState(() => {
    const mt5 = connections.find(c => c.platformId === 'mt5' || c.platformId === 'mt4');
    return mt5?.platformId || connections[0]?.platformId || null;
  });

  useEffect(() => {
    if (!activePlatformId && connections.length > 0) {
      const mt5 = connections.find(c => c.platformId === 'mt5' || c.platformId === 'mt4');
      const id  = mt5?.platformId || connections[0]?.platformId;
      setActivePlatformId(id);
      defaultPlatformId.current = id;
    }
  }, [connections, activePlatformId]);

  const [daysFilter,   setDaysFilter]   = useState(30);
  const [customRange, setCustomRange] = useState(null);
  const [symbolFilter, setSymbolFilter] = useState('ALL');
  const [sessionFilter, setSessionFilter] = useState('ALL');
  const [dirFilter,    setDirFilter]    = useState('ALL');

  const [account,   setAccount]   = useState(null);
  const [rawTrades, setRawTrades] = useState([]);

  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshing,  setRefreshing]  = useState(false);
  const [historyStale, setHistoryStale] = useState(false);
  const [historyDataSource, setHistoryDataSource] = useState(null);
  const [accountStale, setAccountStale] = useState(false);
  const [accountDataSource, setAccountDataSource] = useState(null);

  const isFetching = useRef(false);
  const intervalRef = useRef(null);
  const rawTradesRef = useRef([]);
  const accountRef = useRef(null);
  const lastTradesFpRef = useRef('');
  const lastAccountFpRef = useRef('');

  useEffect(() => {
    rawTradesRef.current = rawTrades;
  }, [rawTrades]);
  useEffect(() => {
    accountRef.current = account;
  }, [account]);

  useEffect(() => {
    invalidateAuraAnalyticsCache();
    lastTradesFpRef.current = '';
    lastAccountFpRef.current = '';
  }, [activePlatformId]);

  const fetchData = useCallback(async (background = false) => {
    if (!activePlatformId) return;
    if (isFetching.current) return;
    isFetching.current = true;

    const hasCachedData = rawTradesRef.current.length > 0 || accountRef.current;
    const devPerfFetch = !background && isAuraAnalysisDevPerfEnabled();
    if (devPerfFetch) auraAnalysisDevPerfPipelineBegin({ trigger: 'fetch' });
    const tParallel0 = devPerfFetch ? performance.now() : 0;

    if (!background) {
      setError(null);
      if (!hasCachedData) setLoading(true);
      else setRefreshing(true);
    } else {
      setRefreshing(true);
    }

    try {
      const historyArg =
        customRange?.from && customRange?.to
          ? { from: customRange.from, to: customRange.to }
          : daysFilter;

      const tAcc0 = devPerfFetch ? performance.now() : 0;
      const accP = Api.getAuraPlatformAccount(activePlatformId).then((res) => {
        if (devPerfFetch) auraAnalysisDevPerfPipelineStageMs('fetch.account', performance.now() - tAcc0);
        return res;
      });
      const tHist0 = devPerfFetch ? performance.now() : 0;
      const histP = Api.getAuraPlatformHistory(activePlatformId, historyArg).then((res) => {
        if (devPerfFetch) auraAnalysisDevPerfPipelineStageMs('fetch.history', performance.now() - tHist0);
        return res;
      });

      const [accSettled, histSettled] = await Promise.allSettled([accP, histP]);
      if (devPerfFetch) auraAnalysisDevPerfPipelineStageMs('fetch.parallel', performance.now() - tParallel0);

      let gotAccount = false;
      let gotTrades = false;

      if (accSettled.status === 'fulfilled') {
        const accRes = accSettled.value;
        if (accRes?.data?.success || accRes?.data?.account) {
          const nextAcc = accRes.data.account || null;
          const afp = accountPayloadFingerprint(nextAcc);
          if (afp !== lastAccountFpRef.current) {
            setAccount(nextAcc);
            lastAccountFpRef.current = afp;
          }
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
          const tfp = tradesPayloadFingerprint(trades);
          if (tfp !== lastTradesFpRef.current) {
            setRawTrades(trades);
            lastTradesFpRef.current = tfp;
          }
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
      setLoading(false);
      setRefreshing(false);
    }
  }, [activePlatformId, daysFilter, customRange?.from, customRange?.to]);

  useEffect(() => {
    if (activePlatformId) fetchData(false);
  }, [activePlatformId, daysFilter, customRange?.from, customRange?.to]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activePlatformId) return undefined;
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => fetchData(true), REFRESH_INTERVAL_MS);
    return () => clearInterval(intervalRef.current);
  }, [activePlatformId, fetchData]);

  const trades = useMemo(() => {
    const devPerfMemo = isAuraAnalysisDevPerfEnabled() && auraAnalysisDevPerfIsPipelineActive();
    const t0 = devPerfMemo ? performance.now() : 0;
    let t = rawTrades;
    if (symbolFilter  !== 'ALL') t = t.filter(x => (x.pair || x.symbol) === symbolFilter);
    if (sessionFilter !== 'ALL') t = t.filter(x => x.session === sessionFilter);
    if (dirFilter     !== 'ALL') t = t.filter(x => (x.direction || '').toLowerCase() === dirFilter.toLowerCase());
    if (devPerfMemo) auraAnalysisDevPerfPipelineStageMs('normalize.trades', performance.now() - t0);
    return t;
  }, [rawTrades, symbolFilter, sessionFilter, dirFilter]);

  const symbolOptions = useMemo(() => {
    const s = new Set(rawTrades.map(t => t.pair || t.symbol).filter(Boolean));
    return ['ALL', ...Array.from(s).sort()];
  }, [rawTrades]);

  const analyticsDataKey = useMemo(
    () => auraAnalysisClosedDataKey(trades, account),
    [trades, account]
  );
  const [analytics, setAnalytics] = useState(() => emptyAnalytics(null));
  const [analyticsFlushTick, setAnalyticsFlushTick] = useState(0);

  useLayoutEffect(() => {
    let cancelled = false;
    if (isAuraAnalysisDevPerfEnabled()) {
      auraAnalysisDevPerfEnsurePipeline({ trigger: 'analyticsKey' });
    }
    computeAnalytics(trades, account).then((a) => {
      if (!cancelled) {
        setAnalytics(a);
        if (isAuraAnalysisDevPerfEnabled()) {
          setAnalyticsFlushTick((n) => n + 1);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [analyticsDataKey]);

  const lastUpdatedStr = useMemo(() => {
    if (!lastUpdated) return null;
    const diff = Math.floor((Date.now() - lastUpdated.getTime()) / 60000);
    if (diff < 1) return 'Just now';
    if (diff === 1) return '1 min ago';
    return `${diff} min ago`;
  }, [lastUpdated]);

  const dataValue = useMemo(
    () => ({
      activePlatformId,
      setActivePlatformId,
      connections,
      account,
      rawTrades,
      trades,
      daysFilter,
      setDaysFilter,
      customRange,
      setCustomRange,
      symbolFilter,
      setSymbolFilter,
      sessionFilter,
      setSessionFilter,
      dirFilter,
      setDirFilter,
      symbolOptions,
      dateRangeOptions: DATE_RANGE_OPTIONS,
      loading,
      error,
      refreshing,
      lastUpdated,
      lastUpdatedStr,
      historyStale,
      historyDataSource,
      accountStale,
      accountDataSource,
      refresh: fetchData,
    }),
    [
      activePlatformId,
      connections,
      account,
      rawTrades,
      trades,
      daysFilter,
      customRange,
      symbolFilter,
      sessionFilter,
      dirFilter,
      symbolOptions,
      loading,
      error,
      refreshing,
      lastUpdated,
      lastUpdatedStr,
      historyStale,
      historyDataSource,
      accountStale,
      accountDataSource,
      fetchData,
    ]
  );

  const analyticsValue = useMemo(
    () => ({
      analytics,
      analyticsDataKey,
      analyticsFlushTick,
    }),
    [analytics, analyticsDataKey, analyticsFlushTick]
  );

  const mergedLegacyValue = useMemo(() => ({ ...dataValue, ...analyticsValue }), [dataValue, analyticsValue]);

  return (
    <AuraAnalysisDataContext.Provider value={dataValue}>
      <AuraAnalysisAnalyticsContext.Provider value={analyticsValue}>
        <AuraAnalysisContext.Provider value={mergedLegacyValue}>
          {children}
          <AuraAnalysisPerfFlushBridge />
        </AuraAnalysisContext.Provider>
      </AuraAnalysisAnalyticsContext.Provider>
    </AuraAnalysisDataContext.Provider>
  );
}

/** Subscribe to filters, trades, account, loading — not analytics (avoids rerenders on heavy compute). */
export function useAuraAnalysisData() {
  const ctx = useContext(AuraAnalysisDataContext);
  if (!ctx) throw new Error('useAuraAnalysisData must be used inside AuraAnalysisProvider');
  return ctx;
}

/** Subscribe to analytics payload only. */
export function useAuraAnalysisMetrics() {
  const ctx = useContext(AuraAnalysisAnalyticsContext);
  if (!ctx) throw new Error('useAuraAnalysisMetrics must be used inside AuraAnalysisProvider');
  return ctx;
}

/** Full context (merged). Prefer useAuraAnalysisData / useAuraAnalysisMetrics when splitting helps. */
export function useAuraAnalysis() {
  const ctx = useContext(AuraAnalysisContext);
  if (!ctx) throw new Error('useAuraAnalysis must be used inside AuraAnalysisProvider');
  return ctx;
}
