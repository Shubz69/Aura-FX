import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaCheckSquare, FaImage } from 'react-icons/fa';
import { toast } from 'react-toastify';
import {
  CHECKLIST_TABS,
  CHECKLIST_TAB_META,
  CHECKLIST_BY_TAB,
  getMaxPointsForTab,
} from '../../lib/aura-analysis/validator/checklistTabsData';
import { CHECKLIST_SECTIONS, getSectionScore } from '../../lib/aura-analysis/validator/checklistSections';
import { getScoreLabel } from '../../lib/aura-analysis/validator/scoreCalculator';
import { VALIDATOR_CHECKLIST_PENDING_KEY } from '../../lib/aura-analysis/validator/validatorChecklistStorage';
import '../../styles/TradeValidatorView.css';

const STORAGE_KEY_CHECKED = 'aura-trade-validator-checked-by-tab';
const STORAGE_KEY_FORMATION = 'aura-trade-validator-formation-checked';
const MIN_CONFLUENCE_PCT = 70;

function ChecklistItemRow({ item, checked, onToggle, onExampleOpen }) {
  const hasImg = Boolean(item.exampleImageSrc);
  return (
    <div className="tv-checklist-item">
      <label className="tv-checklist-item-main">
        <input type="checkbox" checked={checked.has(item.id)} onChange={() => onToggle(item.id)} />
        <span className="tv-checkmark" aria-hidden />
        <span className="tv-item-label">{item.label}</span>
      </label>
      <button
        type="button"
        className={`tv-example-thumb ${hasImg ? 'tv-example-thumb--has-img' : 'tv-example-thumb--empty'}`}
        onClick={() =>
          onExampleOpen({
            src: item.exampleImageSrc || null,
            label: item.label,
          })
        }
        aria-label={hasImg ? `Enlarge example image for: ${item.label}` : `Example image placeholder for: ${item.label}`}
        title={hasImg ? 'View example' : 'Example image (add file later)'}
      >
        {hasImg ? (
          <img src={item.exampleImageSrc} alt="" className="tv-example-thumb-img" loading="lazy" />
        ) : (
          <FaImage className="tv-example-thumb-icon" aria-hidden />
        )}
      </button>
      <span className="tv-item-pct">+{item.points}</span>
    </div>
  );
}

