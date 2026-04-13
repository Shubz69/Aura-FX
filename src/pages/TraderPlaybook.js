import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
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
  computeExecutionBreakdownsTaggedAll,
  summarizeMissedPatterns,
} from '../lib/trader-playbook/analyticsClient';
import {
  RULE_GROUPS,
  OVERVIEW_FIELDS,
  NO_SETUP_REASONS,
  WIZARD_FLOW,
  WIZARD_BASICS_FIELDS,
  buildWizardReviewSnapshot,
  LIST_SECTION_LABELS,
} from '../lib/trader-playbook/rulesCopy';
import { MID, METRIC_LABEL } from '../lib/trader-playbook/metricDefinitions';
import { MetricLabel } from '../lib/trader-playbook/MetricTooltip';
import {
  buildPlaybookReviewPrefillFromSearchParams,
  stripReplayHandoffParams,
  TR_HANDOFF,
} from '../lib/trader-replay/replayToolHandoff';
import { TRADE_VALIDATOR_BASE as TV_BASE, PLAYBOOK_MISSED_REVIEW_PATH } from '../lib/trader-playbook/playbookPaths';
import '../styles/TraderPlaybookTerminalTokens.css';
import '../styles/aura-analysis/AuraDashboard.css';
import '../styles/TraderPlaybookPremium.css';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'rules', label: 'Rules' },
  { id: 'checklist', label: 'Checklist' },
  { id: 'trades', label: 'Executions' },
  { id: 'missed', label: 'Missed' },
  { id: 'analytics', label: 'Performance' },
  { id: 'review', label: 'Refine' },
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

function applyWizardField(wd, bucket, key, value) {
  return normalizeSetup({ ...wd, ...rulesFieldPatch(wd, bucket, key, value) });
}

