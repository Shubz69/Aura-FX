import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import Api from '../../services/Api';
import { useTradeValidatorAccount } from '../../context/TradeValidatorAccountContext';
import useLivePrices from '../../hooks/useLivePrices';
import {
  getInstrumentsByCategory,
  getInstrumentForWatchlistSymbol,
  getPriceExamples,
} from '../../lib/aura-analysis/instruments';
import { calculateRisk, deriveStopLossFromRiskAndPositionSize } from '../../lib/aura-analysis/calculators/calculateRisk';
import { projectPnLAtLots } from '../../lib/aura-analysis/calculators/projectPnLAtLots';
import { forexPairNeedsUsdJpy } from '../../lib/aura-analysis/calculators/forexPipValueUsd';
import { buildFxRatesFromPriceMap } from '../../lib/aura-analysis/calculators/accountCurrency';
import { formatMoneyAccount, ACCOUNT_CURRENCY_OPTIONS } from '../../lib/aura-analysis/formatAccountCurrency';
import { getScoreLabel } from '../../lib/aura-analysis/validator/scoreCalculator';
import { VALIDATOR_CHECKLIST_PENDING_KEY } from '../../lib/aura-analysis/validator/validatorChecklistStorage';
import '../../styles/aura-analysis/TradeCalculator.css';

const FALLBACK_INSTRUMENTS_BY_CATEGORY = getInstrumentsByCategory();

const SESSIONS = [
  { value: '', label: 'Select session' },
  { value: 'Asia', label: 'Asia' },
  { value: 'London', label: 'London' },
  { value: 'New York', label: 'New York' },
  { value: 'Sydney', label: 'Sydney' },
];

const RISK_WARNING_PCT = 5;

