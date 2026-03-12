import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getAllInstruments, getInstrumentsByCategory } from '../../lib/aura-analysis/instruments';
import { calculateRisk, deriveStopLossFromRiskAndPositionSize } from '../../lib/aura-analysis/calculators/calculateRisk';
import '../../styles/aura-analysis/TradeCalculator.css';

const INSTRUMENTS_LIST = getAllInstruments();
const INSTRUMENTS_BY_CATEGORY = getInstrumentsByCategory();

const SESSIONS = [
  { value: '', label: 'Select session' },
  { value: 'Asia', label: 'Asia' },
  { value: 'London', label: 'London' },
  { value: 'New York', label: 'New York' },
  { value: 'Sydney', label: 'Sydney' },
];

export default function TradeCalculator() {
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
  });
  const [pairDropdownOpen, setPairDropdownOpen] = useState(false);
  const pairDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pairDropdownRef.current && !pairDropdownRef.current.contains(e.target)) {
        setPairDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // When position size is manually set, derive SL so risk (balance × risk %) stays constant.
  useEffect(() => {
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
    });
    if (derived == null) return;
    const rounded = Math.round(derived * 100000) / 100000;
    const current = Number(form.stopLoss) || 0;
    if (Math.abs(current - rounded) > 1e-9) {
      setForm((f) => ({ ...f, stopLoss: String(rounded) }));
    }
  }, [form.positionSize, form.entryPrice, form.accountBalance, form.riskPercent, form.direction, form.pair]);

  const calcInput = useMemo(
    () => ({
      accountBalance: Number(form.accountBalance) || 0,
      riskPercent: Number(form.riskPercent) || 0,
      entry: Number(form.entryPrice) || 0,
      stop: Number(form.stopLoss) || 0,
      takeProfit: Number(form.takeProfit) || 0,
      direction: form.direction,
    }),
    [
      form.accountBalance,
      form.riskPercent,
      form.entryPrice,
      form.stopLoss,
      form.takeProfit,
      form.direction,
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

  const potentialProfitDisplay = useMemo(() => {
    if (result.positionSize <= 0) return 0;
    return result.potentialProfit * (positionSizeUsed / result.positionSize);
  }, [result.potentialProfit, result.positionSize, positionSizeUsed]);

  const potentialLossDisplay = useMemo(() => {
    if (result.positionSize <= 0) return result.riskAmount;
    return result.potentialLoss * (positionSizeUsed / result.positionSize);
  }, [result.potentialLoss, result.positionSize, result.riskAmount, positionSizeUsed]);

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

  return (
    <div className="trade-calc-page">
      <h1 className="trade-calc-title">Trade Calculator</h1>

      <div className="trade-calc-banner">
        <p className="trade-calc-banner-text">
          Complete Trade Validator before submitting a trade. A minimum confluence score of 70% is required to execute trades.
        </p>
        <Link to="/trader-deck/trade-validator/checklist" className="trade-calc-banner-btn">
          Go to Trade Validator
        </Link>
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
                  <span>{form.pair}</span>
                  <span className="trade-calc-pair-arrow" aria-hidden>{pairDropdownOpen ? '▲' : '▼'}</span>
                </button>
                {pairDropdownOpen && (
                  <div
                    className="trade-calc-pair-list"
                    role="listbox"
                    aria-label="Pair and asset list"
                  >
                    {INSTRUMENTS_BY_CATEGORY.map(({ label, instruments }) => (
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
                )}
              </div>
              <input
                type="text"
                className="trade-calc-input"
                value={form.pairLabel}
                readOnly
                aria-label="Pair display"
              />
            </div>
            <span className="trade-calc-helper">Examples and units update by pair.</span>
          </div>

          <div className="trade-calc-field">
            <label>Direction</label>
            <div className="trade-calc-direction">
              <button
                type="button"
                className={`trade-calc-dir-btn ${form.direction === 'buy' ? 'active' : ''}`}
                onClick={() => setForm((f) => ({ ...f, direction: 'buy' }))}
              >
                Buy
              </button>
              <button
                type="button"
                className={`trade-calc-dir-btn ${form.direction === 'sell' ? 'active' : ''}`}
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
            <label>Risk %</label>
            <input
              type="number"
              min="0.1"
              step="0.1"
              className="trade-calc-input"
              value={form.riskPercent}
              onChange={(e) => setForm((f) => ({ ...f, riskPercent: e.target.value }))}
            />
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
                  step="0.00001"
                  className="trade-calc-input"
                  value={form.entryPrice || ''}
                  placeholder="0"
                  onChange={(e) => setForm((f) => ({ ...f, entryPrice: e.target.value }))}
                />
                <span className="trade-calc-eg">e.g. 1.005</span>
              </div>
              <div className="trade-calc-esp">
                <label className="trade-calc-esp-label">Stop loss</label>
                <input
                  type="number"
                  step="0.00001"
                  className="trade-calc-input"
                  value={form.stopLoss || ''}
                  placeholder="0"
                  onChange={(e) => setForm((f) => ({ ...f, stopLoss: e.target.value }))}
                />
                <span className="trade-calc-eg">e.g. 1.003</span>
              </div>
              <div className="trade-calc-esp">
                <label className="trade-calc-esp-label">Take profit</label>
                <input
                  type="number"
                  step="0.00001"
                  className="trade-calc-input"
                  value={form.takeProfit || ''}
                  placeholder="0"
                  onChange={(e) => setForm((f) => ({ ...f, takeProfit: e.target.value }))}
                />
                <span className="trade-calc-eg">e.g. 1.09</span>
              </div>
            </div>
          </div>

          <div className="trade-calc-field">
            <label>Session (optional)</label>
            <select
              value={form.session}
              onChange={(e) => setForm((f) => ({ ...f, session: e.target.value }))}
              className="trade-calc-input"
            >
              {SESSIONS.map((s) => (
                <option key={s.value || 'session'} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
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
                <strong>Risk amount (from balance × risk %):</strong> ${riskAmountFromBalance.toFixed(2)}
              </p>
            )}
            {!hasEntrySlTp ? (
              <p className="trade-calc-calc-hint">
                Enter entry, stop loss, and take profit to see distances, position size, and P/L.
              </p>
            ) : (
              <div className="trade-calc-calc-results">
                <p><strong>Risk amount:</strong> ${result.riskAmount.toFixed(2)}</p>
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
                <p><strong>Potential profit:</strong> ${potentialProfitDisplay.toFixed(2)}</p>
                <p><strong>Potential loss:</strong> ${potentialLossDisplay.toFixed(2)}</p>
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
        </section>
      </div>
    </div>
  );
}
