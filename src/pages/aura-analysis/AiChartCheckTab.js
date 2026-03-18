/**
 * AI Chart Check Tab
 * Upload a chart → AI scores it against the Trade Validator checklist.
 */
import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import '../../styles/aura-analysis/AiChartCheck.css';

const BASE_URL = process.env.REACT_APP_API_URL || '';

const CHECKLIST_TYPES = [
  { id: 'scalp',    label: 'Scalp',      desc: 'Fast execution, precision entry and session control' },
  { id: 'intraDay', label: 'Intra Day',  desc: 'Structured intraday bias, confirmations and clean execution' },
  { id: 'swing',    label: 'Swing',      desc: 'Higher-timeframe structure, patience and position quality' },
];

const DIRECTION_OPTIONS = ['Buy', 'Sell', 'Unsure'];
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_SIZE_MB = 10;

const TIMEFRAME_OPTIONS = ['Monthly','Weekly','Daily','4H','2H','1H','30M','15M','5M','1M'];
const TF_DEFAULTS      = ['1H','15M','4H','Daily'];
const makeSlot = (tf = '1H') => ({ id: `${Date.now()}-${Math.random()}`, timeframe: tf, image: null });

function ScoreDial({ score }) {
  const clamp = Math.max(0, Math.min(100, score));
  const color = clamp >= 80 ? '#10b981' : clamp >= 60 ? '#f59e0b' : clamp >= 40 ? '#f97316' : '#ef4444';
  const radius = 44;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (clamp / 100) * circ;
  return (
    <div className="acc-dial-wrap">
      <svg viewBox="0 0 100 100" className="acc-dial-svg">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="8" />
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.4s' }}
        />
        <text x="50" y="54" textAnchor="middle" fill="#fff" fontSize="18" fontWeight="700" fontFamily="inherit">
          {clamp}
        </text>
        <text x="50" y="66" textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize="7" fontFamily="inherit">
          / 100
        </text>
      </svg>
    </div>
  );
}

