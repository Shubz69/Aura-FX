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
import { useAuth } from './AuthContext';
import { mergeTradeMetadataRow, upsertTradeMetadata } from '../lib/aura-analysis/tradeMetadataStorage';
import { readFilterPresets, writeFilterPresets } from '../lib/aura-analysis/filterPresetsStorage';
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
const LAST_GOOD_STATE_VERSION = 1;
const LAST_GOOD_ENGINE_VERSION = 'computeAnalytics-v2-propRiskPack';
const LAST_GOOD_KEY_PREFIX = 'aura_analysis_last_good_dashboard_state_v1';

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

function pickDefaultPlatformId(connections = []) {
  const mt5 = connections.find(c => c.platformId === 'mt5' || c.platformId === 'mt4');
  return mt5?.platformId || connections[0]?.platformId || null;
}

function lastGoodStorageKey(platformId) {
  return `${LAST_GOOD_KEY_PREFIX}:${String(platformId || '')}`;
}

function readLastGoodDashboardState(platformId) {
  if (!platformId || typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(lastGoodStorageKey(platformId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== LAST_GOOD_STATE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLastGoodDashboardState(platformId, nextState) {
  if (!platformId || typeof window === 'undefined' || !window.localStorage || !nextState) return;
  try {
    window.localStorage.setItem(lastGoodStorageKey(platformId), JSON.stringify(nextState));
  } catch {
    /* ignore storage quota / private mode */
  }
}

function auraPerfLog(event, fields = {}) {
  if (!isAuraAnalysisDevPerfEnabled()) return;
  try {
    // eslint-disable-next-line no-console
    console.info(`[aura-analysis-perf] ${event}`, fields);
  } catch {
    /* noop */
  }
}

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
  const { user } = useAuth();
  const userId = user?.id != null ? user.id : null;
  const { connections } = useAuraConnection();
  const initialPlatformId = pickDefaultPlatformId(connections);
  const initialLastGood = readLastGoodDashboardState(initialPlatformId);

  const defaultPlatformId = useRef(null);
  const [activePlatformId, setActivePlatformId] = useState(() => {
    return initialPlatformId;
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

  const [account,   setAccount]   = useState(initialLastGood?.account || null);
  const [rawTrades, setRawTrades] = useState(
    Array.isArray(initialLastGood?.rawTrades) ? initialLastGood.rawTrades : []
  );

  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [lastUpdated, setLastUpdated] = useState(
    initialLastGood?.updatedAt ? new Date(initialLastGood.updatedAt) : null
  );
  const [refreshing,  setRefreshing]  = useState(false);
  const [historyStale, setHistoryStale] = useState(!!initialLastGood);
  const [historyDataSource, setHistoryDataSource] = useState(initialLastGood ? 'last_good' : null);
  const [accountStale, setAccountStale] = useState(!!initialLastGood);
  const [accountDataSource, setAccountDataSource] = useState(initialLastGood ? 'last_good' : null);
  const [tradeMetaTick, setTradeMetaTick] = useState(0);
  const [filterPresetTick, setFilterPresetTick] = useState(0);

  const isFetching = useRef(false);
  const intervalRef = useRef(null);
  const rawTradesRef = useRef([]);
  const accountRef = useRef(null);
  const lastTradesFpRef = useRef('');
  const lastAccountFpRef = useRef('');
  /** Server computeAnalytics payload + fingerprint (stale-while-revalidate fast path). */
  const pendingServerPrecomputedRef = useRef(
    initialLastGood?.analytics && initialLastGood?.analyticsFingerprint
      ? { fingerprint: String(initialLastGood.analyticsFingerprint), payload: initialLastGood.analytics }
      : null
  );
  const instantRenderLoggedRef = useRef(false);

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
    pendingServerPrecomputedRef.current = null;
  }, [activePlatformId]);

  useEffect(() => {
    if (!activePlatformId) return;
    const cached = readLastGoodDashboardState(activePlatformId);
    if (cached) {
      const nextTrades = Array.isArray(cached.rawTrades) ? cached.rawTrades : [];
      const nextAccount = cached.account || null;
      rawTradesRef.current = nextTrades;
      accountRef.current = nextAccount;
      lastTradesFpRef.current = tradesPayloadFingerprint(nextTrades);
      lastAccountFpRef.current = accountPayloadFingerprint(nextAccount);
      setRawTrades(nextTrades);
      setAccount(nextAccount);
      setAnalytics(cached.analytics || emptyAnalytics(nextAccount));
      setLastUpdated(cached.updatedAt ? new Date(cached.updatedAt) : new Date());
      setHistoryStale(true);
      setAccountStale(true);
      setHistoryDataSource('last_good');
      setAccountDataSource('last_good');
      setLoading(false);
      setError(null);
      if (cached.analytics && cached.analyticsFingerprint) {
        pendingServerPrecomputedRef.current = {
          fingerprint: String(cached.analyticsFingerprint),
          payload: cached.analytics,
        };
      }
      if (!instantRenderLoggedRef.current) {
        auraPerfLog('instant_render', {
          platformId: activePlatformId,
          hasAccount: !!nextAccount,
          tradeCount: nextTrades.length,
          updatedAt: cached.updatedAt || null,
        });
        instantRenderLoggedRef.current = true;
      }
      return;
    }
    setRawTrades([]);
    setAccount(null);
    setAnalytics(emptyAnalytics(null));
    rawTradesRef.current = [];
    accountRef.current = null;
    setLastUpdated(null);
    setHistoryStale(false);
    setAccountStale(false);
    setHistoryDataSource(null);
    setAccountDataSource(null);
    setError(null);
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
      if (hasCachedData) {
        auraPerfLog('background_refresh_start', {
          platformId: activePlatformId,
          via: 'cached_bootstrap',
        });
      }
    } else {
      setRefreshing(true);
      auraPerfLog('background_refresh_start', {
        platformId: activePlatformId,
        via: 'interval_or_revalidate',
      });
    }

    let gotAccount = false;
    let gotTrades = false;
    let usedLiveFallback = false;
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
          if (accRes.data.dataSource === 'live') usedLiveFallback = true;
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
          if (payload?.dataSource === 'live') usedLiveFallback = true;
          if (payload?.precomputedAnalytics && payload?.analyticsInputFingerprint) {
            pendingServerPrecomputedRef.current = {
              fingerprint: String(payload.analyticsInputFingerprint),
              payload: payload.precomputedAnalytics,
            };
          } else {
            pendingServerPrecomputedRef.current = null;
          }
        } else {
          pendingServerPrecomputedRef.current = null;
        }
      } else {
        pendingServerPrecomputedRef.current = null;
      }

      setLastUpdated(new Date());

      const accRevalidate = accSettled.status === 'fulfilled' && accSettled.value?.data?.revalidating;
      const histRevalidate = histSettled.status === 'fulfilled' && histSettled.value?.data?.revalidating;
      if (!background && (accRevalidate || histRevalidate)) {
        window.setTimeout(() => {
          fetchData(true);
        }, 4000);
        window.setTimeout(() => {
          fetchData(true);
        }, 12000);
      }

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
      if (usedLiveFallback) {
        auraPerfLog('live_fallback_used', { platformId: activePlatformId });
      }
      auraPerfLog('background_refresh_complete', {
        platformId: activePlatformId,
        gotAccount,
        gotTrades,
      });
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
    let t = rawTrades.map((row) => mergeTradeMetadataRow(userId, activePlatformId, row));
    if (symbolFilter  !== 'ALL') t = t.filter(x => (x.pair || x.symbol) === symbolFilter);
    if (sessionFilter !== 'ALL') t = t.filter(x => x.session === sessionFilter);
    if (dirFilter     !== 'ALL') t = t.filter(x => (x.direction || '').toLowerCase() === dirFilter.toLowerCase());
    if (devPerfMemo) auraAnalysisDevPerfPipelineStageMs('normalize.trades', performance.now() - t0);
    return t;
  }, [rawTrades, symbolFilter, sessionFilter, dirFilter, userId, activePlatformId, tradeMetaTick]);

  const symbolOptions = useMemo(() => {
    const s = new Set(rawTrades.map(t => t.pair || t.symbol).filter(Boolean));
    return ['ALL', ...Array.from(s).sort()];
  }, [rawTrades]);

  const analyticsDataKey = useMemo(
    () => auraAnalysisClosedDataKey(trades, account),
    [trades, account]
  );
  /** Same trade window as API + server preset cache (unfiltered rawTrades). */
  const analyticsDataKeyRaw = useMemo(
    () => auraAnalysisClosedDataKey(rawTrades, account),
    [rawTrades, account]
  );
  const filtersAtDefault =
    symbolFilter === 'ALL' && sessionFilter === 'ALL' && dirFilter === 'ALL';

  const filterPresets = useMemo(() => readFilterPresets(userId), [userId, filterPresetTick]);

  const patchTradeMetadata = useCallback((tradeId, patch) => {
    upsertTradeMetadata(userId, activePlatformId, tradeId, patch);
    setTradeMetaTick((n) => n + 1);
  }, [userId, activePlatformId]);

  const saveCurrentFilterPreset = useCallback((name) => {
    const label = String(name || '').trim();
    if (!label) return;
    const existing = readFilterPresets(userId).filter((p) => p.name !== label);
    existing.push({
      name: label,
      symbolFilter,
      sessionFilter,
      dirFilter,
      daysFilter,
      customRange: customRange ? { from: customRange.from, to: customRange.to } : null,
    });
    writeFilterPresets(userId, existing);
    setFilterPresetTick((n) => n + 1);
  }, [userId, symbolFilter, sessionFilter, dirFilter, daysFilter, customRange]);

  const applyFilterPreset = useCallback((preset) => {
    if (!preset || typeof preset !== 'object') return;
    setSymbolFilter(preset.symbolFilter || 'ALL');
    setSessionFilter(preset.sessionFilter || 'ALL');
    setDirFilter(preset.dirFilter || 'ALL');
    if (preset.customRange?.from && preset.customRange?.to) {
      setCustomRange({ from: preset.customRange.from, to: preset.customRange.to });
    } else if (preset.daysFilter != null && !Number.isNaN(Number(preset.daysFilter))) {
      setCustomRange(null);
      setDaysFilter(Number(preset.daysFilter));
    }
  }, []);

  const removeFilterPreset = useCallback((name) => {
    const next = readFilterPresets(userId).filter((p) => p.name !== name);
    writeFilterPresets(userId, next);
    setFilterPresetTick((n) => n + 1);
  }, [userId]);

  const [analytics, setAnalytics] = useState(() => initialLastGood?.analytics || emptyAnalytics(initialLastGood?.account || null));
  const [analyticsFlushTick, setAnalyticsFlushTick] = useState(0);

  useLayoutEffect(() => {
    let cancelled = false;
    if (isAuraAnalysisDevPerfEnabled()) {
      auraAnalysisDevPerfEnsurePipeline({ trigger: 'analyticsKey' });
    }
    const pending = pendingServerPrecomputedRef.current;

    if (!filtersAtDefault) {
      if (pending) pendingServerPrecomputedRef.current = null;
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
    }

    if (
      pending
      && pending.fingerprint === analyticsDataKeyRaw
      && pending.payload
      && typeof pending.payload === 'object'
    ) {
      pendingServerPrecomputedRef.current = null;
      setAnalytics(pending.payload);
      if (isAuraAnalysisDevPerfEnabled()) {
        setAnalyticsFlushTick((n) => n + 1);
      }
      return () => {
        cancelled = true;
      };
    }
    if (pending && pending.fingerprint !== analyticsDataKeyRaw) {
      pendingServerPrecomputedRef.current = null;
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
  }, [analyticsDataKeyRaw, filtersAtDefault, trades, account, symbolFilter, sessionFilter, dirFilter]);

  useEffect(() => {
    if (!activePlatformId || !filtersAtDefault) return;
    const existing = readLastGoodDashboardState(activePlatformId) || {};
    const nextAccount = account || existing.account || null;
    const nextTrades = rawTrades.length ? rawTrades : (Array.isArray(existing.rawTrades) ? existing.rawTrades : []);
    const nextAnalytics = analytics || existing.analytics || null;
    if (!nextAccount && nextTrades.length === 0) return;
    const nextFingerprint = auraAnalysisClosedDataKey(nextTrades, nextAccount);
    const safeNext = {
      v: LAST_GOOD_STATE_VERSION,
      platformId: activePlatformId,
      account: nextAccount,
      rawTrades: nextTrades,
      analytics: nextAnalytics,
      analyticsFingerprint: nextFingerprint,
      analyticsEngineVersion: LAST_GOOD_ENGINE_VERSION,
      updatedAt: new Date().toISOString(),
      accountUpdatedAt: nextAccount ? new Date().toISOString() : existing.accountUpdatedAt || null,
      historyUpdatedAt: nextTrades.length ? new Date().toISOString() : existing.historyUpdatedAt || null,
    };
    writeLastGoodDashboardState(activePlatformId, safeNext);
  }, [activePlatformId, filtersAtDefault, account, rawTrades, analytics]);

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
      filterPresets,
      saveCurrentFilterPreset,
      applyFilterPreset,
      removeFilterPreset,
      patchTradeMetadata,
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
      filterPresets,
      saveCurrentFilterPreset,
      applyFilterPreset,
      removeFilterPreset,
      patchTradeMetadata,
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
