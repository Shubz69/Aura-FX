import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import TraderSuiteShell from '../components/TraderSuiteShell';
import { useAuth } from '../context/AuthContext';
import Api from '../services/Api';
import { formatWelcomeEyebrow, getUserFirstName } from '../utils/welcomeUser';
import { FaPen, FaTimes } from 'react-icons/fa';
import {
  PLAYBOOK_SETUP_OPTIONS,
  buildTraderLabHandoff,
  buildValidator,
  calculateRiskAmount,
  calculatePositionSizeUnits,
  calculateRiskReward,
  confidenceToConviction,
  convictionToConfidence,
  formatPositionLots,
  safeNumber,
  toYmd,
} from '../utils/traderSuite';
import TradingViewChartPanel from '../components/TradingViewChartPanel';
import TraderLabThesisBlock from '../components/trader-deck/TraderLabThesisBlock';
import TraderLabLoadingShell from '../components/trader-deck/TraderLabLoadingShell';
import { formatLabLevel } from '../lib/trader-deck/traderLabFormatters';
import {
  TRADER_LAB_HANDOFF_KEY,
  MARKET_DECODER_LAB_HANDOFF_KEY,
} from '../lib/aura-analysis/validator/validatorChecklistStorage';
import '../styles/trader-deck/TraderLabLayout.css';

const INSTRUMENTS = [
  { label: 'XAUUSD', value: 'OANDA:XAUUSD' },
  { label: 'XAGUSD', value: 'OANDA:XAGUSD' },
  { label: 'EURUSD', value: 'OANDA:EURUSD' },
  { label: 'GBPUSD', value: 'OANDA:GBPUSD' },
  { label: 'USDJPY', value: 'OANDA:USDJPY' },
  { label: 'AUDUSD', value: 'OANDA:AUDUSD' },
  { label: 'NZDUSD', value: 'OANDA:NZDUSD' },
  { label: 'USDCAD', value: 'OANDA:USDCAD' },
  { label: 'USDCHF', value: 'OANDA:USDCHF' },
  { label: 'EURJPY', value: 'OANDA:EURJPY' },
  { label: 'GBPJPY', value: 'OANDA:GBPJPY' },
  { label: 'EURGBP', value: 'OANDA:EURGBP' },
  { label: 'US500', value: 'OANDA:SPX500USD' },
  { label: 'NAS100', value: 'OANDA:NAS100USD' },
  { label: 'US30', value: 'OANDA:US30USD' },
  { label: 'SPY', value: 'AMEX:SPY' },
  { label: 'QQQ', value: 'NASDAQ:QQQ' },
  { label: 'IWM', value: 'AMEX:IWM' },
  { label: 'DIA', value: 'AMEX:DIA' },
  { label: 'GLD', value: 'AMEX:GLD' },
  { label: 'TLT', value: 'NASDAQ:TLT' },
  { label: 'USOIL', value: 'TVC:USOIL' },
  { label: 'UKOIL', value: 'TVC:UKOIL' },
  { label: 'XNGUSD', value: 'TVC:NATGASUSD' },
  { label: 'BTCUSD', value: 'COINBASE:BTCUSD' },
  { label: 'ETHUSD', value: 'COINBASE:ETHUSD' },
  { label: 'SOLUSD', value: 'BINANCE:SOLUSDT' },
  { label: 'XRPUSD', value: 'BINANCE:XRPUSDT' },
  { label: 'ADAUSD', value: 'BINANCE:ADAUSDT' },
  { label: 'DXY', value: 'TVC:DXY' },
  { label: 'VIX', value: 'TVC:VIX' },
];
const INSTRUMENT_VALUE_SET = new Set(INSTRUMENTS.map((x) => x.value));
const INSTRUMENT_LABEL_TO_VALUE = new Map(INSTRUMENTS.map((x) => [x.label, x.value]));

const CHART_INTERVALS = [
  { label: '15m', value: '15' },
  { label: '1H', value: '60' },
  { label: '4H', value: '240' },
  { label: '1D', value: '1D' },
];

const LOADING_TERMINAL_STATS = [
  { label: 'Market State', value: '…', tone: 'gold' },
  { label: 'Confidence', value: '…' },
  { label: 'Bias', value: '…' },
];

const DEFAULT_FORM = {
  sessionDate: toYmd(),
  chartSymbol: 'OANDA:XAUUSD',
  accountSize: 100000,
  marketBias: 'Bullish',
  marketState: 'Trending',
  auraConfidence: 72,
  todaysFocus: 'U.S. / China|Neutral\nEurope|Positive\nMiddle East|Negative',
  sessionGoal: 'Hold discipline on continuation entries; max 2 quality trades.',
  maxTradesAllowed: 3,
  keyDrivers:
    'Strong U.S. economic data supporting risk tone\nInstitutional inflows into metals\nDXY softening into NY close',
  fundamentalBacking: 'GDP Growth: 3.2% YoY\nInflation cooling: 2.9% → 2.4%\nSector strength in metals and energy',
  whatDoISee: '',
  setupName: 'London Breakout',
  whyIsThisValid: '',
  whatConfirmsEntry: '',
  conviction: 'medium',
  confidence: 72,
  riskLevel: 'Medium',
  entryPrice: 2235,
  stopLoss: 2218,
  targetPrice: 2265,
  riskPercent: 1,
  biasAligned: true,
  setupValid: true,
  entryConfirmed: true,
  riskDefined: true,
  livePnlR: 1.5,
  livePnlPercent: 0.8,
  currentPrice: 2236.4,
  distanceToSl: 18,
  distanceToTp: 29,
  emotions: 'Focused',
  duringNotes: '',
  outcome: 'win',
  resultR: 2.5,
  durationMinutes: 96,
  followedRules: true,
  entryCorrect: true,
  exitCorrect: false,
  whatToChange: '',
  emotionalIntensity: 30,
  mistakeTags: [],
  traderThesisUpdatedAt: null,
};

