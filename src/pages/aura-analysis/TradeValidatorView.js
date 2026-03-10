import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FaArrowLeft } from 'react-icons/fa';
import { toast } from 'react-toastify';
import Api from '../../services/Api';
import '../../styles/TradeValidatorView.css';

const CHECKLIST_ITEMS = [
  { id: 'htf-1', label: 'Weekly trend direction identified', points: 10 },
  { id: 'htf-2', label: 'Daily trend aligned with weekly bias', points: 10 },
  { id: 'kl-1', label: 'Price reacting at supply / demand zone', points: 10 },
  { id: 'kl-2', label: 'Previous support/resistance respected', points: 8 },
  { id: 'liq-1', label: 'Equal highs / equal lows present', points: 6 },
  { id: 'liq-2', label: 'Liquidity sweep occurred', points: 8 },
  { id: 'ms-1', label: 'Break of structure (BOS)', points: 8 },
  { id: 'ec-1', label: 'Engulfing candle', points: 5 },
  { id: 'rm-1', label: 'Minimum risk reward 1:3', points: 4 },
  { id: 'rm-2', label: 'Stop loss placed at logical structure', points: 3 },
];

const TOTAL_POINTS = 200;
const POINTS_BY_ID = Object.fromEntries(CHECKLIST_ITEMS.map((i) => [i.id, i.points]));

function getScoreLabel(score) {
  if (score >= 70) return 'Valid Trade';
  if (score >= 60) return 'Risky / Not Ready';
  if (score >= 40) return 'Weak Setup';
  return 'No Trade';
}

const PAIRS = [
  { value: 'EURUSD', label: 'EUR/USD' },
  { value: 'GBPUSD', label: 'GBP/USD' },
  { value: 'USDJPY', label: 'USD/JPY' },
  { value: 'XAUUSD', label: 'XAU/USD' },
  { value: 'US30', label: 'US30' },
];

function calcForexRisk(pair, balance, riskPercent, entry, stop, direction) {
  const riskAmount = (balance * riskPercent) / 100;
  if (riskAmount <= 0) return { riskAmount, positionSize: 0, stopPips: 0 };
  const isJpy = pair.includes('JPY');
  const pipSize = isJpy ? 0.01 : 0.0001;
  const stopDistance = Math.abs(entry - stop);
  const stopPips = stopDistance / pipSize;
  const contractSize = 100000;
  const pipValuePerLot = isJpy ? (contractSize * pipSize) / entry : contractSize * pipSize;
  if (stopPips <= 0 || pipValuePerLot <= 0) return { riskAmount, positionSize: 0, stopPips: 0 };
  const positionSize = riskAmount / (stopPips * pipValuePerLot);
  return { riskAmount, positionSize, stopPips, pipValuePerLot };
}

