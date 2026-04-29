import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
import LightweightInstrumentChart from '../components/charts/LightweightInstrumentChart';
import TraderLabThesisBlock from '../components/trader-deck/TraderLabThesisBlock';
import TraderLabLoadingShell from '../components/trader-deck/TraderLabLoadingShell';
import { formatLabLevel } from '../lib/trader-deck/traderLabFormatters';
import {
  TRADER_LAB_HANDOFF_KEY,
  MARKET_DECODER_LAB_HANDOFF_KEY,
} from '../lib/aura-analysis/validator/validatorChecklistStorage';
import {
  peekChartUserRequestFromStorage,
  clearChartUserRequestStorage,
  intervalForTraderLab,
  CHART_PATH_TRADER_LAB,
} from '../lib/chartUserRequest';
import { validateMarketDecoderSections } from '../lib/trader-deck/marketDecoderExport';
import { normalizeApiInterval } from '../lib/charts/lightweightChartData';
import {
  TERMINAL_INSTRUMENT_OPTIONS as INSTRUMENTS,
  TERMINAL_INSTRUMENT_LABEL_TO_VALUE as INSTRUMENT_LABEL_TO_VALUE,
  chartSymbolFromDecoded as chartSymbolFromDecodedBase,
  normalizeDecodedSymbol,
} from '../data/terminalInstruments';
import '../styles/trader-deck/TraderLabLayout.css';

const CHART_INTERVALS = [
  { label: '1m', value: '1' },
  { label: '5m', value: '5' },
  { label: '15m', value: '15' },
  { label: '30m', value: '30' },
  { label: '45m', value: '45' },
  { label: '1H', value: '60' },
  { label: '4H', value: '240' },
  { label: '1D', value: '1D' },
  { label: '1W', value: '1W' },
  { label: '1mo', value: '1M' },
  { label: '1y', value: '1Y' },
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
  decoderExport: null,
  /** Candle timeframe for `/api/market/chart-history` (1, 15, 60, 240, 1D). */
  chartInterval: '60',
  tradePlanInstrument: 'OANDA:XAUUSD',
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
  const looksTechnicalOnly = (value) => {
    const text = String(value || '').toLowerCase();
    if (!text.trim()) return false;
    return ['pivot', 'breakout', 'retest', 'support', 'resistance', 'rsi', 'macd', 'moving average', 'entry', 'stop loss', 'target']
      .some((term) => text.includes(term));
  };
  const normalizedDecoderExport =
    raw.decoderExport && typeof raw.decoderExport === 'object'
      ? validateMarketDecoderSections(raw.decoderExport)
      : null;
  const legacyFundamentalFallback =
    /market decoder/i.test(String(raw.setupName || '')) && looksTechnicalOnly(raw.fundamentalBacking)
      ? 'No fundamental analysis saved for this older decoder run'
      : raw.fundamentalBacking;
  const safeFundamentalBacking =
    normalizedDecoderExport?.fundamentals?.fundamentalBacking
    || legacyFundamentalFallback;
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
      safeFundamentalBacking != null ? String(safeFundamentalBacking) : DEFAULT_FORM.fundamentalBacking,
    whatDoISee: raw.whatDoISee != null ? String(raw.whatDoISee) : DEFAULT_FORM.whatDoISee,
    whyIsThisValid,
    whatConfirmsEntry,
    traderThesisUpdatedAt: raw.traderThesisUpdatedAt != null ? raw.traderThesisUpdatedAt : DEFAULT_FORM.traderThesisUpdatedAt,
    decoderExport: normalizedDecoderExport || DEFAULT_FORM.decoderExport,
  };
  merged.tradePlanInstrument = merged.tradePlanInstrument || merged.chartSymbol;
  if (!raw.conviction && raw.confidence != null) {
    merged.conviction = confidenceToConviction(raw.confidence);
  }
  merged.chartInterval = normalizeApiInterval(raw.chartInterval ?? merged.chartInterval);
  return merged;
}