export default function TradeCalculator() {
  const navigate = useNavigate();
  const { accounts, selectedAccountId, patchAccountCurrency } = useTradeValidatorAccount();
  const { prices } = useLivePrices({ beginnerMode: false });
  const [watchlistPayload, setWatchlistPayload] = useState(null);
  const [pairSearch, setPairSearch] = useState('');
  const [pendingChecklist, setPendingChecklist] = useState(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    pair: 'EURUSD',
    pairLabel: 'EUR/USD',
    direction: 'buy',
    accountBalance: 10000,
    riskPercent: 1,
    positionSize: '',
    entryPrice: 0,
    stopLoss: 0,
    takeProfit: 0,
    session: '',
    notes: '',
    usdJpy: '',
  });
  const [pairDropdownOpen, setPairDropdownOpen] = useState(false);
  const [sessionDropdownOpen, setSessionDropdownOpen] = useState(false);
  const pairDropdownRef = useRef(null);
  const sessionDropdownRef = useRef(null);
  const userChosenStopLossRef = useRef(null);
  const hadManualPositionSizeRef = useRef(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(VALIDATOR_CHECKLIST_PENDING_KEY);
      if (raw) setPendingChecklist(JSON.parse(raw));
    } catch {
      setPendingChecklist(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const base = Api.getBaseUrl() || '';
    fetch(`${base}/api/market/watchlist`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.success && data.watchlist) setWatchlistPayload(data.watchlist);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const instrumentGroups = useMemo(() => {
    const fallbackGroups = FALLBACK_INSTRUMENTS_BY_CATEGORY;
    const commodityFallbackInst = fallbackGroups.find((g) => g.category === 'commodity')?.instruments || [];

    if (!watchlistPayload?.groups) return fallbackGroups;

    const keys = Object.keys(watchlistPayload.groups).sort(
      (a, b) => (watchlistPayload.groups[a].order || 0) - (watchlistPayload.groups[b].order || 0)
    );
    return keys.map((key) => {
      const g = watchlistPayload.groups[key];
      let instruments = (g.symbols || []).map((row) => ({
        symbol: row.symbol,
        displayName: row.displayName || row.symbol,
      }));

      // Full commodity universe for sizing (not all are on the live quote snapshot).
      if (key === 'commodities' && commodityFallbackInst.length) {
        const seen = new Set(instruments.map((i) => String(i.symbol).toUpperCase()));
        for (const inst of commodityFallbackInst) {
          const sym = String(inst.symbol).toUpperCase();
          if (!seen.has(sym)) {
            seen.add(sym);
            instruments.push({
              symbol: inst.symbol,
              displayName: inst.displayName,
            });
          }
        }
        instruments.sort((a, b) => a.symbol.localeCompare(b.symbol));
      }

      return {
        label: g.name || key,
        categoryKey: key,
        instruments,
      };
    });
  }, [watchlistPayload]);

  const filteredInstrumentGroups = useMemo(() => {
    const q = pairSearch.trim().toLowerCase();
    if (!q) return instrumentGroups;
    return instrumentGroups
      .map((g) => ({
        ...g,
        instruments: g.instruments.filter(
          (i) =>
            i.symbol.toLowerCase().includes(q) || (i.displayName && i.displayName.toLowerCase().includes(q))
        ),
      }))
      .filter((g) => g.instruments.length > 0);
  }, [instrumentGroups, pairSearch]);

  /** When searching, show one flat scrollable list (plan: no category headers). */
  const filteredFlatSearchResults = useMemo(() => {
    const q = pairSearch.trim().toLowerCase();
    if (!q) return null;
    const out = [];
    for (const g of instrumentGroups) {
      for (const inst of g.instruments) {
        const match =
          inst.symbol.toLowerCase().includes(q) ||
          (inst.displayName && inst.displayName.toLowerCase().includes(q));
        if (match) out.push({ ...inst, categoryLabel: g.label });
      }
    }
    return out;
  }, [instrumentGroups, pairSearch]);

  const selectedAccount = useMemo(
    () => accounts.find((a) => Number(a.id) === Number(selectedAccountId)),
    [accounts, selectedAccountId]
  );
  const accountCurrency = selectedAccount?.accountCurrency || 'USD';

  const handleAccountCurrencyChange = useCallback(
    async (e) => {
      const ccy = e.target.value;
      if (!selectedAccountId) return;
      try {
        await patchAccountCurrency(selectedAccountId, ccy);
      } catch (err) {
        toast.error(err?.response?.data?.message || err.message || 'Could not update account currency');
      }
    },
    [selectedAccountId, patchAccountCurrency]
  );

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pairDropdownRef.current && !pairDropdownRef.current.contains(e.target)) {
        setPairDropdownOpen(false);
      }
      if (sessionDropdownRef.current && !sessionDropdownRef.current.contains(e.target)) {
        setSessionDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hasManualPositionSize = Boolean(String(form.positionSize).trim() && Number(form.positionSize) > 0);

  const needsUsdJpy = useMemo(() => forexPairNeedsUsdJpy(form.pair), [form.pair]);

  const usdJpyForCalc = useMemo(() => {
    if (!needsUsdJpy) return undefined;
    const manual = Number(form.usdJpy);
    if (Number.isFinite(manual) && manual > 0) return manual;
    const row = prices?.USDJPY;
    const fromSnap = row ? parseFloat(row.rawPrice ?? row.price ?? '') : NaN;
    if (Number.isFinite(fromSnap) && fromSnap > 0) return fromSnap;
    return undefined;
  }, [needsUsdJpy, form.usdJpy, prices]);

  const fxRates = useMemo(() => {
    const fromSnap = buildFxRatesFromPriceMap(prices || {});
    const jpy = usdJpyForCalc;
    if (usdJpyForCalc != null && Number.isFinite(jpy) && jpy > 0) {
      return { ...fromSnap, USDJPY: jpy };
    }
    return fromSnap;
  }, [prices, usdJpyForCalc]);

  // When position size is empty, remember current SL as the user's choice (so we can restore it when they clear manual size).
  useEffect(() => {
    if (!hasManualPositionSize) {
      const sl = Number(form.stopLoss);
      if (Number.isFinite(sl)) userChosenStopLossRef.current = form.stopLoss;
    }
  }, [hasManualPositionSize, form.stopLoss]);

  // When position size is manually set, derive SL so risk (balance × risk %) stays constant.
  useEffect(() => {
    if (!hasManualPositionSize) {
      if (hadManualPositionSizeRef.current) {
        hadManualPositionSizeRef.current = false;
        const restore = userChosenStopLossRef.current;
        if (restore != null && String(restore).trim() !== '') {
          setForm((f) => ({ ...f, stopLoss: String(restore) }));
        }
      }
      return;
    }
    hadManualPositionSizeRef.current = true;
    const manual = Number(form.positionSize);
    const entry = Number(form.entryPrice) || 0;
    const balance = Number(form.accountBalance) || 0;
    const riskPct = Number(form.riskPercent) || 0;
    if (manual <= 0 || entry <= 0 || balance <= 0 || riskPct <= 0) return;
    const derived = deriveStopLossFromRiskAndPositionSize(form.pair, {
      accountBalance: balance,
      riskPercent: riskPct,
      entry,
      direction: form.direction,
      positionSize: manual,
      usdJpy: usdJpyForCalc,
      accountCurrency,
      fxRates,
    });
    if (derived == null) return;
    const rounded = Math.round(derived * 100000) / 100000;
    const current = Number(form.stopLoss) || 0;
    if (Math.abs(current - rounded) > 1e-9) {
      setForm((f) => ({ ...f, stopLoss: String(rounded) }));
    }
  }, [
    hasManualPositionSize,
    form.positionSize,
    form.entryPrice,
    form.accountBalance,
    form.riskPercent,
    form.direction,
    form.pair,
    usdJpyForCalc,
    accountCurrency,
    fxRates,
  ]);

  const calcInput = useMemo(
    () => ({
      accountBalance: Number(form.accountBalance) || 0,
      riskPercent: Number(form.riskPercent) || 0,
      entry: Number(form.entryPrice) || 0,
      stop: Number(form.stopLoss) || 0,
      takeProfit: Number(form.takeProfit) || 0,
      direction: form.direction,
      usdJpy: usdJpyForCalc,
      accountCurrency,
      fxRates,
    }),
    [
      form.accountBalance,
      form.riskPercent,
      form.entryPrice,
      form.stopLoss,
      form.takeProfit,
      form.direction,
      usdJpyForCalc,
      accountCurrency,
      fxRates,
    ]
  );

  const result = useMemo(() => {
    return calculateRisk(form.pair, calcInput);
  }, [form.pair, calcInput]);

  const positionSizeUsed = useMemo(() => {
    const manual = Number(form.positionSize);
    if (manual > 0) return manual;
    return result.positionSize;
  }, [form.positionSize, result.positionSize]);

  /** P/L at displayed size when auto-size failed (blocked sanity, validation, missing pip USD, etc.). */
  const projectedPnL = useMemo(() => {
    const lots = positionSizeUsed;
    if (lots <= 0) return null;
    return projectPnLAtLots(form.pair, calcInput, lots);
  }, [form.pair, calcInput, positionSizeUsed]);

  /** Only substitute projected values when the engine did not produce a sized position — keeps legacy scaling for normal flows. */
  const useProjectedPnL = Boolean(
    projectedPnL &&
      (result.positionSize <= 0 || result.calculationBlocked === true)
  );

  const potentialProfitDisplay = useMemo(() => {
    if (useProjectedPnL) return projectedPnL.potentialProfit;
    if (result.positionSize <= 0) return 0;
    return result.potentialProfit * (positionSizeUsed / result.positionSize);
  }, [useProjectedPnL, projectedPnL, result.potentialProfit, result.positionSize, positionSizeUsed]);

  const potentialLossDisplay = useMemo(() => {
    if (useProjectedPnL) return projectedPnL.potentialLoss;
    if (result.positionSize <= 0) return positionSizeUsed > 0 ? 0 : result.riskAmount;
    return result.potentialLoss * (positionSizeUsed / result.positionSize);
  }, [useProjectedPnL, projectedPnL, result.potentialLoss, result.positionSize, positionSizeUsed, result.riskAmount]);

  const hasEntrySlTp =
    (Number(form.entryPrice) || 0) > 0 &&
    (Number(form.stopLoss) || 0) !== 0 &&
    (Number(form.takeProfit) || 0) > 0;

  const riskAmountFromBalance = useMemo(() => {
    const bal = Number(form.accountBalance) || 0;
    const pct = Number(form.riskPercent) || 0;
    if (bal <= 0 || pct <= 0) return 0;
    return (bal * pct) / 100;
  }, [form.accountBalance, form.riskPercent]);

  const riskRoundingNote = useMemo(() => {
    if (!hasEntrySlTp || positionSizeUsed <= 0 || potentialLossDisplay <= 0) return null;
    const target = riskAmountFromBalance;
    const diff = Math.abs(potentialLossDisplay - target);
    const tol = accountCurrency === 'JPY' ? 1 : 0.5;
    if (diff < tol) return null;
    return { target, actual: potentialLossDisplay, diff };
  }, [
    hasEntrySlTp,
    positionSizeUsed,
    riskAmountFromBalance,
    potentialLossDisplay,
    accountCurrency,
  ]);

  const riskPctNum = Number(form.riskPercent) || 0;
  const showHighRiskWarning = riskPctNum > RISK_WARNING_PCT;

  const selectedInstrumentMeta = useMemo(() => getInstrumentForWatchlistSymbol(form.pair), [form.pair]);

  const priceExamples = useMemo(() => {
    return getPriceExamples(selectedInstrumentMeta);
  }, [selectedInstrumentMeta]);

  const priceInputStep = useMemo(() => {
    const t = selectedInstrumentMeta?.tickSize;
    if (Number.isFinite(t) && t > 0) return t;
    return 0.00001;
  }, [selectedInstrumentMeta]);

  const handlePairSelect = (inst) => {
    setForm((f) => ({ ...f, pair: inst.symbol, pairLabel: inst.displayName }));
    setPairDropdownOpen(false);
  };

  const suggestFromRisk = () => {
    const size = result.positionSize;
    const label = result.positionUnitLabel;
    let str = size;
    if (label === 'lots' || label === 'units') str = size.toFixed(2);
    else if (label === 'contracts' || label === 'shares') str = Math.round(size);
    setForm((f) => ({ ...f, positionSize: String(str) }));
  };

  const altUnit = result.altUnitLabel || 'pips';
  const stopAlt = result.stopDistanceAlt ?? result.stopDistancePrice;
  const tpAlt = result.takeProfitDistanceAlt ?? result.takeProfitDistancePrice;

  const handleSaveToJournal = async () => {
    if (!pendingChecklist) {
      toast.error('Open the Checklist first, then tap Save trade or Use trade calculator to continue here.');
      return;
    }
    if (!hasEntrySlTp) {
      toast.error('Enter entry, stop loss, and take profit.');
      return;
    }
    const balance = Number(form.accountBalance) || 0;
    if (balance <= 0) {
      toast.error('Enter account balance.');
      return;
    }
    setSaving(true);
    const checklistScore = Number(pendingChecklist.checklistScore) || 0;
    const checklistTotal = Number(pendingChecklist.checklistTotal) || 100;
    const checklistPercent = Number(pendingChecklist.checklistPercent) || 0;
    const tradeGrade =
      pendingChecklist.tradeGrade || getScoreLabel(Math.round(checklistPercent * 2));
    const payload = {
      pair: form.pair,
      direction: form.direction,
      accountBalance: balance,
      riskPercent: Number(form.riskPercent) || 0,
      riskAmount: result.riskAmount,
      entryPrice: Number(form.entryPrice) || 0,
      stopLoss: Number(form.stopLoss) || 0,
      takeProfit: Number(form.takeProfit) || 0,
      stopLossPips: result.stopDistanceAlt ?? result.stopDistancePrice,
      takeProfitPips: result.takeProfitDistanceAlt ?? result.takeProfitDistancePrice,
      rr: Number(result.riskReward.toFixed(2)),
      positionSize: positionSizeUsed,
      potentialProfit:
        useProjectedPnL && projectedPnL
          ? projectedPnL.potentialProfit
          : result.positionSize > 0
            ? result.potentialProfit * (positionSizeUsed / result.positionSize)
            : 0,
      potentialLoss:
        useProjectedPnL && projectedPnL
          ? projectedPnL.potentialLoss
          : result.positionSize > 0
            ? result.potentialLoss * (positionSizeUsed / result.positionSize)
            : 0,
      result: 'open',
      pnl: 0,
      rMultiple: 0,
      checklistScore,
      checklistTotal,
      checklistPercent,
      tradeGrade,
      notes: (form.notes || '').trim() || null,
      session: form.session || null,
      assetClass: (() => {
        const inst = selectedInstrumentMeta;
        const m = inst.calculationMode;
        if (m === 'forex') return 'forex';
        if (m === 'commodity') return 'commodity';
        if (m === 'index_cfd') return 'indices';
        if (m === 'stock_share') return 'stock';
        if (m === 'future_contract') return 'future';
        if (m === 'crypto_units' || m === 'crypto_lot') return 'crypto';
        return inst.assetClass || 'forex';
      })(),
    };
    if (selectedAccountId != null && Number.isFinite(Number(selectedAccountId))) {
      payload.validatorAccountId = Number(selectedAccountId);
    }
    try {
      await Api.createAuraAnalysisTrade(payload);
      if (checklistPercent < 70) {
        toast.warning('Trade saved — checklist was below 70%.');
      } else {
        toast.success('Trade saved to journal.');
      }
      try {
        sessionStorage.removeItem(VALIDATOR_CHECKLIST_PENDING_KEY);
        localStorage.removeItem('aura-trade-validator-checked-by-tab');
      } catch {}
      setPendingChecklist(null);
      navigate('/trader-deck/trade-validator/journal');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to save trade');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="trade-calc-page">
      <h1 className="trade-calc-title">Trade Calculator</h1>

      <div className={`trade-calc-banner${pendingChecklist ? ' trade-calc-banner--linked' : ''}`}>
        {pendingChecklist ? (
          <p className="trade-calc-banner-text">
            <strong>Checklist linked:</strong> {pendingChecklist.checklistPercent}% ·{' '}
            {pendingChecklist.sessionType === 'scalp'
              ? 'Scalp'
              : pendingChecklist.sessionType === 'swing'
                ? 'Swing'
                : 'Intra Day'}{' '}
            · Enter trade details below, then <strong>Save trade to journal</strong>.
          </p>
        ) : (
          <>
            <p className="trade-calc-banner-text">
              Complete the checklist, then use <strong>Save trade</strong> or <strong>Use trade calculator</strong> to continue here.
            </p>
            <Link to="/trader-deck/trade-validator/checklist" className="trade-calc-banner-btn">
              Go to Checklist
            </Link>
          </>
        )}
      </div>

      <div className="trade-calc-columns">
        <section className="trade-calc-panel trade-calc-setup">
          <h2 className="trade-calc-panel-title">Trade setup</h2>

          <div className="trade-calc-field">
            <label>Pair / Asset</label>
            <div className="trade-calc-pair-row">
              <div className="trade-calc-pair-dropdown" ref={pairDropdownRef}>
                <button
                  type="button"
                  className="trade-calc-input trade-calc-pair-trigger"
                  onClick={() => setPairDropdownOpen((o) => !o)}
                  aria-expanded={pairDropdownOpen}
                  aria-haspopup="listbox"
                  aria-label="Select pair or asset"
                >
                  <span className="trade-calc-pair-trigger-main">{form.pair}</span>
                  <span className="trade-calc-pair-trigger-sub">{form.pairLabel}</span>
                  <span className="trade-calc-pair-arrow" aria-hidden>{pairDropdownOpen ? '▲' : '▼'}</span>
                </button>
                {pairDropdownOpen && (
                  <div className="trade-calc-pair-popover">
                    <input
                      type="search"
                      className="trade-calc-input trade-calc-pair-search"
                      placeholder="Type to filter…"
                      value={pairSearch}
                      onChange={(e) => setPairSearch(e.target.value)}
                      aria-label="Filter instruments"
                      autoComplete="off"
                    />
                    <div className="trade-calc-pair-list" role="listbox" aria-label="Pair and asset list">
                      {filteredFlatSearchResults != null
                        ? filteredFlatSearchResults.map((inst) => (
                            <button
                              key={inst.symbol}
                              type="button"
                              role="option"
                              aria-selected={form.pair === inst.symbol}
                              className={`trade-calc-pair-option trade-calc-pair-option--flat ${form.pair === inst.symbol ? 'selected' : ''}`}
                              onClick={() => handlePairSelect(inst)}
                            >
                              <span className="trade-calc-pair-option-symbol">{inst.symbol}</span>
                              <span className="trade-calc-pair-option-name">{inst.displayName}</span>
                              <span className="trade-calc-pair-option-cat">{inst.categoryLabel}</span>
                            </button>
                          ))
                        : filteredInstrumentGroups.map(({ label, instruments }) => (
                            <div key={label} className="trade-calc-pair-category">
                              <div className="trade-calc-pair-category-label">{label}</div>
                              {instruments.map((inst) => (
                                <button
                                  key={inst.symbol}
                                  type="button"
                                  role="option"
                                  aria-selected={form.pair === inst.symbol}
                                  className={`trade-calc-pair-option ${form.pair === inst.symbol ? 'selected' : ''}`}
                                  onClick={() => handlePairSelect(inst)}
                                >
                                  <span className="trade-calc-pair-option-symbol">{inst.symbol}</span>
                                  <span className="trade-calc-pair-option-name">{inst.displayName}</span>
                                </button>
                              ))}
                            </div>
                          ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <span className="trade-calc-helper">Same universe as Market Watch. Examples and units update by pair.</span>
          </div>

          <div className="trade-calc-field">
            <label>Direction</label>
            <div className="trade-calc-direction">
              <button
                type="button"
                className={`trade-calc-dir-btn trade-calc-dir-btn--buy ${form.direction === 'buy' ? 'active' : ''}`}
                onClick={() => setForm((f) => ({ ...f, direction: 'buy' }))}
              >
                Buy
              </button>
              <button
                type="button"
                className={`trade-calc-dir-btn trade-calc-dir-btn--sell ${form.direction === 'sell' ? 'active' : ''}`}
                onClick={() => setForm((f) => ({ ...f, direction: 'sell' }))}
              >
                Sell
              </button>
            </div>
          </div>

          <div className="trade-calc-field">
            <label>Account balance</label>
            <input
              type="number"
              min="1"
              step="1"
              className="trade-calc-input"
              value={form.accountBalance}
              onChange={(e) => setForm((f) => ({ ...f, accountBalance: e.target.value }))}
            />
          </div>

          <div className="trade-calc-field">
            <label>Account currency (denomination)</label>
            <select
              className="trade-calc-input"
              value={accountCurrency}
              onChange={handleAccountCurrencyChange}
              disabled={!selectedAccountId}
              aria-label="Account currency"
            >
              {ACCOUNT_CURRENCY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <span className="trade-calc-helper">
              Stored per Trade Validator account. Risk and P/L use live FX from the market snapshot when available.
            </span>
          </div>

          <div className="trade-calc-field">
            <label>Risk %</label>
            <p className="trade-calc-risk-notice">
              Risk above {RISK_WARNING_PCT}% per trade is generally not recommended.
            </p>
            <input
              type="number"
              min="0.1"
              step="0.1"
              className={`trade-calc-input${showHighRiskWarning ? ' trade-calc-input--high-risk' : ''}`}
              value={form.riskPercent}
              onChange={(e) => setForm((f) => ({ ...f, riskPercent: e.target.value }))}
            />
            {showHighRiskWarning && (
              <div className="trade-calc-risk-warning" role="alert">
                High risk: {riskPctNum}% per trade is above the recommended {RISK_WARNING_PCT}% limit. Consider reducing risk to protect your capital.
              </div>
            )}
          </div>

          <div className="trade-calc-field">
            <label>Position size (optional)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="trade-calc-input"
              value={form.positionSize}
              placeholder="Auto from risk % and SL"
              onChange={(e) => setForm((f) => ({ ...f, positionSize: e.target.value }))}
            />
            <button type="button" className="trade-calc-suggest" onClick={suggestFromRisk}>
              Suggest from risk %
            </button>
            <span className="trade-calc-helper">
              Leave empty to use size from risk % and stop loss. If you enter a size, stop loss is adjusted so your risk stays the same.
            </span>
          </div>

          <div className="trade-calc-field trade-calc-row3">
            <label>Entry, Stop loss, Take profit</label>
            <div className="trade-calc-esp-row">
              <div className="trade-calc-esp">
                <label className="trade-calc-esp-label">Entry</label>
                <input
                  type="number"
                  step={priceInputStep}
                  className="trade-calc-input"
                  value={form.entryPrice || ''}
                  placeholder={priceExamples.entryStr}
                  onChange={(e) => setForm((f) => ({ ...f, entryPrice: e.target.value }))}
                />
                <span className="trade-calc-eg">e.g. {priceExamples.entryStr}</span>
              </div>
              <div className="trade-calc-esp">
                <label className="trade-calc-esp-label">Stop loss</label>
                <input
                  type="number"
                  step={priceInputStep}
                  className="trade-calc-input"
                  value={form.stopLoss || ''}
                  placeholder={priceExamples.slStr}
                  onChange={(e) => setForm((f) => ({ ...f, stopLoss: e.target.value }))}
                />
                <span className="trade-calc-eg">e.g. {priceExamples.slStr}</span>
              </div>
              <div className="trade-calc-esp">
                <label className="trade-calc-esp-label">Take profit</label>
                <input
                  type="number"
                  step={priceInputStep}
                  className="trade-calc-input"
                  value={form.takeProfit || ''}
                  placeholder={priceExamples.tpStr}
                  onChange={(e) => setForm((f) => ({ ...f, takeProfit: e.target.value }))}
                />
                <span className="trade-calc-eg">e.g. {priceExamples.tpStr}</span>
              </div>
            </div>
          </div>

          {needsUsdJpy && (
            <div className="trade-calc-field">
              <label>USD/JPY (for USD risk &amp; P/L)</label>
              <input
                type="number"
                min="1"
                step="0.01"
                className="trade-calc-input"
                value={form.usdJpy}
                placeholder="e.g. 150"
                onChange={(e) => setForm((f) => ({ ...f, usdJpy: e.target.value }))}
              />
              <span className="trade-calc-helper">
                JPY crosses (e.g. EUR/JPY): yen per US dollar. Required to convert pip value to USD for position size and dollar P/L.
              </span>
            </div>
          )}

          <div className="trade-calc-field trade-calc-session-wrap" ref={sessionDropdownRef}>
            <label>Session (optional)</label>
            <div className="trade-calc-session-dropdown">
              <button
                type="button"
                className="trade-calc-input trade-calc-session-trigger"
                onClick={() => setSessionDropdownOpen((o) => !o)}
                aria-expanded={sessionDropdownOpen}
                aria-haspopup="listbox"
                aria-label="Select session"
              >
                <span>{SESSIONS.find((s) => s.value === form.session)?.label ?? 'Select session'}</span>
                <span className="trade-calc-session-arrow" aria-hidden>{sessionDropdownOpen ? '▲' : '▼'}</span>
              </button>
              {sessionDropdownOpen && (
                <ul className="trade-calc-session-list" role="listbox" aria-label="Session list">
                  {SESSIONS.map((s) => (
                    <li key={s.value || 'session'}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={form.session === s.value}
                        className={`trade-calc-session-option ${form.session === s.value ? 'selected' : ''}`}
                        onClick={() => {
                          setForm((f) => ({ ...f, session: s.value }));
                          setSessionDropdownOpen(false);
                        }}
                      >
                        {s.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="trade-calc-field">
            <label>Notes (optional)</label>
            <textarea
              className="trade-calc-input trade-calc-notes"
              placeholder="Trade notes..."
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
            />
          </div>
        </section>

        <section className="trade-calc-panel trade-calc-calculated">
          <h2 className="trade-calc-panel-title">Calculated</h2>
          <div className="trade-calc-calc-body">
            {riskAmountFromBalance > 0 && (
              <p className="trade-calc-calc-results trade-calc-calc-partial">
                <strong>Risk amount (from balance × risk %):</strong>{' '}
                {formatMoneyAccount(riskAmountFromBalance, accountCurrency)}
              </p>
            )}
            {!hasEntrySlTp ? (
              <p className="trade-calc-calc-hint">
                Enter entry, stop loss, and take profit to see distances, position size, and P/L.
              </p>
            ) : (
              <div className="trade-calc-calc-results">
                <p>
                  <strong>Risk amount:</strong> {formatMoneyAccount(result.riskAmount, accountCurrency)}
                </p>
                <p>
                  <strong>Position size:</strong>{' '}
                  {result.positionUnitLabel === 'lots' || result.positionUnitLabel === 'units'
                    ? positionSizeUsed.toFixed(2)
                    : Math.round(positionSizeUsed)}{' '}
                  {result.positionUnitLabel}
                </p>
                <p>
                  <strong>Stop:</strong> {typeof stopAlt === 'number' ? stopAlt.toFixed(2) : stopAlt} {altUnit}
                  {' — '}
                  <strong>TP:</strong> {typeof tpAlt === 'number' ? tpAlt.toFixed(2) : tpAlt} {altUnit}
                  {' — '}
                  <strong>R:R</strong> 1:{result.riskReward.toFixed(2)}
                </p>
                <p>
                  <strong>Potential profit:</strong> {formatMoneyAccount(potentialProfitDisplay, accountCurrency)}
                </p>
                <p>
                  <strong>Potential loss:</strong> {formatMoneyAccount(potentialLossDisplay, accountCurrency)}
                </p>
                {riskRoundingNote && (
                  <p className="trade-calc-warning" role="note">
                    Risk at this size (after lot step rounding):{' '}
                    {formatMoneyAccount(riskRoundingNote.actual, accountCurrency)} — target was{' '}
                    {formatMoneyAccount(riskRoundingNote.target, accountCurrency)}.
                  </p>
                )}
                <p className="trade-calc-helper trade-calc-calc-disclaimer">
                  Balance and risk % are in <strong>{accountCurrency}</strong>. Sizing uses USD risk from FX rates
                  (live snapshot). For crosses, ensure related majors (e.g. GBPUSD for EUR/GBP) are loaded.
                </p>
                {result.warnings && result.warnings.length > 0 && (
                  <div className="trade-calc-warnings">
                    {result.warnings.map((w, i) => (
                      <p key={i} className="trade-calc-warning">{w}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {pendingChecklist && (
            <div className="trade-calc-save-wrap">
              <button
                type="button"
                className="trade-calc-save-journal-btn"
                onClick={handleSaveToJournal}
                disabled={saving || !hasEntrySlTp}
              >
                {saving ? 'Saving…' : 'Save trade to journal'}
              </button>
              <p className="trade-calc-save-hint">Requires entry, stop, and take profit.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