export default function TradeValidatorView() {
  const [checked, setChecked] = useState(() => {
    try {
      const raw = localStorage.getItem('aura-trade-validator-checked');
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  });
  const [pnl, setPnl] = useState({ dailyPnl: 0, weeklyPnl: 0, monthlyPnl: 0 });
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    pair: 'EURUSD',
    direction: 'buy',
    accountBalance: 10000,
    riskPercent: 1,
    entryPrice: 1.08,
    stopLoss: 1.075,
    takeProfit: 1.095,
    notes: '',
  });

  useEffect(() => {
    const ids = Array.from(checked);
    try {
      localStorage.setItem('aura-trade-validator-checked', JSON.stringify(ids));
    } catch {}
  }, [checked]);

  useEffect(() => {
    Api.getAuraAnalysisPnl()
      .then((res) => {
        if (res.data && res.data.success) {
          setPnl({
            dailyPnl: res.data.dailyPnl ?? 0,
            weeklyPnl: res.data.weeklyPnl ?? 0,
            monthlyPnl: res.data.monthlyPnl ?? 0,
          });
        }
      })
      .catch(() => {});
  }, []);

  const checklistScore = useMemo(() => {
    let sum = 0;
    checked.forEach((id) => {
      sum += POINTS_BY_ID[id] ?? 0;
    });
    return Math.min(TOTAL_POINTS, sum);
  }, [checked]);

  const scorePercent = useMemo(() => Math.round((checklistScore / TOTAL_POINTS) * 100), [checklistScore]);
  const scoreLabel = getScoreLabel(scorePercent);
  const canProceed = scorePercent >= 70;

  const { riskAmount, positionSize, stopPips, pipValuePerLot } = useMemo(() => {
    const { accountBalance, riskPercent, entryPrice, stopLoss, pair, direction } = form;
    return calcForexRisk(pair, Number(accountBalance) || 0, Number(riskPercent) || 0, Number(entryPrice) || 0, Number(stopLoss) || 0, direction);
  }, [form]);

  const takeProfitPips = useMemo(() => {
    const { pair, entryPrice, takeProfit } = form;
    const isJpy = pair.includes('JPY');
    const pipSize = isJpy ? 0.01 : 0.0001;
    return Math.abs((Number(takeProfit) || 0) - (Number(entryPrice) || 0)) / pipSize;
  }, [form]);

  const rr = useMemo(() => {
    if (stopPips <= 0) return 0;
    return (takeProfitPips / stopPips).toFixed(2);
  }, [stopPips, takeProfitPips]);

  const potentialProfit = useMemo(() => {
    if (!pipValuePerLot || positionSize <= 0) return 0;
    return takeProfitPips * pipValuePerLot * positionSize;
  }, [takeProfitPips, pipValuePerLot, positionSize]);

  const handleToggle = (id) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSaveTrade = async () => {
    if (saving) return;
    const payload = {
      pair: form.pair,
      direction: form.direction,
      accountBalance: Number(form.accountBalance) || 0,
      riskPercent: Number(form.riskPercent) || 0,
      riskAmount,
      entryPrice: Number(form.entryPrice) || 0,
      stopLoss: Number(form.stopLoss) || 0,
      takeProfit: Number(form.takeProfit) || 0,
      stopLossPips: stopPips,
      takeProfitPips,
      rr: Number(rr),
      positionSize,
      potentialProfit,
      potentialLoss: riskAmount,
      result: 'open',
      pnl: 0,
      rMultiple: 0,
      checklistScore,
      checklistTotal: TOTAL_POINTS,
      checklistPercent: scorePercent,
      tradeGrade: scoreLabel,
      notes: (form.notes || '').trim() || null,
      assetClass: 'forex',
    };
    if (payload.accountBalance <= 0 || payload.entryPrice <= 0) {
      toast.error('Enter balance and entry price');
      return;
    }
    setSaving(true);
    try {
      await Api.createAuraAnalysisTrade(payload);
      toast.success('Trade saved');
      Api.getAuraAnalysisPnl().then((res) => {
        if (res.data?.success) {
          setPnl({
            dailyPnl: res.data.dailyPnl ?? 0,
            weeklyPnl: res.data.weeklyPnl ?? 0,
            monthlyPnl: res.data.monthlyPnl ?? 0,
          });
        }
      });
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to save trade');
    } finally {
      setSaving(false);
    }
  };

  const formatPnl = (v) => {
    const n = Number(v);
    if (Number.isNaN(n)) return '$0';
    const s = n >= 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`;
    return s;
  };

  return (
    <div className="trade-validator-page">
      <div className="trade-validator-inner">
        <Link to="/aura-analysis" className="trade-validator-back">
          <FaArrowLeft /> Back to Aura Analysis
        </Link>

        <header className="trade-validator-header">
          <h1>Trade Validator</h1>
          <p>Run your trade through the confluence checklist and risk calculator. Log results and track PnL.</p>
        </header>

        <div className="trade-validator-pnl-strip">
          <div className={`trade-validator-pnl-card ${pnl.dailyPnl >= 0 ? 'positive' : 'negative'}`}>
            <span>Daily PnL</span>
            <strong>{formatPnl(pnl.dailyPnl)}</strong>
          </div>
          <div className={`trade-validator-pnl-card ${pnl.weeklyPnl >= 0 ? 'positive' : 'negative'}`}>
            <span>Weekly PnL</span>
            <strong>{formatPnl(pnl.weeklyPnl)}</strong>
          </div>
          <div className={`trade-validator-pnl-card ${pnl.monthlyPnl >= 0 ? 'positive' : 'negative'}`}>
            <span>Monthly PnL</span>
            <strong>{formatPnl(pnl.monthlyPnl)}</strong>
          </div>
        </div>

        <section className="trade-validator-section">
          <h2>Confluence checklist</h2>
          <div className="trade-validator-score">
            <span className={`trade-validator-score-value ${scorePercent >= 70 ? 'good' : scorePercent >= 40 ? 'warn' : 'low'}`}>
              {scorePercent}%
            </span>
            <span className="trade-validator-score-label">/ 100% — {scoreLabel}</span>
          </div>
          <div className="trade-validator-checklist">
            {CHECKLIST_ITEMS.map((item) => (
              <label key={item.id}>
                <input
                  type="checkbox"
                  checked={checked.has(item.id)}
                  onChange={() => handleToggle(item.id)}
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="trade-validator-section">
          <h2>Trade calculator</h2>
          <div className="trade-validator-form-grid">
            <div className="trade-validator-field full">
              <label>Pair</label>
              <select
                value={form.pair}
                onChange={(e) => setForm((f) => ({ ...f, pair: e.target.value }))}
              >
                {PAIRS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="trade-validator-field">
              <label>Direction</label>
              <select
                value={form.direction}
                onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value }))}
              >
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </div>
            <div className="trade-validator-field">
              <label>Balance</label>
              <input
                type="number"
                min="1"
                step="1"
                value={form.accountBalance}
                onChange={(e) => setForm((f) => ({ ...f, accountBalance: e.target.value }))}
              />
            </div>
            <div className="trade-validator-field">
              <label>Risk %</label>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={form.riskPercent}
                onChange={(e) => setForm((f) => ({ ...f, riskPercent: e.target.value }))}
              />
            </div>
            <div className="trade-validator-field">
              <label>Entry</label>
              <input
                type="number"
                step="0.00001"
                value={form.entryPrice}
                onChange={(e) => setForm((f) => ({ ...f, entryPrice: e.target.value }))}
              />
            </div>
            <div className="trade-validator-field">
              <label>Stop loss</label>
              <input
                type="number"
                step="0.00001"
                value={form.stopLoss}
                onChange={(e) => setForm((f) => ({ ...f, stopLoss: e.target.value }))}
              />
            </div>
            <div className="trade-validator-field">
              <label>Take profit</label>
              <input
                type="number"
                step="0.00001"
                value={form.takeProfit}
                onChange={(e) => setForm((f) => ({ ...f, takeProfit: e.target.value }))}
              />
            </div>
          </div>
          <div className="trade-validator-computed">
            <p><strong>Risk amount:</strong> ${riskAmount.toFixed(2)}</p>
            <p><strong>Position size:</strong> {positionSize.toFixed(2)} lots</p>
            <p><strong>Stop:</strong> {stopPips.toFixed(1)} pips — <strong>TP:</strong> {takeProfitPips.toFixed(1)} pips — <strong>R:R</strong> 1:{rr}</p>
            <p><strong>Potential profit:</strong> ${potentialProfit.toFixed(2)}</p>
          </div>
          <div className="trade-validator-field full" style={{ marginTop: 16 }}>
            <label>Notes (optional)</label>
            <input
              type="text"
              placeholder="Trade notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div className="trade-validator-actions">
            <button
              type="button"
              className="trade-validator-btn trade-validator-btn-primary"
              onClick={handleSaveTrade}
              disabled={saving || !canProceed}
            >
              {saving ? 'Saving…' : 'Save trade'}
            </button>
            {!canProceed && (
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', alignSelf: 'center' }}>
                Reach 70% on the checklist to save.
              </span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
