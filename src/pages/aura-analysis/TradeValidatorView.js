import React, { useState, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FaArrowLeft, FaCheckSquare } from 'react-icons/fa';
import { toast } from 'react-toastify';
import Api from '../../services/Api';
import '../../styles/TradeValidatorView.css';

// ─── Checklist structure (match reference) ─────────────────────────────────
const CORE_CONFLUENCE = [
  {
    section: 'Higher Timeframe Bias',
    timeframes: 'Weekly + Daily',
    items: [
      { id: 'htf-1', label: 'Weekly trend direction identified', points: 10 },
      { id: 'htf-2', label: 'Daily trend aligned with weekly bias', points: 10 },
      { id: 'htf-3', label: 'Price trading above/below major HTF structure', points: 8 },
      { id: 'htf-4', label: 'Clear higher highs / lower lows on HTF', points: 6 },
    ],
  },
  {
    section: 'Key Location',
    timeframes: 'Daily + 4H',
    items: [
      { id: 'kl-1', label: 'Price reacting at supply / demand zone', points: 10 },
      { id: 'kl-2', label: 'Previous support/resistance respected', points: 8 },
      { id: 'kl-3', label: 'Psychological level nearby (00 / 50 levels)', points: 6 },
      { id: 'kl-4', label: 'Premium / discount zone within range', points: 3 },
    ],
  },
  {
    section: 'Liquidity & Market Intent',
    timeframes: '4H + 1H',
    items: [
      { id: 'liq-1', label: 'Equal highs / equal lows present', points: 6 },
      { id: 'liq-2', label: 'Liquidity sweep occurred', points: 8 },
      { id: 'liq-3', label: 'Stop hunt / false breakout visible', points: 6 },
      { id: 'liq-4', label: 'Strong rejection after sweep', points: 5 },
      { id: 'liq-5', label: 'Displacement move after liquidity', points: 5 },
    ],
  },
];

const MAIN_CARDS = [
  {
    section: 'Market Structure',
    timeframes: '1H + 30m',
    items: [
      { id: 'ms-1', label: 'Break of structure (BOS)', points: 8 },
      { id: 'ms-2', label: 'Change of character (CHOCH)', points: 7 },
      { id: 'ms-3', label: 'Momentum candle break', points: 6 },
      { id: 'ms-4', label: 'Market compression before breakout', points: 4 },
      { id: 'ms-5', label: 'Clear continuation structure', points: 5 },
    ],
  },
  {
    section: 'Entry Confirmation',
    timeframes: '15m + 5m + 1m',
    items: [
      { id: 'ec-1', label: 'Engulfing candle', points: 3 },
      { id: 'ec-2', label: 'Strong rejection wick', points: 4 },
      { id: 'ec-3', label: 'Momentum candle', points: 4 },
      { id: 'ec-4', label: 'Volume expansion', points: 4 },
      { id: 'ec-5', label: 'Entry within active session (London / NY)', points: 3 },
    ],
  },
  {
    section: 'Risk Management',
    timeframes: 'Execution / Trade Plan',
    items: [
      { id: 'rm-1', label: 'Minimum risk reward 1:3', points: 4 },
      { id: 'rm-2', label: 'Stop loss placed at logical structure', points: 3 },
      { id: 'rm-3', label: 'Trade aligns with higher timeframe bias', points: 3 },
      { id: 'rm-4', label: 'Position size calculated correctly', points: 3 },
      { id: 'rm-5', label: 'Clear invalidation level defined', points: 2 },
    ],
  },
];

