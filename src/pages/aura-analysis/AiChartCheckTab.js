/**
 * AI Chart Check Tab
 * Premium multi-timeframe analysis UI.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getInstrumentsByCategory } from '../../lib/aura-analysis/instruments';
import { mergeWatchlistIntoInstrumentGroups } from '../../lib/aura-analysis/chartCheckPairs';
import '../../styles/aura-analysis/AiChartCheck.css';

const BASE_PAIR_GROUPS = getInstrumentsByCategory();
const BASE_URL = process.env.REACT_APP_API_URL || '';

const CHECKLIST_TYPES = [
  { id: 'scalp', label: 'Scalp', desc: 'Fast execution, precision entry and session control' },
  { id: 'intraDay', label: 'Intra Day', desc: 'Structured intraday bias, confirmations and clean execution' },
  { id: 'swing', label: 'Swing', desc: 'Higher-timeframe structure, patience and position quality' },
];

const DIRECTION_OPTIONS = ['Buy', 'Sell', 'Unsure'];
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_SIZE_MB = 10;
const TIMEFRAME_OPTIONS = ['Monthly', 'Weekly', 'Daily', '4H', '2H', '1H', '30M', '15M', '5M', '1M'];
const TF_DEFAULTS = ['1H', '15M', '4H', 'Daily'];
const makeSlot = (tf = '1H') => ({ id: `${Date.now()}-${Math.random()}`, timeframe: tf, image: null });

function scoreTone(score) {
  if (score >= 75) return 'good';
  if (score >= 45) return 'mid';
  return 'risk';
}

function ScoreCard({ label, value }) {
  return (
    <div className={`acc-score-card acc-score-card--${scoreTone(value)}`}>
      <span className="acc-score-label">{label}</span>
      <span className="acc-score-value">{Math.max(0, Math.min(100, Number(value) || 0))}</span>
    </div>
  );
}

function InfoList({ items }) {
  if (!Array.isArray(items) || !items.length) return <span className="acc-empty-text">None</span>;
  return <ul>{items.map((item, i) => <li key={`${item}-${i}`}>{item}</li>)}</ul>;
}

function SectionCard({ section }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`acc-section-card acc-section-v2 acc-section-v2--${section.verdict || 'moderate'}`}>
      <button className="acc-section-header" onClick={() => setOpen((v) => !v)} type="button">
        <div className="acc-section-left">
          <span className="acc-section-name">{section.name}</span>
        </div>
        <div className="acc-section-right">
          <span className="acc-section-score">{section.score}%</span>
          <span className="acc-section-label">{section.verdict}</span>
          <span className={`acc-section-chevron ${open ? 'open' : ''}`}>›</span>
        </div>
      </button>
      {open && (
        <div className="acc-section-body">
          <div className="acc-sub-block">
            <h5>What AI Sees</h5>
            <InfoList items={section.whatAiSees} />
          </div>
          <div className="acc-sub-block">
            <h5>Why It Matters</h5>
            <p>{section.whyItMatters}</p>
          </div>
          <div className="acc-sub-grid">
            <div className="acc-sub-block">
              <h5>Issues</h5>
              <InfoList items={section.issues} />
            </div>
            <div className="acc-sub-block">
              <h5>What Would Improve It</h5>
              <InfoList items={section.whatWouldImproveIt} />
            </div>
          </div>
          {Array.isArray(section.criteriaResults) && section.criteriaResults.length > 0 && (
            <div className="acc-sub-block">
              <h5>Checklist Criteria</h5>
              <ul className="acc-criteria-list">
                {section.criteriaResults.map((cr, i) => (
                  <li key={`${cr.criterion}-${i}`} className={`acc-criteria-item acc-criteria--${cr.result || 'unclear'}`}>
                    <span className="acc-criteria-dot" />
                    <span className="acc-criteria-text">{cr.criterion}</span>
                    <span className={`acc-criteria-badge acc-criteria-badge--${cr.result || 'unclear'}`}>{cr.result || 'unclear'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HeadlineResult({ result }) {
  const s = result.summary || {};
  return (
    <div className="acc-headline-card">
      <div className="acc-headline-grid">
        <div><span className="acc-k">Bias</span><strong>{s.primaryBias || 'mixed'}</strong></div>
        <div><span className="acc-k">Bias Match</span><strong>{s.biasMatchWithUser == null ? 'unclear' : s.biasMatchWithUser ? 'yes' : 'no'}</strong></div>
        <div><span className="acc-k">Confidence</span><strong>{s.confidenceLabel || 'medium'}</strong></div>
        <div><span className="acc-k">Action Now</span><strong>{s.practicalAction || 'watch'}</strong></div>
      </div>
      <p className="acc-headline-move">
        <span>Most likely next move:</span> {s.mostLikelyNextMove || 'Awaiting cleaner confirmation from current structure.'}
      </p>
    </div>
  );
}

function ResultPanel({ result, onReset, embedded = false }) {
  const navigate = useNavigate();
  const scores = result.scores || {};
  const tf = result.timeframeAnalysis || {};
  const forecast = result.forecast || {};
  const action = result.traderAction || {};
  const explanation = result.userExplanation || {};
  const answers = result.traderAnswers || {};
  const processingMeta = result.processingMeta || {};

  return (
    <div className="acc-result">
      <HeadlineResult result={result} />

      <div className="acc-score-grid">
        <ScoreCard label="Chart Clarity" value={scores.chartClarityScore} />
        <ScoreCard label="Checklist Quality" value={scores.checklistScore} />
        <ScoreCard label="Bias Confidence" value={scores.biasConfidenceScore} />
        <ScoreCard label="Overall Setup" value={scores.overallSetupScore} />
      </div>

      <div className="acc-panel">
        <h3 className="acc-block-title">Timeframe Alignment</h3>
        <div className="acc-timeframe-grid">
          <div><span className="acc-k">HTF</span><strong>{tf.higherTimeframeBias || 'unclear'}</strong></div>
          <div><span className="acc-k">MTF</span><strong>{tf.midTimeframeBias || 'unclear'}</strong></div>
          <div><span className="acc-k">LTF</span><strong>{tf.lowerTimeframeBias || 'unclear'}</strong></div>
        </div>
        <p className="acc-muted-line">{tf.alignmentSummary || 'Alignment details unavailable.'}</p>
        <div className="acc-sub-block">
          <h5>Contradictions</h5>
          <InfoList items={tf.contradictions} />
        </div>
      </div>

      {Array.isArray(result.sections) && result.sections.length > 0 && (
        <div className="acc-sections">
          <h3 className="acc-block-title">Section Breakdown</h3>
          <div className="acc-sections-list">
            {result.sections.map((section, i) => <SectionCard key={`${section.name}-${i}`} section={section} />)}
          </div>
        </div>
      )}

      <div className="acc-panel">
        <h3 className="acc-block-title">Forecast / Scenario Engine</h3>
        <div className="acc-sub-grid">
          <div className="acc-sub-block">
            <h5>Most Likely Next Move</h5>
            <p>{forecast.mostLikelyNextMove || 'Not enough structure for a strong directional call.'}</p>
          </div>
          <div className="acc-sub-block">
            <h5>Secondary Scenario</h5>
            <p>{forecast.secondaryScenario || 'Alternative scenario unavailable.'}</p>
          </div>
        </div>
        <div className="acc-sub-grid">
          <div className="acc-sub-block"><h5>Bull Case</h5><p>{forecast.bullCase || 'Not provided.'}</p></div>
          <div className="acc-sub-block"><h5>Bear Case</h5><p>{forecast.bearCase || 'Not provided.'}</p></div>
        </div>
        <div className="acc-sub-grid">
          <div className="acc-sub-block"><h5>Invalidation</h5><p>{forecast.invalidation || 'Invalidation not provided.'}</p></div>
          <div className="acc-sub-block"><h5>Probability Band</h5><p>{forecast.probabilityBand || 'moderate'}</p></div>
        </div>
        <div className="acc-sub-grid">
          <div className="acc-sub-block"><h5>Confirmation Needed</h5><InfoList items={forecast.confirmationNeeded} /></div>
          <div className="acc-sub-block"><h5>Caution Notes</h5><InfoList items={forecast.cautionNotes} /></div>
        </div>
      </div>

      <div className="acc-panel">
        <h3 className="acc-block-title">Trader Action</h3>
        <div className="acc-sub-grid">
          <div className="acc-sub-block"><h5>Action Now</h5><p>{action.actionNow || 'watch'}</p></div>
          <div className="acc-sub-block"><h5>Reason</h5><p>{action.reason || 'Wait for clearer structure and risk-defined trigger.'}</p></div>
        </div>
        <div className="acc-sub-grid">
          <div className="acc-sub-block"><h5>What To Wait For</h5><InfoList items={action.whatToWaitFor} /></div>
          <div className="acc-sub-block"><h5>Manual Checks</h5><InfoList items={action.manualChecks} /></div>
        </div>
        <div className="acc-sub-block">
          <h5>What Invalidates The Setup</h5>
          <p>{action.whatInvalidatesTheSetup || 'Decisive structural break against thesis.'}</p>
        </div>
      </div>

      <div className="acc-panel">
        <h3 className="acc-block-title">Direct Trader Answers</h3>
        <div className="acc-qa-grid">
          <div className="acc-qa-item">
            <h5>What is the chart showing?</h5>
            <p>{answers.whatIsChartShowing || 'The chart is showing mixed structure with conditional directional pressure.'}</p>
          </div>
          <div className="acc-qa-item">
            <h5>Is my bias correct or not?</h5>
            <p>{answers.isMyBiasCorrect || 'Bias confirmation is mixed; wait for clearer structural alignment.'}</p>
          </div>
          <div className="acc-qa-item">
            <h5>What is most likely to happen next?</h5>
            <p>{answers.whatLikelyNext || forecast.mostLikelyNextMove || 'Most likely path needs confirmation before execution.'}</p>
          </div>
          <div className="acc-qa-item">
            <h5>What would invalidate this view?</h5>
            <p>{answers.whatInvalidatesView || action.whatInvalidatesTheSetup || 'A decisive break through invalidation structure.'}</p>
          </div>
          <div className="acc-qa-item">
            <h5>Should I act now, wait, or avoid it?</h5>
            <p>{answers.shouldIActNow || `Current action: ${action.actionNow || 'watch'}.`}</p>
          </div>
        </div>
      </div>

      <div className="acc-panel">
        <h3 className="acc-block-title">Premium Analyst Explanation</h3>
        <p className="acc-expl-headline">{explanation.headline || 'AI market read'}</p>
        <p>{explanation.summaryParagraph}</p>
        <p>{explanation.biasExplanation}</p>
        <p>{explanation.nextMoveExplanation}</p>
        <p>{explanation.actionExplanation}</p>
      </div>

      <div className="acc-disclaimer">
        <span className="acc-disclaimer-icon">ℹ</span>
        <p>
          <strong>This AI Chart Check is a supporting tool only.</strong> Always complete The Operator checklist manually
          and confirm your own risk plan before entering any position. Not financial advice.
        </p>
      </div>

      <div className="acc-result-actions">
        <button className="acc-btn acc-btn--secondary acc-reset-btn" onClick={onReset} type="button">
          ↺ Analyse Another Chart
        </button>
        {embedded ? (
          <button
            className="acc-btn acc-btn--primary acc-go-checklist"
            onClick={() => {
              if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            type="button"
          >
            ↑ Back To Checklist
          </button>
        ) : (
          <button className="acc-btn acc-btn--primary acc-go-checklist" onClick={() => navigate('/trader-deck/trade-validator/checklist')} type="button">
            📋 Go To Checklist
          </button>
        )}
      </div>
      {(Number.isFinite(Number(processingMeta.elapsedMs)) || Number.isFinite(Number(processingMeta.repairPasses))) && (
        <p className="acc-processing-meta">
          Analysis time: {Number.isFinite(Number(processingMeta.elapsedMs)) ? `${(Number(processingMeta.elapsedMs) / 1000).toFixed(1)}s` : 'n/a'}
          {Number.isFinite(Number(processingMeta.repairPasses)) ? ` · repair passes: ${Number(processingMeta.repairPasses)}` : ''}
        </p>
      )}
    </div>
  );
}

export default function AiChartCheckTab({ embedded = false }) {
  const { token } = useAuth();
  const [pairGroups, setPairGroups] = useState(BASE_PAIR_GROUPS);

  useEffect(() => {
    let cancelled = false;
    fetch(`${BASE_URL}/api/market/watchlist`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data?.success || !data.watchlist) return;
        setPairGroups(mergeWatchlistIntoInstrumentGroups(data.watchlist, BASE_PAIR_GROUPS));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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
      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }
      if (!res.ok || !data.success) {
        let msg = data.message || `Analysis failed (${res.status})`;
        if (data.code === 'UPSTREAM_TIMEOUT') {
          msg += ' The request timed out — try fewer or smaller chart images, then run again.';
        } else if (data.code === 'CHART_CHECK_ERROR' || res.status >= 500) {
          msg += ' Try refreshing the page (a new app version may be available), then run the check again.';
        }
        throw new Error(msg);
      }
      setResult(data.result);
    } catch (err) {
      const m = err.message || 'Analysis failed. Please try again.';
      setError(/Failed to fetch|NetworkError|Load failed/i.test(m)
        ? `${m} Check your connection or refresh the page.`
        : m);
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

  if (result) return <ResultPanel result={result} onReset={handleReset} embedded={embedded} />;

  return (
    <div className={`acc-page ${embedded ? 'acc-page--embedded' : ''}`}>
      {!embedded && (
        <div className="acc-header">
          <div className="acc-header-text">
            <h2 className="acc-title">
              <span className="acc-title-icon">🤖</span>
              AI Chart Check
            </h2>
            <p className="acc-subtitle">
              Upload your chart and the AI will assess it against The Operator checklist —
              giving you a structured score and breakdown.{' '}
              <strong>You must still complete the checklist manually before taking any trade.</strong>
            </p>
          </div>
        </div>
      )}

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
              <label className="acc-field-label" htmlFor="acc-pair-select">
                Pair / Symbol <span className="acc-optional">optional</span>
              </label>
              <select
                id="acc-pair-select"
                className="acc-input acc-select"
                value={pair}
                onChange={(e) => setPair(e.target.value)}
                aria-label="Trading pair or symbol"
              >
                <option value="">Select pair…</option>
                {pairGroups.map((g) => (
                  <optgroup key={g.category} label={g.label}>
                    {g.instruments.map((inst) => (
                      <option key={inst.symbol} value={inst.symbol}>
                        {inst.displayName} ({inst.symbol})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
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
          The Operator checklist manually and confirm your own trade plan before entering any position.
          Not financial advice.
        </p>
      </div>
    </div>
  );
}
