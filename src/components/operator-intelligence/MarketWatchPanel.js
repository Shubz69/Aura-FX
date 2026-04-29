import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaChartBar, FaPlus, FaTimes } from 'react-icons/fa';
import {
  TERMINAL_INSTRUMENTS,
  TERMINAL_INSTRUMENT_CATEGORIES,
  getInstrumentById,
  getInstrumentByChartSymbol,
  chartSymbolFromId,
  normalizeSymbol,
  terminalInstrumentLabel,
} from '../../data/terminalInstruments';
import { hashSeed } from '../../data/operatorIntelligence/chartBars.mock';

const STORAGE_KEY = 'oi_market_watch_v2';

function mulberry32(a) {
  return function mul() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic mock bid/ask/spread per instrument (terminal-style). */
function mockRowForValue(value) {
  const label = terminalInstrumentLabel(value);
  const rng = mulberry32(hashSeed(`${value}|mwatch`));
  const isJpy = label.includes('JPY') && label.length >= 6;
  const isXau = label.includes('XAU');
  const isIdx = /US500|NAS100|US30|SPY|QQQ|IWM|DIA|GLD|TLT|VIX|DXY/i.test(label);
  const isCrypto = /BTC|ETH|SOL|XRP|ADA/i.test(label);

  let mid = 1.0842 + (rng() - 0.5) * 0.012;
  if (isJpy) mid = 151.2 + (rng() - 0.5) * 1.2;
  if (isXau) mid = 2327 + (rng() - 0.5) * 8;
  if (isIdx) mid = 5200 + (rng() - 0.5) * 40;
  if (isCrypto && label.startsWith('BTC')) mid = 64000 + (rng() - 0.5) * 800;
  else if (isCrypto) mid = 2000 + (rng() - 0.5) * 200;

  const spreadPips = 0.8 + rng() * 1.8;
  const spreadAbs = isJpy ? spreadPips * 0.01 : isXau ? 0.4 + rng() * 0.35 : isIdx ? 0.25 + rng() * 0.4 : spreadPips * 0.0001;
  const bid = mid - spreadAbs / 2;
  const ask = mid + spreadAbs / 2;

  const fmt = (n) => {
    if (!Number.isFinite(n)) return '—';
    if (isJpy) return n.toFixed(3);
    if (isXau) return n.toFixed(1);
    if (isIdx || isCrypto) return n.toFixed(n > 200 ? 2 : 4);
    return n.toFixed(5);
  };

  const notes = ['Inside VA', 'Offered', 'Bid-led', 'Balanced', 'Vol pick-up'];
  const note = notes[Math.floor(rng() * notes.length)];

  return {
    value,
    label,
    bid: fmt(bid),
    ask: fmt(ask),
    spread: isJpy ? `${spreadPips.toFixed(1)} pip` : isXau ? `${fmt(spreadAbs)}` : `${(spreadPips * 0.1).toFixed(1)} pip`,
    note,
  };
}

function readStoredList() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    return arr
      .filter((v) => typeof v === 'string')
      .map((v) => normalizeSymbol(v))
      .filter((id) => Boolean(getInstrumentById(id)));
  } catch {
    return null;
  }
}

function writeStoredList(values) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    /* ignore */
  }
}

