import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import TraderSuiteShell from '../components/TraderSuiteShell';
import { useAuth } from '../context/AuthContext';
import Api from '../services/Api';
import { formatWelcomeEyebrow } from '../utils/welcomeUser';
import { normalizeSetup, setupToPayload, DEFAULT_CHECKLIST_SECTIONS } from '../lib/trader-playbook/normalizeSetup';
import { PLAYBOOK_PRESETS } from '../lib/trader-playbook/presets';
import {
  summarizeValidatorTrades,
  summarizeJournalTrades,
  ruleBasedInsights,
  computeExecutionBreakdowns,
  summarizeMissedPatterns,
} from '../lib/trader-playbook/analyticsClient';
import { RULE_GROUPS, OVERVIEW_FIELDS, NO_SETUP_REASONS } from '../lib/trader-playbook/rulesCopy';
import '../styles/aura-analysis/AuraDashboard.css';
import '../styles/TraderPlaybookPremium.css';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'rules', label: 'Rules' },
  { id: 'checklist', label: 'Checklist' },
  { id: 'trades', label: 'Execution log' },
  { id: 'missed', label: 'Missed' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'review', label: 'Refinement' },
];

function rulesFieldPatch(form, bucket, key, value) {
  const patch = { [bucket]: { ...(form[bucket] || {}), [key]: value } };
  if (bucket === 'entryRules') {
    if (key === 'confirmationType') patch.confirmationType = value;
    if (key === 'entryTrigger') patch.entryTrigger = value;
    if (key === 'structureRequirement') patch.structureRequirement = value;
    if (key === 'checklistNotes') patch.checklistNotes = value;
  }
  if (bucket === 'exitRules') {
    if (key === 'stopPlacement') patch.stopPlacement = value;
    if (key === 'invalidationLogic') patch.invalidationLogic = value;
    if (key === 'scaleOutRule') patch.partialsRule = value;
    if (key === 'trailingRule') patch.trailingLogic = value;
    if (key === 'holdVsExit') patch.holdVsExit = value;
  }
  if (bucket === 'riskRules') {
    if (key === 'maxRiskPct') patch.maxRisk = value;
    if (key === 'positionSizingRule') patch.positionSizing = value;
  }
  return patch;
}

