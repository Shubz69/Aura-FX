/**
 * Client-side UDF (Universal Datafeed) adapter for TradingView Charting Library.
 * Replaces the missing self-hosted `public/datafeeds/udf/dist/bundle.js` so charts
 * load without requesting a non-existent static URL (which returns HTML and breaks MIME checks).
 *
 * Implements the HTTP behaviour described at:
 * https://www.tradingview.com/charting-library-docs/latest/connecting_data/UDF/
 */

'use strict';

function trimSlash(url) {
  return String(url || '').replace(/\/+$/, '');
}

async function udfGetJson(base, pathAndQuery) {
  const url = `${base}${pathAndQuery.startsWith('/') ? '' : '/'}${pathAndQuery}`;
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) {
    const err = new Error(`udf_http_${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function udfGetText(base, pathAndQuery) {
  const url = `${base}${pathAndQuery.startsWith('/') ? '' : '/'}${pathAndQuery}`;
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) {
    const err = new Error(`udf_http_${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.text();
}

function tableResponseToRows(table) {
  if (!table || typeof table !== 'object') return [];
  const keys = Object.keys(table).filter((k) => k !== 's' && k !== 'errmsg');
  if (!keys.length) return [];
  const lens = keys.map((k) => {
    const v = table[k];
    return Array.isArray(v) ? v.length : 1;
  });
  const n = Math.max(...lens, 0);
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    const row = {};
    for (const k of keys) {
      const v = table[k];
      row[k] = Array.isArray(v) ? v[i] : v;
    }
    rows.push(row);
  }
  return rows;
}

function normalizeSymbolInfoTableRow(row) {
  if (!row || typeof row !== 'object') return row;
  return {
    ...row,
    name: row.name ?? row.symbol,
    ticker: row.ticker ?? row.symbol ?? row.name,
    description: row.description,
    type: row.type,
    timezone: row.timezone,
    session: row.session ?? row['session-regular'] ?? row['session_regular'],
    'exchange-listed': row['exchange-listed'] ?? row.exchange_listed_name,
    'exchange-traded': row['exchange-traded'] ?? row.exchange_traded_name,
    minmov: row.minmov ?? row.minmovement,
    pricescale: row.pricescale,
    has_intraday: row.has_intraday ?? row['has-intraday'],
    has_weekly_and_monthly: row.has_weekly_and_monthly ?? row['has-weekly-and-monthly'],
    supported_resolutions: row.supported_resolutions ?? row['supported-resolutions'],
    visible_plots_set: row.visible_plots_set ?? row['visible-plots-set'],
    volume_precision: row.volume_precision ?? row['volume_precision'],
  };
}

function mapUdfSymbolToLibraryInfo(data, configuration) {
  const exListed =
    data['exchange-listed'] ??
    data.exchange_listed ??
    data.exchange_listed_name ??
    data.exchange;
  const exTraded = data['exchange-traded'] ?? data.exchange_traded ?? exListed;
  const name = data.name ?? data.symbol;
  const ticker = data.ticker ?? name;
  const supported =
    data.supported_resolutions ||
    (configuration && configuration.supported_resolutions) ||
    ['1', '5', '15', '30', '60', 'D', 'W', 'M'];

  return {
    name: String(name),
    ticker: String(ticker),
    description: String(data.description || name || ''),
    type: String(data.type || 'stock'),
    session: String(data.session || data['session-regular'] || data['session_regular'] || '24x7'),
    timezone: String(data.timezone || 'Etc/UTC'),
    exchange: String(exListed || exTraded || ''),
    listed_exchange: String(exListed || ''),
    minmov: Number(data.minmov ?? data.minmovement ?? 1),
    pricescale: Number(data.pricescale ?? 100),
    has_intraday: !!data.has_intraday || !!data['has-intraday'],
    has_daily: data.has_daily !== false,
    has_weekly_and_monthly: !!(data.has_weekly_and_monthly || data['has-weekly-and-monthly']),
    visible_plots_set: String(data.visible_plots_set || data['visible-plots-set'] || 'ohlcv'),
    supported_resolutions: supported,
    volume_precision: Number(data.volume_precision ?? data['volume_precision'] ?? 0),
    data_status: data.data_status || 'endofday',
    logo_urls: data.logo_urls,
    exchange_logo: data.exchange_logo,
  };
}

function trimHistoryBars(bars, limited) {
  if (!limited || !limited.maxResponseLength || bars.length <= limited.maxResponseLength) {
    return bars;
  }
  const max = limited.maxResponseLength;
  const order = limited.expectedOrder === 'earliestFirst' ? 'earliestFirst' : 'latestFirst';
  if (order === 'latestFirst') return bars.slice(-max);
  return bars.slice(0, max);
}

function historyJsonToBars(data, limited) {
  if (!data || data.s === 'error') {
    const err = new Error(data && data.errmsg ? String(data.errmsg) : 'history_error');
    err.udf = data;
    throw err;
  }
  if (data.s === 'no_data') {
    const meta = {};
    if (data.nextTime != null) meta.nextTime = Number(data.nextTime);
    return { bars: [], meta: { noData: true, ...meta } };
  }
  const t = data.t;
  if (!Array.isArray(t) || !t.length) {
    return { bars: [], meta: { noData: true } };
  }
  const o = data.o;
  const h = data.h;
  const l = data.l;
  const c = data.c;
  const v = data.v;
  const bars = [];
  for (let i = 0; i < t.length; i += 1) {
    const ts = Number(t[i]);
    if (!Number.isFinite(ts)) continue;
    bars.push({
      time: ts * 1000,
      open: o != null ? Number(o[i]) : Number(c[i]),
      high: h != null ? Number(h[i]) : Number(c[i]),
      low: l != null ? Number(l[i]) : Number(c[i]),
      close: Number(c[i]),
      volume: v != null ? Number(v[i]) : undefined,
    });
  }
  bars.sort((a, b) => a.time - b.time);
  const trimmed = trimHistoryBars(bars, limited);
  return { bars: trimmed, meta: {} };
}

/**
 * @param {string} datafeedURL
 * @param {number} [updateFrequency]
 * @param {{ maxResponseLength?: number, expectedOrder?: 'latestFirst'|'earliestFirst' }} [limitedServerResponse]
 */
function UDFCompatibleDatafeed(datafeedURL, updateFrequency, limitedServerResponse) {
  const self = this;
  this._base = trimSlash(datafeedURL);
  this._updateFrequency = Math.max(1000, Number(updateFrequency) || 10000);
  this._limited = limitedServerResponse && typeof limitedServerResponse === 'object' ? limitedServerResponse : null;
  this._configuration = {
    supported_resolutions: ['1', '5', '15', '30', '60', 'D', 'W', 'M'],
    supports_group_request: false,
    supports_search: true,
    supports_marks: false,
    supports_timescale_marks: false,
  };
  this._subscribers = Object.create(null);
  this._pollTimers = Object.create(null);
  this._symbolGroupCache = Object.create(null);

  this.onReady = function (callback) {
    udfGetJson(self._base, '/config')
      .then((cfg) => {
        self._configuration = { ...self._configuration, ...cfg };
        callback(self._configuration);
      })
      .catch(() => {
        callback(self._configuration);
      });
  };

  this.searchSymbols = function (userInput, exchange, symbolType, onResult) {
    if (!self._configuration.supports_search) {
      onResult([]);
      return;
    }
    const q = new URLSearchParams({
      query: String(userInput || ''),
      limit: '30',
    });
    if (exchange) q.set('exchange', String(exchange));
    if (symbolType) q.set('type', String(symbolType));
    udfGetJson(self._base, `/search?${q.toString()}`)
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        onResult(list);
      })
      .catch(() => onResult([]));
  };

  this.resolveSymbol = function (symbolName, onResolve, onError) {
    const name = String(symbolName || '').trim();
    if (!name) {
      onError('unknown_symbol');
      return;
    }

    if (self._configuration.supports_group_request && !self._configuration.supports_search) {
      const groupings = self._configuration.symbols_groupings;
      const fromEx =
        Array.isArray(self._configuration.exchanges) &&
        self._configuration.exchanges.map((e) => e && e.value).find((v) => v && String(v).length > 0);
      const group =
        (Array.isArray(groupings) && groupings[0] && String(groupings[0])) ||
        (fromEx ? String(fromEx) : 'NYSE');
      const cacheKey = group;
      const finish = () => {
        const rows = self._symbolGroupCache[cacheKey];
        if (!rows || !rows.length) {
          onError('unknown_symbol');
          return;
        }
        const hit = rows.find(
          (r) =>
            String(r.name || '').toUpperCase() === name.toUpperCase() ||
            String(r.ticker || '').toUpperCase() === name.toUpperCase()
        );
        if (!hit) {
          onError('unknown_symbol');
          return;
        }
        onResolve(hit);
      };

      if (self._symbolGroupCache[cacheKey]) {
        finish();
        return;
      }

      udfGetJson(self._base, `/symbol_info?group=${encodeURIComponent(cacheKey)}`)
        .then((table) => {
          const rows = tableResponseToRows(table).map((row) =>
            mapUdfSymbolToLibraryInfo(normalizeSymbolInfoTableRow(row), self._configuration)
          );
          self._symbolGroupCache[cacheKey] = rows;
          finish();
        })
        .catch(() => onError('unknown_symbol'));
      return;
    }

    udfGetJson(self._base, `/symbols?symbol=${encodeURIComponent(name)}`)
      .then((data) => onResolve(mapUdfSymbolToLibraryInfo(data, self._configuration)))
      .catch((e) => {
        if (e && e.status === 404) onError('unknown_symbol');
        else onError(String((e && e.message) || 'resolve_failed'));
      });
  };

  this.getBars = function (symbolInfo, resolution, periodParams, onHistory, onError) {
    const ticker = symbolInfo.ticker || symbolInfo.name;
    const q = new URLSearchParams({
      symbol: String(ticker),
      resolution: String(resolution),
      from: String(Math.floor(periodParams.from)),
      to: String(Math.floor(periodParams.to)),
    });
    if (periodParams.countBack != null) {
      q.set('countback', String(Math.floor(periodParams.countBack)));
    }
    udfGetJson(self._base, `/history?${q.toString()}`)
      .then((data) => {
        try {
          const { bars, meta } = historyJsonToBars(data, self._limited);
          onHistory(bars, meta);
        } catch (e) {
          onError(String(e.message || e));
        }
      })
      .catch((e) => onError(String((e && e.message) || 'history_fetch_failed')));
  };

  this.subscribeBars = function (symbolInfo, resolution, onRealtime, subscriberUID) {
    const ticker = symbolInfo.ticker || symbolInfo.name;
    const uid = String(subscriberUID);

    const tick = () => {
      const sub = self._subscribers[uid];
      if (!sub) return;
      const now = Math.floor(Date.now() / 1000);
      const from = now - 7 * 86400;
      const q = new URLSearchParams({
        symbol: String(ticker),
        resolution: String(resolution),
        from: String(from),
        to: String(now),
        countback: '5',
      });
      udfGetJson(self._base, `/history?${q.toString()}`)
        .then((data) => {
          try {
            const { bars } = historyJsonToBars(data, self._limited);
            if (!bars.length) return;
            const last = bars[bars.length - 1];
            if (sub.lastBarTime == null || last.time > sub.lastBarTime) {
              sub.lastBarTime = last.time;
              onRealtime(last);
            }
          } catch (_) {
            /* ignore poll errors */
          }
        })
        .catch(() => {});
    };

    self._subscribers[uid] = { lastBarTime: null };
    self._pollTimers[uid] = window.setInterval(tick, self._updateFrequency);
    tick();
  };

  this.unsubscribeBars = function (subscriberUID) {
    const uid = String(subscriberUID);
    if (self._pollTimers[uid]) {
      window.clearInterval(self._pollTimers[uid]);
      delete self._pollTimers[uid];
    }
    delete self._subscribers[uid];
  };

  this.getServerTime = function (callback) {
    if (!self._configuration.supports_time) return;
    udfGetText(self._base, '/time')
      .then((text) => {
        const n = parseInt(String(text).trim(), 10);
        callback(Number.isFinite(n) ? n : Math.floor(Date.now() / 1000));
      })
      .catch(() => callback(Math.floor(Date.now() / 1000)));
  };
}

export function installUdfDatafeedGlobal() {
  if (typeof window === 'undefined') return;
  if (window.Datafeeds && typeof window.Datafeeds.UDFCompatibleDatafeed === 'function') return;
  window.Datafeeds = window.Datafeeds || {};
  window.Datafeeds.UDFCompatibleDatafeed = UDFCompatibleDatafeed;
}

export { UDFCompatibleDatafeed };