function SectionCard({ section }) {
  const [open, setOpen] = useState(false);
  const statusMeta = {
    pass:    { cls: 'acc-status--pass',    label: 'Pass',    icon: '✓' },
    partial: { cls: 'acc-status--partial', label: 'Partial', icon: '◑' },
    fail:    { cls: 'acc-status--fail',    label: 'Fail',    icon: '✗' },
  };
  const meta = statusMeta[section.status] || statusMeta.partial;

  return (
    <div className={`acc-section-card ${meta.cls.replace('acc-status--', 'acc-section--')}`}>
      <button className="acc-section-header" onClick={() => setOpen(v => !v)} type="button">
        <div className="acc-section-left">
          <span className={`acc-section-status ${meta.cls}`}>{meta.icon}</span>
          <span className="acc-section-name">{section.name}</span>
        </div>
        <div className="acc-section-right">
          <span className="acc-section-score">{section.score}%</span>
          <span className={`acc-section-label ${meta.cls}`}>{meta.label}</span>
          <span className={`acc-section-chevron ${open ? 'open' : ''}`}>›</span>
        </div>
      </button>
      {open && (
        <div className="acc-section-body">
          <p className="acc-section-reasoning">{section.reasoning}</p>
          {Array.isArray(section.criteriaResults) && section.criteriaResults.length > 0 && (
            <ul className="acc-criteria-list">
              {section.criteriaResults.map((cr, i) => {
                const r = cr.result || 'unclear';
                return (
                  <li key={i} className={`acc-criteria-item acc-criteria--${r}`}>
                    <span className="acc-criteria-dot" />
                    <span className="acc-criteria-text">{cr.criterion}</span>
                    {cr.note && <span className="acc-criteria-note"> — {cr.note}</span>}
                    <span className={`acc-criteria-badge acc-criteria-badge--${r}`}>{r}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function RecommendationBanner({ score }) {
  const navigate = useNavigate();
  const isGood = score >= 70;

  return (
    <div className={`acc-rec-banner ${isGood ? 'acc-rec-banner--good' : 'acc-rec-banner--risk'}`}>
      <div className="acc-rec-banner-left">
        <span className="acc-rec-banner-icon">{isGood ? '✅' : '⚠️'}</span>
        <div className="acc-rec-banner-text">
          <span className="acc-rec-banner-title">
            {isGood ? 'Trade Recommendation: Good to Go' : 'Not Recommended — Trade at Your Own Risk'}
          </span>
          <span className="acc-rec-banner-body">
            {isGood
              ? `Your chart scores ${score}% and meets the 70% threshold. Start your checklist to formally add this trade to the system.`
              : `Your chart scores ${score}%, which is below the 70% threshold. This setup is not recommended — if you still want to proceed, do so at your own risk.`
            }
          </span>
        </div>
      </div>
      <button
        type="button"
        className={`acc-rec-banner-btn ${isGood ? 'acc-rec-banner-btn--good' : 'acc-rec-banner-btn--risk'}`}
        onClick={() => navigate('/trader-deck/trade-validator/checklist')}
      >
        <span>📋</span>
        {isGood ? 'Start Checklist' : 'Go to Checklist'}
      </button>
    </div>
  );
}

function ResultPanel({ result, onReset }) {
  return (
    <div className="acc-result">
      {/* Overall score */}
      <div className="acc-result-hero">
        <ScoreDial score={result.overallScore} />
        <div className="acc-result-hero-text">
          <div className="acc-result-status">
            <span className="acc-result-emoji">{result.statusEmoji}</span>
            <span className="acc-result-label">{result.statusLabel}</span>
            <span className={`acc-result-conf acc-result-conf--${result.confidence}`}>
              {result.confidence} confidence
            </span>
          </div>
          <div className="acc-result-meta">
            {result.checklistLabel && (
              <span className="acc-result-badge">{result.checklistLabel} Checklist</span>
            )}
            {result.imageQuality && (
              <span className={`acc-result-badge acc-result-badge--iq acc-iq--${result.imageQuality}`}>
                Image: {result.imageQuality}
              </span>
            )}
          </div>
          <p className="acc-result-summary">{result.summary}</p>
        </div>
      </div>

      {/* Recommendation banner */}
      <RecommendationBanner score={result.overallScore} />

      {/* Section breakdown */}
      {Array.isArray(result.sections) && result.sections.length > 0 && (
        <div className="acc-sections">
          <h3 className="acc-block-title">Checklist Section Breakdown</h3>
          <div className="acc-sections-list">
            {result.sections.map((s, i) => <SectionCard key={i} section={s} />)}
          </div>
        </div>
      )}

      {/* 4-column insight grid */}
      <div className="acc-insights-grid">
        {result.positives?.length > 0 && (
          <div className="acc-insight acc-insight--pos">
            <div className="acc-insight-title">✓ Supporting</div>
            <ul>{result.positives.map((p, i) => <li key={i}>{p}</li>)}</ul>
          </div>
        )}
        {result.concerns?.length > 0 && (
          <div className="acc-insight acc-insight--neg">
            <div className="acc-insight-title">⚠ Concerns</div>
            <ul>{result.concerns.map((c, i) => <li key={i}>{c}</li>)}</ul>
          </div>
        )}
        {result.missing?.length > 0 && (
          <div className="acc-insight acc-insight--missing">
            <div className="acc-insight-title">? Missing</div>
            <ul>{result.missing.map((m, i) => <li key={i}>{m}</li>)}</ul>
          </div>
        )}
        {result.manualConfirmation?.length > 0 && (
          <div className="acc-insight acc-insight--manual">
            <div className="acc-insight-title">✎ Manual Check</div>
            <ul>{result.manualConfirmation.map((m, i) => <li key={i}>{m}</li>)}</ul>
          </div>
        )}
      </div>

      {/* Mandatory disclaimer */}
      <div className="acc-disclaimer">
        <span className="acc-disclaimer-icon">ℹ</span>
        <p>
          <strong>This AI Chart Check is a supporting tool only.</strong> You must still go through the
          full checklist manually and confirm your trade plan yourself before entering any trade.
          This is not financial advice and does not guarantee any trade outcome.
        </p>
      </div>

      <button className="acc-btn acc-btn--secondary acc-reset-btn" onClick={onReset} type="button">
        ↺ Analyse Another Chart
      </button>
    </div>
  );
}

export default function AiChartCheckTab() {
  const { token } = useAuth();

  // Upload state — multi-slot
  const [slots, setSlots]               = useState(() => [makeSlot('1H')]);
  const [activeSlotId, setActiveSlotId] = useState(null);
  const [dragOverId, setDragOverId]     = useState(null);
  const [uploadError, setUploadError]   = useState('');
  const fileInputRef = useRef();

  // Form state
  const [checklistType, setChecklistType] = useState('intraDay');
  const [pair, setPair]     = useState('');
  const [direction, setDirection] = useState('');
  const [note, setNote]     = useState('');

  // Analysis state
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const processFile = useCallback((file, slotId) => {
    setUploadError('');
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError('Unsupported file type. Please upload JPEG, PNG, or WebP.');
      return;
    }
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > MAX_SIZE_MB) {
      setUploadError(`File too large (${sizeMB.toFixed(1)}MB). Max is ${MAX_SIZE_MB}MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const base64 = dataUrl.split(',')[1];
      setSlots(prev => prev.map(s =>
        s.id === slotId
          ? { ...s, image: { base64, mimeType: file.type, previewUrl: dataUrl, name: file.name, sizeMB: sizeMB.toFixed(1) } }
          : s
      ));
      setResult(null);
      setError('');
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFileInput = (e) => {
    if (activeSlotId) processFile(e.target.files?.[0], activeSlotId);
    e.target.value = '';
  };

  const addSlot = () => {
    if (slots.length >= 4) return;
    setSlots(prev => [...prev, makeSlot(TF_DEFAULTS[prev.length] || '15M')]);
  };

  const removeSlot = (id) => {
    setSlots(prev => prev.length > 1 ? prev.filter(s => s.id !== id) : prev);
  };

  const updateSlotTf = (id, tf) => {
    setSlots(prev => prev.map(s => s.id === id ? { ...s, timeframe: tf } : s));
  };

  const openFilePicker = (slotId) => {
    setActiveSlotId(slotId);
    fileInputRef.current?.click();
  };

  const handleAnalyse = async () => {
    const filled = slots.filter(s => s.image);
    if (!filled.length) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(`${BASE_URL}/api/ai/chart-check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          images: filled.map(s => ({ base64: s.image.base64, mimeType: s.image.mimeType, timeframe: s.timeframe })),
          checklistType,
          pair: pair.trim() || undefined,
          direction: direction || undefined,
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Analysis failed');
      setResult(data.result);
    } catch (err) {
      setError(err.message || 'Analysis failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSlots([makeSlot('1H')]);
    setResult(null);
    setError('');
    setUploadError('');
    setPair('');
    setDirection('');
    setNote('');
  };

  const filledCount = slots.filter(s => s.image).length;

  if (result) return <ResultPanel result={result} onReset={handleReset} />;

  return (
    <div className="acc-page">
      {/* Header */}
      <div className="acc-header">
        <div className="acc-header-text">
          <h2 className="acc-title">
            <span className="acc-title-icon">🤖</span>
            AI Chart Check
          </h2>
          <p className="acc-subtitle">
            Upload your chart and the AI will assess it against the Trade Validator checklist —
            giving you a structured score and breakdown.{' '}
            <strong>You must still complete the checklist manually before taking any trade.</strong>
          </p>
        </div>
      </div>

      <div className="acc-layout">
        {/* Multi-image upload grid */}
        <div className="acc-card acc-upload-card">
          <div className="acc-upload-card-head">
            <h3 className="acc-card-title">Chart Images</h3>
            <span className="acc-card-hint">Up to 4 timeframes — AI analyses them together</span>
          </div>
          <div className="acc-slots-grid">
            {slots.map(slot => (
              <div
                key={slot.id}
                className={`acc-slot${slot.image ? ' acc-slot--filled' : ''}${dragOverId === slot.id ? ' acc-slot--dragover' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOverId(slot.id); }}
                onDragLeave={() => setDragOverId(null)}
                onDrop={e => { e.preventDefault(); setDragOverId(null); processFile(e.dataTransfer.files?.[0], slot.id); }}
              >
                <div className="acc-slot-tf-row">
                  <select
                    className="acc-slot-tf-select"
                    value={slot.timeframe}
                    onChange={e => updateSlotTf(slot.id, e.target.value)}
                  >
                    {TIMEFRAME_OPTIONS.map(tf => <option key={tf} value={tf}>{tf}</option>)}
                  </select>
                  {slots.length > 1 && (
                    <button type="button" className="acc-slot-remove-btn" onClick={() => removeSlot(slot.id)}>✕</button>
                  )}
                </div>
                {!slot.image ? (
                  <div
                    className="acc-slot-empty"
                    role="button"
                    tabIndex={0}
                    onClick={() => openFilePicker(slot.id)}
                    onKeyDown={e => e.key === 'Enter' && openFilePicker(slot.id)}
                  >
                    <span className="acc-slot-plus">+</span>
                    <span className="acc-slot-add-label">Upload Chart</span>
                    <span className="acc-slot-add-hint">Drag & drop or click</span>
                  </div>
                ) : (
                  <div className="acc-slot-preview">
                    <img src={slot.image.previewUrl} alt={`${slot.timeframe} chart`} className="acc-slot-img" />
                    <div className="acc-slot-overlay">
                      <button type="button" className="acc-slot-overlay-btn" onClick={() => openFilePicker(slot.id)}>↺ Change</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {slots.length < 4 && (
              <button type="button" className="acc-slot acc-slot--add-new" onClick={addSlot}>
                <span className="acc-slot-plus">+</span>
                <span>Add Timeframe</span>
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_TYPES.join(',')}
            onChange={handleFileInput}
            style={{ display: 'none' }}
          />
          {uploadError && <p className="acc-field-error">{uploadError}</p>}
        </div>

        {/* Config */}
        <div className="acc-card acc-config-card">
          {/* Checklist type */}
          <div className="acc-field-group">
            <label className="acc-field-label">Checklist Mode</label>
            <div className="acc-type-pills">
              {CHECKLIST_TYPES.map(t => (
                <button
                  key={t.id}
                  type="button"
                  className={`acc-type-pill ${checklistType === t.id ? 'active' : ''}`}
                  onClick={() => setChecklistType(t.id)}
                >
                  <span className="acc-type-pill-label">{t.label}</span>
                  <span className="acc-type-pill-desc">{t.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Optional context */}
          <div className="acc-context-grid">
            <div className="acc-field">
              <label className="acc-field-label">Pair / Symbol <span className="acc-optional">optional</span></label>
              <input
                className="acc-input"
                type="text"
                placeholder="e.g. EURUSD, XAUUSD"
                value={pair}
                onChange={e => setPair(e.target.value)}
              />
            </div>
            <div className="acc-field">
              <label className="acc-field-label">Direction Idea <span className="acc-optional">optional</span></label>
              <div className="acc-dir-pills">
                {DIRECTION_OPTIONS.map(d => (
                  <button
                    key={d}
                    type="button"
                    className={`acc-dir-pill ${direction === d ? 'active' : ''}`}
                    onClick={() => setDirection(prev => prev === d ? '' : d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div className="acc-field acc-field--full">
              <label className="acc-field-label">Setup Note <span className="acc-optional">optional</span></label>
              <textarea
                className="acc-textarea"
                placeholder="Briefly describe your setup idea, e.g. 'Bearish reaction from 4H OB, expecting continuation after London open'"
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          {error && <div className="acc-error-box">{error}</div>}

          <button
            className="acc-btn acc-btn--primary acc-analyse-btn"
            onClick={handleAnalyse}
            disabled={!filledCount || loading}
            type="button"
          >
            {loading ? (
              <>
                <span className="acc-spinner" />
                Analysing chart…
              </>
            ) : (
              <>{filledCount > 1 ? `🔍 Analyse ${filledCount} Charts` : '🔍 Analyse Chart'}</>
            )}
          </button>

          {loading && (
            <p className="acc-loading-hint">
              The AI is reviewing your chart against the {CHECKLIST_TYPES.find(t => t.id === checklistType)?.label} checklist.
              This may take 15–30 seconds.
            </p>
          )}
        </div>
      </div>

      {/* Always-visible reminder */}
      <div className="acc-reminder">
        <span className="acc-reminder-icon">📋</span>
        <p>
          AI Chart Check is a <strong>supporting tool only</strong>. Always complete the full
          Trade Validator checklist manually and confirm your own trade plan before entering any position.
          Not financial advice.
        </p>
      </div>
    </div>
  );
}