function fmtPct(x) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${Math.round(x * 1000) / 10}%`;
}

function fmtPF(x) {
  if (x == null || Number.isNaN(x)) return '—';
  return x >= 10 ? `${x.toFixed(1)}` : `${Math.round(x * 100) / 100}`;
}

function fmtDt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

const CHECKLIST_THRESHOLD = 0.85;

const CHECKLIST_READINESS = {
  NO_ITEMS: { label: 'No active checklist items', tone: 'muted' },
  FAILED_REQUIRED: { label: 'Not qualified — required gates still open', tone: 'bad' },
  QUALIFIED: { label: 'Qualified — proceed only with defined risk', tone: 'good' },
  BORDERLINE: { label: 'Borderline — elevated discretion', tone: 'warn' },
  WEAK: { label: 'Not ready — revisit checklist items', tone: 'bad' },
};

const WIZARD_STEP_LABELS = [
  'Basics',
  'Context & regime',
  'Trigger & entry',
  'Management & risk',
  'Avoid conditions',
  'Merge presets & finish',
];

export default function TraderPlaybook() {
  const { user } = useAuth();
  const [setups, setSetups] = useState([]);
  const [summary, setSummary] = useState(null);
  const [view, setView] = useState('hub');
  const [selectedId, setSelectedId] = useState(null);
  const [detailTab, setDetailTab] = useState('overview');
  const [form, setForm] = useState(() => normalizeSetup({}));
  const [baselineForm, setBaselineForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('updated');
  const [hubFilter, setHubFilter] = useState('all');
  const [detailMenuOpen, setDetailMenuOpen] = useState(false);
  const [reviewPrefill, setReviewPrefill] = useState(null);

  const [vTrades, setVTrades] = useState([]);
  const [jTrades, setJTrades] = useState([]);
  const [mTrades, setMTrades] = useState([]);
  const [reviewNotes, setReviewNotes] = useState([]);

  const [drawer, setDrawer] = useState(null);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardDraft, setWizardDraft] = useState(null);

  const [checklistMode, setChecklistMode] = useState('builder');
  const [checklistTick, setChecklistTick] = useState({});

  const loadCore = useCallback(async ({ showLoading = true } = {}) => {
    if (showLoading) setLoading(true);
    try {
      const [sr, sumr] = await Promise.allSettled([Api.getTraderPlaybookSetups(), Api.getTraderPlaybookSummary()]);
      if (sr.status === 'fulfilled' && sr.value?.data?.setups) {
        setSetups(sr.value.data.setups.map((s) => normalizeSetup(s)));
      } else {
        setSetups([]);
      }
      if (sumr.status === 'fulfilled' && sumr.value?.data?.summary) {
        setSummary(sumr.value.data.summary);
      } else {
        setSummary(null);
      }
    } catch {
      toast.error('Could not load playbook data');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCore();
  }, [loadCore]);

  const refreshTrades = useCallback(async () => {
    try {
      const [v, j] = await Promise.allSettled([Api.getAuraAnalysisTrades({}), Api.getJournalTrades({})]);
      if (v.status === 'fulfilled' && Array.isArray(v.value?.data?.trades)) setVTrades(v.value.data.trades);
      else setVTrades([]);
      if (j.status === 'fulfilled' && Array.isArray(j.value?.data?.trades)) setJTrades(j.value.data.trades);
      else setJTrades([]);
    } catch {
      setVTrades([]);
      setJTrades([]);
    }
  }, []);

  const loadDetailData = useCallback(
    async (playbookId) => {
      if (!playbookId) return;
      try {
        await Api.touchTraderPlaybookSetup(playbookId).catch(() => {});
        const [m, n, v, j] = await Promise.allSettled([
          Api.getTraderPlaybookMTrades({ playbookId }),
          Api.getTraderPlaybookReviewNotes(playbookId),
          Api.getAuraAnalysisTrades({}),
          Api.getJournalTrades({}),
        ]);
        if (m.status === 'fulfilled' && Array.isArray(m.value?.data?.mTrades)) setMTrades(m.value.data.mTrades);
        else setMTrades([]);
        if (n.status === 'fulfilled' && Array.isArray(n.value?.data?.notes)) setReviewNotes(n.value.data.notes);
        else setReviewNotes([]);
        if (v.status === 'fulfilled' && Array.isArray(v.value?.data?.trades)) setVTrades(v.value.data.trades);
        if (j.status === 'fulfilled' && Array.isArray(j.value?.data?.trades)) setJTrades(j.value.data.trades);
      } catch {
        toast.error('Could not load playbook detail');
      }
    },
    []
  );

  const openDetail = async (id, tab, prefill) => {
    let row = setups.find((s) => s.id === id);
    try {
      const res = await Api.getTraderPlaybookSetup(id);
      if (res?.data?.setup) {
        row = normalizeSetup(res.data.setup);
        setSetups((prev) => prev.map((s) => (s.id === id ? row : s)));
      }
    } catch {
      /* use list cache */
    }
    if (!row) return;
    setSelectedId(id);
    setForm(normalizeSetup(row));
    setBaselineForm(JSON.stringify(setupToPayload(normalizeSetup(row))));
    setDetailTab(tab || 'overview');
    setView('detail');
    setChecklistTick({});
    setDetailMenuOpen(false);
    setReviewPrefill(prefill != null ? prefill : null);
    loadDetailData(id);
  };

  const applyChange = (patch) => setForm((prev) => normalizeSetup({ ...prev, ...patch }));

  const saveSetup = async (isDraft = false) => {
    setSaving(true);
    try {
      const payload = setupToPayload(form);
      payload.status = isDraft ? 'draft' : payload.status || 'active';
      if (selectedId) {
        const res = await Api.updateTraderPlaybookSetup(selectedId, payload);
        const saved = normalizeSetup(res?.data?.setup || { ...payload, id: selectedId });
        setSetups((prev) => prev.map((item) => (item.id === selectedId ? saved : item)));
        setForm(saved);
        setBaselineForm(JSON.stringify(setupToPayload(saved)));
        toast.success(isDraft ? 'Draft saved' : 'Playbook locked in');
        await loadCore({ showLoading: false });
        loadDetailData(selectedId);
      } else {
        const res = await Api.createTraderPlaybookSetup(payload);
        const saved = normalizeSetup(res?.data?.setup || payload);
        setSetups((prev) => [saved, ...prev]);
        setSelectedId(saved.id);
        setForm(saved);
        setBaselineForm(JSON.stringify(setupToPayload(saved)));
        setView('detail');
        toast.success('Playbook created — define rules, then tag executions.');
        await loadCore({ showLoading: false });
        loadDetailData(saved.id);
      }
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const resetLocal = () => {
    if (!baselineForm) return;
    try {
      const parsed = JSON.parse(baselineForm);
      setForm(normalizeSetup(parsed));
      toast.info('Reverted local changes');
    } catch {
      toast.error('Nothing to reset');
    }
  };

  const duplicatePlaybook = async (id) => {
    try {
      const res = await Api.createTraderPlaybookSetup({ duplicateFromId: id });
      const saved = normalizeSetup(res?.data?.setup);
      setSetups((prev) => [saved, ...prev]);
      toast.success('Duplicate created');
      await loadCore({ showLoading: false });
    } catch {
      toast.error('Duplicate failed');
    }
  };

  const archivePlaybook = async (id) => {
    const row = setups.find((s) => s.id === id);
    if (!row) return;
    try {
      const payload = setupToPayload({ ...row, status: 'archived' });
      await Api.updateTraderPlaybookSetup(id, payload);
      setSetups((prev) => prev.map((s) => (s.id === id ? normalizeSetup({ ...s, status: 'archived' }) : s)));
      if (selectedId === id) {
        setForm((prev) => normalizeSetup({ ...prev, status: 'archived' }));
      }
      toast.success('Archived');
      await loadCore({ showLoading: false });
      if (selectedId === id) loadDetailData(id);
    } catch {
      toast.error('Archive failed');
    }
  };

  const deletePlaybook = async (id) => {
    if (!window.confirm('Delete this playbook permanently?')) return;
    try {
      await Api.deleteTraderPlaybookSetup(id);
      setSetups((prev) => prev.filter((s) => s.id !== id));
      if (selectedId === id) {
        setView('hub');
        setSelectedId(null);
      }
      toast.success('Deleted');
      loadCore();
    } catch {
      toast.error('Delete failed');
    }
  };

  const metricsByPlaybook = useMemo(() => {
    const m = {};
    (summary?.perPlaybook || []).forEach((p) => {
      m[p.playbookId] = p;
    });
    return m;
  }, [summary]);

  const filteredSetups = useMemo(() => {
    let list = setups.filter((s) => (s.name || '').toLowerCase().includes(search.toLowerCase()));
    const st = (s) => String(s.status || 'active').toLowerCase();
    if (hubFilter === 'active') list = list.filter((s) => st(s) !== 'draft' && st(s) !== 'archived');
    else if (hubFilter === 'draft') list = list.filter((s) => st(s) === 'draft');
    else if (hubFilter === 'archived') list = list.filter((s) => st(s) === 'archived');
    if (sortKey === 'name') list = [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else if (sortKey === 'lastUsed')
      list = [...list].sort((a, b) => String(b.lastUsedAt || '').localeCompare(String(a.lastUsedAt || '')));
    else list = [...list].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    return list;
  }, [setups, search, sortKey, hubFilter]);

  const hubStats = useMemo(() => {
    if (loading) return [];
    if (!summary) return [];
    const bs = summary.playbooksByStatus || {};
    return [
      { label: 'Playbooks', value: String(summary.playbooksTotal ?? 0) },
      { label: 'Active', value: String(bs.active ?? summary.playbooksActive ?? 0) },
      { label: 'Drafts', value: String(bs.draft ?? 0) },
      { label: 'Tagged', value: String(summary.taggedTrades ?? 0) },
      { label: 'No setup', value: String(summary.noSetupTrades ?? 0) },
      { label: 'Missed', value: String(summary.missedTrades ?? 0) },
      {
        label: 'Leading edge',
        value: summary.bestPlaybook?.name?.slice(0, 26) || '—',
        tone: 'green',
      },
      { label: 'Win rate (tagged)', value: fmtPct(summary.globalWinRate), tone: 'gold' },
      { label: 'Profit factor', value: fmtPF(summary.globalProfitFactor), tone: 'gold' },
    ];
  }, [summary, loading]);

  const vSum = useMemo(() => summarizeValidatorTrades(vTrades, selectedId), [vTrades, selectedId]);
  const jSum = useMemo(() => summarizeJournalTrades(jTrades, selectedId), [jTrades, selectedId]);
  const breakdown = useMemo(
    () => computeExecutionBreakdowns(vTrades, jTrades, selectedId),
    [vTrades, jTrades, selectedId]
  );
  const mPatterns = useMemo(() => summarizeMissedPatterns(mTrades, selectedId), [mTrades, selectedId]);
  const insights = useMemo(
    () =>
      ruleBasedInsights({
        validatorSummary: vSum,
        journalSummary: jSum,
        globalSummary: summary,
        mPatterns,
        breakdowns: breakdown,
      }),
    [vSum, jSum, summary, mPatterns, breakdown]
  );

  const latestReview = useMemo(() => {
    const list = [...(reviewNotes || [])].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return list[0] || null;
  }, [reviewNotes]);

  const detailMetrics = metricsByPlaybook[selectedId] || {};

  const checklistProgress = useMemo(() => {
    const sections = form.checklistSections || [];
    let total = 0;
    let done = 0;
    let required = 0;
    let requiredDone = 0;
    sections.forEach((sec) => {
      (sec.items || []).forEach((it) => {
        if (!it.active) return;
        total += 1;
        const ticked = checklistTick[it.id];
        if (ticked) done += 1;
        if (it.required) {
          required += 1;
          if (ticked) requiredDone += 1;
        }
      });
    });
    const pct = total ? done / total : 0;
    const passRequired = required ? requiredDone >= required : true;
    let optional = 0;
    let optionalDone = 0;
    sections.forEach((sec) => {
      (sec.items || []).forEach((it) => {
        if (!it.active || it.required) return;
        optional += 1;
        if (checklistTick[it.id]) optionalDone += 1;
      });
    });
    let readiness = 'NO_ITEMS';
    if (total) {
      if (!passRequired) readiness = 'FAILED_REQUIRED';
      else if (pct >= CHECKLIST_THRESHOLD) readiness = 'QUALIFIED';
      else if (pct >= 0.65) readiness = 'BORDERLINE';
      else readiness = 'WEAK';
    }
    return { pct, passRequired, total, done, required, requiredDone, optional, optionalDone, readiness };
  }, [form.checklistSections, checklistTick]);

  const startNewWizard = () => {
    const base = normalizeSetup({
      name: 'New playbook',
      status: 'draft',
      checklistSections: DEFAULT_CHECKLIST_SECTIONS(),
    });
    setWizardDraft(base);
    setWizardStep(0);
    setDrawer('wizard');
  };

  const openTagDrawer = async () => {
    await refreshTrades();
    setDrawer('tag');
  };

  const unifiedTrades = useMemo(() => {
    const v = (vTrades || []).map((t) => ({
      source: 'validator',
      id: t.id,
      label: `${t.pair} · ${t.direction}`,
      at: t.createdAt,
      tag: t.setupTagType,
      playbookId: t.playbookSetupId,
      noSetupReason: t.noSetupReason || null,
    }));
    const j = (jTrades || []).map((t) => ({
      source: 'journal',
      id: t.id,
      label: `${t.pair} · ${t.date}`,
      at: t.date,
      tag: t.setupTagType,
      playbookId: t.playbookSetupId,
      noSetupReason: t.noSetupReason || null,
    }));
    return [...v, ...j].sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  }, [vTrades, jTrades]);

  const tagTradeRow = async (row, playbookId, tagType, noSetupReason = null) => {
    try {
      const base =
        tagType === 'NO_SETUP'
          ? { playbookSetupId: null, setupTagType: tagType, noSetupReason: noSetupReason || null }
          : { playbookSetupId: playbookId, setupTagType: 'PLAYBOOK', noSetupReason: null };
      if (row.source === 'validator') {
        await Api.updateAuraAnalysisTrade(row.id, base);
      } else {
        await Api.updateJournalTrade(row.id, base);
      }
      toast.success(tagType === 'NO_SETUP' ? 'Classified outside playbook' : 'Linked to playbook');
      await refreshTrades();
      await loadCore({ showLoading: false });
      if (view === 'detail' && selectedId) loadDetailData(selectedId);
    } catch {
      toast.error('Could not update trade');
    }
  };

  const hubPrimary = (
    <>
      <button type="button" className="trader-suite-btn trader-suite-btn--primary" onClick={startNewWizard}>
        New playbook
      </button>
      <button type="button" className="trader-suite-btn" onClick={() => openTagDrawer()}>
        Classify trades
      </button>
      <button type="button" className="trader-suite-btn" onClick={() => setDrawer('missed')}>
        Log missed setup
      </button>
      <button
        type="button"
        className="trader-suite-btn"
        onClick={() => {
          if (!setups.length) {
            toast.info('Create a playbook first to view analytics in context.');
            return;
          }
          const active = setups.find((s) => String(s.status || 'active').toLowerCase() !== 'archived') || setups[0];
          openDetail(active.id, 'analytics');
        }}
      >
        View analytics
      </button>
    </>
  );

  const renderHub = () => {
    if (loading) {
      return (
        <div className="tp-root tp-root--loading" aria-busy="true" aria-label="Loading playbooks">
          <div className="tp-skeleton tp-skeleton--strip" />
          <div className="tp-skeleton tp-skeleton--toolbar" />
          <div className="tp-playbook-grid tp-playbook-grid--hub">
            <div className="tp-skeleton tp-skeleton--card" />
            <div className="tp-skeleton tp-skeleton--card" />
            <div className="tp-skeleton tp-skeleton--card" />
          </div>
          <p className="tp-loading-caption">Loading library and discipline metrics…</p>
        </div>
      );
    }

    const disc = summary || {};
    const tagPct = disc.disciplineTaggedVsAll != null ? fmtPct(disc.disciplineTaggedVsAll) : '—';
    const noSetupPct = disc.noSetupRate != null ? fmtPct(disc.noSetupRate) : '—';
    const adhere = disc.adherenceRate != null ? fmtPct(disc.adherenceRate) : '—';

    return (
      <div className="tp-root">
        <section className="tp-discipline-strip" aria-label="Discipline overview">
          <div className="tp-discipline-strip__intro">
            <span className="tp-discipline-strip__title">Execution discipline</span>
            <p className="tp-discipline-strip__desc">
              Classify validator and journal rows so analytics reflect real adherence — not intentions.
            </p>
          </div>
          <div className="tp-discipline-strip__metrics">
            <div className="tp-disc-metric">
              <span>Tagged share</span>
              <strong>{tagPct}</strong>
              <small>of classified activity</small>
            </div>
            <div className="tp-disc-metric">
              <span>Playbook adherence</span>
              <strong>{adhere}</strong>
              <small>vs no-setup (classified)</small>
            </div>
            <div className="tp-disc-metric tp-disc-metric--alert">
              <span>No-setup rate</span>
              <strong>{noSetupPct}</strong>
              <small>outside defined playbooks</small>
            </div>
            <div className="tp-disc-metric">
              <span>Unclassified</span>
              <strong>{disc.unclassifiedTrades ?? 0}</strong>
              <small>awaiting tag</small>
            </div>
            <div className="tp-disc-metric">
              <span>Missed / M</span>
              <strong>{disc.missedTrades ?? 0}</strong>
              <small>logged for review</small>
            </div>
            <div className="tp-disc-metric">
              <span>Leading setup</span>
              <strong className="tp-disc-metric__ellipsis">{disc.bestPlaybook?.name?.slice(0, 22) || '—'}</strong>
              <small>by expectancy sample</small>
            </div>
          </div>
          {disc.processGapLabel ? <p className="tp-process-gap">{disc.processGapLabel}</p> : null}
        </section>

        <div className="tp-hub-section-label">Library</div>
        <div className="tp-toolbar tp-toolbar--elevated">
          <input
            className="tp-search"
            placeholder="Find a playbook…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search playbooks"
          />
          <select className="trader-suite-select" value={hubFilter} onChange={(e) => setHubFilter(e.target.value)} aria-label="Filter by status">
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="draft">Drafts</option>
            <option value="archived">Archived</option>
          </select>
          <select className="trader-suite-select" value={sortKey} onChange={(e) => setSortKey(e.target.value)} aria-label="Sort playbooks">
            <option value="updated">Recently updated</option>
            <option value="lastUsed">Last used</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>

        <div className="tp-playbook-grid tp-playbook-grid--hub">
          <button
            type="button"
            className="tp-discipline-panel"
            onClick={() => setDrawer('noSetup')}
          >
            <div className="tp-discipline-panel__label">Discipline review</div>
            <h3 className="tp-discipline-panel__title">No-setup &amp; rule breaks</h3>
            <p className="tp-discipline-panel__body">
              {summary?.noSetupTrades ?? 0} outside-plan · {summary?.missedTrades ?? 0} missed logged ·{' '}
              {summary?.unclassifiedTrades ?? 0} still unclassified
            </p>
            <span className="tp-discipline-panel__cta">Open panel</span>
          </button>

          {filteredSetups.map((s) => {
            const pm = metricsByPlaybook[s.id] || {};
            const st = (s.status || 'active').toLowerCase();
            const assetChips = (s.assets || '')
              .split(',')
              .map((x) => x.trim())
              .filter(Boolean)
              .slice(0, 4);
            return (
              <article key={s.id} className={`tp-playbook-card tp-playbook-card--${st}`}>
                <div className="tp-playbook-card__head">
                  <span className="tp-playbook-card__badge" style={{ color: s.color || undefined }} aria-hidden>
                    {s.icon || '📘'}
                  </span>
                  <span className={`tp-pill tp-pill--status-${st === 'archived' ? 'archived' : st === 'draft' ? 'draft' : 'active'}`}>
                    {st === 'archived' ? 'Archived' : st === 'draft' ? 'Draft' : 'Active'}
                  </span>
                </div>
                <h3 className="tp-playbook-card__title">{s.name}</h3>
                <div className="tp-playbook-card__meta">
                  {[s.setupType, s.marketType, s.session].filter(Boolean).join(' · ') || 'Complete context in Rules'}
                </div>
                <div className="tp-playbook-card__timestamps">
                  <span>Updated {fmtDt(s.updatedAt)}</span>
                  <span>Last used {fmtDt(s.lastUsedAt)}</span>
                </div>
                <div className="tp-pill-row">
                  {(assetChips.length ? assetChips : ['Define assets']).map((x, i) => (
                    <span key={`${s.id}-chip-${i}`} className="tp-pill tp-pill--asset">
                      {x}
                    </span>
                  ))}
                </div>
                <div className="tp-metrics-grid tp-metrics-grid--prior">
                  <div className="tp-metric-priority">
                    <span>Win rate</span>
                    <strong>{pm.winRate != null ? fmtPct(pm.winRate) : '—'}</strong>
                  </div>
                  <div>
                    <span>Profit factor</span>
                    <strong>{fmtPF(pm.profitFactor)}</strong>
                  </div>
                  <div>
                    <span>Tagged</span>
                    <strong>{pm.taggedTrades ?? 0}</strong>
                  </div>
                </div>
                <div className="tp-card-actions tp-card-actions--split">
                  <div className="tp-card-actions__primary">
                    <button type="button" className="tp-btn-ghost tp-btn-ghost--emphasis" onClick={() => openDetail(s.id)}>
                      Open playbook
                    </button>
                  </div>
                  <div className="tp-card-actions__menu">
                    <button type="button" className="tp-btn-ghost" onClick={() => duplicatePlaybook(s.id)}>
                      Duplicate
                    </button>
                    <button type="button" className="tp-btn-ghost" onClick={() => archivePlaybook(s.id)}>
                      Archive
                    </button>
                    <button type="button" className="tp-btn-ghost tp-btn-ghost--danger" onClick={() => deletePlaybook(s.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {!setups.length ? (
          <div className="tp-empty tp-empty--hero">
            <h3 className="tp-empty__title">Define your first edge</h3>
            <p>
              Playbooks turn discretionary intuition into reviewable rules. Start with one live setup, then classify executions from the
              validator and journal so win rate and profit factor mean something.
            </p>
            <ul className="tp-empty__list">
              <li>New playbook — codify context, trigger, risk</li>
              <li>Classify trades — link executions or flag no-setup honestly</li>
              <li>Log missed setups — capture what the process failed to deliver</li>
            </ul>
          </div>
        ) : null}
        {setups.length > 0 && !filteredSetups.length ? (
          <div className="tp-empty">
            Nothing matches this filter. <button type="button" className="tp-inline-link" onClick={() => { setHubFilter('all'); setSearch(''); }}>Reset filters</button>
          </div>
        ) : null}
      </div>
    );
  };

  const renderDetail = () => {
    const st = String(form.status || 'active').toLowerCase();
    const readinessMeta = CHECKLIST_READINESS[checklistProgress.readiness] || CHECKLIST_READINESS.NO_ITEMS;
    const globalTagged = summary?.taggedTrades ?? 0;
    const thisTagged = detailMetrics.taggedTrades ?? vSum.count + jSum.count;
    const oppNotes = [];
    if (globalTagged >= 12 && thisTagged <= 3) {
      oppNotes.push(
        'Low tagging volume on this playbook versus your classified book — confirm it remains a primary edge or fold it into another definition.'
      );
    }
    if (mPatterns.total >= 4) {
      oppNotes.push(`${mPatterns.total} missed / mis-execution entries — review pre-trade gates and session filters.`);
    }
    if (breakdown.sampleSize >= 10 && breakdown.byDow.length) {
      const [d, n] = breakdown.byDow[0];
      oppNotes.push(`Tagged activity concentrates on ${d} (${n} trades) — plan reviews after those sessions.`);
    }

    return (
      <div className="tp-root">
        <button
          type="button"
          className="tp-detail-back"
          onClick={() => {
            setView('hub');
            loadCore();
          }}
        >
          ← Back to hub
        </button>

        <header className="tp-detail-hero">
          <div className="tp-detail-hero__identity">
            <span className="tp-detail-hero__icon" style={{ color: form.color || undefined }} aria-hidden>
              {form.icon || '📘'}
            </span>
            <div className="tp-detail-hero__titles">
              <div className="tp-detail-hero__title-row">
                <h1 className="tp-detail-hero__name">{form.name}</h1>
                <span className={`tp-pill tp-pill--status-${st === 'archived' ? 'archived' : st === 'draft' ? 'draft' : 'active'}`}>
                  {st === 'archived' ? 'Archived' : st === 'draft' ? 'Draft' : 'Active'}
                </span>
              </div>
              <p className="tp-detail-hero__desc">{form.description || 'Describe the thesis, regime, and non‑negotiables for this edge.'}</p>
              <div className="tp-detail-hero__meta-row">
                {[form.setupType, form.marketType, form.session].filter(Boolean).join(' · ') || 'Complete operational context in Overview'}
                {form.assets ? (
                  <>
                    {' · '}
                    <span className="tp-detail-hero__assets">{form.assets}</span>
                  </>
                ) : null}
                {form.timeframes ? (
                  <>
                    {' · '}
                    <span>{form.timeframes}</span>
                  </>
                ) : null}
              </div>
              <div className="tp-detail-hero__stats">
                <div>
                  <span>Last used</span>
                  <strong>{fmtDt(form.lastUsedAt)}</strong>
                </div>
                <div>
                  <span>Tagged trades</span>
                  <strong>{detailMetrics.taggedTrades ?? vSum.count + jSum.count}</strong>
                </div>
                <div>
                  <span>Win rate (V)</span>
                  <strong>{fmtPct(detailMetrics.winRate ?? vSum.winRate)}</strong>
                </div>
                <div>
                  <span>Profit factor</span>
                  <strong>{fmtPF(detailMetrics.profitFactor ?? vSum.profitFactor)}</strong>
                </div>
                <div>
                  <span>Expectancy $</span>
                  <strong>{vSum.expectancy != null ? vSum.expectancy.toFixed(2) : '—'}</strong>
                </div>
              </div>
              {latestReview ? (
                <div className="tp-detail-hero__review-hint">
                  <span className="tp-kicker-inline">Latest refinement</span>
                  <strong>{latestReview.title || 'Review note'}</strong>
                  <span className="tp-detail-hero__review-meta">
                    {fmtDt(latestReview.createdAt)} · {String(latestReview.noteType || '').replace(/_/g, ' ')}
                  </span>
                </div>
              ) : (
                <p className="tp-detail-hero__review-hint tp-detail-hero__review-hint--empty">
                  No refinement notes yet — capture rule changes after reviews.
                </p>
              )}
            </div>
          </div>
          <div className="tp-detail-hero__actions">
            <button type="button" className="trader-suite-btn trader-suite-btn--primary" onClick={() => saveSetup(false)} disabled={saving}>
              {saving ? 'Saving…' : 'Lock in changes'}
            </button>
            <div className={`tp-detail-overflow${detailMenuOpen ? ' tp-detail-overflow--open' : ''}`}>
              <button
                type="button"
                className="trader-suite-btn"
                aria-expanded={detailMenuOpen}
                onClick={() => setDetailMenuOpen((o) => !o)}
              >
                Manage
              </button>
              {detailMenuOpen ? (
                <div className="tp-detail-overflow__menu" role="menu">
                  <button type="button" className="tp-overflow-item" onClick={() => saveSetup(true)} disabled={saving}>
                    Save as draft
                  </button>
                  <button type="button" className="tp-overflow-item" onClick={resetLocal}>
                    Revert unsaved edits
                  </button>
                  {selectedId ? (
                    <button type="button" className="tp-overflow-item" onClick={() => duplicatePlaybook(selectedId)}>
                      Duplicate playbook
                    </button>
                  ) : null}
                  {selectedId ? (
                    <button type="button" className="tp-overflow-item" onClick={() => archivePlaybook(selectedId)}>
                      Archive
                    </button>
                  ) : null}
                  {selectedId ? (
                    <button type="button" className="tp-overflow-item tp-overflow-item--danger" onClick={() => deletePlaybook(selectedId)}>
                      Delete
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <div className="tp-tabs trader-suite-tab-row tp-tabs--detail">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`trader-suite-tab-btn${detailTab === t.id ? ' trader-suite-tab-btn--active' : ''}`}
              onClick={() => {
                setDetailTab(t.id);
                setDetailMenuOpen(false);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="tp-tab-panel">
          {detailTab === 'overview' ? (
            <div className="tp-detail-split">
              <div className="tp-panel tp-panel--tight">
                <div className="trader-suite-kicker">Identity &amp; deployment</div>
                <div className="tp-field-grid">
                  <div className="tp-field">
                    <label>Name</label>
                    <input className="tp-input" value={form.name} onChange={(e) => applyChange({ name: e.target.value })} />
                  </div>
                  <div className="tp-field">
                    <label>Icon</label>
                    <input className="tp-input" value={form.icon} onChange={(e) => applyChange({ icon: e.target.value })} maxLength={8} />
                  </div>
                  <div className="tp-field">
                    <label>Accent</label>
                    <input
                      className="tp-input"
                      value={form.color || ''}
                      onChange={(e) => applyChange({ color: e.target.value })}
                      placeholder="#c9a962 or css color"
                    />
                  </div>
                  <div className="tp-field">
                    <label>Status</label>
                    <select className="tp-select" value={form.status} onChange={(e) => applyChange({ status: e.target.value })}>
                      <option value="active">Active</option>
                      <option value="draft">Draft</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                </div>
                <div className="tp-field" style={{ marginTop: 12 }}>
                  <label>Thesis / scope</label>
                  <textarea className="tp-textarea" value={form.description} onChange={(e) => applyChange({ description: e.target.value })} />
                </div>
                <div className="tp-field-grid" style={{ marginTop: 12 }}>
                  <div className="tp-field">
                    <label>Market type</label>
                    <input className="tp-input" value={form.marketType} onChange={(e) => applyChange({ marketType: e.target.value })} />
                  </div>
                  <div className="tp-field">
                    <label>Setup type</label>
                    <input className="tp-input" value={form.setupType} onChange={(e) => applyChange({ setupType: e.target.value })} />
                  </div>
                  <div className="tp-field">
                    <label>Session</label>
                    <input className="tp-input" value={form.session} onChange={(e) => applyChange({ session: e.target.value })} />
                  </div>
                  <div className="tp-field">
                    <label>Timeframes</label>
                    <input className="tp-input" value={form.timeframes} onChange={(e) => applyChange({ timeframes: e.target.value })} />
                  </div>
                  <div className="tp-field" style={{ gridColumn: '1 / -1' }}>
                    <label>Assets</label>
                    <input className="tp-input" value={form.assets} onChange={(e) => applyChange({ assets: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="tp-panel tp-panel--tight tp-panel--summary">
                <div className="trader-suite-kicker">Operational summary</div>
                <p className="tp-summary-lede">
                  Narrative blocks below are what you read before risk goes on — keep them tight and falsifiable.
                </p>
                <div className="tp-field-grid">
                  {OVERVIEW_FIELDS.map(({ key, label, hint }) => (
                    <div key={key} className="tp-field">
                      <label>{label}</label>
                      <p className="tp-field-hint">{hint}</p>
                      <textarea
                        className="tp-textarea"
                        value={form.overviewBlocks?.[key] || ''}
                        onChange={(e) =>
                          applyChange({
                            overviewBlocks: { ...form.overviewBlocks, [key]: e.target.value },
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
                <div className="tp-board-preview">
                  <div className="trader-suite-kicker">One-screen board</div>
                  <dl className="tp-board-dl">
                    <dt>When live</dt>
                    <dd>{form.overviewBlocks?.worksBest || form.marketType || '—'}</dd>
                    <dt>Stand down</dt>
                    <dd>{form.overviewBlocks?.avoid || form.doNotTrade?.join(', ') || '—'}</dd>
                    <dt>Mistake watchlist</dt>
                    <dd>{form.commonMistakes?.join(', ') || '—'}</dd>
                  </dl>
                </div>
              </div>
            </div>
          ) : null}

          {detailTab === 'rules' ? (
            <div className="tp-panel tp-panel--rules">
              <p className="tp-rules-intro">
                Structure mirrors a discretionary workflow — context before trigger, confirmation before risk, management before psychology.
              </p>
              {RULE_GROUPS.map((grp) => (
                <section key={grp.id} className="tp-rule-group">
                  <header className="tp-rule-group__head">
                    <h3 className="tp-rule-group__title">{grp.title}</h3>
                    <p className="tp-rule-group__subtitle">{grp.subtitle}</p>
                  </header>
                  <div className="tp-field-grid">
                    {grp.fields.map((f) => {
                      const bucket = form[f.bucket] || {};
                      const val = bucket[f.key] ?? '';
                      const onF = (e) => applyChange(rulesFieldPatch(form, f.bucket, f.key, e.target.value));
                      return (
                        <div key={`${f.bucket}-${f.key}`} className="tp-field">
                          <label>{f.label}</label>
                          <p className="tp-field-hint">{f.hint}</p>
                          {f.multiline === false ? (
                            <input className="tp-input" value={val} onChange={onF} />
                          ) : (
                            <textarea className="tp-textarea" value={val} onChange={onF} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
              <section className="tp-rule-group">
                <header className="tp-rule-group__head">
                  <h3 className="tp-rule-group__title">Tags &amp; discrete lists</h3>
                  <p className="tp-rule-group__subtitle">Fast filters for search and boards — pair with narrative guardrails above.</p>
                </header>
                <div className="tp-field">
                  <label>Playbook tags</label>
                  <TagEditor tags={form.tags} onChange={(tags) => applyChange({ tags })} />
                </div>
                <div className="tp-field-grid" style={{ marginTop: 14 }}>
                  <div className="tp-field">
                    <label>Do not trade (chips)</label>
                    <ChipList items={form.doNotTrade} onChange={(doNotTrade) => applyChange({ doNotTrade })} />
                  </div>
                  <div className="tp-field">
                    <label>Common mistakes (chips)</label>
                    <ChipList items={form.commonMistakes} onChange={(commonMistakes) => applyChange({ commonMistakes })} />
                  </div>
                </div>
              </section>
            </div>
          ) : null}

          {detailTab === 'checklist' ? (
            <div className="tp-panel tp-panel--checklist">
              <div className="tp-checklist-modebar">
                <div className="tp-checklist-modebar__toggle">
                  <span className="trader-suite-kicker" style={{ margin: '0 0 6px' }}>
                    Mode
                  </span>
                  <div className="tp-hub-actions" style={{ marginBottom: 0 }}>
                    <button
                      type="button"
                      className={`trader-suite-btn${checklistMode === 'builder' ? ' trader-suite-btn--primary' : ''}`}
                      onClick={() => setChecklistMode('builder')}
                    >
                      Structure builder
                    </button>
                    <button
                      type="button"
                      className={`trader-suite-btn${checklistMode === 'trader' ? ' trader-suite-btn--primary' : ''}`}
                      onClick={() => setChecklistMode('trader')}
                    >
                      Pre-trade execution
                    </button>
                  </div>
                </div>
                {checklistMode === 'trader' ? (
                  <div className="tp-checklist-readiness">
                    <div className={`tp-readiness tp-readiness--${readinessMeta.tone}`}>
                      <span className="tp-readiness__label">Readiness</span>
                      <strong>{readinessMeta.label}</strong>
                    </div>
                    <div className="tp-readiness-metrics">
                      <div>
                        <span>Completion</span>
                        <strong>{Math.round(checklistProgress.pct * 100)}%</strong>
                      </div>
                      <div>
                        <span>Required passed</span>
                        <strong>
                          {checklistProgress.requiredDone}/{checklistProgress.required || 0}
                        </strong>
                      </div>
                      <div>
                        <span>Optional confirmations</span>
                        <strong>
                          {checklistProgress.optionalDone}/{checklistProgress.optional || 0}
                        </strong>
                      </div>
                    </div>
                    {!checklistProgress.passRequired ? (
                      <p className="tp-readiness-warn">Required items remain open — do not treat partial completion as approval.</p>
                    ) : null}
                    {checklistProgress.passRequired && checklistProgress.pct < CHECKLIST_THRESHOLD ? (
                      <p className="tp-readiness-warn">
                        Below {Math.round(CHECKLIST_THRESHOLD * 100)}% overall completion — discretionary risk is elevated.
                      </p>
                    ) : null}
                    <div className="tp-hub-actions" style={{ marginTop: 10, marginBottom: 0 }}>
                      <button type="button" className="trader-suite-btn" onClick={() => setChecklistTick({})}>
                        Reset session
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
              {checklistMode === 'trader' && form.overviewBlocks?.idealExample ? (
                <div className="tp-ideal-panel">
                  <div className="trader-suite-kicker">A+ execution profile</div>
                  <p>{form.overviewBlocks.idealExample}</p>
                </div>
              ) : null}
              <ChecklistBuilder
                sections={form.checklistSections}
                mode={checklistMode}
                tick={checklistTick}
                setTick={setChecklistTick}
                onChangeSections={(checklistSections) => applyChange({ checklistSections })}
              />
              <div className="tp-hub-actions" style={{ marginTop: 14 }}>
                <span className="trader-suite-kicker" style={{ margin: 0, alignSelf: 'center' }}>
                  Templates
                </span>
                <button
                  type="button"
                  className="trader-suite-btn"
                  onClick={() => applyChange({ checklistSections: PLAYBOOK_PRESETS.scalp.checklistSections || DEFAULT_CHECKLIST_SECTIONS() })}
                >
                  Scalp checklist
                </button>
                <button type="button" className="trader-suite-btn" onClick={() => applyChange({ checklistSections: DEFAULT_CHECKLIST_SECTIONS() })}>
                  Reset sections
                </button>
              </div>
            </div>
          ) : null}

          {detailTab === 'trades' ? (
            <div className="tp-panel">
              <TradesTable vTrades={vTrades} jTrades={jTrades} playbookId={selectedId} />
            </div>
          ) : null}

          {detailTab === 'missed' ? (
            <div className="tp-panel">
              <MissedList
                mTrades={mTrades}
                playbookId={selectedId}
                onDraftRefinement={(m) => {
                  setReviewPrefill({
                    noteType: 'lesson',
                    title: `Missed setup — ${m.asset || 'review'}`,
                    body: [
                      m.missType ? `Miss type: ${m.missType}` : '',
                      m.missReason ? `What happened: ${m.missReason}` : '',
                      m.lessonLearned ? `Lesson: ${m.lessonLearned}` : '',
                      m.whatShouldHaveHappened ? `Corrective: ${m.whatShouldHaveHappened}` : '',
                    ]
                      .filter(Boolean)
                      .join('\n'),
                  });
                  setDetailTab('review');
                }}
              />
            </div>
          ) : null}

          {detailTab === 'analytics' ? (
            <div className="tp-panel tp-analytics">
              <div className="tp-analytics__head">
                <div>
                  <h2 className="tp-analytics__title">Playbook analytics</h2>
                  <p className="tp-analytics__sub">Weekly-grade view — built only from tagged validator and journal rows.</p>
                </div>
                <button
                  type="button"
                  className="trader-suite-btn"
                  onClick={() => {
                    const lines = [...insights.refine, ...insights.hurting].filter(Boolean);
                    setReviewPrefill({
                      noteType: 'rule_refinement',
                      title: `Refinement — ${form.name}`,
                      body: lines.length ? lines.map((x) => `• ${x}`).join('\n') : '• Document any rule or checklist change after this review.',
                    });
                    setDetailTab('review');
                  }}
                >
                  Log refinement from insights
                </button>
              </div>

              <section className="tp-analytics-section">
                <h3 className="tp-analytics-section__title">Performance</h3>
                <div className="tp-stat-grid tp-stat-grid--analytics">
                  <div className="tp-stat-card tp-stat-card--emph">
                    <span>Tagged (V+J closed sample)</span>
                    <strong>{vSum.count + jSum.count}</strong>
                  </div>
                  <div className="tp-stat-card">
                    <span>Win rate (validator)</span>
                    <strong>{fmtPct(vSum.winRate)}</strong>
                  </div>
                  <div className="tp-stat-card">
                    <span>Profit factor</span>
                    <strong>{fmtPF(vSum.profitFactor)}</strong>
                  </div>
                  <div className="tp-stat-card">
                    <span>Expectancy $</span>
                    <strong>{vSum.expectancy != null ? vSum.expectancy.toFixed(2) : '—'}</strong>
                  </div>
                  <div className="tp-stat-card">
                    <span>Avg R (V)</span>
                    <strong>{vSum.avgR != null ? vSum.avgR.toFixed(2) : '—'}</strong>
                  </div>
                  <div className="tp-stat-card">
                    <span>Expectancy R (J)</span>
                    <strong>{jSum.expectancyR != null ? jSum.expectancyR.toFixed(2) : '—'}</strong>
                  </div>
                  <div className="tp-stat-card">
                    <span>Net $ (V sample)</span>
                    <strong>{vSum.totalPnl != null ? vSum.totalPnl.toFixed(2) : '—'}</strong>
                  </div>
                  <div className="tp-stat-card">
                    <span>Best / worst $</span>
                    <strong>
                      {vSum.best != null ? vSum.best.toFixed(2) : '—'} / {vSum.worst != null ? vSum.worst.toFixed(2) : '—'}
                    </strong>
                  </div>
                </div>
                {!vSum.count && !jSum.count ? (
                  <p className="tp-analytics-empty">Insufficient tagged trades — classify validator and journal executions on this playbook.</p>
                ) : null}
              </section>

              <section className="tp-analytics-section">
                <h3 className="tp-analytics-section__title">Discipline</h3>
                <div className="tp-stat-grid tp-stat-grid--analytics">
                  <div className="tp-stat-card">
                    <span>No-setup rate (global)</span>
                    <strong>{summary?.noSetupRate != null ? fmtPct(summary.noSetupRate) : '—'}</strong>
                  </div>
                  <div className="tp-stat-card">
                    <span>Adherence (classified)</span>
                    <strong>{summary?.adherenceRate != null ? fmtPct(summary.adherenceRate) : '—'}</strong>
                  </div>
                  <div className="tp-stat-card">
                    <span>Missed log count</span>
                    <strong>{mPatterns.total}</strong>
                  </div>
                  <div className="tp-stat-card tp-stat-card--wide">
                    <span>Top miss pattern</span>
                    <strong>
                      {mPatterns.topMissTypes?.length ? `${mPatterns.topMissTypes[0][0]} (${mPatterns.topMissTypes[0][1]})` : '—'}
                    </strong>
                  </div>
                </div>
              </section>

              <section className="tp-analytics-section">
                <h3 className="tp-analytics-section__title">Consistency</h3>
                {breakdown.sampleSize ? (
                  <div className="tp-breakdown-grid">
                    <div>
                      <div className="trader-suite-kicker">Day of week</div>
                      <ul className="tp-breakdown-list">
                        {breakdown.byDow.map(([k, v]) => (
                          <li key={k}>
                            {k} <strong>{v}</strong>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="trader-suite-kicker">Session</div>
                      <ul className="tp-breakdown-list">
                        {breakdown.bySession.map(([k, v]) => (
                          <li key={k}>
                            {k || '—'} <strong>{v}</strong>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="trader-suite-kicker">Asset</div>
                      <ul className="tp-breakdown-list">
                        {breakdown.byPair.slice(0, 6).map(([k, v]) => (
                          <li key={k}>
                            {k} <strong>{v}</strong>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="trader-suite-kicker">Streaks (W / L)</div>
                      <p className="tp-breakdown-streaks">
                        <strong>{breakdown.maxWinStreak}</strong> max win · <strong>{breakdown.maxLossStreak}</strong> max loss
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="tp-analytics-empty">No consistency breakdown yet — needs a broader tagged sample.</p>
                )}
              </section>

              <section className="tp-analytics-section">
                <h3 className="tp-analytics-section__title">Opportunity</h3>
                {oppNotes.length ? (
                  <ul className="tp-insight-list tp-insight-list--neutral">
                    {oppNotes.map((x, idx) => (
                      <li key={`opp-${idx}-${String(x).slice(0, 24)}`}>{x}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="tp-analytics-empty">Opportunity signals appear once global tagging and missed logs accumulate.</p>
                )}
              </section>

              <section className="tp-analytics-section tp-analytics-section--insights">
                <div className="tp-insight-cols">
                  <div>
                    <h4 className="tp-insight-heading">What is working</h4>
                    <ul className="tp-insight-list tp-insight-list--ok">
                      {(insights.working.length
                        ? insights.working
                        : ['Not enough closed tagged trades to stress-test edge quality yet.']
                      ).map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="tp-insight-heading">What is dragging</h4>
                    <ul className="tp-insight-list tp-insight-list--bad">
                      {(insights.hurting.length ? insights.hurting : ['No statistically supported drag from current sample.']).map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="tp-insight-heading">Refine next</h4>
                    <ul className="tp-insight-list tp-insight-list--gold">
                      {(insights.refine.length ? insights.refine : ['Maintain weekly refinement notes as tagging grows.']).map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            </div>
          ) : null}

          {detailTab === 'review' ? (
            <div className="tp-panel">
              <ReviewPanel
                notes={reviewNotes}
                playbookId={selectedId}
                onRefresh={() => loadDetailData(selectedId)}
                prefill={reviewPrefill}
                onPrefillConsumed={() => setReviewPrefill(null)}
              />
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  const renderWizard = () => {
    if (!wizardDraft) return null;
    const wd = wizardDraft;
    const step = wizardStep;
    const setWd = (p) => setWizardDraft((prev) => normalizeSetup({ ...prev, ...p }));

    return (
      <div className="tp-drawer-overlay" role="dialog" aria-modal onClick={() => setDrawer(null)}>
        <div className="tp-drawer tp-drawer--wizard" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="tp-wizard-title">
          <div className="tp-drawer__head">
            <h2 id="tp-wizard-title">New playbook</h2>
            <p className="tp-drawer__intro">Step through context, execution, and guardrails — presets merge at the end without overwriting your edits.</p>
          </div>
          <div className="tp-pill-row tp-wizard-steps">
            {WIZARD_STEP_LABELS.map((l, i) => (
              <span key={l} className={`tp-pill${i === step ? ' tp-pill--status-draft' : ''}`}>
                {i + 1}. {l}
              </span>
            ))}
          </div>
          {step === 0 ? (
            <div className="tp-field-grid">
              <div className="tp-field">
                <label>Name</label>
                <input className="tp-input" value={wd.name} onChange={(e) => setWd({ name: e.target.value })} />
              </div>
              <div className="tp-field">
                <label>Icon</label>
                <input className="tp-input" value={wd.icon} onChange={(e) => setWd({ icon: e.target.value })} />
              </div>
              <div className="tp-field">
                <label>Market type</label>
                <input className="tp-input" value={wd.marketType} onChange={(e) => setWd({ marketType: e.target.value })} />
              </div>
              <div className="tp-field">
                <label>Assets</label>
                <input className="tp-input" value={wd.assets} onChange={(e) => setWd({ assets: e.target.value })} />
              </div>
              <div className="tp-field">
                <label>Session</label>
                <input className="tp-input" value={wd.session} onChange={(e) => setWd({ session: e.target.value })} />
              </div>
              <div className="tp-field">
                <label>Timeframes</label>
                <input className="tp-input" value={wd.timeframes} onChange={(e) => setWd({ timeframes: e.target.value })} />
              </div>
            </div>
          ) : null}
          {step === 1 ? (
            <div className="tp-field-grid">
              {Object.keys(wd.marketConditions || {}).map((k) => (
                <div key={k} className="tp-field">
                  <label>{k}</label>
                  <textarea
                    className="tp-textarea"
                    value={wd.marketConditions[k] || ''}
                    onChange={(e) => setWd({ marketConditions: { ...wd.marketConditions, [k]: e.target.value } })}
                  />
                </div>
              ))}
            </div>
          ) : null}
          {step === 2 ? (
            <div className="tp-field-grid">
              {Object.keys(wd.entryRules || {}).map((k) => (
                <div key={k} className="tp-field">
                  <label>{k}</label>
                  <textarea
                    className="tp-textarea"
                    value={wd.entryRules[k] || ''}
                    onChange={(e) => setWd({ entryRules: { ...wd.entryRules, [k]: e.target.value } })}
                  />
                </div>
              ))}
            </div>
          ) : null}
          {step === 3 ? (
            <div className="tp-field-grid">
              {Object.keys(wd.exitRules || {}).map((k) => (
                <div key={k} className="tp-field">
                  <label>{k}</label>
                  <textarea
                    className="tp-textarea"
                    value={wd.exitRules[k] || ''}
                    onChange={(e) => setWd({ exitRules: { ...wd.exitRules, [k]: e.target.value } })}
                  />
                </div>
              ))}
              {Object.keys(wd.riskRules || {}).map((k) => (
                <div key={k} className="tp-field">
                  <label>{k}</label>
                  <input
                    className="tp-input"
                    value={wd.riskRules[k] || ''}
                    onChange={(e) => setWd({ riskRules: { ...wd.riskRules, [k]: e.target.value } })}
                  />
                </div>
              ))}
            </div>
          ) : null}
          {step === 4 ? (
            <div className="tp-field-grid">
              {Object.keys(wd.guardrails || {}).map((k) => (
                <div key={k} className="tp-field">
                  <label>{k}</label>
                  <textarea
                    className="tp-textarea"
                    value={wd.guardrails[k] || ''}
                    onChange={(e) => setWd({ guardrails: { ...wd.guardrails, [k]: e.target.value } })}
                  />
                </div>
              ))}
            </div>
          ) : null}
          {step === 5 ? (
            <div className="tp-wizard-finish">
              <p className="tp-wizard-finish__copy">
                Merge a preset into this draft — fields you already filled win on conflict. Review the Rules tab before locking in.
              </p>
              <div className="tp-hub-actions">
                {Object.keys(PLAYBOOK_PRESETS).map((k) => (
                  <button
                    key={k}
                    type="button"
                    className="trader-suite-btn"
                    onClick={() => setWizardDraft((prev) => normalizeSetup({ ...prev, ...PLAYBOOK_PRESETS[k] }))}
                  >
                    Load {k} preset
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="tp-hub-actions">
            <button
              type="button"
              className="trader-suite-btn"
              disabled={step <= 0}
              onClick={() => setWizardStep((s) => Math.max(0, s - 1))}
            >
              Back
            </button>
            {step < WIZARD_STEP_LABELS.length - 1 ? (
              <button type="button" className="trader-suite-btn trader-suite-btn--primary" onClick={() => setWizardStep((s) => s + 1)}>
                Next
              </button>
            ) : (
              <button
                type="button"
                className="trader-suite-btn trader-suite-btn--primary"
                onClick={() => {
                  const merged = normalizeSetup({ ...wizardDraft, status: 'draft' });
                  setForm(merged);
                  setSelectedId(null);
                  setView('detail');
                  setDrawer(null);
                  setDetailTab('overview');
                  toast.success('Review Overview and Rules, then lock in.');
                }}
              >
                Open in editor
              </button>
            )}
            <button type="button" className="trader-suite-btn" onClick={() => setDrawer(null)}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <TraderSuiteShell
      variant="terminal"
      terminalPresentation="aura-dashboard"
      eyebrow={formatWelcomeEyebrow(user)}
      title="Trader Playbook"
      description="Codify edges, execute against checklists, classify validator and journal trades honestly, and close the loop with missed logs and refinements."
      stats={view === 'hub' && !loading ? hubStats : []}
      primaryAction={view === 'hub' ? hubPrimary : null}
      secondaryActions={null}
    >
      {view === 'hub' ? renderHub() : renderDetail()}
      {drawer === 'wizard' ? renderWizard() : null}
      {drawer === 'tag' ? (
        <TagDrawer
          trades={unifiedTrades}
          setups={setups}
          onClose={() => setDrawer(null)}
          onTag={tagTradeRow}
        />
      ) : null}
      {drawer === 'missed' ? (
        <MissedDrawer
          setups={setups}
          onClose={() => setDrawer(null)}
          onSaved={async () => {
            await loadCore({ showLoading: false });
            if (view === 'detail' && selectedId) await loadDetailData(selectedId);
            setDrawer(null);
          }}
        />
      ) : null}
      {drawer === 'noSetup' ? (
        <NoSetupDrawer summary={summary} trades={unifiedTrades} setups={setups} onClose={() => setDrawer(null)} onTag={tagTradeRow} />
      ) : null}
    </TraderSuiteShell>
  );
}

function TagEditor({ tags, onChange }) {
  const [val, setVal] = useState('');
  return (
    <div>
      <div className="tp-chip-input-row">
        <input className="tp-input" style={{ maxWidth: 220 }} value={val} onChange={(e) => setVal(e.target.value)} placeholder="Add tag" />
        <button
          type="button"
          className="trader-suite-btn"
          onClick={() => {
            if (!val.trim()) return;
            onChange([...(tags || []), val.trim()].slice(0, 24));
            setVal('');
          }}
        >
          Add
        </button>
      </div>
      <div className="tp-pill-row" style={{ marginTop: 8 }}>
        {(tags || []).map((t) => (
          <span key={t} className="tp-pill">
            {t}
            <span
              role="button"
              tabIndex={0}
              className="tp-chip-remove"
              onClick={() => onChange((tags || []).filter((x) => x !== t))}
              onKeyDown={(e) => e.key === 'Enter' && onChange((tags || []).filter((x) => x !== t))}
            >
              ×
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function ChipList({ items, onChange }) {
  const [val, setVal] = useState('');
  return (
    <div>
      <div className="tp-chip-input-row">
        <input className="tp-input" style={{ maxWidth: 280 }} value={val} onChange={(e) => setVal(e.target.value)} />
        <button
          type="button"
          className="trader-suite-btn"
          onClick={() => {
            if (!val.trim()) return;
            onChange([...(items || []), val.trim()]);
            setVal('');
          }}
        >
          Add
        </button>
      </div>
      <div className="tp-pill-row" style={{ marginTop: 8 }}>
        {(items || []).map((t, idx) => (
          <span key={`${t}-${idx}`} className="tp-pill">
            {t}
            <span
              role="button"
              tabIndex={0}
              className="tp-chip-remove"
              onClick={() => onChange((items || []).filter((_, i) => i !== idx))}
            >
              ×
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function ChecklistBuilder({ sections, mode, tick, setTick, onChangeSections }) {
  const updateSection = (sid, fn) => {
    const next = (sections || []).map((s) => (s.id === sid ? fn(s) : s));
    onChangeSections(next);
  };

  const sectionProgress = (sec) => {
    const active = (sec.items || []).filter((it) => it.active);
    const total = active.length;
    const done = active.filter((it) => tick[it.id]).length;
    const req = active.filter((it) => it.required);
    const reqDone = req.filter((it) => tick[it.id]).length;
    return { total, done, reqN: req.length, reqDone };
  };

  return (
    <div className="tp-checklist-builder">
      {(sections || []).map((sec) => {
        const sp = sectionProgress(sec);
        return (
          <div key={sec.id} className="tp-checklist-section">
            <div className="tp-checklist-section__head">
              <div>
                <strong className="tp-checklist-section__title">{sec.title}</strong>
                {mode === 'trader' && sp.total ? (
                  <span className="tp-checklist-section__progress">
                    {sp.done}/{sp.total} items · {sp.reqDone}/{sp.reqN || 0} required
                  </span>
                ) : null}
              </div>
              {mode === 'builder' ? (
                <button
                  type="button"
                  className="tp-btn-ghost"
                  onClick={() =>
                    updateSection(sec.id, (s) => ({
                      ...s,
                      items: [
                        ...(s.items || []),
                        {
                          id: `n-${Date.now()}`,
                          label: 'New item',
                          description: '',
                          required: true,
                          sortOrder: (s.items || []).length,
                          active: true,
                          weight: 1,
                        },
                      ],
                    }))
                  }
                >
                  + Item
                </button>
              ) : null}
            </div>
            {(sec.items || []).map((it, idx) => (
              <div key={it.id} className={`tp-checklist-item${it.required ? ' tp-checklist-item--required' : ''}`}>
                {mode === 'trader' ? (
                  <label className="tp-checklist-item__trader-label">
                    <input
                      type="checkbox"
                      checked={!!tick[it.id]}
                      onChange={(e) => setTick((prev) => ({ ...prev, [it.id]: e.target.checked }))}
                    />
                    <span>
                      {it.label}
                      {it.required ? <span className="tp-req-star"> *</span> : <span className="tp-opt-hint"> optional</span>}
                    </span>
                  </label>
                ) : (
                  <div className="tp-checklist-item__editor">
                    <input
                      className="tp-input"
                      value={it.label}
                      onChange={(e) =>
                        updateSection(sec.id, (s) => ({
                          ...s,
                          items: (s.items || []).map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)),
                        }))
                      }
                    />
                    <label className="tp-checklist-item__flags">
                      <input
                        type="checkbox"
                        checked={!!it.required}
                        onChange={(e) =>
                          updateSection(sec.id, (s) => ({
                            ...s,
                            items: (s.items || []).map((x, i) => (i === idx ? { ...x, required: e.target.checked } : x)),
                          }))
                        }
                      />{' '}
                      Required
                    </label>
                    <label className="tp-checklist-item__flags">
                      <input
                        type="checkbox"
                        checked={it.active !== false}
                        onChange={(e) =>
                          updateSection(sec.id, (s) => ({
                            ...s,
                            items: (s.items || []).map((x, i) => (i === idx ? { ...x, active: e.target.checked } : x)),
                          }))
                        }
                      />{' '}
                      Active in execution
                    </label>
                  </div>
                )}
                {mode === 'builder' ? (
                  <div className="tp-checklist-item__actions">
                    <button
                      type="button"
                      className="tp-btn-ghost"
                      aria-label="Move up"
                      disabled={idx <= 0}
                      onClick={() =>
                        updateSection(sec.id, (s) => {
                          const items = [...(s.items || [])];
                          if (idx <= 0) return s;
                          [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]];
                          return { ...s, items };
                        })
                      }
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="tp-btn-ghost"
                      aria-label="Move down"
                      disabled={idx >= (sec.items || []).length - 1}
                      onClick={() =>
                        updateSection(sec.id, (s) => {
                          const items = [...(s.items || [])];
                          if (idx >= items.length - 1) return s;
                          [items[idx + 1], items[idx]] = [items[idx], items[idx + 1]];
                          return { ...s, items };
                        })
                      }
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="tp-btn-ghost"
                      onClick={() =>
                        updateSection(sec.id, (s) => {
                          const items = [...(s.items || [])];
                          const copy = { ...it, id: `dup-${Date.now()}`, label: `${it.label} (copy)` };
                          items.splice(idx + 1, 0, copy);
                          return { ...s, items };
                        })
                      }
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      className="tp-btn-ghost tp-btn-ghost--danger"
                      onClick={() =>
                        updateSection(sec.id, (s) => ({
                          ...s,
                          items: (s.items || []).filter((_, i) => i !== idx),
                        }))
                      }
                    >
                      Remove
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function TradesTable({ vTrades, jTrades, playbookId }) {
  const rows = useMemo(() => {
    const v = (vTrades || [])
      .filter((t) => t.playbookSetupId === playbookId && String(t.setupTagType).toUpperCase() === 'PLAYBOOK')
      .map((t) => ({
        k: `v-${t.id}`,
        source: 'Validator',
        when: t.createdAt,
        sym: t.pair,
        dir: t.direction,
        res: t.result,
        pnl: t.pnl,
        r: t.rMultiple,
      }));
    const j = (jTrades || [])
      .filter((t) => t.playbookSetupId === playbookId && String(t.setupTagType).toUpperCase() === 'PLAYBOOK')
      .map((t) => ({
        k: `j-${t.id}`,
        source: 'Journal',
        when: t.date,
        sym: t.pair,
        dir: t.tradeType || '-',
        res: t.rResult > 0 ? 'win' : t.rResult < 0 ? 'loss' : 'be',
        pnl: t.dollarResult,
        r: t.rResult,
      }));
    return [...v, ...j].sort((a, b) => String(b.when || '').localeCompare(String(a.when || '')));
  }, [vTrades, jTrades, playbookId]);

  const [sel, setSel] = useState(null);

  if (!rows.length) {
    return (
      <div className="tp-empty tp-empty--compact">
        No executions linked to this playbook. Use <strong>Classify trades</strong> from the hub to mark validator and journal rows as on-setup.
      </div>
    );
  }

  return (
    <div>
      <p className="tp-trades-lede">On-setup executions only — the sample your analytics use for this playbook.</p>
      <div className="tp-table-wrap">
        <table className="tp-table">
          <thead>
            <tr>
              <th>Source</th>
              <th>When</th>
              <th>Symbol</th>
              <th>Dir</th>
              <th>Result</th>
              <th>PnL / R</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.k}
                className={sel?.k === r.k ? 'tp-table-row--active' : ''}
                style={{ cursor: 'pointer' }}
                onClick={() => setSel(r)}
              >
                <td>
                  <span className={`tp-source-badge tp-source-badge--${r.source === 'Validator' ? 'v' : 'j'}`}>{r.source}</span>
                </td>
                <td>{String(r.when || '').slice(0, 19)}</td>
                <td>{r.sym}</td>
                <td>{r.dir}</td>
                <td>{r.res}</td>
                <td>{r.pnl != null ? Number(r.pnl).toFixed(2) : Number(r.r).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sel ? (
        <div className="tp-panel tp-trade-detail" style={{ marginTop: 12 }}>
          <div className="trader-suite-kicker">Execution detail</div>
          <dl className="tp-board-dl">
            <dt>Source</dt>
            <dd>{sel.source}</dd>
            <dt>Time</dt>
            <dd>{String(sel.when || '—')}</dd>
            <dt>Symbol / direction</dt>
            <dd>
              {sel.sym} · {sel.dir}
            </dd>
            <dt>Result</dt>
            <dd>{sel.res}</dd>
            <dt>PnL ($ journal) / R</dt>
            <dd>{sel.pnl != null ? `$${Number(sel.pnl).toFixed(2)}` : `${Number(sel.r).toFixed(2)} R`}</dd>
          </dl>
          <button type="button" className="trader-suite-btn" onClick={() => setSel(null)}>
            Close
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MissedList({ mTrades, playbookId, onDraftRefinement }) {
  const rows = (mTrades || []).filter((m) => !playbookId || m.playbookId === playbookId);
  if (!rows.length) {
    return (
      <div className="tp-empty tp-empty--compact">
        <strong>No missed or mis-executed setups logged here.</strong>
        <p>Use <em>Log missed setup</em> from the hub when price proves the thesis but you did not participate as planned.</p>
      </div>
    );
  }
  return (
    <div className="tp-missed-list">
      <p className="tp-trades-lede">Structured regret — turn misses into refinements, not anecdotes.</p>
      <ul className="tp-missed-cards">
        {rows.map((m) => (
          <li key={m.id} className="tp-missed-card">
            <div className="tp-missed-card__head">
              <span className="tp-missed-card__asset">{m.asset || '—'}</span>
              <span className="tp-pill tp-pill--status-draft">{m.missType || 'missed'}</span>
              <time className="tp-missed-card__when">{String(m.occurredAt || '').slice(0, 16)}</time>
            </div>
            {m.setupSummary ? <p className="tp-missed-card__block"><span>Thesis</span> {m.setupSummary}</p> : null}
            {m.missReason ? (
              <p className="tp-missed-card__block">
                <span>Process gap</span> {m.missReason}
              </p>
            ) : null}
            {m.whatShouldHaveHappened ? (
              <p className="tp-missed-card__block">
                <span>Corrective</span> {m.whatShouldHaveHappened}
              </p>
            ) : null}
            {m.lessonLearned ? (
              <p className="tp-missed-card__block tp-missed-card__lesson">
                <span>Lesson</span> {m.lessonLearned}
              </p>
            ) : null}
            <div className="tp-missed-card__foot">
              <span>Severity {m.severity ?? '—'}</span>
              {onDraftRefinement ? (
                <button type="button" className="tp-btn-ghost tp-btn-ghost--emphasis" onClick={() => onDraftRefinement(m)}>
                  Draft refinement note
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const NOTE_TYPE_COPY = {
  rule_refinement: { label: 'Rule refinement', hint: 'Change to definitions, checklist, or guardrails.', tone: 'gold' },
  lesson: { label: 'Lesson', hint: 'Capture a miss, near-miss, or process failure.', tone: 'blue' },
  performance: { label: 'Performance', hint: 'What the sample said — sizing, frequency, outcomes.', tone: 'green' },
  psychology: { label: 'Psychology', hint: 'Behavioural friction: hesitation, oversize, tilt.', tone: 'rose' },
};

function ReviewPanel({ notes, playbookId, onRefresh, prefill, onPrefillConsumed }) {
  const [noteType, setNoteType] = useState('performance');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [period, setPeriod] = useState('');

  useEffect(() => {
    if (!prefill) return;
    if (prefill.noteType) setNoteType(prefill.noteType);
    if (prefill.title !== undefined) setTitle(prefill.title);
    if (prefill.body !== undefined) setBody(prefill.body);
    if (prefill.period !== undefined) setPeriod(prefill.period);
    onPrefillConsumed?.();
  }, [prefill]);

  const submit = async () => {
    try {
      await Api.createTraderPlaybookReviewNote({ playbookId, noteType, title, body, periodLabel: period });
      toast.success('Refinement captured');
      onRefresh();
      setTitle('');
      setBody('');
    } catch {
      toast.error('Could not save note');
    }
  };

  const sorted = useMemo(
    () => [...(notes || [])].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
    [notes]
  );

  return (
    <div className="tp-review">
      <div className="tp-review-compose tp-panel tp-panel--tight">
        <div className="trader-suite-kicker">Compose refinement</div>
        <p className="tp-review-lede">Playbooks should evolve — tie each note to a sample, rule, or behavioural cue.</p>
        <div className="tp-note-type-picker">
          {Object.entries(NOTE_TYPE_COPY).map(([value, meta]) => (
            <button
              key={value}
              type="button"
              className={`tp-note-type-btn tp-note-type-btn--${meta.tone}${noteType === value ? ' tp-note-type-btn--active' : ''}`}
              onClick={() => setNoteType(value)}
            >
              <strong>{meta.label}</strong>
              <span>{meta.hint}</span>
            </button>
          ))}
        </div>
        <div className="tp-field-grid" style={{ marginTop: 12 }}>
          <div className="tp-field">
            <label>Review window</label>
            <input className="tp-input" value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="Week of …" />
          </div>
          <div className="tp-field" style={{ gridColumn: '1 / -1' }}>
            <label>Headline</label>
            <input className="tp-input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="tp-field" style={{ gridColumn: '1 / -1' }}>
            <label>Detail</label>
            <textarea className="tp-textarea" value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <button type="button" className="trader-suite-btn trader-suite-btn--primary" onClick={submit} disabled={!playbookId}>
            Commit refinement
          </button>
          {!playbookId ? (
            <span className="tp-review-warn">Save the playbook before attaching notes.</span>
          ) : null}
        </div>
      </div>
      <div className="trader-suite-kicker" style={{ margin: '20px 0 10px' }}>
        Timeline
      </div>
      {!sorted.length ? (
        <div className="tp-empty tp-empty--compact">No refinements yet — codify what you learned from analytics or missed trades.</div>
      ) : (
        <ul className="tp-review-timeline">
          {sorted.map((n) => {
            const meta = NOTE_TYPE_COPY[n.noteType] || { label: n.noteType, tone: 'muted' };
            return (
              <li key={n.id} className={`tp-review-card tp-review-card--${meta.tone}`}>
                <div className="tp-review-card__head">
                  <span className="tp-review-card__type">{meta.label}</span>
                  <time dateTime={n.createdAt}>{fmtDt(n.createdAt)}</time>
                </div>
                <h4 className="tp-review-card__title">{n.title || 'Untitled'}</h4>
                {n.periodLabel ? <p className="tp-review-card__period">{n.periodLabel}</p> : null}
                {n.body ? <p className="tp-review-card__body">{n.body}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TagDrawer({ trades, setups, onClose, onTag }) {
  const [pid, setPid] = useState('');
  const [tradeFilter, setTradeFilter] = useState('needs_attention');
  const [noSetupReason, setNoSetupReason] = useState(NO_SETUP_REASONS[0]?.value || 'other');

  const filtered = useMemo(() => {
    let t = trades || [];
    const tagU = (x) => String(x || '').toUpperCase();
    if (tradeFilter === 'all') return t;
    if (tradeFilter === 'needs_attention') {
      t = t.filter((r) => {
        const u = tagU(r.tag);
        return !r.tag || r.tag === '' || (u !== 'PLAYBOOK' && u !== 'NO_SETUP');
      });
    } else if (tradeFilter === 'playbook') {
      t = t.filter((r) => tagU(r.tag) === 'PLAYBOOK');
    } else if (tradeFilter === 'no_setup') {
      t = t.filter((r) => tagU(r.tag) === 'NO_SETUP');
    }
    return t;
  }, [trades, tradeFilter]);

  const reasonLabel = (v) => NO_SETUP_REASONS.find((r) => r.value === v)?.label || v;

  return (
    <div className="tp-drawer-overlay" onClick={onClose} role="presentation">
      <div className="tp-drawer tp-drawer--wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="tp-tag-drawer-title">
        <div className="tp-drawer__head">
          <h2 id="tp-tag-drawer-title">Classify executions</h2>
          <p className="tp-drawer__intro">
            Validator fills carry fill quality; journal carries narrative — both should reflect <strong>on-setup</strong>, <strong>off-plan</strong>, or
            honest <strong>no-setup</strong> classification.
          </p>
        </div>
        <div className="tp-field-grid">
          <div className="tp-field">
            <label>Target playbook</label>
            <select className="tp-select" value={pid} onChange={(e) => setPid(e.target.value)}>
              <option value="">Select…</option>
              {setups.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="tp-field">
            <label>No-setup reason</label>
            <select className="tp-select" value={noSetupReason} onChange={(e) => setNoSetupReason(e.target.value)}>
              {NO_SETUP_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <p className="tp-field-hint">{NO_SETUP_REASONS.find((r) => r.value === noSetupReason)?.description}</p>
          </div>
        </div>
        <div className="tp-tag-toolbar">
          <span className="trader-suite-kicker" style={{ margin: 0 }}>
            Show
          </span>
          {[
            { id: 'needs_attention', label: 'Needs attention' },
            { id: 'all', label: 'All' },
            { id: 'playbook', label: 'On playbook' },
            { id: 'no_setup', label: 'No setup' },
          ].map((x) => (
            <button
              key={x.id}
              type="button"
              className={`tp-filter-chip${tradeFilter === x.id ? ' tp-filter-chip--active' : ''}`}
              onClick={() => setTradeFilter(x.id)}
            >
              {x.label}
            </button>
          ))}
        </div>
        <div className="tp-table-wrap tp-table-wrap--drawer">
          <table className="tp-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Trade</th>
                <th>State</th>
                <th className="tp-table-actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="tp-table-empty-cell">
                    No trades match this filter — try <strong>All</strong> or classify new rows from the validator or journal.
                  </td>
                </tr>
              ) : (
                filtered.slice(0, 100).map((r) => {
                  const tagUpper = String(r.tag || '').toUpperCase();
                  const isPlaybook = tagUpper === 'PLAYBOOK';
                  const isNo = tagUpper === 'NO_SETUP';
                  return (
                    <tr key={`${r.source}-${r.id}`} className={isPlaybook ? 'tp-row--tagged' : isNo ? 'tp-row--nosetup' : ''}>
                      <td>
                        <span className={`tp-source-badge tp-source-badge--${r.source === 'validator' ? 'v' : 'j'}`}>
                          {r.source === 'validator' ? 'Validator' : 'Journal'}
                        </span>
                      </td>
                      <td>{r.label}</td>
                      <td>
                        {isPlaybook ? (
                          <span className="tp-pill tp-pill--status-active">On playbook</span>
                        ) : isNo ? (
                          <span className="tp-pill tp-pill--status-archived">
                            No setup{r.noSetupReason ? ` · ${reasonLabel(r.noSetupReason)}` : ''}
                          </span>
                        ) : (
                          <span className="tp-pill tp-pill--status-draft">Unclassified</span>
                        )}
                      </td>
                      <td>
                        <div className="tp-row-actions">
                          <button type="button" className="tp-btn-ghost" disabled={!pid} onClick={() => onTag(r, pid, 'PLAYBOOK')}>
                            Link
                          </button>
                          <button type="button" className="tp-btn-ghost tp-btn-ghost--danger" onClick={() => onTag(r, null, 'NO_SETUP', noSetupReason)}>
                            No setup
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="tp-drawer__footer">
          <button type="button" className="trader-suite-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function MissedDrawer({ setups, onClose, onSaved }) {
  const [playbookId, setPlaybookId] = useState('');
  const [asset, setAsset] = useState('');
  const [timeframe, setTimeframe] = useState('');
  const [session, setSession] = useState('');
  const [direction, setDirection] = useState('');
  const [missType, setMissType] = useState('missed');
  const [setupSummary, setSetupSummary] = useState('');
  const [qualificationReason, setQualificationReason] = useState('');
  const [missReason, setMissReason] = useState('');
  const [whatShouldHaveHappened, setWhatShouldHaveHappened] = useState('');
  const [lessonLearned, setLessonLearned] = useState('');
  const [severity, setSeverity] = useState(3);
  const [screenshotUrl, setScreenshotUrl] = useState('');

  const save = async () => {
    try {
      await Api.createTraderPlaybookMTrade({
        playbookId: playbookId || null,
        asset,
        timeframe,
        session,
        direction,
        missType,
        setupSummary,
        qualificationReason,
        missReason,
        whatShouldHaveHappened,
        lessonLearned,
        severity: Number(severity) || null,
        screenshotUrl: screenshotUrl || null,
        occurredAt: new Date().toISOString(),
      });
      toast.success('Logged');
      onSaved();
    } catch {
      toast.error('Could not log');
    }
  };

  return (
    <div className="tp-drawer-overlay" onClick={onClose}>
      <div className="tp-drawer" onClick={(e) => e.stopPropagation()}>
        <h2>Log missed / mis trade</h2>
        <div className="tp-field">
          <label>Playbook (optional)</label>
          <select className="tp-select" value={playbookId} onChange={(e) => setPlaybookId(e.target.value)}>
            <option value="">—</option>
            {setups.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="tp-field-grid">
          <div className="tp-field">
            <label>Asset</label>
            <input className="tp-input" value={asset} onChange={(e) => setAsset(e.target.value)} />
          </div>
          <div className="tp-field">
            <label>Timeframe</label>
            <input className="tp-input" value={timeframe} onChange={(e) => setTimeframe(e.target.value)} />
          </div>
          <div className="tp-field">
            <label>Session</label>
            <input className="tp-input" value={session} onChange={(e) => setSession(e.target.value)} />
          </div>
          <div className="tp-field">
            <label>Direction</label>
            <input className="tp-input" value={direction} onChange={(e) => setDirection(e.target.value)} />
          </div>
          <div className="tp-field">
            <label>Miss type</label>
            <select className="tp-select" value={missType} onChange={(e) => setMissType(e.target.value)}>
              <option value="missed">Missed</option>
              <option value="mis_execute">Mis-executed</option>
              <option value="early">Too early</option>
              <option value="late">Too late</option>
            </select>
          </div>
          <div className="tp-field">
            <label>Severity (1–5)</label>
            <input
              className="tp-input"
              type="number"
              min={1}
              max={5}
              value={severity}
              onChange={(e) => setSeverity(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="tp-field">
          <label>Setup summary</label>
          <textarea className="tp-textarea" value={setupSummary} onChange={(e) => setSetupSummary(e.target.value)} />
        </div>
        <div className="tp-field">
          <label>Why it qualified</label>
          <textarea className="tp-textarea" value={qualificationReason} onChange={(e) => setQualificationReason(e.target.value)} />
        </div>
        <div className="tp-field">
          <label>Why missed / mis-executed</label>
          <textarea className="tp-textarea" value={missReason} onChange={(e) => setMissReason(e.target.value)} />
        </div>
        <div className="tp-field">
          <label>What should have happened</label>
          <textarea className="tp-textarea" value={whatShouldHaveHappened} onChange={(e) => setWhatShouldHaveHappened(e.target.value)} />
        </div>
        <div className="tp-field">
          <label>Lesson learned</label>
          <textarea className="tp-textarea" value={lessonLearned} onChange={(e) => setLessonLearned(e.target.value)} />
        </div>
        <div className="tp-field">
          <label>Screenshot URL (optional)</label>
          <input className="tp-input" value={screenshotUrl} onChange={(e) => setScreenshotUrl(e.target.value)} />
        </div>
        <div className="tp-hub-actions">
          <button type="button" className="trader-suite-btn trader-suite-btn--primary" onClick={save}>
            Save
          </button>
          <button type="button" className="trader-suite-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function NoSetupDrawer({ summary, trades, setups, onClose, onTag }) {
  const noSetupRows = trades.filter((t) => String(t.tag).toUpperCase() === 'NO_SETUP');
  const reasonLabel = (v) => NO_SETUP_REASONS.find((x) => x.value === v)?.label || v || '—';
  return (
    <div className="tp-drawer-overlay" onClick={onClose} role="presentation">
      <div className="tp-drawer tp-drawer--wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="tp-drawer__head">
          <h2>No-setup &amp; discipline</h2>
          <p className="tp-drawer__intro">
            These executions were classified <strong>outside</strong> your playbooks. The breakdown matters: impulse, unplanned, or valid idea wrong book —
            keep reasons honest for adherence stats.
          </p>
          <p className="tp-discipline-banner">
            Global no-setup rows: <strong>{summary?.noSetupTrades ?? 0}</strong> · Still unclassified: <strong>{summary?.unclassifiedTrades ?? 0}</strong>
          </p>
        </div>
        <div className="tp-table-wrap tp-table-wrap--drawer">
          <table className="tp-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Trade</th>
                <th>Reason</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {noSetupRows.length ? (
                noSetupRows.slice(0, 40).map((r) => (
                  <tr key={`${r.source}-${r.id}`}>
                    <td>
                      <span className={`tp-source-badge tp-source-badge--${r.source === 'validator' ? 'v' : 'j'}`}>
                        {r.source === 'validator' ? 'Validator' : 'Journal'}
                      </span>
                    </td>
                    <td>{r.label}</td>
                    <td>{reasonLabel(r.noSetupReason)}</td>
                    <td>
                      <button type="button" className="tp-btn-ghost" onClick={() => onTag(r, setups[0]?.id, 'PLAYBOOK')} disabled={!setups[0]}>
                        Link playbook
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="tp-table-empty-cell">
                    No no-setup rows in this sample — open <strong>Classify executions</strong> to tag incoming trades.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="tp-drawer__footer">
          <button type="button" className="trader-suite-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
