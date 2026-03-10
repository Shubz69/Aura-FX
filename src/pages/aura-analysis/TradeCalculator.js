import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import '../../styles/aura-analysis/TradeCalculator.css';

const PAIRS = [
  { value: 'EURUSD', label: 'EUR/USD' },
  { value: 'GBPUSD', label: 'GBP/USD' },
  { value: 'USDJPY', label: 'USD/JPY' },
  { value: 'XAUUSD', label: 'XAU/USD' },
  { value: 'US30', label: 'US30' },
];

const SESSIONS = [{ value: '', label: 'Select session' }, { value: 'Asia', label: 'Asia' }, { value: 'London', label: 'London' }, { value: 'New York', label: 'New York' }, { value: 'Sydney', label: 'Sydney' }];

function calcForexRisk(pair, balance, riskPercent, entry, stop) {
  const riskAmount = (balance * riskPercent) / 100;
  if (riskAmount <= 0) return { riskAmount, positionSize: 0, stopPips: 0, pipValuePerLot: 0 };
  const isJpy = pair.includes('JPY');
  const pipSize = isJpy ? 0.01 : 0.0001;
  const stopDistance = Math.abs(entry - stop);
  const stopPips = stopDistance / pipSize;
  const contractSize = 100000;
  const pipValuePerLot = isJpy ? (contractSize * pipSize) / (entry || 1) : contractSize * pipSize;
  if (stopPips <= 0 || pipValuePerLot <= 0) return { riskAmount, positionSize: 0, stopPips: 0, pipValuePerLot: 0 };
  const positionSize = riskAmount / (stopPips * pipValuePerLot);
  return { riskAmount, positionSize, stopPips, pipValuePerLot };
}

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

  const pairOption = PAIRS.find((p) => p.value === form.pair) || PAIRS[0];

  const { riskAmount, positionSize: suggestedSize, stopPips, pipValuePerLot } = useMemo(() => {
    const balance = Number(form.accountBalance) || 0;
    const risk = Number(form.riskPercent) || 0;
    const entry = Number(form.entryPrice) || 0;
    const stop = Number(form.stopLoss) || 0;
    return calcForexRisk(form.pair, balance, risk, entry, stop);
  }, [form.pair, form.accountBalance, form.riskPercent, form.entryPrice, form.stopLoss]);

  const takeProfitPips = useMemo(() => {
    const isJpy = form.pair.includes('JPY');
    const pipSize = isJpy ? 0.01 : 0.0001;
    return Math.abs((Number(form.takeProfit) || 0) - (Number(form.entryPrice) || 0)) / pipSize;
  }, [form.pair, form.entryPrice, form.takeProfit]);

  const positionSizeNum = Number(form.positionSize) || suggestedSize || 0;
  const rr = stopPips > 0 ? (takeProfitPips / stopPips).toFixed(2) : '0';
  const potentialProfit = pipValuePerLot && positionSizeNum > 0 ? takeProfitPips * pipValuePerLot * positionSizeNum : 0;

  const hasEntrySlTp = (Number(form.entryPrice) || 0) > 0 && (Number(form.stopLoss) || 0) !== 0 && (Number(form.takeProfit) || 0) > 0;

  const handlePairChange = (e) => {
    const v = e.target.value;
    const p = PAIRS.find((x) => x.value === v) || PAIRS[0];
    setForm((f) => ({ ...f, pair: v, pairLabel: p.label }));
  };

  const suggestFromRisk = () => {
    setForm((f) => ({ ...f, positionSize: suggestedSize > 0 ? suggestedSize.toFixed(2) : '' }));
  };

  return (
    <div className="trade-calc-page">
      <h1 className="trade-calc-title">Trade Calculator</h1>

      <div className="trade-calc-banner">
        <p className="trade-calc-banner-text">
          Complete Trade Validator before submitting a trade. A minimum confluence score of 70% is required to execute trades.
        </p>
        <Link to="/aura-analysis/trade-validator" className="trade-calc-banner-btn">
          Go to Trade Validator
        </Link>
      </div>

      <div className="trade-calc-columns">
        <section className="trade-calc-panel trade-calc-setup">
          <h2 className="trade-calc-panel-title">Trade setup</h2>

          <div className="trade-calc-field">
            <label>Pair / Asset</label>
            <div className="trade-calc-pair-row">
              <select value={form.pair} onChange={handlePairChange} className="trade-calc-input">
                {PAIRS.map((p) => (
                  <option key={p.value} value={p.value}>{p.value}</option>
                ))}
              </select>
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
            <label>Position size</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="trade-calc-input"
              value={form.positionSize}
              placeholder="0"
              onChange={(e) => setForm((f) => ({ ...f, positionSize: e.target.value }))}
            />
            <button type="button" className="trade-calc-suggest" onClick={suggestFromRisk}>
              Suggest from risk %
            </button>
            <span className="trade-calc-helper">
              Fixed size used for P/L. Changing SL only affects loss; changing TP only affects profit.
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
                <option key={s.value || 'session'} value={s.value}>{s.label}</option>
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
            {!hasEntrySlTp ? (
              <p className="trade-calc-calc-hint">
                Enter entry, stop loss, and take profit to see distances and suggest position size.
              </p>
            ) : (
              <div className="trade-calc-calc-results">
                <p><strong>Risk amount:</strong> ${riskAmount.toFixed(2)}</p>
                <p><strong>Position size:</strong> {(form.positionSize ? positionSizeNum : suggestedSize)?.toFixed(2) ?? '0.00'} lots</p>
                <p><strong>Stop:</strong> {stopPips.toFixed(1)} pips — <strong>TP:</strong> {takeProfitPips.toFixed(1)} pips — <strong>R:R</strong> 1:{rr}</p>
                <p><strong>Potential profit:</strong> ${potentialProfit.toFixed(2)}</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
