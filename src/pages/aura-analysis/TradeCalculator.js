import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import Api from '../../services/Api';
import { useTradeValidatorAccount } from '../../context/TradeValidatorAccountContext';
import { getAllInstruments, getInstrumentsByCategory, getInstrumentOrFallback, getPriceExamples } from '../../lib/aura-analysis/instruments';
import { calculateRisk, deriveStopLossFromRiskAndPositionSize } from '../../lib/aura-analysis/calculators/calculateRisk';
import { getScoreLabel } from '../../lib/aura-analysis/validator/scoreCalculator';
import { VALIDATOR_CHECKLIST_PENDING_KEY } from '../../lib/aura-analysis/validator/validatorChecklistStorage';
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

const RISK_WARNING_PCT = 5;

export default function TradeCalculator() {
  const navigate = useNavigate();
  const { selectedAccountId } = useTradeValidatorAccount();
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
    });
    if (derived == null) return;
    const rounded = Math.round(derived * 100000) / 100000;
    const current = Number(form.stopLoss) || 0;
    if (Math.abs(current - rounded) > 1e-9) {
      setForm((f) => ({ ...f, stopLoss: String(rounded) }));
    }
  }, [hasManualPositionSize, form.positionSize, form.entryPrice, form.accountBalance, form.riskPercent, form.direction, form.pair]);

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

  const riskPctNum = Number(form.riskPercent) || 0;
  const showHighRiskWarning = riskPctNum > RISK_WARNING_PCT;

  const priceExamples = useMemo(() => {
    const inst = getInstrumentOrFallback(form.pair);
    return getPriceExamples(inst);
  }, [form.pair]);

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
      potentialProfit: result.potentialProfit * (positionSizeUsed / Math.max(result.positionSize, 1e-9)),
      potentialLoss: result.potentialLoss * (positionSizeUsed / Math.max(result.positionSize, 1e-9)),
      result: 'open',
      pnl: 0,
      rMultiple: 0,
      checklistScore,
      checklistTotal,
      checklistPercent,
      tradeGrade,
      notes: (form.notes || '').trim() || null,
      session: form.session || null,
      assetClass:
        result.positionUnitLabel === 'lots'
          ? 'forex'
          : result.positionUnitLabel === 'contracts'
            ? 'indices'
            : 'crypto',
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
                  step="0.00001"
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
                  step="0.00001"
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
                  step="0.00001"
                  className="trade-calc-input"
                  value={form.takeProfit || ''}
                  placeholder={priceExamples.tpStr}
                  onChange={(e) => setForm((f) => ({ ...f, takeProfit: e.target.value }))}
                />
                <span className="trade-calc-eg">e.g. {priceExamples.tpStr}</span>
              </div>
            </div>
          </div>

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
