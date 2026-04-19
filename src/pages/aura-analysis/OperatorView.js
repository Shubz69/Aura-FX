import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { FaArrowLeft, FaCheckSquare, FaImage, FaPlus, FaTimes } from 'react-icons/fa';
import { toast } from 'react-toastify';
import {
  CHECKLIST_TABS,
  CHECKLIST_TAB_META,
  CHECKLIST_BY_TAB,
  getExecutionTabMaxForUserItems,
  getExecutionTabEarnedScore,
} from '../../lib/aura-analysis/validator/checklistTabsData';
import { CHECKLIST_SECTIONS, getSetupFormationSubTemplates } from '../../lib/aura-analysis/validator/checklistSections';
import { allocateEvenPointsById, sumCheckedPoints } from '../../lib/aura-analysis/validator/checklistAllocate';
import { getScoreLabel } from '../../lib/aura-analysis/validator/scoreCalculator';
import {
  VALIDATOR_CHECKLIST_PENDING_KEY,
  TV_V3_CHECKED_KEY,
  TV_V3_FORMATION_CHECKED_KEY,
} from '../../lib/aura-analysis/validator/validatorChecklistStorage';
import AiChartCheckTab from './AiChartCheckTab';
import { OPERATOR_BASE as TV_BASE, PLAYBOOK_MISSED_REVIEW_PATH } from '../../lib/trader-playbook/playbookPaths';
import '../../styles/TraderPlaybookTerminalTokens.css';
import '../../styles/OperatorView.css';

const STORAGE_ITEMS = 'aura-tv-v3-items';
const STORAGE_CHECKED = TV_V3_CHECKED_KEY;
const STORAGE_FORMATION_ITEMS = 'aura-tv-v3-formation-items';
const STORAGE_FORMATION_CHECKED = TV_V3_FORMATION_CHECKED_KEY;
const MIN_CONFLUENCE_PCT = 70;