const SETUP_FORMATION_CATEGORIES = [
  { name: 'BREAK AND RETEST', items: [{ id: 'br-1', label: 'Price returns to broken structure', points: 4 }, { id: 'br-2', label: 'Level flips support/resistance', points: 4 }] },
  { name: 'SUPPLY / DEMAND REACTION', items: [{ id: 'sd-1', label: 'Strong impulsive move from zone', points: 3 }, { id: 'sd-2', label: 'Reaction inside zone', points: 1 }] },
  { name: 'TRENDLINE BREAK', items: [{ id: 'tl-1', label: 'Trendline cleanly broken', points: 2 }, { id: 'tl-2', label: 'Retest of broken trendline', points: 2 }] },
  { name: 'WEDGE / TRIANGLE', items: [{ id: 'wg-1', label: 'Converging trendlines formed', points: 2 }, { id: 'wg-2', label: 'Breakout confirmed', points: 2 }] },
  { name: 'ELLIOTT WAVE', items: [{ id: 'ew-1', label: 'Clear wave structure visible', points: 2 }, { id: 'ew-2', label: 'Correct wave count', points: 7 }] },
];

const ALL_ITEMS = [
  ...CORE_CONFLUENCE.flatMap((s) => s.items),
  ...MAIN_CARDS.flatMap((s) => s.items),
  ...SETUP_FORMATION_CATEGORIES.flatMap((c) => c.items),
];
const TOTAL_POINTS = ALL_ITEMS.reduce((sum, i) => sum + i.points, 0);
const POINTS_BY_ID = Object.fromEntries(ALL_ITEMS.map((i) => [i.id, i.points]));