function clipText(s, max = 180) {
  if (!s || !String(s).trim()) return '';
  const t = String(s).replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function fmtPct(x) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${Math.round(x * 1000) / 10}%`;
}

function fmtPF(x) {
  if (x == null || Number.isNaN(x)) return '—';
  return x >= 10 ? `${x.toFixed(1)}` : `${Math.round(x * 100) / 100}`;
}

function fmtFixed(x, digits = 2) {
  const n = Number(x);
  return Number.isFinite(n) ? n.toFixed(digits) : '—';
}

function fmtDt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function fmtShortDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const DOW_CHART_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DOW_AXIS_LABEL = { Mon: 'Mo', Tue: 'Tu', Wed: 'We', Thu: 'Th', Fri: 'Fr', Sat: 'Sa', Sun: 'Su' };

function countPlaybookExecutionsThisMonth(vTrades, jTrades, playbookId) {
  if (!playbookId) return 0;
  const now = new Date();
  const y = now.getFullYear();
  const mo = now.getMonth();
  const inMonth = (iso) => {
    const d = iso ? new Date(iso) : null;
    return d && !Number.isNaN(d.getTime()) && d.getFullYear() === y && d.getMonth() === mo;
  };
  let n = 0;
  (vTrades || []).forEach((t) => {
    if (
      t.playbookSetupId === playbookId &&
      String(t.setupTagType || '').toUpperCase() === 'PLAYBOOK' &&
      inMonth(t.createdAt)
    ) {
      n += 1;
    }
  });
  (jTrades || []).forEach((t) => {
    if (
      t.playbookSetupId === playbookId &&
      String(t.setupTagType || '').toUpperCase() === 'PLAYBOOK' &&
      inMonth(t.date)
    ) {
      n += 1;
    }
  });
  return n;
}

/** Turn freeform overview / rule text into short bullet lines (no fabrication). */
function bulletListFromText(raw, maxItems = 7) {
  if (!raw || !String(raw).trim()) return [];
  const t = String(raw).replace(/\r\n/g, '\n').trim();
  const byBullet = t
    .split(/\n+/)
    .map((s) => s.replace(/^\s*[•\-*]\s*/, '').trim())
    .filter(Boolean);
  if (byBullet.length > 1) return byBullet.slice(0, maxItems);
  const bySemi = t.split(/;+/).map((s) => s.trim()).filter(Boolean);
  if (bySemi.length > 1) return bySemi.slice(0, maxItems);
  return t.length > 200 ? [clipText(t, 240)] : [t];
}

const CHECKLIST_THRESHOLD = 0.85;

const CHECKLIST_READINESS = {
  NO_ITEMS: { label: 'No active checklist items', tone: 'muted' },
  FAILED_REQUIRED: { label: 'Not qualified — required gates still open', tone: 'bad' },
  QUALIFIED: { label: 'Qualified — proceed only with defined risk', tone: 'good' },
  BORDERLINE: { label: 'Borderline — elevated discretion', tone: 'warn' },
  WEAK: { label: 'Not ready — revisit checklist items', tone: 'bad' },
};

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
  const [searchParams, setSearchParams] = useSearchParams();
  const replayPlaybookConsumedRef = useRef(false);

  const [vTrades, setVTrades] = useState([]);
  const [jTrades, setJTrades] = useState([]);
  const [mTrades, setMTrades] = useState([]);
  const [reviewNotes, setReviewNotes] = useState([]);

  const [drawer, setDrawer] = useState(null);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardDraft, setWizardDraft] = useState(null);

  const [checklistMode, setChecklistMode] = useState('builder');
  const [checklistTick, setChecklistTick] = useState({});
  const manageMenuRef = useRef(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  const loadCore = useCallback(async ({ showLoading = true, hubTradeSamples = false } = {}) => {
    if (showLoading) setLoading(true);
    try {
      const onHub = viewRef.current === 'hub' || hubTradeSamples;
      const settled = await Promise.allSettled([
        Api.getTraderPlaybookSetups(),
        Api.getTraderPlaybookSummary(),
        Api.getAuraAnalysisTrades({}),
        Api.getJournalTrades({}),
        ...(onHub ? [Api.getTraderPlaybookMTrades({})] : []),
      ]);
      const [sr, sumr, vr, jr, mr] = settled;
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
      if (vr.status === 'fulfilled' && Array.isArray(vr.value?.data?.trades)) setVTrades(vr.value.data.trades);
      if (jr.status === 'fulfilled' && Array.isArray(jr.value?.data?.trades)) setJTrades(jr.value.data.trades);
      if (onHub && mr && mr.status === 'fulfilled' && Array.isArray(mr.value?.data?.mTrades)) {
        setMTrades(mr.value.data.mTrades);
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

  useEffect(() => {
    if (!drawer) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setDrawer(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  useEffect(() => {
    if (!detailMenuOpen) return undefined;
    const onDown = (e) => {
      if (manageMenuRef.current && !manageMenuRef.current.contains(e.target)) {
        setDetailMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [detailMenuOpen]);

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

  useEffect(() => {
    if (replayPlaybookConsumedRef.current || loading || !setups.length) return;
    if (!searchParams.get(TR_HANDOFF.origin) && !searchParams.get('replaySessionId')) return;
    const hint = (searchParams.get('replayHint') || '').trim().toLowerCase();
    const row = hint
      ? setups.find((s) => (s.name || '').trim().toLowerCase() === hint)
      : null;
    if (!row?.id) {
      replayPlaybookConsumedRef.current = true;
      setSearchParams(stripReplayHandoffParams(searchParams), { replace: true });
      return;
    }
    const tab = searchParams.get(TR_HANDOFF.detailTab) === 'review' ? 'review' : 'overview';
    const prefill = buildPlaybookReviewPrefillFromSearchParams(searchParams);
    replayPlaybookConsumedRef.current = true;
    void openDetail(row.id, tab, prefill);
    setSearchParams(stripReplayHandoffParams(searchParams), { replace: true });
  }, [loading, setups, searchParams, setSearchParams, openDetail]);

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

  const hubVSum = useMemo(() => summarizeValidatorTrades(vTrades, null, { allTaggedPlaybooks: true }), [vTrades]);
  const hubJSum = useMemo(() => summarizeJournalTrades(jTrades, null, { allTaggedPlaybooks: true }), [jTrades]);
  const hubBreakdown = useMemo(() => computeExecutionBreakdownsTaggedAll(vTrades, jTrades), [vTrades, jTrades]);
  const hubMPatternsAll = useMemo(() => summarizeMissedPatterns(mTrades, null), [mTrades]);
  const hubInsights = useMemo(
    () =>
      ruleBasedInsights({
        validatorSummary: hubVSum,
        journalSummary: hubJSum,
        globalSummary: summary,
        mPatterns: hubMPatternsAll,
        breakdowns: hubBreakdown,
        playbookName: '',
      }),
    [hubVSum, hubJSum, summary, hubMPatternsAll, hubBreakdown]
  );

  const hubTopIssues = useMemo(() => {
    const { hurting = [], refine = [], working = [] } = hubInsights;
    return [...hurting, ...refine, ...working].slice(0, 5);
  }, [hubInsights]);

  const hubSpotlightPlaybookId = useMemo(() => {
    const rows = setups.filter((s) => {
      const st = String(s.status || 'active').toLowerCase();
      return st !== 'draft' && st !== 'archived';
    });
    const pool = rows.length ? rows : setups;
    if (!pool.length) return null;
    return [...pool].sort((a, b) => String(b.lastUsedAt || '').localeCompare(String(a.lastUsedAt || '')))[0].id;
  }, [setups]);

  const playbookNameById = useMemo(() => {
    const m = {};
    (setups || []).forEach((s) => {
      if (s?.id) m[s.id] = s.name || 'Playbook';
    });
    return m;
  }, [setups]);

  const hubRecentMissed = useMemo(() => {
    return [...(mTrades || [])]
      .sort((a, b) => String(b.occurredAt || b.createdAt || '').localeCompare(String(a.occurredAt || a.createdAt || '')))
      .slice(0, 8);
  }, [mTrades]);

  const hubDisciplineInsight = useMemo(() => {
    const disc = summary || {};
    if (disc.processGapLabel) return disc.processGapLabel;
    const ns = disc.noSetupRate;
    const classified = (disc.taggedTrades ?? 0) + (disc.noSetupTrades ?? 0);
    if (ns != null && classified >= 8 && ns >= 0.12) {
      return `Discipline pressure — ${(ns * 100).toFixed(0)}% of classified executions are ${METRIC_LABEL.OFF_PLAN.toLowerCase()}.`;
    }
    return null;
  }, [summary]);

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
        playbookName: form.name,
      }),
    [vSum, jSum, summary, mPatterns, breakdown, form.name]
  );

  const processCostHint = useMemo(() => {
    const disc = summary || {};
    const ns = disc.noSetupRate;
    const classified = (disc.taggedTrades ?? 0) + (disc.noSetupTrades ?? 0);
    if (ns != null && ns > 0.2 && classified >= 10) {
      return `${(ns * 100).toFixed(0)}% of classified executions are off-plan — that portion of the book cannot be attributed to any measured edge.`;
    }
    return null;
  }, [summary]);

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
      toast.success(tagType === 'NO_SETUP' ? 'Marked off-plan' : 'Linked to playbook');
      await refreshTrades();
      await loadCore({ showLoading: false });
      if (view === 'detail' && selectedId) loadDetailData(selectedId);
    } catch {
      toast.error('Could not update trade');
    }
  };

  const openHubAnalytics = () => {
    const active = setups.find((s) => String(s.status || 'active').toLowerCase() !== 'archived') || setups[0];
    if (!active) {
      toast.info('Create a playbook first to view analytics in context.');
      return;
    }
    openDetail(active.id, 'analytics');
  };

  const renderHub = () => {
    if (loading) {
      return (
        <div className="tp-root tp-root--loading" aria-busy="true" aria-label="Loading playbooks">
          <div className="tp-hub-max">
          <div className="tp-hub-skel-strip">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="tp-skeleton tp-skeleton--hub-stat" />
            ))}
          </div>
          <div className="tp-skeleton tp-skeleton--insight" />
          <div className="tp-hub-command-grid tp-hub-command-grid--skeleton">
            <div className="tp-skeleton tp-skeleton--hub-col" />
            <div className="tp-skeleton tp-skeleton--hub-col" />
            <div className="tp-skeleton tp-skeleton--hub-col" />
          </div>
          <p className="tp-loading-caption">Loading playbooks and execution sample…</p>
          </div>
        </div>
      );
    }

    const disc = summary || {};
    const tagPct = disc.disciplineTaggedVsAll != null ? fmtPct(disc.disciplineTaggedVsAll) : '—';
    const noSetupPct = disc.noSetupRate != null ? fmtPct(disc.noSetupRate) : '—';
    const adhere = disc.adherenceRate != null ? fmtPct(disc.adherenceRate) : '—';
    const taggedN = disc.taggedTrades ?? 0;
    const noSetupN = disc.noSetupTrades ?? 0;
    const classifiedPair = taggedN + noSetupN > 0 ? `${taggedN} / ${taggedN + noSetupN}` : '—';
    const dowMap = Object.fromEntries(hubBreakdown.byDow || []);
    const dowMax = Math.max(1, ...DOW_CHART_ORDER.map((d) => dowMap[d] || 0));
    const vb = disc.validatorBreakdown || {};
    const jb = disc.journalBreakdown || {};
    const onBookV = vb.tagged ?? 0;
    const onBookJ = jb.tagged ?? 0;
    const onBookSplitDen = Math.max(1, onBookV + onBookJ);
    const totalRollup = (vb.sampleSize ?? 0) + (jb.sampleSize ?? 0);
    const classifiedBook = taggedN + noSetupN + (disc.unclassifiedTrades ?? 0);

    return (
      <div className="tp-root tp-root--hub">
        <div className="tp-hub-max">
        <section className="tp-hub-discipline-strip" aria-label="Discipline overview">
          <div className="tp-hub-discipline-cards">
            <div className="tp-panel tp-hub-disc-card tp-hub-disc-card--onbook">
              <span className="tp-hub-disc-card__label">
                <MetricLabel metricId={MID.ON_BOOK_SHARE_CLASSIFIED}>On-book</MetricLabel>
              </span>
              <strong className="tp-hub-disc-card__value">{adhere}</strong>
              <small className="tp-hub-disc-card__hint">{METRIC_LABEL.ON_BOOK_EXECUTIONS} · {classifiedPair}</small>
              {disc.adherenceRate != null ? (
                <div className="tp-hub-microbar tp-hub-microbar--green" aria-hidden>
                  <span style={{ width: `${Math.min(100, Math.round(disc.adherenceRate * 100))}%` }} />
                </div>
              ) : null}
            </div>
            <div className="tp-panel tp-hub-disc-card tp-hub-disc-card--offplan">
              <span className="tp-hub-disc-card__label">
                <MetricLabel metricId={MID.OFF_PLAN_RATE_CLASSIFIED}>{METRIC_LABEL.OFF_PLAN}</MetricLabel>
              </span>
              <strong className="tp-hub-disc-card__value">{noSetupPct}</strong>
              <small className="tp-hub-disc-card__hint">of classified executions</small>
              {disc.noSetupRate != null ? (
                <div className="tp-hub-microbar tp-hub-microbar--red" aria-hidden>
                  <span style={{ width: `${Math.min(100, Math.round(disc.noSetupRate * 100))}%` }} />
                </div>
              ) : null}
            </div>
            <div className="tp-panel tp-hub-disc-card tp-hub-disc-card--missed">
              <span className="tp-hub-disc-card__label">
                <MetricLabel metricId={MID.MISSED_LOG}>Missed</MetricLabel>
              </span>
              <strong className="tp-hub-disc-card__value">{disc.missedTrades ?? 0}</strong>
              <small className="tp-hub-disc-card__hint">logged setups</small>
            </div>
            <div className="tp-panel tp-hub-disc-card tp-hub-disc-card--coverage">
              <span className="tp-hub-disc-card__label">
                <MetricLabel metricId={MID.CLASSIFICATION_COVERAGE}>Coverage</MetricLabel>
              </span>
              <strong className="tp-hub-disc-card__value">{tagPct}</strong>
              <small className="tp-hub-disc-card__hint">on-book vs full rollup</small>
              {disc.disciplineTaggedVsAll != null ? (
                <div className="tp-hub-microbar tp-hub-microbar--blue" aria-hidden>
                  <span style={{ width: `${Math.min(100, Math.round(disc.disciplineTaggedVsAll * 100))}%` }} />
                </div>
              ) : null}
            </div>
            <div className="tp-panel tp-hub-disc-card tp-hub-disc-card--best">
              <span className="tp-hub-disc-card__label">
                <MetricLabel metricId={MID.LEADING_SETUP}>Best playbook</MetricLabel>
              </span>
              <strong className="tp-hub-disc-card__value tp-hub-disc-card__value--text">{disc.bestPlaybook?.name?.slice(0, 28) || '—'}</strong>
              <small className="tp-hub-disc-card__hint">by sample expectancy</small>
            </div>
          </div>
          {hubDisciplineInsight ? <p className="tp-hub-discipline-insight">{hubDisciplineInsight}</p> : null}
          {hubDisciplineInsight ? null : processCostHint ? <p className="tp-hub-discipline-insight tp-hub-discipline-insight--muted">{processCostHint}</p> : null}
        </section>

        <nav className="tp-terminal-flow" aria-label="Execution workspace">
          <span className="tp-terminal-flow__label">Workspace</span>
          <div className="tp-terminal-flow__links">
            <Link to={`${TV_BASE}/checklist`} className="tp-terminal-flow__link">
              Checklist
            </Link>
            <span className="tp-terminal-flow__sep" aria-hidden>
              ·
            </span>
            <Link to={`${TV_BASE}/calculator`} className="tp-terminal-flow__link">
              Trade calculator
            </Link>
            <span className="tp-terminal-flow__sep" aria-hidden>
              ·
            </span>
            <Link to={PLAYBOOK_MISSED_REVIEW_PATH} className="tp-terminal-flow__link">
              Missed review
            </Link>
          </div>
        </nav>

        <div className="tp-hub-command-grid">
          <div className="tp-hub-col tp-hub-col--left">
            <div className="tp-hub-col-head">
              <span className="tp-kicker">Your playbooks</span>
            </div>
            <div className="tp-toolbar tp-toolbar--elevated tp-toolbar--hub">
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

            <div className="tp-hub-playbook-stack">
              {filteredSetups.map((s) => {
                const pm = metricsByPlaybook[s.id] || {};
                const pmClosed = (pm.wins || 0) + (pm.losses || 0) + (pm.breakevens || 0);
                const st = (s.status || 'active').toLowerCase();
                const assetChips = (s.assets || '')
                  .split(',')
                  .map((x) => x.trim())
                  .filter(Boolean)
                  .slice(0, 4);
                const isSpotlight = hubSpotlightPlaybookId && s.id === hubSpotlightPlaybookId;
                const wrBar = pm.winRate != null ? Math.round(pm.winRate * 100) : 0;
                return (
                  <article
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openDetail(s.id);
                      }
                    }}
                    className={`tp-playbook-card tp-playbook-card--${st} tp-playbook-card--hub${isSpotlight ? ' tp-playbook-card--hub-spotlight' : ''}`}
                    onClick={() => openDetail(s.id)}
                  >
                    <div className="tp-playbook-card__title-row tp-playbook-card__title-row--hub">
                      <span className="tp-playbook-card__badge tp-playbook-card__badge--hub" style={{ color: s.color || undefined }} aria-hidden>
                        {s.icon || '📘'}
                      </span>
                      <h3 className="tp-playbook-card__title tp-playbook-card__title--hub">{s.name}</h3>
                      <span className={`tp-pill tp-pill--status-${st === 'archived' ? 'archived' : st === 'draft' ? 'draft' : 'active'}`}>
                        {st === 'archived' ? 'Archived' : st === 'draft' ? 'Draft' : 'Active'}
                      </span>
                    </div>
                    <p className="tp-playbook-card__meta-line tp-playbook-card__meta-line--hub">
                      {[s.setupType, s.marketType, s.session].filter(Boolean).join(' · ') || 'Complete context in Rules'}
                      <span className="tp-playbook-card__meta-sep" aria-hidden>
                        {' '}
                        ·{' '}
                      </span>
                      <span className="tp-playbook-card__meta-dates">
                        Upd {fmtDt(s.updatedAt)} · Used {fmtDt(s.lastUsedAt)}
                      </span>
                    </p>
                    <div className="tp-pill-row tp-pill-row--hub-tight">
                      {(assetChips.length ? assetChips : ['Define assets']).map((x, i) => (
                        <span key={`${s.id}-chip-${i}`} className="tp-pill tp-pill--asset">
                          {x}
                        </span>
                      ))}
                    </div>
                    <div className="tp-playbook-card__metric-strip" role="group" aria-label="Playbook metrics">
                      <div className="tp-playbook-card__metric-cell">
                        <span className="tp-playbook-card__metric-label">
                          <MetricLabel metricId={MID.WIN_RATE_PLAYBOOK}>{METRIC_LABEL.WIN_RATE}</MetricLabel>
                          {pmClosed > 0 ? <span className="tp-metric-sample"> · n={pmClosed}</span> : null}
                        </span>
                        <strong>{pm.winRate != null ? fmtPct(pm.winRate) : '—'}</strong>
                      </div>
                      <div className="tp-playbook-card__metric-cell">
                        <span className="tp-playbook-card__metric-label">
                          <MetricLabel metricId={MID.PROFIT_FACTOR_PLAYBOOK}>{METRIC_LABEL.PROFIT_FACTOR}</MetricLabel> (V)
                        </span>
                        <strong>{fmtPF(pm.profitFactor)}</strong>
                      </div>
                      <div className="tp-playbook-card__metric-cell">
                        <span className="tp-playbook-card__metric-label">
                          <MetricLabel metricId={MID.ON_BOOK_EXECUTIONS_PLAYBOOK}>{METRIC_LABEL.ON_BOOK_EXECUTIONS}</MetricLabel>
                        </span>
                        <strong>{pm.taggedTrades ?? 0}</strong>
                      </div>
                    </div>
                    {pm.winRate != null ? (
                      <div className="tp-hub-wr-hint" aria-hidden>
                        <span style={{ width: `${wrBar}%` }} />
                      </div>
                    ) : null}
                    <div className="tp-card-actions tp-card-actions--split" onClick={(e) => e.stopPropagation()}>
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

            <div className="tp-hub-col-cta">
              <button type="button" className="trader-suite-btn trader-suite-btn--primary" onClick={startNewWizard}>
                New playbook
              </button>
              <button type="button" className="trader-suite-btn" onClick={() => openTagDrawer()}>
                Classify trades
              </button>
              <button type="button" className="trader-suite-btn" onClick={() => setDrawer('missed')}>
                Log missed setup
              </button>
            </div>
          </div>

          <div className="tp-hub-col tp-hub-col--mid">
            <div className="tp-hub-col-head">
              <span className="tp-kicker">Performance</span>
            </div>
            <div className="tp-panel tp-hub-mid-card">
              <div className="tp-hub-mid-metrics">
                <div>
                  <span className="tp-hub-mid-k">
                    <MetricLabel metricId={MID.GLOBAL_WIN_RATE}>{METRIC_LABEL.WIN_RATE}</MetricLabel> (book-wide)
                  </span>
                  <strong>{fmtPct(disc.globalWinRate)}</strong>
                </div>
                <div>
                  <span className="tp-hub-mid-k">
                    <MetricLabel metricId={MID.GLOBAL_PROFIT_FACTOR}>{METRIC_LABEL.PROFIT_FACTOR}</MetricLabel> (V, book-wide)
                  </span>
                  <strong>{fmtPF(disc.globalProfitFactor)}</strong>
                </div>
              </div>
              <div className="tp-hub-mid-divider" />
              <div className="tp-hub-mid-metrics tp-hub-mid-metrics--compact">
                <div>
                  <span className="tp-hub-mid-k">
                    <MetricLabel metricId={MID.OFF_PLAN_RATE_CLASSIFIED}>{METRIC_LABEL.OFF_PLAN}</MetricLabel>
                  </span>
                  <strong>{noSetupPct}</strong>
                </div>
                <div>
                  <span className="tp-hub-mid-k">
                    <MetricLabel metricId={MID.MISSED_LOG}>Missed</MetricLabel>
                  </span>
                  <strong>{disc.missedTrades ?? 0}</strong>
                </div>
              </div>
              <button type="button" className="tp-hub-link-analytics tp-inline-link" onClick={openHubAnalytics}>
                Open performance tab
              </button>
            </div>

            <div className="tp-hub-col-head tp-hub-col-head--tight">
              <span className="tp-kicker">Top issues</span>
            </div>
            <div className="tp-panel tp-hub-mid-card tp-hub-issues">
              {hubTopIssues.length ? (
                <ul className="tp-hub-issue-list">
                  {hubTopIssues.map((line, i) => (
                    <li key={`issue-${i}`}>{clipText(line, 220)}</li>
                  ))}
                </ul>
              ) : (
                <p className="tp-hub-muted">Classify more executions to surface rule-based insights.</p>
              )}
            </div>

            <div className="tp-hub-col-head tp-hub-col-head--tight">
              <span className="tp-kicker">Trading rhythm</span>
              <span className="tp-hub-rhythm-caption">{hubBreakdown.sampleSize} on-book fills in client sample</span>
            </div>
            <div className="tp-panel tp-hub-mid-card tp-hub-rhythm">
              {hubBreakdown.sampleSize > 0 ? (
                <div className="tp-hub-dow-bars" aria-label="Tagged executions by weekday">
                  {DOW_CHART_ORDER.map((d) => {
                    const c = dowMap[d] || 0;
                    const h = Math.round((c / dowMax) * 100);
                    return (
                      <div key={d} className="tp-hub-dow-cell">
                        <div className="tp-hub-dow-bar-wrap">
                          <span className="tp-hub-dow-bar" style={{ height: `${h}%` }} title={`${d}: ${c}`} />
                        </div>
                        <span className="tp-hub-dow-label">{DOW_AXIS_LABEL[d] || d}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="tp-hub-muted">No tagged playbook executions in the loaded validator + journal sample yet.</p>
              )}
            </div>
          </div>

          <div className="tp-hub-col tp-hub-col--right">
            <div className="tp-hub-col-head">
              <span className="tp-kicker">Recent missed setups</span>
              <Link to={PLAYBOOK_MISSED_REVIEW_PATH} className="tp-hub-col-head__link">
                Full review →
              </Link>
            </div>
            <div className="tp-panel tp-hub-side-card">
              {hubRecentMissed.length ? (
                <ul className="tp-hub-missed-list">
                  {hubRecentMissed.map((m) => (
                    <li key={m.id} className="tp-hub-missed-row">
                      <span className="tp-hub-missed-dot" aria-hidden />
                      <div className="tp-hub-missed-main">
                        <span className="tp-hub-missed-name">{playbookNameById[m.playbookId] || 'Unlinked'}</span>
                        <span className="tp-hub-missed-date">{fmtShortDate(m.occurredAt || m.createdAt)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="tp-hub-muted">No missed setups logged yet.</p>
              )}
            </div>

            <div className="tp-hub-col-head tp-hub-col-head--tight">
              <span className="tp-kicker">Sample depth</span>
            </div>
            <div className="tp-panel tp-hub-side-card tp-hub-depth">
              <div className="tp-hub-depth-line">
                <span className="tp-hub-mid-k">Rows in rollup</span>
                <strong>{totalRollup}</strong>
              </div>
              <div className="tp-hub-depth-line">
                <span className="tp-hub-mid-k">Classified book</span>
                <strong>{classifiedBook}</strong>
              </div>
              <div className="tp-hub-depth-line">
                <span className="tp-hub-mid-k">
                  <MetricLabel metricId={MID.ON_BOOK_EXECUTIONS_GLOBAL}>{METRIC_LABEL.ON_BOOK_EXECUTIONS}</MetricLabel>
                </span>
                <strong>{taggedN}</strong>
              </div>
              <div className="tp-hub-depth-bars" aria-label="Validator versus journal on-book split">
                <div className="tp-hub-depth-bar-row">
                  <span>Validator</span>
                  <div className="tp-hub-split-bar">
                    <span className="tp-hub-split-bar__fill tp-hub-split-bar__fill--v" style={{ width: `${Math.round((onBookV / onBookSplitDen) * 100)}%` }} />
                  </div>
                  <span>{onBookV}</span>
                </div>
                <div className="tp-hub-depth-bar-row">
                  <span>Journal</span>
                  <div className="tp-hub-split-bar">
                    <span className="tp-hub-split-bar__fill tp-hub-split-bar__fill--j" style={{ width: `${Math.round((onBookJ / onBookSplitDen) * 100)}%` }} />
                  </div>
                  <span>{onBookJ}</span>
                </div>
              </div>
              <button type="button" className="tp-hub-link-analytics tp-inline-link" onClick={() => setDrawer('noSetup')}>
                Inspect off-plan rows
              </button>
            </div>
          </div>
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
              <li>Classify trades — link executions or mark off-plan honestly</li>
              <li>Log missed setups — capture what the process failed to deliver</li>
            </ul>
            <div className="tp-empty__actions">
              <button type="button" className="trader-suite-btn trader-suite-btn--primary" onClick={startNewWizard}>
                New playbook
              </button>
              <button type="button" className="trader-suite-btn" onClick={() => openTagDrawer()}>
                Classify trades
              </button>
              <button type="button" className="trader-suite-btn" onClick={() => setDrawer('missed')}>
                Log missed setup
              </button>
              <Link to={`${TV_BASE}/checklist`} className="trader-suite-btn tp-empty__link-btn">
                Pre-trade checklist
              </Link>
            </div>
          </div>
        ) : null}
        {setups.length > 0 && !filteredSetups.length ? (
          <div className="tp-empty tp-empty--inline">
            Nothing matches this filter.{' '}
            <button type="button" className="tp-inline-link" onClick={() => { setHubFilter('all'); setSearch(''); }}>
              Reset filters
            </button>
          </div>
        ) : null}
        </div>
      </div>
    );
  };

  const renderDetail = () => {
    const st = String(form.status || 'active').toLowerCase();
    const readinessMeta = CHECKLIST_READINESS[checklistProgress.readiness] || CHECKLIST_READINESS.NO_ITEMS;
    const globalTagged = summary?.taggedTrades ?? 0;
    const thisTagged = detailMetrics.taggedTrades ?? vSum.count + jSum.count;
    const detailClosed =
      (detailMetrics.wins || 0) + (detailMetrics.losses || 0) + (detailMetrics.breakevens || 0);
    const onBookExecCount = detailMetrics.taggedTrades != null ? detailMetrics.taggedTrades : vSum.count + jSum.count;
    const oppNotes = [];
    if (globalTagged >= 12 && thisTagged <= 3) {
      oppNotes.push(
        'This playbook is lightly used versus your classified book — either it is a niche edge or it should be merged into a broader definition before you trust the stats.'
      );
    }
    if (mPatterns.total >= 4) {
      oppNotes.push(
        `${mPatterns.total} missed / mis-execution entries on file — if the setup was valid, that is execution tax; if not, tighten qualification in Rules.`
      );
    }
    if (breakdown.sampleSize >= 10 && breakdown.byDow.length) {
      const [d, n] = breakdown.byDow[0];
      oppNotes.push(`Execution clusters on ${d} (${n} tagged) — schedule review right after that session block while memory is fresh.`);
    }

    const detailExecThisMonth = countPlaybookExecutionsThisMonth(vTrades, jTrades, selectedId);
    const detailWinRate = detailMetrics.winRate ?? vSum.winRate;
    const detailPF = detailMetrics.profitFactor ?? vSum.profitFactor;
    const covPct = summary?.disciplineTaggedVsAll != null ? fmtPct(summary.disciplineTaggedVsAll) : '—';
    const detailTopIssueLines = [...(insights.hurting || []), ...(insights.refine || [])].filter(Boolean).slice(0, 6);
    const dowMapD = Object.fromEntries(breakdown.byDow || []);
    const dowMaxD = Math.max(1, ...DOW_CHART_ORDER.map((d) => dowMapD[d] || 0));
    const useJournalExpectancy = jSum.count >= 3 && jSum.expectancyR != null && Number.isFinite(jSum.expectancyR);
    const expDisplay = useJournalExpectancy
      ? `${jSum.expectancyR >= 0 ? '+' : ''}${fmtFixed(jSum.expectancyR, 2)}R`
      : fmtFixed(vSum.expectancy, 2);
    const bestBullets = bulletListFromText(form.overviewBlocks?.worksBest);
    const avoidFromText = bulletListFromText(form.overviewBlocks?.avoid);
    const avoidChips = (form.doNotTrade || []).filter(Boolean).slice(0, 6);
    const avoidBullets = [...avoidFromText, ...avoidChips.map((c) => `Do not trade: ${c}`)];
    const entryBullets = bulletListFromText(
      [form.overviewBlocks?.entryModelSummary, form.entryRules?.entryTrigger, form.entryRules?.confirmationType].filter(Boolean).join('\n')
    );
    const stopBullets = bulletListFromText([form.exitRules?.stopPlacement, form.exitRules?.invalidationLogic].filter(Boolean).join('\n'));
    const exitBullets = bulletListFromText(
      [form.exitRules?.scaleOutRule, form.exitRules?.trailingLogic, form.exitRules?.holdVsExit].filter(Boolean).join('\n')
    );
    const sortedReviewNotes = [...(reviewNotes || [])].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const compactNotes = sortedReviewNotes.slice(0, 3);
    const isLeadingPlaybook = summary?.bestPlaybook?.id === selectedId;
    const winsShow = detailMetrics.wins ?? 0;
    const lossesShow = detailMetrics.losses ?? 0;

    return (
      <div className="tp-root tp-root--detail-command">
        <div className="tp-hub-max">
        <button
          type="button"
          className="tp-detail-back"
          onClick={() => {
            setView('hub');
            loadCore({ hubTradeSamples: true, showLoading: false });
          }}
        >
          ← Back to hub
        </button>

        <header className="tp-detail-command-hero">
          <div className="tp-detail-command-hero__left">
            <span className="tp-detail-command-hero__icon" style={{ color: form.color || undefined }} aria-hidden>
              {form.icon || '📘'}
            </span>
            <div className="tp-detail-command-hero__copy">
              <div className="tp-detail-command-hero__title-row">
                <h1 className="tp-detail-command-hero__name">{form.name}</h1>
                <span className={`tp-pill tp-pill--status-${st === 'archived' ? 'archived' : st === 'draft' ? 'draft' : 'active'}`}>
                  {st === 'archived' ? 'Archived' : st === 'draft' ? 'Draft' : 'Active'}
                </span>
              </div>
              <p className="tp-detail-command-hero__desc">
                {form.description || 'Describe the thesis, regime, and non‑negotiables for this edge.'}
              </p>
              <p className="tp-detail-command-hero__context">
                {[form.setupType, form.marketType, form.session].filter(Boolean).join(' · ') || 'Session and regime live in Overview'}
                {form.assets ? (
                  <>
                    {' · '}
                    <span>{form.assets}</span>
                  </>
                ) : null}
                {form.timeframes ? (
                  <>
                    {' · '}
                    <span>{form.timeframes}</span>
                  </>
                ) : null}
              </p>
            </div>
          </div>
          <div className="tp-detail-command-hero__actions">
            <div
              ref={manageMenuRef}
              className={`tp-detail-overflow${detailMenuOpen ? ' tp-detail-overflow--open' : ''}`}
            >
              <button
                type="button"
                className="trader-suite-btn"
                aria-expanded={detailMenuOpen}
                onClick={() => setDetailMenuOpen((o) => !o)}
              >
                Manage playbook
              </button>
              {detailMenuOpen ? (
                <div className="tp-detail-overflow__menu" role="menu">
                  <button type="button" className="tp-overflow-item tp-overflow-item--accent" onClick={() => { setDetailMenuOpen(false); saveSetup(false); }} disabled={saving}>
                    {saving ? 'Saving…' : 'Save & lock in'}
                  </button>
                  <button type="button" className="tp-overflow-item" onClick={() => { setDetailMenuOpen(false); saveSetup(true); }} disabled={saving}>
                    Save as draft
                  </button>
                  <button type="button" className="tp-overflow-item" onClick={() => { setDetailMenuOpen(false); resetLocal(); }}>
                    Revert unsaved edits
                  </button>
                  {selectedId ? (
                    <button type="button" className="tp-overflow-item" onClick={() => { setDetailMenuOpen(false); duplicatePlaybook(selectedId); }}>
                      Duplicate playbook
                    </button>
                  ) : null}
                  {selectedId ? (
                    <button type="button" className="tp-overflow-item" onClick={() => { setDetailMenuOpen(false); archivePlaybook(selectedId); }}>
                      Archive
                    </button>
                  ) : null}
                  {selectedId ? (
                    <button type="button" className="tp-overflow-item tp-overflow-item--danger" onClick={() => { setDetailMenuOpen(false); deletePlaybook(selectedId); }}>
                      Delete
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <button type="button" className="trader-suite-btn" onClick={() => setDetailTab('trades')}>
              Add trade
            </button>
            <button
              type="button"
              className="trader-suite-btn trader-suite-btn--primary"
              onClick={() => {
                void openTagDrawer();
              }}
            >
              Classify trades
            </button>
          </div>
        </header>

        <p className="tp-detail-hero-subline">
          Last used {fmtShortDate(form.lastUsedAt)} — {detailExecThisMonth} executions this month
        </p>

        <nav className="tp-terminal-flow tp-terminal-flow--detail" aria-label="Execution workspace">
          <span className="tp-terminal-flow__label">Flow</span>
          <div className="tp-terminal-flow__links">
            <Link to={`${TV_BASE}/checklist`} className="tp-terminal-flow__link">
              Checklist
            </Link>
            <span className="tp-terminal-flow__sep" aria-hidden>
              ·
            </span>
            <Link to={`${TV_BASE}/calculator`} className="tp-terminal-flow__link">
              Calculator
            </Link>
            <span className="tp-terminal-flow__sep" aria-hidden>
              ·
            </span>
            <Link to={PLAYBOOK_MISSED_REVIEW_PATH} className="tp-terminal-flow__link">
              Missed review
            </Link>
          </div>
        </nav>

        <section className="tp-detail-prismetrics" aria-label="Primary playbook metrics">
          <div className="tp-panel tp-detail-pri-card tp-detail-pri-card--wr">
            <span className="tp-detail-pri-card__label">
              <MetricLabel metricId={MID.WIN_RATE_PLAYBOOK}>{METRIC_LABEL.WIN_RATE}</MetricLabel>
            </span>
            <strong className="tp-detail-pri-card__value">{fmtPct(detailWinRate)}</strong>
            <small className="tp-detail-pri-card__sub">
              {detailClosed > 0 ? `${detailClosed} closes (V+J)` : `${vSum.count + jSum.count} tagged rows`}
            </small>
            {detailWinRate != null ? (
              <div className="tp-detail-pri-bar tp-detail-pri-bar--green" aria-hidden>
                <span style={{ width: `${Math.min(100, Math.round(detailWinRate * 100))}%` }} />
              </div>
            ) : null}
          </div>
          <div className="tp-panel tp-detail-pri-card tp-detail-pri-card--pf">
            <span className="tp-detail-pri-card__label">
              <MetricLabel metricId={MID.PROFIT_FACTOR_PLAYBOOK}>{METRIC_LABEL.PROFIT_FACTOR}</MetricLabel> (V)
            </span>
            <strong className="tp-detail-pri-card__value">{fmtPF(detailPF)}</strong>
            <small className="tp-detail-pri-card__sub">{vSum.count > 0 ? `${vSum.count} validator closes` : 'No validator sample'}</small>
            {vSum.count > 0 && detailPF != null && Number.isFinite(detailPF) ? (
              <div className="tp-detail-pri-bar tp-detail-pri-bar--purple" aria-hidden>
                <span style={{ width: `${Math.min(100, Math.round((Number(detailPF) / 3) * 50))}%` }} />
              </div>
            ) : null}
          </div>
          <div className="tp-panel tp-detail-pri-card tp-detail-pri-card--exp">
            <span className="tp-detail-pri-card__label">
              {useJournalExpectancy ? (
                <MetricLabel metricId={MID.EXPECTANCY_R_JOURNAL_PLAYBOOK}>Expectancy (R · journal)</MetricLabel>
              ) : (
                <MetricLabel metricId={MID.EXPECTANCY_DOLLAR_VALIDATOR_PLAYBOOK}>Expectancy $ (validator)</MetricLabel>
              )}
            </span>
            <strong className="tp-detail-pri-card__value">{expDisplay}</strong>
            <small className="tp-detail-pri-card__sub">
              {useJournalExpectancy ? `${jSum.count} journal rows` : `${vSum.count} validator closes`}
            </small>
          </div>
          <div className="tp-panel tp-detail-pri-card tp-detail-pri-card--cov">
            <span className="tp-detail-pri-card__label">
              <MetricLabel metricId={MID.CLASSIFICATION_COVERAGE}>Coverage</MetricLabel>
            </span>
            <strong className="tp-detail-pri-card__value">{covPct}</strong>
            <small className="tp-detail-pri-card__sub">Full validator + journal rollup</small>
            {summary?.disciplineTaggedVsAll != null ? (
              <div className="tp-detail-pri-bar tp-detail-pri-bar--blue" aria-hidden>
                <span style={{ width: `${Math.min(100, Math.round(summary.disciplineTaggedVsAll * 100))}%` }} />
              </div>
            ) : null}
          </div>
          <div className="tp-panel tp-detail-pri-card tp-detail-pri-card--total">
            <span className="tp-detail-pri-card__label">
              <MetricLabel metricId={MID.ON_BOOK_EXECUTIONS_PLAYBOOK}>{METRIC_LABEL.ON_BOOK_EXECUTIONS}</MetricLabel>
            </span>
            <strong className="tp-detail-pri-card__value">{onBookExecCount}</strong>
            <small className="tp-detail-pri-card__sub">This playbook · merged summary</small>
          </div>
        </section>

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
            <div className="tp-overview-stack">
              <div className="tp-detail-layout-grid">
                <div className="tp-detail-layout-col tp-detail-layout-col--strategy">
                  <div className="tp-kicker tp-detail-layout-kicker">At a glance</div>
                  <div className="tp-detail-at-glance-split">
                    <section className="tp-panel tp-detail-glance-card tp-detail-glance-card--best" aria-label="Best conditions">
                      <h3 className="tp-detail-glance-card__title">Best conditions</h3>
                      {bestBullets.length ? (
                        <ul className="tp-detail-bullet-list">
                          {bestBullets.map((line, i) => (
                            <li key={`b-${i}`}>{line}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="tp-detail-glance-empty">Define when this edge is live in Overview → When this edge is live.</p>
                      )}
                    </section>
                    <section className="tp-panel tp-detail-glance-card tp-detail-glance-card--avoid" aria-label="Avoid conditions">
                      <h3 className="tp-detail-glance-card__title">Avoid conditions</h3>
                      {avoidBullets.length ? (
                        <ul className="tp-detail-bullet-list tp-detail-bullet-list--avoid">
                          {avoidBullets.map((line, i) => (
                            <li key={`a-${i}`}>{line}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="tp-detail-glance-empty">Add stand-down narrative or do-not-trade chips under Rules.</p>
                      )}
                    </section>
                  </div>

                  <section className="tp-panel tp-detail-exec-model" aria-label="Execution model">
                    <h3 className="tp-detail-glance-card__title">Execution model</h3>
                    <div className="tp-detail-exec-block">
                      <span className="tp-detail-exec-k">Entry</span>
                      {entryBullets.length ? (
                        <ul className="tp-detail-bullet-list">
                          {entryBullets.map((line, i) => (
                            <li key={`e-${i}`}>{line}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="tp-detail-glance-empty">Capture trigger and confirmation in Rules or Overview.</p>
                      )}
                    </div>
                    <div className="tp-detail-exec-block">
                      <span className="tp-detail-exec-k">Stop / invalidation</span>
                      {stopBullets.length ? (
                        <ul className="tp-detail-bullet-list">
                          {stopBullets.map((line, i) => (
                            <li key={`s-${i}`}>{line}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="tp-detail-glance-empty">Define stop placement and invalidation in Rules.</p>
                      )}
                    </div>
                    <div className="tp-detail-exec-block">
                      <span className="tp-detail-exec-k">Exit / management</span>
                      {exitBullets.length ? (
                        <ul className="tp-detail-bullet-list">
                          {exitBullets.map((line, i) => (
                            <li key={`x-${i}`}>{line}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="tp-detail-glance-empty">Add scale-out and trailing logic under Rules.</p>
                      )}
                    </div>
                  </section>

                  <section className="tp-panel tp-detail-notes-compact" aria-label="Recent review notes">
                    <h3 className="tp-detail-glance-card__title">Review notes (compact)</h3>
                    {compactNotes.length ? (
                      <ul className="tp-detail-compact-notes">
                        {compactNotes.map((n) => (
                          <li key={n.id}>
                            <span className="tp-detail-compact-notes__date">{fmtShortDate(n.createdAt)}</span>
                            <span className="tp-detail-compact-notes__title">{n.title || 'Note'}</span>
                            <span className="tp-detail-compact-notes__body">{clipText(n.body || '', 100)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="tp-detail-glance-empty">No notes yet — open the Refine tab to add one.</p>
                    )}
                    <button type="button" className="tp-inline-link tp-detail-notes-link" onClick={() => setDetailTab('review')}>
                      Open full refine tab
                    </button>
                  </section>
                </div>

                <div className="tp-detail-layout-col tp-detail-layout-col--performance">
                  <div className="tp-kicker tp-detail-layout-kicker">Performance insights</div>
                  <div className="tp-detail-perf-mini-grid">
                    <div className="tp-panel tp-detail-perf-mini">
                      <span className="tp-detail-perf-mini__k">
                        <MetricLabel metricId={MID.WIN_RATE_PLAYBOOK}>{METRIC_LABEL.WIN_RATE}</MetricLabel>
                      </span>
                      <strong>{fmtPct(detailWinRate)}</strong>
                    </div>
                    <div className="tp-panel tp-detail-perf-mini">
                      <span className="tp-detail-perf-mini__k">
                        <MetricLabel metricId={MID.PROFIT_FACTOR_PLAYBOOK}>{METRIC_LABEL.PROFIT_FACTOR}</MetricLabel> (V)
                      </span>
                      <strong>{fmtPF(detailPF)}</strong>
                    </div>
                    <div className="tp-panel tp-detail-perf-mini">
                      <span className="tp-detail-perf-mini__k">
                        <MetricLabel metricId={MID.OFF_PLAN_RATE_CLASSIFIED}>{METRIC_LABEL.OFF_PLAN}</MetricLabel> (book)
                      </span>
                      <strong>{summary?.noSetupRate != null ? fmtPct(summary.noSetupRate) : '—'}</strong>
                    </div>
                    <div className="tp-panel tp-detail-perf-mini">
                      <span className="tp-detail-perf-mini__k">
                        <MetricLabel metricId={MID.MISSED_LOG}>Missed</MetricLabel>
                      </span>
                      <strong>{mPatterns.total}</strong>
                    </div>
                  </div>

                  <section className="tp-panel tp-detail-top-issues" aria-label="Top issues">
                    <h3 className="tp-detail-glance-card__title">Top issues</h3>
                    {detailTopIssueLines.length ? (
                      <ul className="tp-detail-bullet-list tp-detail-bullet-list--issues">
                        {detailTopIssueLines.map((line, i) => (
                          <li key={`iss-${i}`}>{clipText(line, 200)}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="tp-detail-glance-empty">Classify more executions to surface desk insights.</p>
                    )}
                    <button type="button" className="tp-inline-link tp-detail-notes-link" onClick={() => setDetailTab('analytics')}>
                      Open performance tab
                    </button>
                  </section>

                  <section className="tp-panel tp-detail-notes-expanded" aria-label="Review notes expanded">
                    <h3 className="tp-detail-glance-card__title">Review notes (expanded)</h3>
                    {sortedReviewNotes.length ? (
                      <ul className="tp-detail-expanded-notes">
                        {sortedReviewNotes.map((n) => (
                          <li key={n.id}>
                            <div className="tp-detail-expanded-notes__head">
                              <span className="tp-detail-expanded-notes__date">{fmtShortDate(n.createdAt)}</span>
                              <span className="tp-detail-expanded-notes__type">{String(n.noteType || '').replace(/_/g, ' ')}</span>
                            </div>
                            <strong className="tp-detail-expanded-notes__title">{n.title || 'Note'}</strong>
                            <p className="tp-detail-expanded-notes__body">{clipText(n.body || '', 400)}</p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="tp-detail-glance-empty">No refinement notes on file for this playbook.</p>
                    )}
                  </section>
                </div>

                <div className="tp-detail-layout-col tp-detail-layout-col--side">
                  <div className="tp-kicker tp-detail-layout-kicker">Analytics snapshot</div>
                  <section className="tp-panel tp-detail-side-card" aria-label="Performance breakdown">
                    <h3 className="tp-detail-glance-card__title">Performance breakdown</h3>
                    <p className="tp-detail-side-leading">
                      {isLeadingPlaybook ? (
                        <span className="tp-detail-side-badge">Leading setup</span>
                      ) : (
                        <span className="tp-detail-side-muted">Book leader: {summary?.bestPlaybook?.name || '—'}</span>
                      )}
                    </p>
                    <dl className="tp-detail-side-dl">
                      <div>
                        <dt>
                          <MetricLabel metricId={MID.WIN_RATE_PLAYBOOK}>{METRIC_LABEL.WIN_RATE}</MetricLabel>
                        </dt>
                        <dd>{fmtPct(detailWinRate)}</dd>
                      </div>
                      <div>
                        <dt>Wins / losses</dt>
                        <dd>
                          {winsShow} / {lossesShow}
                        </dd>
                      </div>
                      <div>
                        <dt>
                          <MetricLabel metricId={MID.ON_BOOK_EXECUTIONS_PLAYBOOK}>Tagged sample</MetricLabel>
                        </dt>
                        <dd>{onBookExecCount}</dd>
                      </div>
                    </dl>
                  </section>

                  <section className="tp-panel tp-detail-side-card" aria-label="Win rate rhythm">
                    <h3 className="tp-detail-glance-card__title">
                      <MetricLabel metricId={MID.WIN_RATE_PLAYBOOK}>{METRIC_LABEL.WIN_RATE}</MetricLabel> rhythm
                    </h3>
                    {breakdown.sampleSize > 0 ? (
                      <div className="tp-detail-trend-bars" aria-hidden>
                        {DOW_CHART_ORDER.map((d) => {
                          const c = dowMapD[d] || 0;
                          const h = Math.round((c / dowMaxD) * 100);
                          return (
                            <div key={d} className="tp-detail-trend-cell">
                              <div className="tp-detail-trend-wrap">
                                <span className="tp-detail-trend-bar tp-detail-trend-bar--wr" style={{ height: `${h}%` }} title={`${d}: ${c}`} />
                              </div>
                              <span className="tp-detail-trend-label">{DOW_AXIS_LABEL[d]}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="tp-detail-glance-empty">No weekday sample for this playbook yet.</p>
                    )}
                  </section>

                  <section className="tp-panel tp-detail-side-card" aria-label="Profit factor context">
                    <h3 className="tp-detail-glance-card__title">
                      <MetricLabel metricId={MID.PROFIT_FACTOR_PLAYBOOK}>{METRIC_LABEL.PROFIT_FACTOR}</MetricLabel> (V) context
                    </h3>
                    {breakdown.sampleSize > 0 ? (
                      <div className="tp-detail-trend-bars" aria-hidden>
                        {DOW_CHART_ORDER.map((d) => {
                          const c = dowMapD[d] || 0;
                          const h = Math.round((c / dowMaxD) * 100);
                          return (
                            <div key={`pf-${d}`} className="tp-detail-trend-cell">
                              <div className="tp-detail-trend-wrap">
                                <span className="tp-detail-trend-bar tp-detail-trend-bar--pf" style={{ height: `${h}%` }} title={`${d}: ${c}`} />
                              </div>
                              <span className="tp-detail-trend-label">{DOW_AXIS_LABEL[d]}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="tp-detail-glance-empty">Tag validator fills to see activity by day.</p>
                    )}
                    <p className="tp-detail-side-foot">Bars reflect execution count by weekday — not PF by day.</p>
                  </section>
                </div>
              </div>

              <div className="tp-detail-editor-block">
                <div className="tp-kicker tp-detail-layout-kicker">Definitions &amp; editor</div>
                <div className="tp-detail-split">
                <div className="tp-panel tp-panel--tight">
                  <div className="trader-suite-kicker">Identity &amp; deployment</div>
                  <div className="tp-field-grid">
                    <div className="tp-field">
                      <label>Playbook name</label>
                      <input className="tp-input" value={form.name} onChange={(e) => applyChange({ name: e.target.value })} />
                    </div>
                    <div className="tp-field">
                      <label>Mark</label>
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
                      <label>Rotation</label>
                      <select className="tp-select" value={form.status} onChange={(e) => applyChange({ status: e.target.value })}>
                        <option value="active">Active</option>
                        <option value="draft">Draft</option>
                        <option value="archived">Archived</option>
                      </select>
                    </div>
                  </div>
                  <div className="tp-field" style={{ marginTop: 12 }}>
                    <label>Thesis</label>
                    <p className="tp-field-hint">One paragraph: what you are trying to exploit and why it exists in the market.</p>
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
                      <label>Primary session</label>
                      <input className="tp-input" value={form.session} onChange={(e) => applyChange({ session: e.target.value })} />
                    </div>
                    <div className="tp-field">
                      <label>Timeframe stack</label>
                      <input className="tp-input" value={form.timeframes} onChange={(e) => applyChange({ timeframes: e.target.value })} />
                    </div>
                    <div className="tp-field" style={{ gridColumn: '1 / -1' }}>
                      <label>Primary instruments</label>
                      <input className="tp-input" value={form.assets} onChange={(e) => applyChange({ assets: e.target.value })} />
                    </div>
                  </div>
                </div>
                <div className="tp-panel tp-panel--tight tp-panel--summary">
                  <div className="trader-suite-kicker">Refine the narrative</div>
                  <p className="tp-summary-lede">
                    Tight, falsifiable lines — if it cannot be proven wrong by the chart, it is not a rule.
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
                </div>
              </div>
              </div>
            </div>
          ) : null}

          {detailTab === 'rules' ? (
            <div className="tp-panel tp-panel--rules">
              <p className="tp-rules-intro">
                Built like a desk playbook: regime and bias first, then trigger and proof, then risk and management — only then psychology and
                stand-down rules.
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
                  <h3 className="tp-rule-group__title">Tags &amp; execution chips</h3>
                  <p className="tp-rule-group__subtitle">{LIST_SECTION_LABELS.tags.hint}</p>
                </header>
                <div className="tp-field">
                  <label>{LIST_SECTION_LABELS.tags.label}</label>
                  <TagEditor tags={form.tags} onChange={(tags) => applyChange({ tags })} />
                </div>
                <div className="tp-field-grid" style={{ marginTop: 14 }}>
                  <div className="tp-field">
                    <label>{LIST_SECTION_LABELS.doNotTrade.label}</label>
                    <p className="tp-field-hint">{LIST_SECTION_LABELS.doNotTrade.hint}</p>
                    <ChipList items={form.doNotTrade} onChange={(doNotTrade) => applyChange({ doNotTrade })} />
                  </div>
                  <div className="tp-field">
                    <label>{LIST_SECTION_LABELS.commonMistakes.label}</label>
                    <p className="tp-field-hint">{LIST_SECTION_LABELS.commonMistakes.hint}</p>
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
                  <h2 className="tp-analytics__title">Performance desk</h2>
                  <p className="tp-analytics__sub">
                    Same data as always — ordered for decisions: is the edge real, is process intact, where is rhythm breaking, are you leaving valid
                    trades on the table.
                  </p>
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
                  Send to Refine
                </button>
              </div>

              <div className="tp-analytics-readme">
                <p className="tp-analytics-readme__lede">
                  Everything here is tied to real executions you have classified — no projections. Read top to bottom: edge and sample size first,
                  then global discipline (honest off-plan tags), then rhythm. When something breaks, log it under Refine so the playbook and your
                  behaviour stay linked.
                </p>
              </div>

              <section className="tp-analytics-section">
                <h3 className="tp-analytics-section__title">Edge quality — is this setup worth trading?</h3>
                <p className="tp-analytics-section__lede">
                  Validator $ and journal R for rows tagged <strong>PLAYBOOK</strong> to this setup only.
                </p>
                <div className="tp-stat-grid tp-stat-grid--analytics">
                  <div className="tp-stat-card tp-stat-card--emph">
                    <span>
                      <MetricLabel metricId={MID.SAMPLE_VJ_TAGGED_PLAYBOOK}>Sample depth (V+J)</MetricLabel>
                    </span>
                    <strong>{vSum.count + jSum.count}</strong>
                    <small className="tp-stat-secondary">
                      {vSum.count} validator closes (win/loss/BE) · {jSum.count} journal rows on this playbook
                    </small>
                  </div>
                  <div className="tp-stat-card">
                    <span>
                      <MetricLabel metricId={MID.WIN_RATE_VALIDATOR_PLAYBOOK}>Win rate (validator)</MetricLabel>
                    </span>
                    <strong>{fmtPct(vSum.winRate)}</strong>
                    {vSum.count > 0 ? <small className="tp-stat-secondary">Based on {vSum.count} closed validator trades</small> : null}
                  </div>
                  <div className="tp-stat-card">
                    <span>
                      <MetricLabel metricId={MID.PROFIT_FACTOR_VALIDATOR_PLAYBOOK}>{METRIC_LABEL.PROFIT_FACTOR} (validator)</MetricLabel>
                    </span>
                    <strong>{fmtPF(vSum.profitFactor)}</strong>
                    {vSum.count > 0 ? <small className="tp-stat-secondary">Gross $ wins ÷ gross $|loss| on this sample</small> : null}
                  </div>
                  <div className="tp-stat-card">
                    <span>
                      <MetricLabel metricId={MID.EXPECTANCY_DOLLAR_VALIDATOR_PLAYBOOK}>Expectancy $ (validator)</MetricLabel>
                    </span>
                    <strong>{fmtFixed(vSum.expectancy, 2)}</strong>
                    {vSum.count > 0 ? <small className="tp-stat-secondary">n = {vSum.count} closes</small> : null}
                  </div>
                  <div className="tp-stat-card">
                    <span>
                      <MetricLabel metricId={MID.AVG_R_VALIDATOR_PLAYBOOK}>Avg R (validator)</MetricLabel>
                    </span>
                    <strong>{fmtFixed(vSum.avgR, 2)}</strong>
                  </div>
                  <div className="tp-stat-card">
                    <span>
                      <MetricLabel metricId={MID.EXPECTANCY_R_JOURNAL_PLAYBOOK}>Expectancy (R · journal)</MetricLabel>
                    </span>
                    <strong>{fmtFixed(jSum.expectancyR, 2)}</strong>
                    {jSum.count > 0 ? <small className="tp-stat-secondary">Based on {jSum.count} journal rows</small> : null}
                  </div>
                  <div className="tp-stat-card">
                    <span>
                      <MetricLabel metricId={MID.NET_PNL_VALIDATOR_PLAYBOOK}>Net $ (validator)</MetricLabel>
                    </span>
                    <strong>{fmtFixed(vSum.totalPnl, 2)}</strong>
                  </div>
                  <div className="tp-stat-card">
                    <span>
                      <MetricLabel metricId={MID.BEST_WORST_VALIDATOR_PLAYBOOK}>Best / worst $ (validator)</MetricLabel>
                    </span>
                    <strong>
                      {fmtFixed(vSum.best, 2)} / {fmtFixed(vSum.worst, 2)}
                    </strong>
                  </div>
                </div>
                {!vSum.count && !jSum.count ? (
                  <p className="tp-analytics-empty">
                    No validator or journal rows are tagged to this playbook yet. Open <strong>Classify executions</strong>, link fills to this setup,
                    then revisit — without tags, win rate and expectancy cannot mean anything here.
                  </p>
                ) : null}
              </section>

              <section className="tp-analytics-section">
                <h3 className="tp-analytics-section__title">Discipline — are you staying on plan?</h3>
                <p className="tp-analytics-section__lede">
                  Global book: same summary as the hub — on-book vs off-plan among <strong>classified</strong> rows, plus what is still unclassified.
                </p>
                <div className="tp-stat-grid tp-stat-grid--analytics">
                  <div className="tp-stat-card tp-stat-card--emph">
                    <span>
                      <MetricLabel metricId={MID.ON_BOOK_SHARE_CLASSIFIED}>On-book share (classified)</MetricLabel>
                    </span>
                    <strong>{summary?.adherenceRate != null ? fmtPct(summary.adherenceRate) : '—'}</strong>
                  </div>
                  <div className="tp-stat-card tp-stat-card--alert">
                    <span>
                      <MetricLabel metricId={MID.OFF_PLAN_RATE_CLASSIFIED}>Off-plan rate (classified)</MetricLabel>
                    </span>
                    <strong>{summary?.noSetupRate != null ? fmtPct(summary.noSetupRate) : '—'}</strong>
                  </div>
                  <div className="tp-stat-card">
                    <span>
                      <MetricLabel metricId={MID.UNCLASSIFIED}>{METRIC_LABEL.UNCLASSIFIED}</MetricLabel>
                    </span>
                    <strong>{summary?.unclassifiedTrades ?? '—'}</strong>
                  </div>
                  <div className="tp-stat-card">
                    <span>
                      <MetricLabel metricId={MID.MISSED_LOG}>{METRIC_LABEL.MISSED_LOG}</MetricLabel>
                    </span>
                    <strong>{mPatterns.total}</strong>
                    <small className="tp-stat-secondary">Entries scoped to this playbook in the missed log</small>
                  </div>
                  <div className="tp-stat-card tp-stat-card--wide">
                    <span>
                      <MetricLabel metricId={MID.TOP_MISS_PATTERN_PLAYBOOK}>Top miss label</MetricLabel>
                    </span>
                    <strong>
                      {mPatterns.topMissTypes?.length ? `${mPatterns.topMissTypes[0][0]} (${mPatterns.topMissTypes[0][1]})` : '—'}
                    </strong>
                  </div>
                </div>
                {!summary ? (
                  <p className="tp-analytics-empty">Summary not loaded — refresh the hub. Discipline rates need the server rollup.</p>
                ) : null}
              </section>

              <section className="tp-analytics-section tp-analytics-section--insights">
                <h3 className="tp-analytics-section__title">Desk read — edge · execution · next move</h3>
                <p className="tp-analytics-section__lede">Rule-based only — no fabricated stats.</p>
                <div className="tp-insight-cols">
                  <div>
                    <h4 className="tp-insight-heading">What is working</h4>
                    <ul className="tp-insight-list tp-insight-list--ok">
                      {(insights.working.length
                        ? insights.working
                        : ['Not enough closed tagged trades to judge whether this book is structurally sound.']
                      ).map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="tp-insight-heading">What is weakening the edge</h4>
                    <ul className="tp-insight-list tp-insight-list--bad">
                      {(insights.hurting.length
                        ? insights.hurting
                        : ['No supported drag in the current sample — keep tagging so this stays honest.']
                      ).map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="tp-insight-heading">What to tighten next</h4>
                    <ul className="tp-insight-list tp-insight-list--gold">
                      {(insights.refine.length
                        ? insights.refine
                        : ['Keep a short Refine note after each weekly review — rules drift without paper.']
                      ).map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>

              <section className="tp-analytics-section">
                <h3 className="tp-analytics-section__title">
                  <MetricLabel metricId={MID.EXECUTION_RHYTHM_PLAYBOOK}>Execution rhythm</MetricLabel>
                </h3>
                <p className="tp-analytics-section__lede">
                  Where tagged executions cluster — day, session, symbol; streaks from chronological win/loss runs.
                </p>
                {breakdown.sampleSize ? (
                  <div className="tp-breakdown-grid">
                    <div>
                      <div className="trader-suite-kicker">Day</div>
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
                      <div className="trader-suite-kicker">Symbol</div>
                      <ul className="tp-breakdown-list">
                        {breakdown.byPair.slice(0, 6).map(([k, v]) => (
                          <li key={k}>
                            {k} <strong>{v}</strong>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="trader-suite-kicker">Streaks</div>
                      <p className="tp-breakdown-streaks">
                        <strong>{breakdown.maxWinStreak}</strong> max win · <strong>{breakdown.maxLossStreak}</strong> max loss
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="tp-analytics-empty">
                    No tagged sample yet for rhythm — link validator and journal rows to this playbook. Breakdowns appear once those rows exist with
                    day/session/pair fields.
                  </p>
                )}
              </section>

              <section className="tp-analytics-section">
                <h3 className="tp-analytics-section__title">Deployment &amp; missed opportunity</h3>
                <p className="tp-analytics-section__lede">Under-used setups, heavy miss logs, and clustering hints — all from real counts.</p>
                {oppNotes.length ? (
                  <ul className="tp-insight-list tp-insight-list--neutral">
                    {oppNotes.map((x, idx) => (
                      <li key={`opp-${idx}-${String(x).slice(0, 24)}`}>{x}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="tp-analytics-empty">
                    Not enough contrast yet between this playbook and your global book — keep classifying executions and log missed setups so
                    under-use / over-use signals can surface.
                  </p>
                )}
              </section>
            </div>
          ) : null}

          {detailTab === 'review' ? (
            <div className="tp-panel">
              <ReviewPanel
                notes={reviewNotes}
                playbookId={selectedId}
                onRefresh={() => {
                  loadDetailData(selectedId);
                  loadCore({ showLoading: false });
                }}
                prefill={reviewPrefill}
                onPrefillConsumed={() => setReviewPrefill(null)}
              />
            </div>
          ) : null}
        </div>
        </div>
      </div>
    );
  };

  const renderWizard = () => {
    if (!wizardDraft) return null;
    const wd = wizardDraft;
    const step = wizardStep;
    const setWd = (p) => setWizardDraft((prev) => normalizeSetup({ ...prev, ...p }));
    const flowStep = WIZARD_FLOW[step] || WIZARD_FLOW[0];
    const reviewSnap = flowStep.kind === 'review' ? buildWizardReviewSnapshot(wd) : null;

    const renderWizardGroupFields = (groupId) => {
      const grp = RULE_GROUPS.find((g) => g.id === groupId);
      if (!grp) return null;
      return (
        <section key={groupId} className="tp-wizard-section">
          <header className="tp-wizard-section__head">
            <h3 className="tp-wizard-section__title">{grp.title}</h3>
            <p className="tp-wizard-section__subtitle">{grp.subtitle}</p>
          </header>
          <div className="tp-field-grid">
            {grp.fields.map((f) => {
              const bucket = wd[f.bucket] || {};
              const val = bucket[f.key] ?? '';
              return (
                <div key={`${f.bucket}-${f.key}`} className="tp-field">
                  <label>{f.label}</label>
                  <p className="tp-field-hint">{f.hint}</p>
                  {f.multiline === false ? (
                    <input
                      className="tp-input"
                      value={val}
                      placeholder={f.placeholder || ''}
                      onChange={(e) =>
                        setWizardDraft((prev) => applyWizardField(prev, f.bucket, f.key, e.target.value))
                      }
                    />
                  ) : (
                    <textarea
                      className="tp-textarea"
                      value={val}
                      placeholder={f.placeholder || ''}
                      onChange={(e) =>
                        setWizardDraft((prev) => applyWizardField(prev, f.bucket, f.key, e.target.value))
                      }
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      );
    };

    return (
      <div className="tp-drawer-overlay" role="presentation" onClick={() => setDrawer(null)}>
        <div
          className="tp-drawer tp-drawer--wizard"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tp-wizard-title"
        >
          <div className="tp-drawer__head">
            <h2 id="tp-wizard-title">Build a playbook</h2>
            <p className="tp-drawer__intro">
              You are defining a live strategy: regime, trigger, risk, and stand-down rules. Optional presets merge on the last step — your text wins
              on conflicts.
            </p>
          </div>
          <div className="tp-wizard-step-banner">
            <span className="tp-wizard-step-banner__n">
              Step {step + 1} / {WIZARD_FLOW.length}
            </span>
            <h3 className="tp-wizard-step-banner__title">{flowStep.title}</h3>
            <p className="tp-wizard-step-banner__sub">{flowStep.subtitle}</p>
          </div>
          <div className="tp-pill-row tp-wizard-steps">
            {WIZARD_FLOW.map((s, i) => (
              <span key={s.pill} className={`tp-pill${i === step ? ' tp-pill--status-draft' : ''}`}>
                {i + 1}. {s.pill}
              </span>
            ))}
          </div>
          {flowStep.kind === 'basics' ? (
            <div className="tp-field-grid">
              {WIZARD_BASICS_FIELDS.map((f) => (
                <div key={f.key} className="tp-field">
                  <label>{f.label}</label>
                  <p className="tp-field-hint">{f.hint}</p>
                  <input
                    className="tp-input"
                    value={wd[f.key] || ''}
                    placeholder={f.placeholder || ''}
                    onChange={(e) => setWd({ [f.key]: e.target.value })}
                  />
                </div>
              ))}
            </div>
          ) : null}
          {flowStep.kind === 'groups' ? (
            <div className="tp-wizard-groups">{flowStep.groupIds.map((id) => renderWizardGroupFields(id))}</div>
          ) : null}
          {flowStep.kind === 'review' && reviewSnap ? (
            <div className="tp-wizard-review">
              <div className="tp-wizard-review__card">
                <h4 className="tp-wizard-review__title">Strategy snapshot</h4>
                <p className="tp-wizard-review__identity">{reviewSnap.identity}</p>
                <dl className="tp-wizard-review__dl">
                  <div>
                    <dt>When this edge is live</dt>
                    <dd>{reviewSnap.liveEdge || '— Add narrative in Overview after save'}</dd>
                  </div>
                  <div>
                    <dt>Execution model</dt>
                    <dd>{reviewSnap.execution || '—'}</dd>
                  </div>
                  <div>
                    <dt>Risk model</dt>
                    <dd>{reviewSnap.risk || '—'}</dd>
                  </div>
                  <div>
                    <dt>Stand down</dt>
                    <dd>{reviewSnap.standDown || '—'}</dd>
                  </div>
                </dl>
                <p className="tp-wizard-review__checklist">{reviewSnap.checklistLine}</p>
                <p className="tp-wizard-review__save-hint">
                  Continue to the editor to finish the Overview board and checklist — then lock in when the definition matches how you actually trade.
                </p>
              </div>
              <div className="tp-wizard-finish">
                <p className="tp-wizard-finish__copy">
                  Optional: merge a preset skeleton. Fields you already wrote are preserved when keys overlap.
                </p>
                <div className="tp-hub-actions tp-hub-actions--wrap">
                  {Object.keys(PLAYBOOK_PRESETS).map((k) => (
                    <button
                      key={k}
                      type="button"
                      className="trader-suite-btn"
                      onClick={() => setWizardDraft((prev) => normalizeSetup({ ...prev, ...PLAYBOOK_PRESETS[k] }))}
                    >
                      Merge “{k}” preset
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          <div className="tp-hub-actions tp-wizard-actions">
            <button
              type="button"
              className="trader-suite-btn"
              disabled={step <= 0}
              onClick={() => setWizardStep((s) => Math.max(0, s - 1))}
            >
              Back
            </button>
            {step < WIZARD_FLOW.length - 1 ? (
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
                  toast.success('Draft ready in editor — refine Overview and Rules, then lock in.');
                }}
              >
                Open playbook editor
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
      title="Playbook"
      description="Build, execute, and refine your trading edge"
      stats={[]}
      primaryAction={null}
      secondaryActions={
        view === 'hub' ? (
          <Link to={PLAYBOOK_MISSED_REVIEW_PATH} className="trader-suite-btn">
            Missed review
          </Link>
        ) : null
      }
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
      <p className="tp-trades-lede">Rows tagged to this playbook only — this is the denominator for Performance on this setup.</p>
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
        <div className="tp-empty tp-empty--compact">
          No refinement notes on file — when analytics or missed setups change a rule, commit it here so the playbook and the chart stay aligned.
        </div>
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
            Every close should be <strong>on-book</strong> (linked to a playbook) or honestly <strong>off-plan</strong>. Unclassified rows hide the true cost of discretion — close the
            log before trusting any stat.
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
            <label>Off-plan reason</label>
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
            { id: 'playbook', label: 'On-book' },
            { id: 'no_setup', label: 'Off-plan' },
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
                          <span className="tp-pill tp-pill--status-active">On-book</span>
                        ) : isNo ? (
                          <span className="tp-pill tp-pill--status-archived">
                            Off-plan{r.noSetupReason ? ` · ${reasonLabel(r.noSetupReason)}` : ''}
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
                            Mark off-plan
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
    <div className="tp-drawer-overlay" onClick={onClose} role="presentation">
      <div className="tp-drawer tp-drawer--wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="tp-missed-drawer-title">
        <div className="tp-drawer__head">
          <h2 id="tp-missed-drawer-title">Log missed setup</h2>
          <p className="tp-drawer__intro">Capture valid process, failure to execute, or mis-execution — this feed powers opportunity analytics.</p>
        </div>
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
        <div className="tp-drawer__footer tp-hub-actions">
          <button type="button" className="trader-suite-btn trader-suite-btn--primary" onClick={save}>
            Save entry
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
          <h2>Off-plan discipline</h2>
          <p className="tp-drawer__intro">
            Off-plan fills are behavioural data: impulse, unplanned clicks, or the right idea in the wrong book. Honest reasons keep your adherence line
            credible.
          </p>
          <p className="tp-discipline-banner">
            Classified off-plan (global): <strong>{summary?.noSetupTrades ?? 0}</strong> · Unclassified (still blind):{' '}
            <strong>{summary?.unclassifiedTrades ?? 0}</strong>
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