function newRowId() {
  return `tv-row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildEmptyItemsByTab() {
  const o = {};
  for (const tab of CHECKLIST_TABS) {
    o[tab.id] = {};
    for (const card of CHECKLIST_BY_TAB[tab.id]) {
      o[tab.id][card.id] = [];
    }
  }
  return o;
}

function buildEmptyFormationItems() {
  const o = {};
  getSetupFormationSubTemplates().forEach((sub) => {
    o[sub.id] = [];
  });
  return o;
}

function parseItemsByTab(raw) {
  try {
    const data = raw ? JSON.parse(raw) : null;
    const empty = buildEmptyItemsByTab();
    if (!data || typeof data !== 'object') return empty;
    for (const tab of CHECKLIST_TABS) {
      const tabObj = data[tab.id];
      if (!tabObj || typeof tabObj !== 'object') continue;
      for (const card of CHECKLIST_BY_TAB[tab.id]) {
        const arr = tabObj[card.id];
        if (!Array.isArray(arr)) continue;
        empty[tab.id][card.id] = arr
          .filter((row) => row && typeof row.label === 'string' && row.id)
          .map((row) => ({
            id: String(row.id),
            label: String(row.label),
            ...(row.exampleImageSrc ? { exampleImageSrc: row.exampleImageSrc } : {}),
          }));
      }
    }
    return empty;
  } catch {
    return buildEmptyItemsByTab();
  }
}

function parseFormationItems(raw) {
  try {
    const data = raw ? JSON.parse(raw) : null;
    const empty = buildEmptyFormationItems();
    if (!data || typeof data !== 'object') return empty;
    getSetupFormationSubTemplates().forEach((sub) => {
      const arr = data[sub.id];
      if (!Array.isArray(arr)) return;
      empty[sub.id] = arr
        .filter((row) => row && typeof row.label === 'string' && row.id)
        .map((row) => ({
          id: String(row.id),
          label: String(row.label),
          ...(row.exampleImageSrc ? { exampleImageSrc: row.exampleImageSrc } : {}),
        }));
    });
    return empty;
  } catch {
    return buildEmptyFormationItems();
  }
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

function labelsInCard(items) {
  return new Set(items.map((i) => i.label.trim().toLowerCase()).filter(Boolean));
}

function TemplatePickerModal({ sectionTitle, templateRows, existingLabels, onClose, onConfirm }) {
  const [picked, setPicked] = useState(() => new Set(templateRows.map((_, i) => i)));

  const toggle = (idx) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const addRowsForIndices = (indices) => {
    const toAdd = [];
    const ex = new Set(existingLabels);
    for (const idx of indices) {
      const row = templateRows[idx];
      if (!row) continue;
      const key = row.label.trim().toLowerCase();
      if (key && ex.has(key)) continue;
      if (key) ex.add(key);
      toAdd.push({
        id: newRowId(),
        label: row.label,
        ...(row.exampleImageSrc ? { exampleImageSrc: row.exampleImageSrc } : {}),
      });
    }
    if (toAdd.length) onConfirm(toAdd);
    onClose();
  };

  const handleAddAll = () => {
    const ex = new Set(existingLabels);
    const indices = templateRows.map((_, i) => i).filter((i) => {
      const key = templateRows[i].label.trim().toLowerCase();
      return key && !ex.has(key);
    });
    addRowsForIndices(indices);
  };

  const handleAddSelected = () => {
    const indices = Array.from(picked).sort((a, b) => a - b);
    addRowsForIndices(indices);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const modal = (
    <div className="tv-modal-overlay" role="presentation" onClick={onClose}>
      <div className="tv-modal" role="dialog" aria-labelledby="tv-template-modal-title" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="tv-modal-close" onClick={onClose} aria-label="Close">
          <FaTimes />
        </button>
        <h2 id="tv-template-modal-title" className="tv-modal-title">
          Aura template · {sectionTitle}
        </h2>
        <p className="tv-modal-sub">Select lines to add, or add every template line at once.</p>
        <ul className="tv-template-list">
          {templateRows.map((row, idx) => (
            <li key={`${row.label}-${idx}`} className="tv-template-row">
              <label className="tv-template-label">
                <input type="checkbox" checked={picked.has(idx)} onChange={() => toggle(idx)} />
                <span>{row.label}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="tv-modal-actions">
          <button type="button" className="tv-modal-btn tv-modal-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="tv-modal-btn tv-modal-btn--secondary" onClick={handleAddSelected}>
            Save selection
          </button>
          <button type="button" className="tv-modal-btn tv-modal-btn--primary" onClick={handleAddAll}>
            Save all lines
          </button>
        </div>
      </div>
    </div>
  );
  if (typeof document === 'undefined') return null;
  return createPortal(modal, document.body);
}

function CustomLineModal({ sectionTitle, onClose, onAdd }) {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const submit = () => {
    const label = value.trim();
    if (!label) {
      toast.info('Enter a checklist line first.');
      return;
    }
    onAdd({ id: newRowId(), label });
    onClose();
  };

  const modal = (
    <div className="tv-modal-overlay" role="presentation" onClick={onClose}>
      <div className="tv-modal tv-modal--narrow" role="dialog" aria-labelledby="tv-custom-modal-title" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="tv-modal-close" onClick={onClose} aria-label="Close">
          <FaTimes />
        </button>
        <h2 id="tv-custom-modal-title" className="tv-modal-title">
          Your line · {sectionTitle}
        </h2>
        <p className="tv-modal-sub">Write a single rule or reminder for this checklist section.</p>
        <input
          ref={inputRef}
          className="tv-modal-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="e.g. Wait for London open volatility to settle"
          maxLength={240}
        />
        <div className="tv-modal-actions">
          <button type="button" className="tv-modal-btn tv-modal-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="tv-modal-btn tv-modal-btn--primary" onClick={submit}>
            Save line
          </button>
        </div>
      </div>
    </div>
  );
  if (typeof document === 'undefined') return null;
  return createPortal(modal, document.body);
}

function SectionAddButton({ onCustom, onTemplate, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="tv-section-add-wrap" ref={wrapRef}>
      <button
        type="button"
        className="tv-section-add-plus"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        <FaPlus aria-hidden />
      </button>
      {open && (
        <div className="tv-section-add-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="tv-section-add-menu-item"
            onClick={() => {
              setOpen(false);
              onCustom();
            }}
          >
            Add your line
          </button>
          <button
            type="button"
            role="menuitem"
            className="tv-section-add-menu-item"
            onClick={() => {
              setOpen(false);
              onTemplate();
            }}
          >
            Use Aura template…
          </button>
        </div>
      )}
    </div>
  );
}

function ChecklistItemRow({ item, checked, points, onToggle, onExampleOpen, onRemove }) {
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
        title={hasImg ? 'View example' : 'Example image (optional)'}
      >
        {hasImg ? (
          <img src={item.exampleImageSrc} alt="" className="tv-example-thumb-img" loading="lazy" />
        ) : (
          <FaImage className="tv-example-thumb-icon" aria-hidden />
        )}
      </button>
      <span className="tv-item-pct">+{points}</span>
      {onRemove && (
        <button type="button" className="tv-item-remove" onClick={() => onRemove(item.id)} aria-label={`Remove: ${item.label}`}>
          <FaTimes aria-hidden />
        </button>
      )}
    </div>
  );
}

function ChecklistCard({
  cardMeta,
  items,
  cardBudget,
  checked,
  onToggle,
  onExampleOpen,
  templateSourceItems,
  onAppendItems,
  onRemoveItem,
}) {
  const pmap = useMemo(() => allocateEvenPointsById(items, cardBudget), [items, cardBudget]);
  const earned = useMemo(
    () => items.reduce((s, i) => s + (checked.has(i.id) ? pmap[i.id] || 0 : 0), 0),
    [items, checked, pmap],
  );
  const pct = cardBudget > 0 && items.length > 0 ? Math.round((earned / cardBudget) * 100) : 0;
  const existingLabels = useMemo(() => labelsInCard(items), [items]);

  const [templateOpen, setTemplateOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);

  return (
    <div className="tv-section-card tv-checklist-tab-card">
      <div className="tv-section-card-head">
        <div className="tv-section-card-head-text">
          <div className="tv-section-card-icon" aria-hidden />
          <h3 className="tv-section-card-title">{cardMeta.cardTitle}</h3>
        </div>
        <SectionAddButton
          ariaLabel={`Add checklist lines to ${cardMeta.cardTitle}`}
          onCustom={() => setCustomOpen(true)}
          onTemplate={() => setTemplateOpen(true)}
        />
      </div>
      <p className="tv-section-card-hint">Use + to add your own lines or load Aura&apos;s template (all or pick specific lines).</p>
      {items.length === 0 ? (
        <div className="tv-checklist-empty">
          <span className="tv-checklist-empty-title">No lines yet</span>
          <span className="tv-checklist-empty-text">This section stays blank until you build your checklist.</span>
        </div>
      ) : (
        <div className="tv-section-list">
          {items.map((item) => (
            <ChecklistItemRow
              key={item.id}
              item={item}
              checked={checked}
              points={pmap[item.id] || 0}
              onToggle={onToggle}
              onExampleOpen={onExampleOpen}
              onRemove={onRemoveItem}
            />
          ))}
        </div>
      )}
      <p className="tv-section-score">
        Section score <span className="tv-section-score-value">{items.length ? `${pct}%` : '—'}</span>
      </p>

      {templateOpen && (
        <TemplatePickerModal
          sectionTitle={cardMeta.cardTitle}
          templateRows={templateSourceItems.map((t) => ({
            label: t.label,
            ...(t.exampleImageSrc ? { exampleImageSrc: t.exampleImageSrc } : {}),
          }))}
          existingLabels={existingLabels}
          onClose={() => setTemplateOpen(false)}
          onConfirm={(rows) => onAppendItems(rows)}
        />
      )}
      {customOpen && (
        <CustomLineModal
          sectionTitle={cardMeta.cardTitle}
          onClose={() => setCustomOpen(false)}
          onAdd={(row) => onAppendItems([row])}
        />
      )}
    </div>
  );
}

function FormationSubBlock({
  subMeta,
  items,
  checked,
  onToggle,
  onExampleOpen,
  onAppendItems,
  onRemoveItem,
}) {
  const budget = subMeta.budget;
  const pmap = useMemo(() => allocateEvenPointsById(items, budget), [items, budget]);
  const earned = useMemo(
    () => items.reduce((s, i) => s + (checked.has(i.id) ? pmap[i.id] || 0 : 0), 0),
    [items, checked, pmap],
  );
  const pct = budget > 0 && items.length > 0 ? Math.round((earned / budget) * 100) : 0;
  const existingLabels = useMemo(() => labelsInCard(items), [items]);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);

  return (
    <div className="tv-setup-cat">
      <div className="tv-setup-cat-head">
        <h4 className="tv-setup-cat-name">{subMeta.title}</h4>
        <SectionAddButton
          ariaLabel={`Add checklist lines to ${subMeta.title}`}
          onCustom={() => setCustomOpen(true)}
          onTemplate={() => setTemplateOpen(true)}
        />
      </div>
      <p className="tv-setup-cat-hint">Pattern-specific checks — add yours or pull from the Aura template.</p>
      {items.length === 0 ? (
        <div className="tv-checklist-empty tv-checklist-empty--compact">
          <span className="tv-checklist-empty-text">Empty · use + to add lines.</span>
        </div>
      ) : (
        items.map((item) => (
          <ChecklistItemRow
            key={item.id}
            item={item}
            checked={checked}
            points={pmap[item.id] || 0}
            onToggle={onToggle}
            onExampleOpen={onExampleOpen}
            onRemove={onRemoveItem}
          />
        ))
      )}
      {items.length > 0 && (
        <p className="tv-setup-sub-score">
          Sub-score <span className="tv-section-score-value">{pct}%</span>
        </p>
      )}

      {templateOpen && (
        <TemplatePickerModal
          sectionTitle={subMeta.title}
          templateRows={subMeta.templateItems}
          existingLabels={existingLabels}
          onClose={() => setTemplateOpen(false)}
          onConfirm={(rows) => onAppendItems(rows)}
        />
      )}
      {customOpen && (
        <CustomLineModal
          sectionTitle={subMeta.title}
          onClose={() => setCustomOpen(false)}
          onAdd={(row) => onAppendItems([row])}
        />
      )}
    </div>
  );
}

export default function OperatorView() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEmbedded = location.pathname.startsWith('/trader-deck/trade-validator');
  const below70WarnedRef = useRef(false);
  const replayToastRef = useRef(false);

  const [activeTab, setActiveTab] = useState('scalp');
  const [itemsByTab, setItemsByTab] = useState(() => parseItemsByTab(localStorage.getItem(STORAGE_ITEMS)));
  const [checkedByTab, setCheckedByTab] = useState(() => parseCheckedByTab(localStorage.getItem(STORAGE_CHECKED)));
  const [formationItemsBySub, setFormationItemsBySub] = useState(() =>
    parseFormationItems(localStorage.getItem(STORAGE_FORMATION_ITEMS)),
  );
  const [exampleOverlay, setExampleOverlay] = useState(null);

  const formationSubTemplates = useMemo(() => getSetupFormationSubTemplates(), []);
  const formationSection = useMemo(() => CHECKLIST_SECTIONS.find((s) => s.id === 'setup-formation'), []);

  const openExample = useCallback((payload) => {
    setExampleOverlay(payload);
  }, []);

  const closeExample = useCallback(() => setExampleOverlay(null), []);

  const fromTraderLabNotified = useRef(false);
  useEffect(() => {
    if (!location.state?.fromTraderLab || fromTraderLabNotified.current) return;
    fromTraderLabNotified.current = true;
    toast.info(
      'Trader Lab plan saved. Complete this checklist, then use the Trade Calculator — your thesis notes will carry over.'
    );
  }, [location.state?.fromTraderLab]);

  useEffect(() => {
    const tab = searchParams.get('tvChecklistTab');
    if (tab && ['scalp', 'intraDay', 'swing'].includes(tab)) {
      setActiveTab(tab);
    }
    if (searchParams.get('trFromReplay') === '1' && !replayToastRef.current) {
      replayToastRef.current = true;
      toast.info(
        'Context from Trader Replay — checklist tab matches your replay timeframe when available. Use your replay notes alongside each line.'
      );
    }
  }, [searchParams]);

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
      const raw = localStorage.getItem(STORAGE_FORMATION_CHECKED);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_ITEMS, JSON.stringify(itemsByTab));
    } catch {}
  }, [itemsByTab]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CHECKED, serializeCheckedByTab(checkedByTab));
    } catch {}
  }, [checkedByTab]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_FORMATION_ITEMS, JSON.stringify(formationItemsBySub));
    } catch {}
  }, [formationItemsBySub]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_FORMATION_CHECKED, JSON.stringify(Array.from(formationChecked)));
    } catch {}
  }, [formationChecked]);

  const activeChecked = checkedByTab[activeTab] ?? new Set();
  const maxPointsActive = useMemo(() => getExecutionTabMaxForUserItems(activeTab, itemsByTab), [activeTab, itemsByTab]);
  const checklistScore = useMemo(
    () => getExecutionTabEarnedScore(activeTab, itemsByTab, activeChecked),
    [activeTab, itemsByTab, activeChecked],
  );
  const scorePercent = maxPointsActive > 0 ? Math.round((checklistScore / maxPointsActive) * 100) : 0;
  const canProceed = maxPointsActive > 0 && scorePercent >= MIN_CONFLUENCE_PCT;

  useEffect(() => {
    if (scorePercent >= MIN_CONFLUENCE_PCT) below70WarnedRef.current = false;
  }, [scorePercent]);

  const formationTotals = useMemo(() => {
    let max = 0;
    let earned = 0;
    for (const sub of formationSubTemplates) {
      const list = formationItemsBySub[sub.id] || [];
      if (list.length === 0) continue;
      max += sub.budget;
      earned += sumCheckedPoints(list, formationChecked, sub.budget);
    }
    return { max, earned };
  }, [formationSubTemplates, formationItemsBySub, formationChecked]);

  const setupFormationScore = formationTotals.max > 0 ? Math.round((formationTotals.earned / formationTotals.max) * 100) : 0;

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

  const appendExecutionRows = (tabId, cardId, rows) => {
    setItemsByTab((prev) => ({
      ...prev,
      [tabId]: {
        ...prev[tabId],
        [cardId]: [...(prev[tabId][cardId] || []), ...rows],
      },
    }));
  };

  const removeExecutionRow = (tabId, cardId, itemId) => {
    setItemsByTab((prev) => ({
      ...prev,
      [tabId]: {
        ...prev[tabId],
        [cardId]: (prev[tabId][cardId] || []).filter((i) => i.id !== itemId),
      },
    }));
    setCheckedByTab((prev) => {
      const next = { ...prev, [tabId]: new Set(prev[tabId]) };
      next[tabId].delete(itemId);
      return next;
    });
  };

  const appendFormationRows = (subId, rows) => {
    setFormationItemsBySub((prev) => ({
      ...prev,
      [subId]: [...(prev[subId] || []), ...rows],
    }));
  };

  const removeFormationRow = (subId, itemId) => {
    setFormationItemsBySub((prev) => ({
      ...prev,
      [subId]: (prev[subId] || []).filter((i) => i.id !== itemId),
    }));
    setFormationChecked((prev) => {
      const next = new Set(prev);
      next.delete(itemId);
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
    if (maxPointsActive <= 0) {
      toast.info('Add at least one checklist line in any section before saving a trade.');
      return;
    }
    pushPendingAndNavigate();
    toast.info('Enter your trade details on the Trade Calculator, then save to your journal.');
  };

  const handleUseTradeCalculator = () => {
    if (maxPointsActive <= 0) {
      toast.info('Add checklist lines in the sections above first.');
      return;
    }
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
  const executionHasAnyLines = maxPointsActive > 0;

  const bottomMsg = !executionHasAnyLines
    ? 'Add lines to your checklist with + in each section — then work toward 70%+ before the calculator.'
    : canProceed
      ? `Score is at or above ${MIN_CONFLUENCE_PCT}%. You can use the Trade Calculator.`
      : `Reach ${MIN_CONFLUENCE_PCT}%+ on the lines you added — or use the calculator after a second click on the blue button.`;

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
              <FaCheckSquare className="tv-title-icon" aria-hidden /> The Operator
            </h1>
            <p className="tv-subtitle">Confluence scoring engine confirms your setup before execution.</p>
          </header>
        )}

        {isEmbedded ? (
          <nav className="tv-flow-rail" aria-label="Playbook workspace">
            <NavLink
              to={`${TV_BASE}/trader-playbook`}
              className={({ isActive }) => `tv-flow-rail__link${isActive ? ' tv-flow-rail__link--active' : ''}`}
            >
              Playbook
            </NavLink>
            <span className="tv-flow-rail__sep" aria-hidden>
              →
            </span>
            <NavLink
              end
              to={`${TV_BASE}/checklist`}
              className={({ isActive }) => `tv-flow-rail__link${isActive ? ' tv-flow-rail__link--active' : ''}`}
            >
              Checklist
            </NavLink>
            <span className="tv-flow-rail__sep" aria-hidden>
              →
            </span>
            <NavLink
              to={`${TV_BASE}/calculator`}
              className={({ isActive }) => `tv-flow-rail__link${isActive ? ' tv-flow-rail__link--active' : ''}`}
            >
              Calculator
            </NavLink>
            <span className="tv-flow-rail__sep" aria-hidden>
              →
            </span>
            <NavLink
              to={PLAYBOOK_MISSED_REVIEW_PATH}
              className={({ isActive }) => `tv-flow-rail__link${isActive ? ' tv-flow-rail__link--active' : ''}`}
            >
              Missed review
            </NavLink>
          </nav>
        ) : null}

        <div className="tv-checklist-topdeck">
          <div className="tv-checklist-topdeck__tabs">
            <div className="tv-tab-rail">
              <div className="tv-tab-row tv-tab-row--segmented" role="tablist" aria-label="Execution style">
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
            </div>
          </div>

          <section className="tv-score-card tv-score-card--compact" aria-label="Confluence score">
            <div className="tv-score-left">
              <span className="tv-score-label">Trade score</span>
              <div className="tv-score-pct-row">
                <span className="tv-score-value tv-score-pct-main">{combinedScore}%</span>
                <span className="tv-score-grade tv-score-grade--inline">{scoreGrade}</span>
              </div>
              <span className="tv-score-sub">
                {executionHasAnyLines ? (
                  <>
                    {checklistScore} / {maxPointsActive} pts · {CHECKLIST_TABS.find((t) => t.id === activeTab)?.label}
                  </>
                ) : (
                  <>Add checklist lines to start scoring · {CHECKLIST_TABS.find((t) => t.id === activeTab)?.label}</>
                )}
                {setupFormationScore > 0 && <span className="tv-score-bonus"> + {setupFormationScore}% setup</span>}
              </span>
            </div>
            <div className="tv-score-bar-wrap" role="presentation">
              <div className="tv-score-bar" style={{ width: `${Math.min(combinedScore / 2, 100)}%` }} />
            </div>
          </section>
        </div>

        <section className="tv-block tv-checklist-tab-content tv-checklist-body">
          <header className="tv-checklist-section-head">
            <h2 className="tv-block-title">{meta.title}</h2>
            <p className="tv-block-sub">{meta.subtitle}</p>
            <p className="tv-checklist-intro">
              Each block starts empty. Use the <strong>+</strong> on a section to add your own line or open the Aura template (add everything, or pick only the lines you want).
            </p>
          </header>
          <div className="tv-cards-grid tv-checklist-tab-cards">
            {tabCards.map((card) => {
              const items = itemsByTab[activeTab][card.id] || [];
              const cardBudget = card.items.reduce((s, i) => s + i.points, 0);
              return (
                <ChecklistCard
                  key={card.id}
                  cardMeta={{ id: card.id, cardTitle: card.cardTitle }}
                  items={items}
                  cardBudget={cardBudget}
                  checked={activeChecked}
                  onToggle={(itemId) => handleTabToggle(activeTab, itemId)}
                  onExampleOpen={openExample}
                  templateSourceItems={card.items}
                  onAppendItems={(rows) => appendExecutionRows(activeTab, card.id, rows)}
                  onRemoveItem={(itemId) => removeExecutionRow(activeTab, card.id, itemId)}
                />
              );
            })}
          </div>
        </section>

        {formationSection && formationSubTemplates.length > 0 && (
          <section className="tv-block tv-setup-block">
            <h2 className="tv-block-title">SETUP FORMATION CHECKLIST</h2>
            <p className="tv-block-sub">Bonus on top of your execution score · each pattern group has its own + button</p>
            <div className="tv-setup-chart" aria-hidden />
            <div className="tv-setup-section">
              <h3 className="tv-setup-section-title">{formationSection.title}</h3>
              <p className="tv-setup-section-time">Timeframes: {formationSection.timeframeLabel}</p>
              <p className="tv-setup-intro">Start blank — add formation checks per pattern, or load Aura templates selectively.</p>
              {formationSubTemplates.map((sub) => (
                <FormationSubBlock
                  key={sub.id}
                  subMeta={sub}
                  items={formationItemsBySub[sub.id] || []}
                  checked={formationChecked}
                  onToggle={handleFormationToggle}
                  onExampleOpen={openExample}
                  onAppendItems={(rows) => appendFormationRows(sub.id, rows)}
                  onRemoveItem={(itemId) => removeFormationRow(sub.id, itemId)}
                />
              ))}
              <p className="tv-setup-section-score">
                Setup bonus <span className="tv-section-score-value">+{setupFormationScore}%</span>
              </p>
            </div>
          </section>
        )}

        <section className="tv-block tv-ai-check-embed" id="ai-chart-check">
          <h2 className="tv-block-title">AI CHART CHECK</h2>
          <p className="tv-block-sub">
            Upload your chart for an AI second opinion, then validate manually with the checklist above before execution.
          </p>
          <AiChartCheckTab embedded />
        </section>

        {exampleOverlay &&
          typeof document !== 'undefined' &&
          createPortal(
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
            </div>,
            document.body,
          )}

        <div className="tv-bottom-bar">
          <div className={`tv-bottom-msg ${canProceed ? 'tv-bottom-msg-ok' : ''}`}>{bottomMsg}</div>
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