function getScoreGrade(scorePercent) {
  if (scorePercent >= 98) return 'A+ Institutional Setup';
  if (scorePercent >= 90) return 'A Strong Setup';
  if (scorePercent >= 80) return 'B Good Setup';
  if (scorePercent >= 70) return 'Valid Trade';
  if (scorePercent >= 60) return 'Risky / Not Ready';
  if (scorePercent >= 40) return 'Weak Setup';
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

function ChecklistItem({ item, checked, onToggle }) {
  return (
    <label className="tv-checklist-item">
      <input type="checkbox" checked={checked.has(item.id)} onChange={() => onToggle(item.id)} />
      <span className="tv-checkmark" aria-hidden />
      <span className="tv-item-label">{item.label}</span>
      <span className="tv-item-pct">+{item.points}%</span>
    </label>
  );
}

function SectionCard({ section, timeframes, items, checked, onToggle }) {
  const score = items.reduce((s, i) => s + (checked.has(i.id) ? i.points : 0), 0);
  const max = items.reduce((s, i) => s + i.points, 0);
  const pct = max > 0 ? Math.round((score / max) * 100) : 0;
  return (
    <div className="tv-section-card">
      <div className="tv-section-card-icon" aria-hidden />
      <h3 className="tv-section-card-title">{section}</h3>
      <p className="tv-section-timeframes">{timeframes}</p>
      <div className="tv-section-list">
        {items.map((item) => (
          <ChecklistItem key={item.id} item={item} checked={checked} onToggle={onToggle} />
        ))}
      </div>
      <p className="tv-section-score">Section score <span className="tv-section-score-value">{pct}%</span></p>
    </div>
  );
}

export default function TradeValidatorView() {
  const location = useLocation();
  const isEmbedded = location.pathname === '/aura-analysis/trade-validator';
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
  const [showTradeForm, setShowTradeForm] = useState(false);
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
    try {
      localStorage.setItem('aura-trade-validator-checked', JSON.stringify(Array.from(checked)));
    } catch {}
  }, [checked]);

  useEffect(() => {
    Api.getAuraAnalysisPnl()
      .then((res) => {
        if (res?.data?.success) {
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
    checked.forEach((id) => { sum += POINTS_BY_ID[id] ?? 0; });
    return sum;
  }, [checked]);

  const scorePercent = TOTAL_POINTS > 0 ? Math.round((checklistScore / TOTAL_POINTS) * 100) : 0;
  const scoreGrade = getScoreGrade(scorePercent);
  const canProceed = scorePercent >= 70;

  const { riskAmount, positionSize, stopPips, pipValuePerLot } = useMemo(() => {
    const { accountBalance, riskPercent, entryPrice, stopLoss, pair } = form;
    return calcForexRisk(pair, Number(accountBalance) || 0, Number(riskPercent) || 0, Number(entryPrice) || 0, Number(stopLoss) || 0, form.direction);
  }, [form]);

  const takeProfitPips = useMemo(() => {
    const isJpy = form.pair.includes('JPY');
    const pipSize = isJpy ? 0.01 : 0.0001;
    return Math.abs((Number(form.takeProfit) || 0) - (Number(form.entryPrice) || 0)) / pipSize;
  }, [form]);

  const rr = stopPips > 0 ? (takeProfitPips / stopPips).toFixed(2) : '0';
  const potentialProfit = pipValuePerLot && positionSize > 0 ? takeProfitPips * pipValuePerLot * positionSize : 0;

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
      tradeGrade: scoreGrade,
      notes: (form.notes || '').trim() || null,
      assetClass: 'forex',
    };
    if (payload.accountBalance <= 0 || payload.entryPrice <= 0) {
      toast.error('Enter balance and entry price in Trade details');
      return;
    }
    setSaving(true);
    try {
      await Api.createAuraAnalysisTrade(payload);
      toast.success('Trade saved');
      Api.getAuraAnalysisPnl().then((res) => {
        if (res?.data?.success) setPnl({ dailyPnl: res.data.dailyPnl ?? 0, weeklyPnl: res.data.weeklyPnl ?? 0, monthlyPnl: res.data.monthlyPnl ?? 0 });
      });
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to save trade');
    } finally {
      setSaving(false);
    }
  };

  const setupFormationScore = useMemo(() => {
    const items = SETUP_FORMATION_CATEGORIES.flatMap((c) => c.items);
    const max = items.reduce((s, i) => s + i.points, 0);
    const score = items.reduce((s, i) => s + (checked.has(i.id) ? i.points : 0), 0);
    return max > 0 ? Math.round((score / max) * 100) : 0;
  }, [checked]);

  return (
    <div className={`trade-validator-page ${isEmbedded ? 'trade-validator-embedded' : ''}`}>
      <div className="trade-validator-inner tv-new-layout">
        <Link to="/aura-analysis" className="trade-validator-back">
          <FaArrowLeft aria-hidden /> Back to Aura Analysis
        </Link>

        <header className="tv-header">
          <h1 className="tv-title"><FaCheckSquare className="tv-title-icon" aria-hidden /> Trade Validator</h1>
          <p className="tv-subtitle">Confluence scoring engine confirm your setup before execution.</p>
        </header>

        {/* Trade Score card */}
        <section className="tv-score-card">
          <div className="tv-score-left">
            <span className="tv-score-label">Trade Score</span>
            <span className="tv-score-value">{scorePercent}% / 100%</span>
            <span className="tv-score-status">Status</span>
            <span className="tv-score-grade">{scoreGrade}</span>
          </div>
          <div className="tv-score-bar-wrap">
            <div className="tv-score-bar" style={{ width: `${scorePercent}%` }} />
          </div>
        </section>

        {/* CORE CONFLUENCE CHECKLIST */}
        <section className="tv-block">
          <h2 className="tv-block-title">CORE CONFLUENCE CHECKLIST</h2>
          <p className="tv-block-sub">This is the main decision layer</p>
          <div className="tv-core-grid">
            {CORE_CONFLUENCE.map((col) => (
              <div key={col.section} className="tv-core-col">
                <h3 className="tv-core-col-title">{col.section}</h3>
                <p className="tv-core-col-time">{col.timeframes}</p>
                {col.items.map((item) => (
                  <ChecklistItem key={item.id} item={item} checked={checked} onToggle={handleToggle} />
                ))}
              </div>
            ))}
          </div>
        </section>

        {/* Market Structure, Entry Confirmation, Risk Management */}
        <div className="tv-cards-grid">
          {MAIN_CARDS.map((card) => (
            <SectionCard
              key={card.section}
              section={card.section}
              timeframes={card.timeframes}
              items={card.items}
              checked={checked}
              onToggle={handleToggle}
            />
          ))}
        </div>

        {/* SETUP FORMATION CHECKLIST */}
        <section className="tv-block tv-setup-block">
          <h2 className="tv-block-title">SETUP FORMATION CHECKLIST</h2>
          <p className="tv-block-sub">This is supporting confirmation, not primary confirmation</p>
          <div className="tv-setup-chart" aria-hidden />
          <div className="tv-setup-section">
            <h3 className="tv-setup-section-title">Setup Formation</h3>
            <p className="tv-setup-section-time">Timeframes: Depends on setup / pattern</p>
            {SETUP_FORMATION_CATEGORIES.map((cat) => (
              <div key={cat.name} className="tv-setup-cat">
                <h4 className="tv-setup-cat-name">{cat.name}</h4>
                {cat.items.map((item) => (
                  <ChecklistItem key={item.id} item={item} checked={checked} onToggle={handleToggle} />
                ))}
              </div>
            ))}
            <p className="tv-setup-section-score">Section score <span className="tv-section-score-value">{setupFormationScore}%</span></p>
          </div>
        </section>

        {/* Bottom bar */}
        <div className="tv-bottom-bar">
          <div className={`tv-bottom-msg ${canProceed ? 'tv-bottom-msg-ok' : ''}`}>
            {canProceed ? 'Score meets minimum requirement (70%).' : 'Reach 70% to use the calculator or save.'}
          </div>
          <div className="tv-bottom-actions">
            <Link to="/aura-analysis/calculator" className="tv-btn-calc">Use in Trade Calculator</Link>
            {canProceed && (
              <button type="button" className="tv-btn-save" onClick={() => setShowTradeForm(true)} disabled={saving}>
                {saving ? 'Saving…' : 'Save trade'}
              </button>
            )}
          </div>
        </div>

        {/* Collapsible Trade details for Save */}
        {showTradeForm && (
          <section className="tv-trade-form-block">
            <div className="tv-trade-form-header">
              <h3>Trade details (for Save trade)</h3>
              <button type="button" className="tv-close-btn" onClick={() => setShowTradeForm(false)} aria-label="Close">×</button>
            </div>
            <div className="trade-validator-form-grid">
              <div className="trade-validator-field full">
                <label>Pair</label>
                <select value={form.pair} onChange={(e) => setForm((f) => ({ ...f, pair: e.target.value }))}>
                  {PAIRS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div className="trade-validator-field">
                <label>Direction</label>
                <select value={form.direction} onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value }))}>
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                </select>
              </div>
              <div className="trade-validator-field">
                <label>Balance</label>
                <input type="number" min="1" value={form.accountBalance} onChange={(e) => setForm((f) => ({ ...f, accountBalance: e.target.value }))} />
              </div>
              <div className="trade-validator-field">
                <label>Risk %</label>
                <input type="number" min="0.1" step="0.1" value={form.riskPercent} onChange={(e) => setForm((f) => ({ ...f, riskPercent: e.target.value }))} />
              </div>
              <div className="trade-validator-field">
                <label>Entry</label>
                <input type="number" step="0.00001" value={form.entryPrice} onChange={(e) => setForm((f) => ({ ...f, entryPrice: e.target.value }))} />
              </div>
              <div className="trade-validator-field">
                <label>Stop loss</label>
                <input type="number" step="0.00001" value={form.stopLoss} onChange={(e) => setForm((f) => ({ ...f, stopLoss: e.target.value }))} />
              </div>
              <div className="trade-validator-field">
                <label>Take profit</label>
                <input type="number" step="0.00001" value={form.takeProfit} onChange={(e) => setForm((f) => ({ ...f, takeProfit: e.target.value }))} />
              </div>
            </div>
            <div className="trade-validator-computed">
              <p><strong>Risk amount:</strong> ${riskAmount.toFixed(2)}</p>
              <p><strong>Position size:</strong> {positionSize.toFixed(2)} lots — <strong>R:R</strong> 1:{rr}</p>
            </div>
            <div className="trade-validator-field full">
              <label>Notes (optional)</label>
              <input type="text" placeholder="Trade notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="tv-trade-form-actions">
              <button type="button" className="trade-validator-btn trade-validator-btn-primary" onClick={handleSaveTrade} disabled={saving}>
                {saving ? 'Saving…' : 'Save trade'}
              </button>
              <button type="button" className="tv-close-btn" onClick={() => setShowTradeForm(false)}>Cancel</button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