function ChecklistCard({ card, checked, onToggle, onExampleOpen }) {
  const score = card.items.reduce((s, i) => s + (checked.has(i.id) ? i.points : 0), 0);
  const max = card.items.reduce((s, i) => s + i.points, 0);
  const pct = max > 0 ? Math.round((score / max) * 100) : 0;
  return (
    <div className="tv-section-card tv-checklist-tab-card">
      <div className="tv-section-card-icon" aria-hidden />
      <h3 className="tv-section-card-title">{card.cardTitle}</h3>
      <div className="tv-section-list">
        {card.items.map((item) => (
          <ChecklistItemRow
            key={item.id}
            item={item}
            checked={checked}
            onToggle={onToggle}
            onExampleOpen={onExampleOpen}
          />
        ))}
      </div>
      <p className="tv-section-score">Section score <span className="tv-section-score-value">{pct}%</span></p>
    </div>
  );
}

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
  const below70WarnedRef = useRef(false);

  const [activeTab, setActiveTab] = useState('scalp');
  const [checkedByTab, setCheckedByTab] = useState(() => {
    try {
      return parseCheckedByTab(localStorage.getItem(STORAGE_KEY_CHECKED));
    } catch {
      return { scalp: new Set(), intraDay: new Set(), swing: new Set() };
    }
  });
  const [exampleOverlay, setExampleOverlay] = useState(null);

  const openExample = useCallback((payload) => {
    setExampleOverlay(payload);
  }, []);

  const closeExample = useCallback(() => setExampleOverlay(null), []);

  useEffect(() => {
    if (!exampleOverlay) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') closeExample();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [exampleOverlay, closeExample]);

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

  const activeChecked = checkedByTab[activeTab] ?? new Set();
  const maxPointsActive = useMemo(() => getMaxPointsForTab(activeTab), [activeTab]);
  const checklistScore = useMemo(() => {
    const cards = CHECKLIST_BY_TAB[activeTab];
    if (!cards) return 0;
    return cards.reduce((sum, card) => sum + card.items.reduce((s, i) => s + (activeChecked.has(i.id) ? i.points : 0), 0), 0);
  }, [activeTab, activeChecked]);
  const scorePercent = maxPointsActive > 0 ? Math.round((checklistScore / maxPointsActive) * 100) : 0;
  const canProceed = scorePercent >= MIN_CONFLUENCE_PCT;

  useEffect(() => {
    if (scorePercent >= MIN_CONFLUENCE_PCT) below70WarnedRef.current = false;
  }, [scorePercent]);

  const formationSection = useMemo(() => CHECKLIST_SECTIONS.find((s) => s.id === 'setup-formation'), []);
  const formationMax = 100;
  const setupFormationScore = useMemo(() => {
    if (!formationSection || !formationSection.subPatterns) return 0;
    const score = getSectionScore(formationSection, formationChecked);
    return formationMax > 0 ? Math.round((score / formationMax) * 100) : 0;
  }, [formationSection, formationChecked]);

  // Combined score: execution (0-100) + setup formation bonus (0-100) = 0-200
  const combinedScore = scorePercent + setupFormationScore;
  const scoreGrade = getScoreLabel(combinedScore);

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

  const pushPendingAndNavigate = () => {
    try {
      sessionStorage.setItem(
        VALIDATOR_CHECKLIST_PENDING_KEY,
        JSON.stringify({
          checklistScore,
          checklistTotal: maxPointsActive,
          checklistPercent: scorePercent,
          setupFormationScore,
          combinedScore,
          sessionType: activeTab,
          tradeGrade: scoreGrade,
        })
      );
    } catch (e) {
      console.warn(e);
    }
    navigate('/trader-deck/trade-validator/calculator');
  };

  const handleSaveTradeNav = () => {
    pushPendingAndNavigate();
    toast.info('Enter your trade details on the Trade Calculator, then save to your journal.');
  };

  const handleUseTradeCalculator = () => {
    if (scorePercent >= MIN_CONFLUENCE_PCT) {
      pushPendingAndNavigate();
      return;
    }
    if (!below70WarnedRef.current) {
      toast.warning(
        `Your execution checklist is ${scorePercent}% — below the recommended ${MIN_CONFLUENCE_PCT}%. Click "Use trade calculator" again to continue anyway.`
      );
      below70WarnedRef.current = true;
      return;
    }
    below70WarnedRef.current = false;
    pushPendingAndNavigate();
  };

  const meta = CHECKLIST_TAB_META[activeTab] || {};
  const tabCards = CHECKLIST_BY_TAB[activeTab] || [];

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
            <h1 className="tv-title">
              <FaCheckSquare className="tv-title-icon" aria-hidden /> Trade Validator
            </h1>
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
            <span className="tv-score-label">Trade score</span>
            <span className="tv-score-value tv-score-pct-main">{combinedScore}%</span>
            <span className="tv-score-sub">
              {checklistScore} / {maxPointsActive} pts · {CHECKLIST_TABS.find((t) => t.id === activeTab)?.label}
              {setupFormationScore > 0 && (
                <span className="tv-score-bonus"> + {setupFormationScore}% setup bonus</span>
              )}
            </span>
            <span className="tv-score-status">Status</span>
            <span className="tv-score-grade">{scoreGrade}</span>
          </div>
          <div className="tv-score-bar-wrap">
            <div className="tv-score-bar" style={{ width: `${Math.min(combinedScore / 2, 100)}%` }} />
          </div>
        </section>

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
                onExampleOpen={openExample}
              />
            ))}
          </div>
        </section>

        {formationSection && formationSection.subPatterns && (
          <section className="tv-block tv-setup-block">
            <h2 className="tv-block-title">SETUP FORMATION CHECKLIST</h2>
            <p className="tv-block-sub">Adds bonus points on top of your execution score · max +100%</p>
            <div className="tv-setup-chart" aria-hidden />
            <div className="tv-setup-section">
              <h3 className="tv-setup-section-title">{formationSection.title}</h3>
              <p className="tv-setup-section-time">Timeframes: {formationSection.timeframeLabel}</p>
              {formationSection.subPatterns.map((sub) => (
                <div key={sub.id} className="tv-setup-cat">
                  <h4 className="tv-setup-cat-name">{sub.title}</h4>
                  {sub.items.map((item) => (
                    <ChecklistItemRow
                      key={item.id}
                      item={item}
                      checked={formationChecked}
                      onToggle={handleFormationToggle}
                      onExampleOpen={openExample}
                    />
                  ))}
                </div>
              ))}
              <p className="tv-setup-section-score">
                Setup bonus <span className="tv-section-score-value">+{setupFormationScore}%</span>
              </p>
            </div>
          </section>
        )}

        {exampleOverlay && (
          <div
            className="tv-example-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label="Example image"
            onClick={closeExample}
          >
            <button type="button" className="tv-example-lightbox-close" onClick={closeExample} aria-label="Close">
              ×
            </button>
            <div className="tv-example-lightbox-inner" onClick={(e) => e.stopPropagation()}>
              {exampleOverlay.src ? (
                <img src={exampleOverlay.src} alt={exampleOverlay.label} className="tv-example-lightbox-img" />
              ) : (
                <div className="tv-example-lightbox-placeholder">
                  <FaImage className="tv-example-lightbox-placeholder-icon" aria-hidden />
                  <p>No example image for this line yet.</p>
                  <p className="tv-example-lightbox-hint">
                    When an image is added, it will show here full size so traders can see what this checklist item refers to.
                  </p>
                </div>
              )}
              <p className="tv-example-lightbox-caption">{exampleOverlay.label}</p>
            </div>
          </div>
        )}

        <div className="tv-bottom-bar">
          <div className={`tv-bottom-msg ${canProceed ? 'tv-bottom-msg-ok' : ''}`}>
            {canProceed
              ? `Score is at or above ${MIN_CONFLUENCE_PCT}%. You can use the Trade Calculator.`
              : `Reach ${MIN_CONFLUENCE_PCT}%+ for the recommended threshold — or use the calculator after a second click on the blue button.`}
          </div>
          <div className="tv-bottom-actions">
            <button type="button" className="tv-btn-save" onClick={handleSaveTradeNav}>
              Save trade
            </button>
            <button type="button" className="tv-btn-calc" onClick={handleUseTradeCalculator}>
              Use trade calculator
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