const TRADER_LAB_LOCAL_DRAFT_KEY = 'aura_trader_lab_last_draft_v1';

function readLocalDraft() {
  try {
    const raw = localStorage.getItem(TRADER_LAB_LOCAL_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeLocalDraft(payload) {
  try {
    localStorage.setItem(TRADER_LAB_LOCAL_DRAFT_KEY, JSON.stringify(payload || {}));
  } catch {
    // ignore storage failures
  }
}

function normalizeSession(session = {}) {
  const { traderThesis: _nestedThesis, whyValid: _legacyWhy, entryConfirmation: _legacyEntry, ...raw } = session;
  const whyIsThisValid =
    raw.whyIsThisValid != null
      ? String(raw.whyIsThisValid)
      : _legacyWhy != null
        ? String(_legacyWhy)
        : DEFAULT_FORM.whyIsThisValid;
  const whatConfirmsEntry =
    raw.whatConfirmsEntry != null
      ? String(raw.whatConfirmsEntry)
      : _legacyEntry != null
        ? String(_legacyEntry)
        : DEFAULT_FORM.whatConfirmsEntry;
  const merged = {
    ...DEFAULT_FORM,
    ...raw,
    mistakeTags: Array.isArray(raw.mistakeTags) ? raw.mistakeTags : DEFAULT_FORM.mistakeTags,
    chartSymbol: raw.chartSymbol || DEFAULT_FORM.chartSymbol,
    accountSize: raw.accountSize !== '' && raw.accountSize != null ? Number(raw.accountSize) : DEFAULT_FORM.accountSize,
    keyDrivers: raw.keyDrivers != null ? String(raw.keyDrivers) : DEFAULT_FORM.keyDrivers,
    fundamentalBacking:
      raw.fundamentalBacking != null ? String(raw.fundamentalBacking) : DEFAULT_FORM.fundamentalBacking,
    whatDoISee: raw.whatDoISee != null ? String(raw.whatDoISee) : DEFAULT_FORM.whatDoISee,
    whyIsThisValid,
    whatConfirmsEntry,
    traderThesisUpdatedAt: raw.traderThesisUpdatedAt != null ? raw.traderThesisUpdatedAt : DEFAULT_FORM.traderThesisUpdatedAt,
  };
  if (!raw.conviction && raw.confidence != null) {
    merged.conviction = confidenceToConviction(raw.confidence);
  }
  return merged;
}

/** API + local draft still use column names whyValid / entryConfirmation */
function toTraderLabPersistPayload(form, extras = {}) {
  const { whyIsThisValid, whatConfirmsEntry, ...rest } = form;
  return {
    ...rest,
    ...extras,
    whyValid: whyIsThisValid,
    entryConfirmation: whatConfirmsEntry,
  };
}

function linesToList(text) {
  return String(text || '')
    .split(/\n/)
    .map((l) => l.replace(/^[•\-\*]\s*/, '').trim())
    .filter(Boolean);
}

function parseGeopoliticalBlock(text) {
  const lines = String(text || '')
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.map((line) => {
    const pipe = line.indexOf('|');
    if (pipe === -1) return { region: line, sentiment: '—' };
    return {
      region: line.slice(0, pipe).trim(),
      sentiment: line.slice(pipe + 1).trim(),
    };
  });
}

function sentimentPillClass(s) {
  const x = String(s).toLowerCase();
  if (x.includes('positive') || x.includes('improv') || x.includes('bull')) return 'tlab-geo-pill tlab-geo-pill--pos';
  if (x.includes('negative') || x.includes('bear')) return 'tlab-geo-pill tlab-geo-pill--neg';
  return 'tlab-geo-pill tlab-geo-pill--mid';
}

function parseLevel(value) {
  if (value == null) return null;
  const m = String(value).match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function normalizeDecodedSymbol(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function chartSymbolFromDecoded(decodedSymbol) {
  const s = normalizeDecodedSymbol(decodedSymbol);
  if (!s) return DEFAULT_FORM.chartSymbol;
  if (INSTRUMENT_LABEL_TO_VALUE.has(s)) return INSTRUMENT_LABEL_TO_VALUE.get(s);
  if (/^[A-Z]{6}$/.test(s)) return `OANDA:${s}`;
  return s;
}

function displaySymbolFromChartSymbol(chartSymbol) {
  const raw = String(chartSymbol || '');
  if (!raw) return '—';
  const token = raw.includes(':') ? raw.split(':')[1] : raw;
  return token || raw;
}

function BiasPill({ bias }) {
  const b = String(bias || '').toLowerCase();
  let cls = 'tlab-pill-bias tlab-pill-bias--neutral';
  if (b.includes('bull')) cls = 'tlab-pill-bias tlab-pill-bias--bull';
  if (b.includes('bear')) cls = 'tlab-pill-bias tlab-pill-bias--bear';
  return <span className={cls}>{String(bias || '—').toUpperCase()}</span>;
}

export default function TraderLab() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [playbookSetups, setPlaybookSetups] = useState(PLAYBOOK_SETUP_OPTIONS);
  const [instrumentOptions, setInstrumentOptions] = useState(INSTRUMENTS);
  const [activeId, setActiveId] = useState(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [chartInterval, setChartInterval] = useState('60');
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const decoderImportAppliedRef = React.useRef(false);

  useEffect(() => {
    let active = true;
    Promise.allSettled([Api.getTraderLabSessions(), Api.getTraderPlaybookSetups()])
      .then(([sessionsRes, playbookRes]) => {
        if (!active) return;

        const nextSessions =
          sessionsRes.status === 'fulfilled' && Array.isArray(sessionsRes.value?.data?.sessions)
            ? sessionsRes.value.data.sessions.map(normalizeSession)
            : [];
        const nextSetups =
          playbookRes.status === 'fulfilled' && Array.isArray(playbookRes.value?.data?.setups)
            ? playbookRes.value.data.setups.map((item) => item.name).filter(Boolean)
            : [];

        if (nextSessions.length) {
          setSessions(nextSessions);
          setActiveId(nextSessions[0].id);
          setForm(nextSessions[0]);
        } else {
          const localDraft = readLocalDraft();
          if (localDraft) {
            setForm(normalizeSession(localDraft));
          }
        }

        if (nextSetups.length) {
          setPlaybookSetups(nextSetups);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (loading || decoderImportAppliedRef.current) return;
    let raw = '';
    try {
      raw = sessionStorage.getItem(MARKET_DECODER_LAB_HANDOFF_KEY) || '';
    } catch {
      raw = '';
    }
    if (!raw) {
      try {
        raw = localStorage.getItem(MARKET_DECODER_LAB_HANDOFF_KEY) || '';
      } catch {
        raw = '';
      }
    }
    if (!raw) return;
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    if (!parsed?.brief) return;
    const brief = parsed.brief || {};
    const handoff = parsed.traderLabHandoff && typeof parsed.traderLabHandoff === 'object' ? parsed.traderLabHandoff : null;
    const symbol = normalizeDecodedSymbol(
      handoff?.symbol || parsed.decodedSymbol || parsed.symbol || brief?.header?.asset || ''
    );
    const symbolUniverse = Array.isArray(parsed?.symbolUniverse)
      ? parsed.symbolUniverse.map((x) => normalizeDecodedSymbol(x)).filter(Boolean)
      : [];
    if (symbolUniverse.length > 0) {
      const merged = [...INSTRUMENTS];
      const seen = new Set(merged.map((x) => x.label));
      symbolUniverse.forEach((sym) => {
        if (seen.has(sym)) return;
        seen.add(sym);
        merged.push({ label: sym, value: chartSymbolFromDecoded(sym) });
      });
      setInstrumentOptions(merged);
    }
    const kln = handoff?.keyLevelsNumeric || {};
    const biasRaw = String(handoff?.bias || brief?.instantRead?.bias || '');
    const bias = biasRaw.toLowerCase();
    const resistance =
      kln.resistance1 != null && Number.isFinite(Number(kln.resistance1))
        ? Number(kln.resistance1)
        : parseLevel(brief?.keyLevels?.keyLevelsDisplay?.resistance1);
    const support =
      kln.support1 != null && Number.isFinite(Number(kln.support1))
        ? Number(kln.support1)
        : parseLevel(brief?.keyLevels?.keyLevelsDisplay?.support1);
    const spot =
      kln.spot != null && Number.isFinite(Number(kln.spot))
        ? Number(kln.spot)
        : parseLevel(brief?.header?.price);
    const entry = spot ?? DEFAULT_FORM.entryPrice;
    const isBear = bias.includes('bear');
    const isBull = bias.includes('bull');
    const structOk =
      (handoff?.dataSufficiency?.sufficientForStructure ?? brief?.meta?.dataSufficiency?.sufficientForStructure) !== false;
    const stop = structOk
      ? isBear
        ? resistance ?? DEFAULT_FORM.stopLoss
        : isBull
          ? support ?? DEFAULT_FORM.stopLoss
          : support ?? resistance ?? DEFAULT_FORM.stopLoss
      : DEFAULT_FORM.stopLoss;
    const target = structOk
      ? isBear
        ? support ?? DEFAULT_FORM.targetPrice
        : isBull
          ? resistance ?? DEFAULT_FORM.targetPrice
          : resistance ?? support ?? DEFAULT_FORM.targetPrice
      : DEFAULT_FORM.targetPrice;
    const exec = handoff?.execution || {};
    const scen = handoff?.scenarios || {};
    const mapped = normalizeSession({
      ...DEFAULT_FORM,
      sessionDate: toYmd(),
      setupName: symbol ? `Market Decoder · ${symbol}` : DEFAULT_FORM.setupName,
      chartSymbol: chartSymbolFromDecoded(symbol),
      marketBias: handoff?.bias || brief?.instantRead?.bias || DEFAULT_FORM.marketBias,
      marketState: handoff?.currentPosture || brief?.finalOutput?.currentPosture || DEFAULT_FORM.marketState,
      entryPrice: entry,
      stopLoss: stop,
      targetPrice: target,
      sessionGoal:
        `${[handoff?.currentPosture, handoff?.postureSubtitle, handoff?.thesis].filter(Boolean).join(' — ')
        || [brief?.finalOutput?.currentPosture, brief?.finalOutput?.postureSubtitle].filter(Boolean).join(' — ')
        || DEFAULT_FORM.sessionGoal}${!structOk ? ' — Decoder: insufficient daily history; confirm levels on your chart.' : ''}`,
      keyDrivers: Array.isArray(brief?.whatMattersNow)
        ? brief.whatMattersNow
            .map((x) => `${x?.label || 'Signal'}: ${x?.text || ''}`.trim())
            .filter(Boolean)
            .join('\n')
        : DEFAULT_FORM.keyDrivers,
      whatDoISee:
        [handoff?.bestApproach, handoff?.deskLogLine, brief?.instantRead?.bestApproach].filter(Boolean).join('\n') || '',
      whatConfirmsEntry:
        exec.entryCondition
        || brief?.executionGuidance?.entryCondition
        || brief?.executionGuidance?.preferredDirection
        || DEFAULT_FORM.whatConfirmsEntry,
      whyIsThisValid:
        exec.invalidation
        || handoff?.whatWouldChange
        || brief?.finalOutput?.whyThisPosture
        || brief?.executionGuidance?.invalidation
        || DEFAULT_FORM.whyIsThisValid,
      fundamentalBacking:
        [
          exec.preferredDirection && `Preferred: ${exec.preferredDirection}`,
          scen.bullish && `Bull case: ${scen.bullish}`,
          scen.bearish && `Bear case: ${scen.bearish}`,
          scen.noTrade && `Stand aside if: ${scen.noTrade}`,
          exec.riskConsideration && `Risk: ${exec.riskConsideration}`,
          exec.avoidThis && `Avoid: ${exec.avoidThis}`,
        ]
          .filter(Boolean)
          .join('\n') || DEFAULT_FORM.fundamentalBacking,
      decoderContext: {
        symbol,
        exportedAt: parsed.exportedAt || new Date().toISOString(),
        source: 'market_decoder',
        handoffVersion: parsed.version || null,
        generatedAt: brief?.meta?.generatedAt || null,
        posture: handoff?.currentPosture || brief?.finalOutput?.currentPosture || null,
        traderLabHandoff: handoff,
        brief,
      },
    });
    decoderImportAppliedRef.current = true;
    setActiveId(null);
    setForm(mapped);
    writeLocalDraft(mapped);
    setLastSavedAt(null);
    try {
      sessionStorage.removeItem(MARKET_DECODER_LAB_HANDOFF_KEY);
    } catch {
      // ignore
    }
    try {
      localStorage.removeItem(MARKET_DECODER_LAB_HANDOFF_KEY);
    } catch {
      // ignore
    }
    toast.success('Market Decoder context imported into Trader Lab. Save to keep it.');
  }, [loading]);

  const rr = useMemo(
    () => calculateRiskReward(form.entryPrice, form.stopLoss, form.targetPrice),
    [form.entryPrice, form.stopLoss, form.targetPrice]
  );

  const riskAmount = useMemo(
    () => calculateRiskAmount(form.accountSize, form.riskPercent),
    [form.accountSize, form.riskPercent]
  );

  const positionUnits = useMemo(
    () => calculatePositionSizeUnits(form.accountSize, form.riskPercent, form.entryPrice, form.stopLoss),
    [form.accountSize, form.riskPercent, form.entryPrice, form.stopLoss]
  );

  const positionLotsLabel = useMemo(
    () => formatPositionLots(form.chartSymbol, positionUnits),
    [form.chartSymbol, positionUnits]
  );

  const validator = useMemo(() => buildValidator(form), [form]);
  const rrOk = rr >= 1;

  const tradeValidatorRows = useMemo(() => {
    const rrStatus = rr >= 2 ? 'OPTIMAL' : rr >= 1 ? 'OK' : 'WEAK';
    const conflictStatus = form.setupValid && form.riskDefined ? 'CLEAR' : 'REVIEW';
    return [
      { label: 'Trend alignment', status: form.biasAligned ? 'YES' : 'NO', ok: form.biasAligned },
      { label: 'Risk / reward', status: rrStatus, ok: rr >= 1 },
      { label: 'Entry confirmation', status: form.entryConfirmed ? 'VALID' : 'PENDING', ok: form.entryConfirmed },
      { label: 'No major conflicts', status: conflictStatus, ok: form.setupValid && form.riskDefined },
    ];
  }, [form.biasAligned, form.setupValid, form.riskDefined, form.entryConfirmed, rr]);

  const validatorPanelOk = tradeValidatorRows.every((r) => r.ok);

  const stats = useMemo(
    () => [
      { label: 'Market State', value: form.marketState || '—', tone: 'gold' },
      { label: 'Confidence', value: `${form.auraConfidence}%` },
      {
        label: 'Bias',
        value: form.marketBias,
        tone: /bull/i.test(String(form.marketBias || '')) ? 'green' : undefined,
      },
    ],
    [form.auraConfidence, form.marketBias, form.marketState]
  );

  const geoRows = useMemo(() => parseGeopoliticalBlock(form.todaysFocus), [form.todaysFocus]);
  const driverLines = useMemo(() => linesToList(form.keyDrivers), [form.keyDrivers]);
  const fundamentalLines = useMemo(() => linesToList(form.fundamentalBacking), [form.fundamentalBacking]);
  const thesisMeta = useMemo(() => {
    const at = form.traderThesisUpdatedAt;
    if (!at) return null;
    try {
      return `Thesis saved · ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(at))}`;
    } catch {
      return 'Thesis saved';
    }
  }, [form.traderThesisUpdatedAt]);
  const savedLabRows = useMemo(() => {
    return [...sessions]
      .sort((a, b) => String(b.sessionDate || '').localeCompare(String(a.sessionDate || '')))
      .map((session) => ({
        id: session.id,
        date: session.sessionDate || '—',
        setupName: session.setupName || 'Untitled lab',
        symbol: displaySymbolFromChartSymbol(session.chartSymbol),
      }));
  }, [sessions]);

  const decoderLogRows = useMemo(() => {
    const rows = [];
    if (form.decoderContext) {
      const sym = form.decoderContext.symbol ? `${form.decoderContext.symbol} · ` : '';
      const posture = form.decoderContext.posture || 'Context linked';
      const when = form.decoderContext.generatedAt
        ? new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(form.decoderContext.generatedAt))
        : '';
      rows.push({ key: 'decoder', text: `${sym}${posture}${when ? ` · ${when}` : ''}` });
    }
    savedLabRows.slice(0, 5).forEach((row) => {
      rows.push({
        key: `lab-${row.id}`,
        text: `${row.setupName} · ${row.symbol} · ${row.date}`,
      });
    });
    if (rows.length === 0) {
      rows.push({ key: 'empty', text: 'No linked brief — export from Market Decoder. Saved labs appear here as a timeline.' });
    }
    return rows;
  }, [form.decoderContext, savedLabRows]);

  const newsRiskLabel = form.emotionalIntensity >= 55 ? 'Moderate' : 'Low';
  const volLabel =
    form.riskLevel === 'High' ? 'High' : form.riskLevel === 'Low' ? 'Low' : 'Moderate';
  const eventRiskLabel = form.emotionalIntensity >= 40 ? 'Moderate' : 'Low';

  const updateField = (key, value) => {
    if (key === 'conviction') {
      const confidence = convictionToConfidence(value);
      setForm((prev) => ({
        ...prev,
        conviction: value,
        confidence,
        auraConfidence: confidence,
      }));
      return;
    }
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const saveSession = async () => {
    setSaving(true);
    try {
      const payload = toTraderLabPersistPayload(form, { rrRatio: rr });
      if (activeId) {
        const res = await Api.updateTraderLabSession(activeId, payload);
        const saved = normalizeSession(res?.data?.session || { ...payload, id: activeId });
        setSessions((prev) => prev.map((item) => (item.id === activeId ? saved : item)));
        setForm(saved);
        writeLocalDraft(saved);
        setLastSavedAt(new Date().toISOString());
      } else {
        const res = await Api.createTraderLabSession(payload);
        const saved = normalizeSession(res?.data?.session || payload);
        setSessions((prev) => [saved, ...prev]);
        setActiveId(saved.id);
        setForm(saved);
        writeLocalDraft(saved);
        setLastSavedAt(new Date().toISOString());
      }
      toast.success('Trader Lab saved');
    } catch (error) {
      console.error(error);
      const fallback = normalizeSession({ ...form, rrRatio: rr });
      writeLocalDraft(fallback);
      setLastSavedAt(new Date().toISOString());
      toast.warning('Cloud save failed. Saved locally on this device.');
    } finally {
      setSaving(false);
    }
  };

  const createFreshSession = () => {
    setActiveId(null);
    setForm({ ...DEFAULT_FORM, sessionDate: toYmd() });
    setLastSavedAt(null);
  };

  const openSavedLab = (sessionId) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;
    setActiveId(session.id);
    setForm(normalizeSession(session));
  };

  const deleteSavedLab = async (sessionId, event) => {
    event?.stopPropagation?.();
    if (!sessionId) return;
    const ok = window.confirm('Remove this saved lab from your archive?');
    if (!ok) return;
    const nextList = sessions.filter((s) => s.id !== sessionId);
    try {
      await Api.deleteTraderLabSession(sessionId);
      setSessions(nextList);
      if (activeId === sessionId) {
        if (nextList.length) {
          setActiveId(nextList[0].id);
          setForm(normalizeSession(nextList[0]));
        } else {
          setActiveId(null);
          setForm({ ...DEFAULT_FORM, sessionDate: toYmd() });
          setLastSavedAt(null);
        }
      }
      toast.success('Lab removed');
    } catch (err) {
      console.error(err);
      toast.error('Could not remove lab');
    }
  };

  const readyToExecute = validator.passed && rrOk;

  const handleExecute = async () => {
    if (!readyToExecute) {
      toast.warning('Complete the Decision Engine checks and ensure reward:risk is at least 1:1.');
      return;
    }
    setSaving(true);
    try {
      const payload = toTraderLabPersistPayload(form, { rrRatio: rr });
      let nextId = activeId;
      if (activeId) {
        const res = await Api.updateTraderLabSession(activeId, payload);
        const saved = normalizeSession(res?.data?.session || { ...payload, id: activeId });
        setSessions((prev) => prev.map((item) => (item.id === activeId ? saved : item)));
        setForm(saved);
        nextId = saved.id;
      } else {
        const res = await Api.createTraderLabSession(payload);
        const saved = normalizeSession(res?.data?.session || payload);
        setSessions((prev) => [saved, ...prev]);
        setActiveId(saved.id);
        setForm(saved);
        nextId = saved.id;
      }
      setLastSavedAt(new Date().toISOString());
      const handoff = buildTraderLabHandoff({ ...form, ...payload }, rr, nextId);
      try {
        sessionStorage.setItem(TRADER_LAB_HANDOFF_KEY, JSON.stringify(handoff));
      } catch (e) {
        console.warn(e);
      }
      toast.success('Saved. Opening Trade Validator checklist.');
      navigate('/trader-deck/trade-validator/checklist', { state: { fromTraderLab: true } });
    } catch (error) {
      console.error(error);
      writeLocalDraft(normalizeSession({ ...form, rrRatio: rr }));
      toast.error('Could not execute this trade plan yet.');
    } finally {
      setSaving(false);
    }
  };

  const welcomeEyebrow = (
    <span className="tlab-welcome">
      <span className="tlab-avatar" aria-hidden>
        {getUserFirstName(user).slice(0, 1).toUpperCase()}
      </span>
      <span>{formatWelcomeEyebrow(user)}</span>
    </span>
  );

  return (
    <TraderSuiteShell
      variant="terminal"
      eyebrow={welcomeEyebrow}
      terminalSubtitle="Focus. Execute. Profit."
      terminalTitlePrefix={
        <svg className="trader-suite-terminal-logo" width="22" height="22" viewBox="0 0 24 24" aria-hidden>
          <path fill="currentColor" d="M12 2 22 20H2z" />
        </svg>
      }
      title="AURA TERMINAL — TRADER LAB"
      description={null}
      stats={loading ? LOADING_TERMINAL_STATS : stats}
      primaryAction={
        <button
          type="button"
          className="trader-suite-btn trader-suite-btn--primary"
          onClick={saveSession}
          disabled={saving || loading}
        >
          {saving ? 'Saving...' : 'Save lab'}
        </button>
      }
      secondaryActions={
        <>
          <button type="button" className="trader-suite-btn" onClick={createFreshSession} disabled={loading}>
            New session
          </button>
        </>
      }
    >
      {loading ? <TraderLabLoadingShell /> : null}

      {!loading ? (
        <div className="trader-lab-v2 trader-lab-v2--gold trader-lab-v2--compact trader-lab-v2--workspace trader-lab-v2--terminal-desktop">
          <aside className="trader-lab-v2__left">
            <div className="tlab-card tlab-card--gold tlab-card--bias-rail">
              <h3 className="tlab-card__title">Trade thesis</h3>
              <div className="tlab-pill-row">
                <BiasPill bias={form.marketBias} />
                <span className="tlab-pill-confidence">{form.auraConfidence}%</span>
              </div>
              <div className="tlab-field" style={{ marginBottom: 8 }}>
                <label>Bias</label>
                <select className="tlab-select" value={form.marketBias} onChange={(e) => updateField('marketBias', e.target.value)}>
                  {['Bullish', 'Bearish', 'Neutral', 'Bullish intraday'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="tlab-mc-row">
                <span>Confidence</span>
                <strong>{form.auraConfidence}%</strong>
              </div>
              <input
                type="range"
                min={1}
                max={100}
                className="tlab-range"
                value={form.auraConfidence}
                onChange={(e) => updateField('auraConfidence', safeNumber(e.target.value))}
                aria-label="Aura confidence"
              />
              <div className="tlab-progress">
                <span style={{ width: `${safeNumber(form.auraConfidence, 0)}%` }} />
              </div>
              <div className="tlab-field" style={{ marginTop: 10 }}>
                <label>Market state</label>
                <select className="tlab-select" value={form.marketState} onChange={(e) => updateField('marketState', e.target.value)}>
                  {['Trending', 'Ranging', 'Volatile', 'Quiet'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="tlab-card tlab-card--gold tlab-card--key-drivers-rail">
              <h3 className="tlab-card__title">Key drivers</h3>
              <ul className="tlab-ref-bullets">
                {driverLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <textarea
                className="tlab-textarea tlab-textarea--tight"
                value={form.keyDrivers}
                onChange={(e) => updateField('keyDrivers', e.target.value)}
                placeholder="One line per driver…"
                aria-label="Key drivers"
              />
            </div>

            <div className="tlab-card tlab-card--gold tlab-card--dock-fundamental">
              <h3 className="tlab-card__title">Fundamental backing</h3>
              <ul className="tlab-ref-bullets tlab-ref-bullets--dock-fundamental">
                {fundamentalLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <textarea
                className="tlab-textarea tlab-textarea--tight tlab-textarea--dock-fundamental"
                value={form.fundamentalBacking}
                onChange={(e) => updateField('fundamentalBacking', e.target.value)}
                placeholder="One line per fundamental point…"
                aria-label="Fundamental backing"
              />
            </div>

            <div className="tl-thesis-stack">
              <TraderLabThesisBlock form={form} onFieldChange={updateField} />
              {thesisMeta ? (
                <p className="tl-thesis-meta-external" aria-live="polite">
                  {thesisMeta}
                </p>
              ) : null}
            </div>
          </aside>

          <div className="trader-lab-v2__center">
            <div className="tlab-center-stack">
              <div className="tlab-center-main">
                <div className="tlab-card tlab-card--chart tlab-card--gold tlab-card--focal">
                  <div className="tlab-chart-toolbar tlab-chart-toolbar--terminal">
                    <div className="tlab-chart-toolbar__primary">
                      <select
                        className="tlab-select"
                        value={form.chartSymbol}
                        onChange={(e) => updateField('chartSymbol', e.target.value)}
                        aria-label="Instrument"
                      >
                        {instrumentOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      <div className="tlab-tf-group" role="group" aria-label="Timeframe">
                        {CHART_INTERVALS.map((tf) => (
                          <button
                            key={tf.value}
                            type="button"
                            className={`tlab-tf${chartInterval === tf.value ? ' tlab-tf--active' : ''}`}
                            onClick={() => setChartInterval(tf.value)}
                          >
                            {tf.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {sessions.length ? (
                      <div className="tlab-session-tabs-inline" role="tablist" aria-label="Recent saved sessions">
                        {sessions.slice(0, 5).map((session) => (
                          <button
                            key={session.id}
                            type="button"
                            role="tab"
                            aria-selected={session.id === activeId}
                            className={`tlab-session-tab${session.id === activeId ? ' tlab-session-tab--active' : ''}`}
                            onClick={() => {
                              setActiveId(session.id);
                              setForm(normalizeSession(session));
                            }}
                          >
                            {session.sessionDate}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="tlab-chart-host tlab-chart-host--fill">
                    <TradingViewChartPanel
                      symbol={form.chartSymbol}
                      interval={chartInterval}
                      fillParent
                      className="trader-suite-chart-frame"
                      suppressLoadingText
                    />
                  </div>
                  <div className="tlab-level-strip">
                    <div>
                      <span className="tlab-level-label">Entry</span>
                      <strong>{formatLabLevel(form.entryPrice)}</strong>
                    </div>
                    <div>
                      <span className="tlab-level-label tlab-level-label--sl">Stop loss</span>
                      <strong>{formatLabLevel(form.stopLoss)}</strong>
                    </div>
                    <div>
                      <span className="tlab-level-label tlab-level-label--tp">Target</span>
                      <strong>{formatLabLevel(form.targetPrice)}</strong>
                    </div>
                  </div>
                </div>
              </div>

            <div
              className={`tlab-decoder-strip tlab-decoder-strip--log${form.decoderContext ? '' : ' tlab-decoder-strip--idle'}`}
              role="region"
              aria-label="Market Decoder and recent labs"
            >
              <div className="tlab-decoder-strip__head">
                <span className="tlab-decoder-strip__k">Market Decoder</span>
                <span className="tlab-decoder-strip__sub">Desk log</span>
              </div>
              <ul className="tlab-decoder-log">
                {decoderLogRows.map((row) => (
                  <li key={row.key} className="tlab-decoder-log__row">
                    {row.text}
                  </li>
                ))}
              </ul>
            </div>
            </div>
          </div>

          <aside className="trader-lab-v2__right">
            <div className="tlab-card tlab-card--gold tlab-card--dock-exec">
              <div className="tlab-exec-head">
                <h3 className="tlab-card__title">Execution notes</h3>
                <span className="tlab-exec-edit-icon" title="Edit notes" aria-hidden>
                  <FaPen />
                </span>
              </div>
              <textarea
                className="tlab-textarea tlab-textarea--exec tlab-textarea--dock"
                value={form.duringNotes}
                onChange={(e) => updateField('duringNotes', e.target.value)}
                placeholder="Live execution plan, scaling, desk notes…"
              />
              <div className="tlab-exec-foot">
                <span className="tlab-exec-meta">
                  {lastSavedAt ? new Date(lastSavedAt).toLocaleString() : '—'}
                </span>
                <button type="button" className="tlab-btn-save-notes" onClick={saveSession} disabled={saving}>
                  {saving ? 'SAVING...' : 'SAVE NOTES'}
                </button>
              </div>
            </div>

            <div className="tlab-card tlab-card--gold tlab-card--dock-decision" aria-label="Decision engine">
              <h3 className="tlab-card__title">Decision checks</h3>
              <div className="tlab-decision-checks tlab-decision-checks--dock" role="list">
                {[
                  { key: 'biasAligned', label: 'Bias aligned' },
                  { key: 'setupValid', label: 'Setup valid' },
                  { key: 'entryConfirmed', label: 'Confirmation' },
                  { key: 'riskDefined', label: 'Risk valid' },
                ].map(({ key, label }) => (
                  <label key={key} className="tlab-decision-check">
                    <input
                      type="checkbox"
                      checked={Boolean(form[key])}
                      onChange={(e) => updateField(key, e.target.checked)}
                    />
                    <span className="tlab-decision-check__ui" aria-hidden />
                    <span className="tlab-decision-check__label">{label}</span>
                  </label>
                ))}
              </div>
              <div className="tlab-dock-conviction">
                <span className="tlab-level-label">Conviction</span>
                <div className="tlab-conviction__seg tlab-conviction__seg--dock">
                  {[
                    { id: 'low', label: 'LOW' },
                    { id: 'medium', label: 'MEDIUM' },
                    { id: 'high', label: 'HIGH' },
                  ].map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      className={`tlab-conviction-btn${form.conviction === id ? ' tlab-conviction-btn--active' : ''}`}
                      onClick={() => updateField('conviction', id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="tlab-execute-btn tlab-execute-btn--dock"
                disabled={!readyToExecute || saving}
                onClick={handleExecute}
              >
                {saving ? '…' : 'EXECUTE'}
              </button>
            </div>

            <div className="tlab-card tlab-card--gold tlab-card--plan-rail">
              <h3 className="tlab-card__title">Trade plan builder</h3>
              <div className="tlab-field">
                <label>Instrument</label>
                <select className="tlab-select" value={form.chartSymbol} onChange={(e) => updateField('chartSymbol', e.target.value)}>
                  {instrumentOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="tlab-field-grid">
                <div className="tlab-field">
                  <label>Entry</label>
                  <input
                    className="tlab-input"
                    type="number"
                    step="any"
                    value={form.entryPrice}
                    onChange={(e) => updateField('entryPrice', e.target.value)}
                  />
                </div>
                <div className="tlab-field">
                  <label>Stop loss</label>
                  <input
                    className="tlab-input"
                    type="number"
                    step="any"
                    value={form.stopLoss}
                    onChange={(e) => updateField('stopLoss', e.target.value)}
                  />
                </div>
                <div className="tlab-field">
                  <label>Target</label>
                  <input
                    className="tlab-input"
                    type="number"
                    step="any"
                    value={form.targetPrice}
                    onChange={(e) => updateField('targetPrice', e.target.value)}
                  />
                </div>
                <div className="tlab-field">
                  <label>Risk %</label>
                  <input
                    className="tlab-input"
                    type="number"
                    step="0.1"
                    value={form.riskPercent}
                    onChange={(e) => updateField('riskPercent', e.target.value)}
                  />
                </div>
                <div className="tlab-field tlab-field--span">
                  <label>Account size (USD)</label>
                  <input
                    className="tlab-input"
                    type="number"
                    step="100"
                    value={form.accountSize}
                    onChange={(e) => updateField('accountSize', e.target.value)}
                  />
                </div>
                <div className="tlab-field tlab-field--span">
                  <label>Playbook setup</label>
                  <select className="tlab-select" value={form.setupName} onChange={(e) => updateField('setupName', e.target.value)}>
                    {playbookSetups.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="tlab-rr-big">
                <span className="tlab-rr-label">R∶R ratio</span>
                <span className="tlab-rr-value">
                  1 : {Number.isFinite(rr) && rr > 0 ? rr.toFixed(2) : '—'}
                </span>
              </div>
              <div className="tlab-metric-row">
                <span>Risk amount</span>
                <strong>
                  {riskAmount > 0
                    ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(riskAmount)
                    : '—'}
                </strong>
              </div>
              <div className="tlab-metric-row">
                <span>Position size (approx.)</span>
                <strong>{positionLotsLabel}</strong>
              </div>
              <div
                className={`tlab-validator-banner tlab-validator-banner--plan${validatorPanelOk ? ' tlab-validator-banner--ok' : ' tlab-validator-banner--bad'}`}
                role="status"
              >
                {validatorPanelOk ? '✓ TRADE VALID' : 'BLOCKED — review checks'}
              </div>
            </div>

            <div className={`tlab-card tlab-card--gold tlab-card--validator tlab-card--validator-metrics${validatorPanelOk ? ' tlab-card--validator-pass' : ''}`}>
              <h3 className="tlab-card__title">Validation</h3>
              <ul className="tlab-validator-list tlab-validator-list--status">
                {tradeValidatorRows.map((row) => (
                  <li key={row.label}>
                    <span className="tlab-vlabel">{row.label}</span>
                    <span className={row.ok ? 'tlab-vstatus tlab-vstatus--ok' : 'tlab-vstatus'}>{row.status}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="tlab-card tlab-card--gold tlab-card--session-rail">
              <h3 className="tlab-card__title">Session focus</h3>
              <div className="tlab-field">
                <label htmlFor="tlab-session-goal">Today&apos;s goal</label>
                <textarea
                  id="tlab-session-goal"
                  className="tlab-textarea tlab-textarea--tight"
                  rows={3}
                  value={form.sessionGoal}
                  onChange={(e) => updateField('sessionGoal', e.target.value)}
                  placeholder="What you are optimizing this session for…"
                />
              </div>
              <div className="tlab-field" style={{ marginTop: 8 }}>
                <label htmlFor="tlab-max-trades">Max trades</label>
                <input
                  id="tlab-max-trades"
                  className="tlab-input"
                  type="number"
                  min={1}
                  max={99}
                  value={form.maxTradesAllowed}
                  onChange={(e) => updateField('maxTradesAllowed', safeNumber(e.target.value, DEFAULT_FORM.maxTradesAllowed))}
                />
              </div>
            </div>

            <div className="tlab-card tlab-card--gold tlab-card--saved-labs">
              <div className="tlab-saved-head">
                <h3 className="tlab-card__title">My trades</h3>
                <span className="tlab-saved-count">{savedLabRows.length}</span>
              </div>
              {!savedLabRows.length ? (
                <p className="tlab-saved-empty">No saved labs yet. Save a session to build your archive.</p>
              ) : (
                <div className="tlab-saved-list" role="list" aria-label="Saved Trader Lab sessions">
                  {savedLabRows.map((row) => (
                    <div
                      key={row.id}
                      className={`tlab-saved-row${activeId === row.id ? ' tlab-saved-row--active' : ''}`}
                    >
                      <button
                        type="button"
                        className="tlab-saved-item"
                        onClick={() => openSavedLab(row.id)}
                      >
                        <span className="tlab-saved-item__date">{row.date}</span>
                        <span className="tlab-saved-item__setup">{row.setupName}</span>
                        <span className="tlab-saved-item__symbol">{row.symbol}</span>
                      </button>
                      <button
                        type="button"
                        className="tlab-saved-remove"
                        aria-label={`Remove ${row.setupName}`}
                        onClick={(e) => deleteSavedLab(row.id, e)}
                      >
                        <FaTimes />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="tlab-card tlab-card--gold tlab-card--desk-context">
              <h3 className="tlab-card__title">Risk & geopolitical</h3>
              <p className="tlab-hint tlab-hint--tight">Region | sentiment (one per line)</p>
              <div className="tlab-table-wrap tlab-table-wrap--compact">
                <table className="tlab-table tlab-table--compact">
                  <thead>
                    <tr>
                      <th>Region</th>
                      <th>Sentiment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {geoRows.map((row) => (
                      <tr key={row.region}>
                        <td>{row.region}</td>
                        <td>
                          <span className={sentimentPillClass(row.sentiment)}>
                            {String(row.sentiment).toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <textarea
                className="tlab-textarea tlab-textarea--tight tlab-textarea--geo-inline"
                value={form.todaysFocus}
                onChange={(e) => updateField('todaysFocus', e.target.value)}
                aria-label="Geopolitical backing lines"
              />
              <table className="tlab-table tlab-table--compact tlab-table--risk-inline">
                <tbody>
                  <tr>
                    <td>Volatility</td>
                    <td><span className="tlab-pill tlab-pill--warn">{volLabel}</span></td>
                  </tr>
                  <tr>
                    <td>News risk</td>
                    <td><span className="tlab-pill tlab-pill--ok">{newsRiskLabel}</span></td>
                  </tr>
                  <tr>
                    <td>Event risk</td>
                    <td><span className="tlab-pill tlab-pill--ok">{eventRiskLabel}</span></td>
                  </tr>
                </tbody>
              </table>
            </div>

          </aside>

          <footer className="trader-lab-v2__footer trader-lab-v2__footer--tagline-only trader-lab-v2__footer--terminal-mobile">
            <p className="tlab-tagline">Trade with clarity. Execute with precision. Win with discipline.</p>
          </footer>
        </div>
      ) : null}
    </TraderSuiteShell>
  );
}
