import React, { useState, useEffect, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaCheckSquare } from 'react-icons/fa';
import { toast } from 'react-toastify';
import Api from '../../services/Api';
import {
  CHECKLIST_SECTIONS,
  isPatternSection,
  getSectionScore,
} from '../../lib/aura-analysis/validator/checklistSections';
import {
  CHECKLIST_TABS,
  CHECKLIST_TAB_META,
  CHECKLIST_BY_TAB,
  getMaxPointsForTab,
} from '../../lib/aura-analysis/validator/checklistTabsData';
import { getScoreLabel } from '../../lib/aura-analysis/validator/scoreCalculator';
import { getAllInstruments } from '../../lib/aura-analysis/instruments';
import { calculateRisk } from '../../lib/aura-analysis/calculators/calculateRisk';
import '../../styles/TradeValidatorView.css';

const STORAGE_KEY_CHECKED = 'aura-trade-validator-checked-by-tab';
const STORAGE_KEY_FORMATION = 'aura-trade-validator-formation-checked';

const INSTRUMENTS_LIST = getAllInstruments();

function ChecklistItemRow({ item, checked, onToggle }) {
  return (
    <label className="tv-checklist-item">
      <input type="checkbox" checked={checked.has(item.id)} onChange={() => onToggle(item.id)} />
      <span className="tv-checkmark" aria-hidden />
      <span className="tv-item-label">{item.label}</span>
      <span className="tv-item-pct">+{item.points}</span>
    </label>
  );
}

function ChecklistCard({ card, checked, onToggle }) {
  const score = card.items.reduce((s, i) => s + (checked.has(i.id) ? i.points : 0), 0);
  const max = card.items.reduce((s, i) => s + i.points, 0);
  const pct = max > 0 ? Math.round((score / max) * 100) : 0;
  return (
    <div className="tv-section-card tv-checklist-tab-card">
      <div className="tv-section-card-icon" aria-hidden />
      <h3 className="tv-section-card-title">{card.cardTitle}</h3>
      <div className="tv-section-list">
        {card.items.map((item) => (
          <ChecklistItemRow key={item.id} item={item} checked={checked} onToggle={onToggle} />
        ))}
      </div>
      <p className="tv-section-score">Section score <span className="tv-section-score-value">{pct}%</span></p>
    </div>
  );
}

/** Minimum confluence % required to submit a trade. Trade cannot go through unless checklist is filled in and score meets this. */
const MIN_CONFLUENCE_PCT = 70;

function parseCheckedByTab(raw) {
  try {
    const data = raw ? JSON.parse(raw) : null;
    if (!data || typeof data !== 'object') return { scalp: new Set(), intraDay: new Set(), swing: new Set() };
    return {
      scalp: new Set(Array.isArray(data.scalp) ? data.scalp : []),
      intraDay: new Set(Array.isArray(data.intraDay) ? data.intraDay : []),
      swing: new Set(Array.isArray(data.swing) ? data.swing : []),
    };
  } catch {
    return { scalp: new Set(), intraDay: new Set(), swing: new Set() };
  }
}

function serializeCheckedByTab(checkedByTab) {
  return JSON.stringify({
    scalp: Array.from(checkedByTab.scalp),
    intraDay: Array.from(checkedByTab.intraDay),
    swing: Array.from(checkedByTab.swing),
  });
}