function seedFromBundleRows(rows) {
  if (!rows?.length) return null;
  const out = [];
  const seen = new Set();
  for (const r of rows) {
    const inst = getInstrumentByChartSymbol(String(r.symbol || ''));
    const id = inst?.id || normalizeSymbol(r.symbol);
    if (!id || !getInstrumentById(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.length ? out : null;
}

/**
 * Editable market watch — full instrument universe, persisted locally.
 * @param {{ seedRows?: Array<Record<string, unknown>> | null, loading?: boolean }} props
 */
export default function MarketWatchPanel({ seedRows, loading }) {
  const { t } = useTranslation();
  const [values, setValues] = useState(() => {
    const stored = readStoredList();
    if (stored?.length) return stored;
    const seeded = seedFromBundleRows(seedRows);
    if (seeded?.length) return seeded;
    return ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD'];
  });
  const [addValue, setAddValue] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const stored = readStoredList();
    if (stored?.length) return;
    const seeded = seedFromBundleRows(seedRows);
    if (seeded?.length) {
      setValues(seeded);
      writeStoredList(seeded);
    }
  }, [seedRows]);

  const persist = useCallback((next) => {
    setValues(next);
    writeStoredList(next);
  }, []);

  const rows = useMemo(
    () => values.map((id) => mockRowForValue(chartSymbolFromId(id))).map((r, idx) => ({ ...r, id: values[idx] })),
    [values],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return TERMINAL_INSTRUMENTS;
    const q = query.trim().toLowerCase();
    return TERMINAL_INSTRUMENTS.filter(
      (inst) => inst.id.toLowerCase().includes(q)
        || inst.label.toLowerCase().includes(q)
        || inst.category.toLowerCase().includes(q),
    );
  }, [query]);

  const grouped = useMemo(
    () => TERMINAL_INSTRUMENT_CATEGORIES.map((category) => ({
      category,
      rows: filtered.filter((x) => x.category === category),
    })).filter((g) => g.rows.length > 0),
    [filtered],
  );

  const addInstrument = () => {
    const v = addValue || '';
    if (!v || !getInstrumentById(v)) return;
    if (values.includes(v)) return;
    persist([...values, v]);
    setAddValue('');
  };

  const removeAt = (value) => {
    persist(values.filter((x) => x !== value));
  };

  const canAdd = addValue && Boolean(getInstrumentById(addValue)) && !values.includes(addValue);

  return (
    <div className="oi-card oi-card--mwatch">
      <div className="oi-card__head oi-card__head--mwatch">
        <FaChartBar className="oi-card__icon" aria-hidden />
        <span className="oi-card__title">{t('operatorIntelligence.marketWatch.title')}</span>
      </div>

      <div className="oi-mwatch-toolbar">
        <label className="oi-sr-only" htmlFor="oi-mwatch-add">
          Add instrument
        </label>
        <input
          className="oi-input oi-input--search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('operatorIntelligence.marketWatch.searchPlaceholder')}
          aria-label={t('operatorIntelligence.marketWatch.searchAria')}
        />
        <select
          id="oi-mwatch-add"
          data-testid="oi-mwatch-add-select"
          className="oi-select oi-select--compact"
          value={addValue}
          onChange={(e) => setAddValue(e.target.value)}
          disabled={loading}
        >
          <option value="">{t('operatorIntelligence.marketWatch.addInstrument')}</option>
          {grouped.map((group) => (
            <optgroup key={group.category} label={group.category}>
              {group.rows.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {`${inst.id} — ${inst.label} (${inst.category})`}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          type="button"
          className="oi-mwatch-add-btn"
          data-testid="oi-mwatch-add-btn"
          onClick={addInstrument}
          disabled={loading || !canAdd}
          title={addValue && values.includes(addValue) ? t('operatorIntelligence.marketWatch.alreadyIn') : undefined}
          aria-label={t('operatorIntelligence.marketWatch.addAria')}
        >
          <FaPlus aria-hidden />
        </button>
      </div>

      {loading ? <p className="oi-card__muted">{t('operatorIntelligence.marketWatch.loading')}</p> : null}
      {!loading && rows.length === 0 ? <p className="oi-card__muted">{t('operatorIntelligence.marketWatch.none')}</p> : null}

      {!loading && rows.length > 0 ? (
        <ul className="oi-mwatch" data-testid="oi-market-watch-list">
          {rows.map((r) => (
            <li key={r.id} className="oi-mwatch__row">
              <span className="oi-mwatch__sym">{r.label}</span>
              <span className="oi-mwatch__bx">
                <span className="oi-mwatch__side">{t('operatorIntelligence.marketWatch.bid')} {r.bid}</span>
                <span className="oi-mwatch__side">{t('operatorIntelligence.marketWatch.ask')} {r.ask}</span>
              </span>
              <span className="oi-mwatch__spr">{t('operatorIntelligence.marketWatch.spr')} {r.spread}</span>
              <span className="oi-mwatch__note">{r.note}</span>
              <button
                type="button"
                className="oi-mwatch__remove"
                aria-label={`Remove ${r.label} from market watch`}
                onClick={() => removeAt(r.id)}
              >
                <FaTimes aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