function toTraderLabPersistPayload(form, extras = {}) {
  const { whyIsThisValid, whatConfirmsEntry, ...rest } = form;
  return {
    ...rest,
    ...extras,
    whyValid: whyIsThisValid,
    entryConfirmation: whatConfirmsEntry,
  };
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

function chartSymbolFromDecoded(decodedSymbol) {
  return chartSymbolFromDecodedBase(decodedSymbol, DEFAULT_FORM.chartSymbol);
}

function symbolTokenFromChartSymbol(chartSymbol) {
  const raw = String(chartSymbol || '').trim();
  if (!raw) return '';
  return raw.includes(':') ? raw.split(':')[1] : raw;
}

function assetClassForSymbol(chartSymbol) {
  const token = symbolTokenFromChartSymbol(chartSymbol).toUpperCase();
  if (!token) return 'generic';
  if (/^(BTC|ETH|SOL|ADA|XRP|LTC|DOGE)/.test(token)) return 'crypto';
  if (/^(XAU|XAG|USOIL|UKOIL|WTI|BRENT|SPX|NAS100|US30|GER40|DAX|NIKKEI|FTSE|CAC40)/.test(token)) return 'macro';
  if (/JPY$/.test(token)) return 'fx-jpy';
  if (/^[A-Z]{6}$/.test(token)) return 'fx-major';
  return 'generic';
}

function defaultPrecisionForSymbol(chartSymbol) {
  const assetClass = assetClassForSymbol(chartSymbol);
  if (assetClass === 'fx-major') return 5;
  if (assetClass === 'fx-jpy') return 3;
  return 2;
}

function roundToPrecision(value, precision) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const p = Math.max(0, Number(precision) || 0);
  const f = 10 ** p;
  return Math.round(n * f) / f;
}