export default function TradeValidatorView() {
  const location = useLocation();
  const navigate = useNavigate();
  const isEmbedded = location.pathname.startsWith('/trader-deck/trade-validator');
  const [activeTab, setActiveTab] = useState('scalp');
  const [checkedByTab, setCheckedByTab] = useState(() => {
    try {
      return parseCheckedByTab(localStorage.getItem(STORAGE_KEY_CHECKED));
    } catch {
      return { scalp: new Set(), intraDay: new Set(), swing: new Set() };
    }
  });
  const [formationChecked, setFormationChecked] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_FORMATION);
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
    pairLabel: 'EUR/USD',
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
      localStorage.setItem(STORAGE_KEY_CHECKED, serializeCheckedByTab(checkedByTab));
    } catch {}
  }, [checkedByTab]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_FORMATION, JSON.stringify(Array.from(formationChecked)));
    } catch {}
  }, [formationChecked]);

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

  const activeChecked = checkedByTab[activeTab] ?? new Set();
  const maxPointsActive = useMemo(() => getMaxPointsForTab(activeTab), [activeTab]);
  const checklistScore = useMemo(() => {
    const cards = CHECKLIST_BY_TAB[activeTab];
    if (!cards) return 0;
    return cards.reduce((sum, card) => sum + card.items.reduce((s, i) => s + (activeChecked.has(i.id) ? i.points : 0), 0), 0);
  }, [activeTab, activeChecked]);
  const scorePercent = maxPointsActive > 0 ? Math.round((checklistScore / maxPointsActive) * 100) : 0;
  /** Normalize to 0–200 scale for grade labels */
  const normalizedScore = maxPointsActive > 0 ? (checklistScore / maxPointsActive) * 200 : 0;
  const scoreGrade = getScoreLabel(Math.round(normalizedScore));
  const canProceed = scorePercent >= MIN_CONFLUENCE_PCT;

  const calcInput = useMemo(
    () => ({
      accountBalance: Number(form.accountBalance) || 0,
      riskPercent: Number(form.riskPercent) || 0,
      entry: Number(form.entryPrice) || 0,
      stop: Number(form.stopLoss) || 0,
      takeProfit: Number(form.takeProfit) || 0,
      direction: form.direction,
    }),
    [form.accountBalance, form.riskPercent, form.entryPrice, form.stopLoss, form.takeProfit, form.direction]
  );

  const calcResult = useMemo(() => calculateRisk(form.pair, calcInput), [form.pair, calcInput]);

  const riskAmount = calcResult.riskAmount;
  const positionSize = calcResult.positionSize;
  const rr = calcResult.riskReward;
  const positionUnitLabel = calcResult.positionUnitLabel || 'lots';

  const handleTabToggle = (tabId, itemId) => {
    setCheckedByTab((prev) => {
      const next = { ...prev, [tabId]: new Set(prev[tabId]) };
      const set = next[tabId];
      if (set.has(itemId)) set.delete(itemId);
      else set.add(itemId);
      return next;
    });
  };

  const handleFormationToggle = (id) => {
    setFormationChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSaveTrade = async () => {
    if (saving) return;
    if (scorePercent < MIN_CONFLUENCE_PCT) {
      toast.error(`A minimum confluence score of ${MIN_CONFLUENCE_PCT}% is required to submit a trade. Complete more checklist items.`);
      return;
    }
    const payload = {
      pair: form.pair,
      direction: form.direction,
      accountBalance: Number(form.accountBalance) || 0,
      riskPercent: Number(form.riskPercent) || 0,
      riskAmount,
      entryPrice: Number(form.entryPrice) || 0,
      stopLoss: Number(form.stopLoss) || 0,
      takeProfit: Number(form.takeProfit) || 0,
      stopLossPips: calcResult.stopDistanceAlt ?? calcResult.stopDistancePrice,
      takeProfitPips: calcResult.takeProfitDistanceAlt ?? calcResult.takeProfitDistancePrice,
      rr: Number(rr.toFixed(2)),
      positionSize,
      potentialProfit: calcResult.potentialProfit,
      potentialLoss: calcResult.potentialLoss,
      result: 'open',
      pnl: 0,
      rMultiple: 0,
      checklistScore,
      checklistTotal: maxPointsActive,
      checklistPercent: scorePercent,
      tradeGrade: scoreGrade,
      notes: (form.notes || '').trim() || null,
      assetClass: calcResult.positionUnitLabel === 'lots' ? 'forex' : (calcResult.positionUnitLabel === 'contracts' ? 'indices' : 'crypto'),
    };
    if (payload.accountBalance <= 0 || payload.entryPrice <= 0) {
      toast.error('Enter balance and entry price in Trade details');
      return;
    }
    setSaving(true);
    try {
      await Api.createAuraAnalysisTrade(payload);
      toast.success('Trade saved');
      try {
        localStorage.removeItem(STORAGE_KEY_CHECKED);
      } catch {}
      setCheckedByTab({ scalp: new Set(), intraDay: new Set(), swing: new Set() });
      setShowTradeForm(false);
      Api.getAuraAnalysisPnl().then((res) => {
        if (res?.data?.success) setPnl({ dailyPnl: res.data.dailyPnl ?? 0, weeklyPnl: res.data.weeklyPnl ?? 0, monthlyPnl: res.data.monthlyPnl ?? 0 });
      });
      navigate('/trader-deck/trade-validator/journal');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to save trade');
    } finally {
      setSaving(false);
    }
  };

  const formationSection = useMemo(() => CHECKLIST_SECTIONS.find((s) => s.id === 'setup-formation'), []);
  const setupFormationScore = useMemo(() => {
    if (!formationSection || !formationSection.subPatterns) return 0;
    const items = formationSection.subPatterns.flatMap((sub) => sub.items);
    const max = formationSection.maxPoints;
    const score = items.reduce((s, i) => s + (formationChecked.has(i.id) ? i.points : 0), 0);
    return max > 0 ? Math.round((score / max) * 100) : 0;
  }, [formationSection, formationChecked]);

  const meta = CHECKLIST_TAB_META[activeTab] || {};
  const tabCards = CHECKLIST_BY_TAB[activeTab] || [];

  const handlePairChange = (e) => {
    const v = e.target.value;
    const inst = INSTRUMENTS_LIST.find((x) => x.symbol === v) || INSTRUMENTS_LIST[0];
    setForm((f) => ({ ...f, pair: v, pairLabel: inst.displayName }));
  };

  return (
    <div className={`trade-validator-page ${isEmbedded ? 'trade-validator-embedded' : ''}`}>
      <div className="trade-validator-inner tv-new-layout">
        {!isEmbedded && (
          <Link to="/trader-deck" className="trade-validator-back">
            <FaArrowLeft aria-hidden /> Back to Trader Desk
          </Link>
        )}

        {!isEmbedded && (
          <header className="tv-header">
            <h1 className="tv-title"><FaCheckSquare className="tv-title-icon" aria-hidden /> Trade Validator</h1>
            <p className="tv-subtitle">Confluence scoring engine confirms your setup before execution.</p>
          </header>
        )}

        <div className="tv-tab-row" role="tablist" aria-label="Execution style">
          {CHECKLIST_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`tv-tab-btn ${activeTab === tab.id ? 'tv-tab-btn-active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <section className="tv-score-card">
          <div className="tv-score-left">
            <span className="tv-score-label">Trade Score</span>
            <span className="tv-score-value">{checklistScore} / {maxPointsActive} ({scorePercent}%)</span>
            <span className="tv-score-status">Status</span>
            <span className="tv-score-grade">{scoreGrade}</span>
          </div>
          <div className="tv-score-bar-wrap">
            <div className="tv-score-bar" style={{ width: `${scorePercent}%` }} />
          </div>
        </section>

        {formationSection && formationSection.subPatterns && (
          <section className="tv-block tv-setup-block">
            <h2 className="tv-block-title">SETUP FORMATION CHECKLIST</h2>
            <p className="tv-block-sub">Supporting confirmation, not primary</p>
            <div className="tv-setup-chart" aria-hidden />
            <div className="tv-setup-section">
              <h3 className="tv-setup-section-title">{formationSection.title}</h3>
              <p className="tv-setup-section-time">Timeframes: {formationSection.timeframeLabel}</p>
              {formationSection.subPatterns.map((sub) => (
                <div key={sub.id} className="tv-setup-cat">
                  <h4 className="tv-setup-cat-name">{sub.title}</h4>
                  {sub.items.map((item) => (
                    <ChecklistItemRow key={item.id} item={item} checked={formationChecked} onToggle={handleFormationToggle} />
                  ))}
                </div>
              ))}
              <p className="tv-setup-section-score">Section score <span className="tv-section-score-value">{setupFormationScore}%</span></p>
            </div>
          </section>
        )}

        <section className="tv-block tv-checklist-tab-content">
          <h2 className="tv-block-title">{meta.title}</h2>
          <p className="tv-block-sub">{meta.subtitle}</p>
          <div className="tv-cards-grid tv-checklist-tab-cards">
            {tabCards.map((card) => (
              <ChecklistCard
                key={card.id}
                card={card}
                checked={activeChecked}
                onToggle={(itemId) => handleTabToggle(activeTab, itemId)}
              />
            ))}
          </div>
        </section>

        <div className="tv-bottom-bar">
          <div className={`tv-bottom-msg ${canProceed ? 'tv-bottom-msg-ok' : ''}`}>
            {canProceed ? `Score meets minimum requirement (${MIN_CONFLUENCE_PCT}%).` : 'Complete the checklist to save a trade.'}
          </div>
          <div className="tv-bottom-actions">
            <Link to="/trader-deck/trade-validator/calculator" className="tv-btn-calc">Use in Trade Calculator</Link>
            <button type="button" className="tv-btn-save" onClick={() => setShowTradeForm(true)} disabled={saving}>
              {saving ? 'Saving…' : 'Save trade'}
            </button>
          </div>
        </div>

        {showTradeForm && (
          <section className="tv-trade-form-block">
            <div className="tv-trade-form-header">
              <h3>Trade details (for Save trade)</h3>
              <button type="button" className="tv-close-btn" onClick={() => setShowTradeForm(false)} aria-label="Close">×</button>
            </div>
            <div className="trade-validator-form-grid">
              <div className="trade-validator-field full">
                <label>Pair</label>
                <select value={form.pair} onChange={handlePairChange}>
                  {INSTRUMENTS_LIST.map((inst) => (
                    <option key={inst.symbol} value={inst.symbol}>{inst.symbol} — {inst.displayName}</option>
                  ))}
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
              <p><strong>Position size:</strong> {(positionUnitLabel === 'lots' || positionUnitLabel === 'units') ? positionSize.toFixed(2) : Math.round(positionSize)} {positionUnitLabel} — <strong>R:R</strong> 1:{rr.toFixed(2)}</p>
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