function derivePlanLevels(chartSymbol, latestClose) {
  const assetClass = assetClassForSymbol(chartSymbol);
  const fallbackByClass = {
    'fx-major': 1.175,
    'fx-jpy': 154.2,
    macro: 2235,
    crypto: 64000,
    generic: 100,
  };
  const entryRaw = Number.isFinite(Number(latestClose))
    ? Number(latestClose)
    : fallbackByClass[assetClass] || fallbackByClass.generic;
  const pctByClass = {
    'fx-major': 0.0035,
    'fx-jpy': 0.003,
    macro: 0.008,
    crypto: 0.02,
    generic: 0.01,
  };
  const stopPct = pctByClass[assetClass] || pctByClass.generic;
  const targetPct = stopPct * 1.5;
  const precision = defaultPrecisionForSymbol(chartSymbol);
  const entry = roundToPrecision(entryRaw, precision);
  const stop = roundToPrecision(entryRaw * (1 - stopPct), precision);
  const target = roundToPrecision(entryRaw * (1 + targetPct), precision);
  return { entry, stop, target, precision };
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [playbookSetups, setPlaybookSetups] = useState(PLAYBOOK_SETUP_OPTIONS);
  const [instrumentOptions, setInstrumentOptions] = useState(INSTRUMENTS);
  const [activeId, setActiveId] = useState(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [latestClose, setLatestClose] = useState(null);
  const [planPricePrecision, setPlanPricePrecision] = useState(defaultPrecisionForSymbol(DEFAULT_FORM.chartSymbol));
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
    if (loading) return;
    if (!location.pathname.includes('trader-lab')) return;
    const payload = peekChartUserRequestFromStorage();
    if (!payload || payload.path !== CHART_PATH_TRADER_LAB) return;
    clearChartUserRequestStorage();
    if (payload.chartSymbol) {
      setForm((f) => ({ ...f, chartSymbol: payload.chartSymbol }));
    }
    if (payload.interval) {
      setForm((f) => ({ ...f, chartInterval: normalizeApiInterval(intervalForTraderLab(payload.interval)) }));
    }
  }, [loading, location.pathname]);

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
    const handoffRaw = parsed.traderLabHandoff && typeof parsed.traderLabHandoff === 'object' ? parsed.traderLabHandoff : null;
    const handoff = validateMarketDecoderSections(handoffRaw || {});
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
    const kln = handoff?.tradeLevels || {};
    const biasRaw = String(handoff?.bias || brief?.instantRead?.bias || '');
    const bias = biasRaw.toLowerCase();
    const resistance =
      kln.target != null && Number.isFinite(Number(kln.target))
        ? Number(kln.target)
        : parseLevel(brief?.keyLevels?.keyLevelsDisplay?.resistance1);
    const support =
      kln.stopLoss != null && Number.isFinite(Number(kln.stopLoss))
        ? Number(kln.stopLoss)
        : parseLevel(brief?.keyLevels?.keyLevelsDisplay?.support1);
    const spot =
      kln.entry != null && Number.isFinite(Number(kln.entry))
        ? Number(kln.entry)
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
    const thesis = handoff?.traderThesis || {};
    const fundamentals = handoff?.fundamentals || {};
    const risks = handoff?.risks || {};
    const technical = handoff?.technical || {};
    const keyDriverLines = Array.isArray(handoff?.keyDrivers)
      ? handoff.keyDrivers.map((d) => `${d?.title || 'Driver'}: ${d?.explanation || ''}`.trim()).filter(Boolean)
      : [];
    const fallbackFundamental = 'No fundamental analysis saved for this older decoder run';
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
        ? (keyDriverLines.length ? keyDriverLines : brief.whatMattersNow
            .map((x) => `${x?.label || 'Signal'}: ${x?.text || ''}`.trim())
            .filter(Boolean)
            .join('\n'))
        : DEFAULT_FORM.keyDrivers,
      whatDoISee:
        [thesis.whatToSee, handoff?.marketDecoderLogLine, technical.trend, brief?.instantRead?.bestApproach].filter(Boolean).join('\n') || '',
      whatConfirmsEntry:
        thesis.whatConfirmsEntry
        || technical.confirmation
        || handoff?.confirmation
        || DEFAULT_FORM.whatConfirmsEntry,
      whyIsThisValid:
        thesis.whyValid
        || handoff?.fundamentalAnalysis
        || fundamentals.fundamentalBacking
        || DEFAULT_FORM.whyIsThisValid,
      fundamentalBacking:
        [
          fundamentals.fundamentalBacking,
          fundamentals.macroBackdrop,
          fundamentals.centralBankPolicy,
          fundamentals.economicData,
          fundamentals.geopoliticalContext,
          fundamentals.crossAssetContext,
        ].filter(Boolean).join('\n') || fallbackFundamental,
      decoderContext: {
        symbol,
        exportedAt: parsed.exportedAt || new Date().toISOString(),
        source: 'market_decoder',
        handoffVersion: parsed.version || null,
        generatedAt: brief?.meta?.generatedAt || null,
        posture: handoff?.bias || brief?.finalOutput?.currentPosture || null,
        traderLabHandoff: handoff,
        brief,
        riskSummary: {
          newsRisk: risks.newsRisk || null,
          eventRisk: risks.eventRisk || null,
          volatilityRisk: risks.volatilityRisk || null,
          invalidation: risks.invalidation || null,
        },
      },
      decoderExport: handoff,
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
    toast.success(t('traderLab.toast.decoderImported'));
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

  const operatorValidatorRows = useMemo(() => {
    const rrStatus = rr >= 2 ? 'OPTIMAL' : rr >= 1 ? 'OK' : 'WEAK';
    const conflictStatus = form.setupValid && form.riskDefined ? 'CLEAR' : 'REVIEW';
    return [
      { label: 'Trend alignment', status: form.biasAligned ? 'YES' : 'NO', ok: form.biasAligned },
      { label: 'Risk / reward', status: rrStatus, ok: rr >= 1 },
      { label: 'Entry confirmation', status: form.entryConfirmed ? 'VALID' : 'PENDING', ok: form.entryConfirmed },
      { label: 'No major conflicts', status: conflictStatus, ok: form.setupValid && form.riskDefined },
    ];
  }, [form.biasAligned, form.setupValid, form.riskDefined, form.entryConfirmed, rr]);

  const validatorPanelOk = operatorValidatorRows.every((r) => r.ok);

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

  const applyTradePlanDefaultsForSymbol = React.useCallback((chartSymbol, closeHint = null) => {
    const levels = derivePlanLevels(chartSymbol, closeHint);
    setPlanPricePrecision(levels.precision);
    setForm((prev) => ({
      ...prev,
      chartSymbol,
      tradePlanInstrument: chartSymbol,
      entryPrice: levels.entry,
      stopLoss: levels.stop,
      targetPrice: levels.target,
    }));
  }, []);

  const handleInstrumentChange = (nextSymbol) => {
    applyTradePlanDefaultsForSymbol(nextSymbol, latestClose);
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
      toast.success(t('traderLab.toast.saved'));
    } catch (error) {
      console.error(error);
      const fallback = normalizeSession({ ...form, rrRatio: rr });
      writeLocalDraft(fallback);
      setLastSavedAt(new Date().toISOString());
      toast.warning(t('traderLab.toast.cloudSaveFailed'));
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
    const ok = window.confirm(t('traderLab.confirm.removeSavedLab'));
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
      toast.success(t('traderLab.toast.removed'));
    } catch (err) {
      console.error(err);
      toast.error(t('traderLab.toast.removeFailed'));
    }
  };

  const readyToExecute = validator.passed && rrOk;

  useEffect(() => {
    const precision = defaultPrecisionForSymbol(form.chartSymbol);
    setPlanPricePrecision(precision);
  }, [form.chartSymbol]);

  useEffect(() => {
    if (loading) return;
    const chartSymbol = form.chartSymbol;
    const planInstrument = form.tradePlanInstrument || chartSymbol;
    if (planInstrument === chartSymbol) return;
    applyTradePlanDefaultsForSymbol(chartSymbol, latestClose);
  }, [applyTradePlanDefaultsForSymbol, form.chartSymbol, form.tradePlanInstrument, latestClose, loading]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const payload = {
      selectedInstrument: form.chartSymbol,
      chartSymbol: form.chartSymbol,
      tradePlanInstrument: form.tradePlanInstrument || form.chartSymbol,
      entry: form.entryPrice,
      stop: form.stopLoss,
      target: form.targetPrice,
      latestClose,
      interval: form.chartInterval,
    };
    console.debug('[TraderLab][SyncDiagnostics]', payload);
  }, [
    form.chartSymbol,
    form.tradePlanInstrument,
    form.entryPrice,
    form.stopLoss,
    form.targetPrice,
    latestClose,
    form.chartInterval,
  ]);

  const handleExecute = async () => {
    if (!readyToExecute) {
      toast.warning(t('traderLab.toast.completeDecisionChecks'));
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
      toast.success(t('traderLab.toast.savedOpeningChecklist'));
      navigate('/trader-deck/trade-validator/checklist', { state: { fromTraderLab: true } });
    } catch (error) {
      console.error(error);
      writeLocalDraft(normalizeSession({ ...form, rrRatio: rr }));
      toast.error(t('traderLab.toast.executeFailed'));
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
  terminalSubtitle={t('traderLab.terminalSubtitle')}
  terminalTitlePrefix={null}
  title={t('traderLab.terminalTitle')}
      description={null}
      stats={loading ? LOADING_TERMINAL_STATS : stats}
      primaryAction={
        <button
          type="button"
          className="trader-suite-btn trader-suite-btn--primary"
          onClick={saveSession}
          disabled={saving || loading}
        >
          {saving ? t('traderLab.saving') : t('traderLab.saveLab')}
        </button>
      }
      secondaryActions={
        <>
          <button type="button" className="trader-suite-btn" onClick={createFreshSession} disabled={loading}>
            {t('traderLab.newSession')}
          </button>
        </>
      }
    >
      {loading ? <TraderLabLoadingShell /> : null}

      {!loading ? (
        <div className="trader-lab-v2 trader-lab-v2--gold trader-lab-v2--compact trader-lab-v2--workspace trader-lab-v2--terminal-desktop">
          {/* LEFT RAIL - Reorganized: Trade Thesis → Key Drivers → Risk & Geopolitical → Session Focus */}
          <aside className="trader-lab-v2__left">
            <div className="tlab-card tlab-card--gold tlab-card--bias-rail">
              <h3 className="tlab-card__title">{t('traderLab.tradeThesis')}</h3>
              <div className="tlab-pill-row">
                <BiasPill bias={form.marketBias} />
                <span className="tlab-pill-confidence">{form.auraConfidence}%</span>
              </div>
              <div className="tlab-field" style={{ marginBottom: 8 }}>
                <label>{t('traderLab.bias')}</label>
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
                aria-label={t('traderLab.auraConfidence')}
              />
              <div className="tlab-progress">
                <span style={{ width: `${safeNumber(form.auraConfidence, 0)}%` }} />
              </div>
              <div className="tlab-field" style={{ marginTop: 10 }}>
                <label>{t('traderLab.marketState')}</label>
                <select className="tlab-select" value={form.marketState} onChange={(e) => updateField('marketState', e.target.value)}>
                  {['Trending', 'Ranging', 'Volatile', 'Quiet'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="tlab-card tlab-card--gold tlab-card--key-drivers-rail">
              <h3 className="tlab-card__title">{t('traderLab.keyDrivers')}</h3>
              <p className="tlab-card__subnote">{t('traderLab.oneDriverPerLine')}</p>
              <textarea
                className="tlab-textarea tlab-textarea--tight"
                rows={5}
                value={form.keyDrivers}
                onChange={(e) => updateField('keyDrivers', e.target.value)}
                placeholder={t('traderLab.oneLinePerDriver')}
                aria-label={t('traderLab.keyDrivers')}
              />
            </div>

            {/* RISK & GEOPOLITICAL - MOVED FROM CENTER COLUMN */}
            <div className="tlab-card tlab-card--gold tlab-card--desk-context">
              <h3 className="tlab-card__title">{t('traderLab.riskGeopolitical')}</h3>
              <p className="tlab-hint tlab-hint--tight">{t('traderLab.regionSentiment')}</p>
              <div className="tlab-table-wrap tlab-table-wrap--compact">
                <table className="tlab-table tlab-table--compact">
                  <thead>
                    <tr>
                      <th>{t('traderLab.region')}</th>
                      <th>{t('traderLab.sentiment')}</th>
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
              <details className="tlab-geo-inline-edit">
                <summary>{t('traderLab.editRegionLines')}</summary>
                <textarea
                  className="tlab-textarea tlab-textarea--tight tlab-textarea--geo-inline"
                  value={form.todaysFocus}
                  onChange={(e) => updateField('todaysFocus', e.target.value)}
                  aria-label={t('traderLab.geopoliticalBackingLines')}
                />
              </details>
              <table className="tlab-table tlab-table--compact tlab-table--risk-inline">
                <tbody>
                  <tr>
                    <td>{t('traderLab.volatility')}</td>
                    <td><span className="tlab-pill tlab-pill--warn">{volLabel}</span></td>
                  </tr>
                  <tr>
                    <td>{t('traderLab.newsRisk')}</td>
                    <td><span className="tlab-pill tlab-pill--ok">{newsRiskLabel}</span></td>
                  </tr>
                  <tr>
                    <td>{t('traderLab.eventRisk')}</td>
                    <td><span className="tlab-pill tlab-pill--ok">{eventRiskLabel}</span></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="tlab-left-tail" aria-label="Session and saved labs">
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
            </div>
          </aside>

          {/* CENTER COLUMN - Reorganized: Chart → Decoder Strip → Fundamental Backing → Trader Thesis */}
          <div className="trader-lab-v2__center">
            <div className="tlab-center-stack">
              <div className="tlab-center-main">
                <div className="tlab-card tlab-card--chart tlab-card--gold tlab-card--focal">
                  <div className="tlab-chart-toolbar tlab-chart-toolbar--terminal">
                    <div className="tlab-chart-toolbar__primary">
                      <select
                        className="tlab-select"
                        value={form.chartSymbol}
                        onChange={(e) => handleInstrumentChange(e.target.value)}
                        aria-label="Instrument"
                      >
                        {instrumentOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      <div>
                        <div className="tlab-hint tlab-hint--tight">Candle timeframe</div>
                        <div className="tlab-tf-group" role="tablist" aria-label="Candle timeframe">
                          {CHART_INTERVALS.map((tf) => (
                            <button
                              key={tf.value}
                              type="button"
                              role="tab"
                              aria-selected={form.chartInterval === tf.value}
                              className={`tlab-tf${form.chartInterval === tf.value ? ' tlab-tf--active' : ''}`}
                              onClick={() => updateField('chartInterval', tf.value)}
                            >
                              {tf.label}
                            </button>
                          ))}
                        </div>
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
                    <LightweightInstrumentChart
                      symbol={form.chartSymbol}
                      interval={normalizeApiInterval(form.chartInterval)}
                      onDataLoaded={(meta) => {
                        const close = Number(meta?.latestClose);
                        if (Number.isFinite(close)) setLatestClose(close);
                      }}
                      fillParent
                      className="trader-suite-chart-frame"
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
                <p className="tlab-decoder-log-hint">Many entries? Scroll the list below.</p>
                <ul
                  className="tlab-decoder-log"
                  aria-label="Market Decoder desk log. Scroll for more when the list is long."
                >
                  {decoderLogRows.map((row) => (
                    <li key={row.key} className="tlab-decoder-log__row">
                      {row.text}
                    </li>
                  ))}
                </ul>
              </div>

              {/* FUNDAMENTAL BACKING - MOVED FROM LEFT RAIL */}
              <div className="tlab-card tlab-card--gold tlab-card--dock-fundamental">
                <h3 className="tlab-card__title">Fundamental backing</h3>
                <p className="tlab-card__subnote">One point per line</p>
                <textarea
                  className="tlab-textarea tlab-textarea--tight tlab-textarea--dock-fundamental"
                  rows={4}
                  value={form.fundamentalBacking}
                  onChange={(e) => updateField('fundamentalBacking', e.target.value)}
                  placeholder="One line per fundamental point…"
                  aria-label="Fundamental backing"
                />
              </div>

              {/* TRADER THESIS BLOCK - MOVED FROM LEFT RAIL */}
              <div className="tl-thesis-stack">
                <TraderLabThesisBlock form={form} onFieldChange={updateField} />
                {thesisMeta ? (
                  <p className="tl-thesis-meta-external" aria-live="polite">
                    {thesisMeta}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {/* RIGHT RAIL - Unchanged */}
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
                <select className="tlab-select" value={form.chartSymbol} onChange={(e) => handleInstrumentChange(e.target.value)}>
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
                    onChange={(e) => updateField('entryPrice', roundToPrecision(e.target.value, planPricePrecision))}
                  />
                </div>
                <div className="tlab-field">
                  <label>Stop loss</label>
                  <input
                    className="tlab-input"
                    type="number"
                    step="any"
                    value={form.stopLoss}
                    onChange={(e) => updateField('stopLoss', roundToPrecision(e.target.value, planPricePrecision))}
                  />
                </div>
                <div className="tlab-field">
                  <label>Target</label>
                  <input
                    className="tlab-input"
                    type="number"
                    step="any"
                    value={form.targetPrice}
                    onChange={(e) => updateField('targetPrice', roundToPrecision(e.target.value, planPricePrecision))}
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
                {operatorValidatorRows.map((row) => (
                  <li key={row.label}>
                    <span className="tlab-vlabel">{row.label}</span>
                    <span className={row.ok ? 'tlab-vstatus tlab-vstatus--ok' : 'tlab-vstatus'}>{row.status}</span>
                  </li>
                ))}
              </ul>
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