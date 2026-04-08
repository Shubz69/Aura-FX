import React, { useEffect, useState } from 'react';
import Api from '../../services/Api';
import { toast } from 'react-toastify';
import { GradeBadge, TagPills } from './BacktestingSharedUi';

function fmtNum(x, d = 2) {
  if (x == null || Number.isNaN(Number(x))) return '—';
  return Number(x).toFixed(d);
}

function toDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function mistakesToText(m) {
  if (!Array.isArray(m) || !m.length) return '';
  return m.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('\n');
}

function textToMistakes(text) {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function TradeReviewDrawer({ trade, open, onClose, onSaved, onDeleted }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (!trade || !open) {
      setForm(null);
      setEditing(false);
      return;
    }
    setForm({
      instrument: trade.instrument || '',
      direction: trade.direction === 'short' ? 'short' : 'long',
      entryPrice: trade.entryPrice != null ? String(trade.entryPrice) : '',
      exitPrice: trade.exitPrice != null ? String(trade.exitPrice) : '',
      stopLoss: trade.stopLoss != null ? String(trade.stopLoss) : '',
      takeProfit: trade.takeProfit != null ? String(trade.takeProfit) : '',
      openTime: toDatetimeLocal(trade.openTime),
      closeTime: toDatetimeLocal(trade.closeTime),
      pnlAmount: trade.pnlAmount != null ? String(trade.pnlAmount) : '',
      initialRiskAmount: trade.initialRiskAmount != null ? String(trade.initialRiskAmount) : '',
      rMultiple: trade.rMultiple != null ? String(trade.rMultiple) : '',
      timeframe: trade.timeframe || '',
      sessionLabel: trade.sessionLabel || '',
      playbookId: trade.playbookId || '',
      playbookName: trade.playbookName || '',
      setupName: trade.setupName || '',
      entryModel: trade.entryModel || '',
      confidenceScore: trade.confidenceScore != null ? String(trade.confidenceScore) : '',
      checklistScore: trade.checklistScore != null ? String(trade.checklistScore) : '',
      ruleAdherenceScore: trade.ruleAdherenceScore != null ? String(trade.ruleAdherenceScore) : '',
      qualityGrade: trade.qualityGrade || 'B',
      bias: trade.bias || '',
      marketCondition: trade.marketCondition || '',
      notes: trade.notes || '',
      tagsStr: Array.isArray(trade.tags) ? trade.tags.join(', ') : '',
      mistakesStr: mistakesToText(trade.mistakes),
    });
    setEditing(false);
  }, [trade, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !trade || !form) return null;

  const patchField = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!trade.id) return;
    setSaving(true);
    try {
      const tags = form.tagsStr
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const body = {
        instrument: form.instrument.trim(),
        direction: form.direction,
        entryPrice: Number(form.entryPrice),
        exitPrice: form.exitPrice !== '' ? Number(form.exitPrice) : null,
        stopLoss: form.stopLoss !== '' ? Number(form.stopLoss) : null,
        takeProfit: form.takeProfit !== '' ? Number(form.takeProfit) : null,
        openTime: form.openTime || null,
        closeTime: form.closeTime || null,
        pnlAmount: Number(form.pnlAmount),
        initialRiskAmount: form.initialRiskAmount !== '' ? Number(form.initialRiskAmount) : null,
        rMultiple: form.rMultiple !== '' ? Number(form.rMultiple) : null,
        timeframe: form.timeframe || null,
        sessionLabel: form.sessionLabel || null,
        playbookId: form.playbookId.trim() || null,
        playbookName: form.playbookName.trim() || null,
        setupName: form.setupName.trim() || null,
        entryModel: form.entryModel.trim() || null,
        confidenceScore: form.confidenceScore !== '' ? Math.max(1, Math.min(10, Math.round(Number(form.confidenceScore)))) : null,
        checklistScore: form.checklistScore !== '' ? Number(form.checklistScore) : null,
        ruleAdherenceScore: form.ruleAdherenceScore !== '' ? Number(form.ruleAdherenceScore) : null,
        qualityGrade: form.qualityGrade,
        bias: form.bias.trim() || null,
        marketCondition: form.marketCondition.trim() || null,
        notes: form.notes,
        tags,
        mistakes: textToMistakes(form.mistakesStr),
        marketType: trade.marketType ?? undefined,
      };
      const res = await Api.patchBacktestingTrade(trade.id, body);
      if (res.data?.success) {
        toast.success('Trade updated');
        onSaved?.(res.data.trade);
        setEditing(false);
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not save trade');
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!trade.id || !window.confirm('Delete this trade permanently?')) return;
    setSaving(true);
    try {
      await Api.deleteBacktestingTrade(trade.id);
      toast.success('Trade deleted');
      onDeleted?.(trade.id);
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  const chk = Array.isArray(trade.checklistItems) ? trade.checklistItems : [];

  return (
    <>
      <div className="bt-drawer-backdrop" role="presentation" onClick={() => !saving && onClose()} />
      <aside className="bt-drawer bt-drawer--wide" role="dialog" aria-modal="true" aria-labelledby="bt-tr-title">
        <div className="bt-drawer-header">
          <div>
            <h2 id="bt-tr-title" className="aa-section-title-lg" style={{ marginBottom: 6 }}>
              <span className="aa-title-dot" />
              Trade review
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <span className="aa-pill aa-pill--accent">{trade.instrument}</span>
              <span className="aa-pill aa-pill--dim">{trade.direction}</span>
              <GradeBadge grade={trade.qualityGrade} />
              <span className="aa--muted" style={{ fontSize: '0.75rem' }}>
                PnL {fmtNum(trade.pnlAmount)} · R {fmtNum(trade.rMultiple)}
              </span>
            </div>
          </div>
          <button type="button" className="bt-btn bt-btn--ghost bt-btn--sm" disabled={saving} onClick={onClose}>
            Close
          </button>
        </div>

        <div className="bt-drawer-body">
          <div className="bt-drawer-meta-row">
            <div>
              <span className="bt-label">Session</span>
              <div className="aa--muted" style={{ fontSize: '0.8rem', wordBreak: 'break-all' }}>
                {trade.sessionId || '—'}
              </div>
            </div>
            <div>
              <span className="bt-label">Tags</span>
              <div>
                <TagPills tags={trade.tags} />
              </div>
            </div>
          </div>

          {!editing ? (
            <>
              <div className="bt-drawer-section">
                <div className="bt-drawer-section-title">Prices & risk</div>
                <div className="bt-review-kv">
                  <div>
                    <span className="bt-review-k">Entry</span>
                    <span className="bt-review-v">{fmtNum(trade.entryPrice)}</span>
                  </div>
                  <div>
                    <span className="bt-review-k">Exit</span>
                    <span className="bt-review-v">{trade.exitPrice != null ? fmtNum(trade.exitPrice) : '—'}</span>
                  </div>
                  <div>
                    <span className="bt-review-k">Stop</span>
                    <span className="bt-review-v">{trade.stopLoss != null ? fmtNum(trade.stopLoss) : '—'}</span>
                  </div>
                  <div>
                    <span className="bt-review-k">TP</span>
                    <span className="bt-review-v">{trade.takeProfit != null ? fmtNum(trade.takeProfit) : '—'}</span>
                  </div>
                  <div>
                    <span className="bt-review-k">Timeframe</span>
                    <span className="bt-review-v">{trade.timeframe || '—'}</span>
                  </div>
                  <div>
                    <span className="bt-review-k">Session window</span>
                    <span className="bt-review-v">{trade.sessionLabel || '—'}</span>
                  </div>
                </div>
              </div>
              <div className="bt-drawer-section">
                <div className="bt-drawer-section-title">Playbook & setup</div>
                <div className="bt-review-kv">
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span className="bt-review-k">Playbook</span>
                    <span className="bt-review-v">{trade.playbookName || trade.playbookId || '—'}</span>
                  </div>
                  <div>
                    <span className="bt-review-k">Setup</span>
                    <span className="bt-review-v">{trade.setupName || '—'}</span>
                  </div>
                  <div>
                    <span className="bt-review-k">Entry model</span>
                    <span className="bt-review-v">{trade.entryModel || '—'}</span>
                  </div>
                  <div>
                    <span className="bt-review-k">Confidence</span>
                    <span className="bt-review-v">{trade.confidenceScore != null ? trade.confidenceScore : '—'}</span>
                  </div>
                  <div>
                    <span className="bt-review-k">Checklist %</span>
                    <span className="bt-review-v">{trade.checklistScore != null ? `${fmtNum(trade.checklistScore, 0)}%` : '—'}</span>
                  </div>
                  <div>
                    <span className="bt-review-k">Rule adherence</span>
                    <span className="bt-review-v">{trade.ruleAdherenceScore != null ? fmtNum(trade.ruleAdherenceScore) : '—'}</span>
                  </div>
                  <div>
                    <span className="bt-review-k">Bias</span>
                    <span className="bt-review-v">{trade.bias || '—'}</span>
                  </div>
                  <div>
                    <span className="bt-review-k">Condition</span>
                    <span className="bt-review-v">{trade.marketCondition || '—'}</span>
                  </div>
                </div>
              </div>
              {chk.length > 0 && (
                <div className="bt-drawer-section">
                  <div className="bt-drawer-section-title">Checklist (read-only)</div>
                  <ul className="bt-checklist-readonly">
                    {chk.map((c, i) => (
                      <li key={c.key || i}>
                        <span className={c.passed ? 'ok' : ''}>{c.passed ? '✓' : '○'}</span> {c.label || c.key}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="bt-drawer-section">
                <div className="bt-drawer-section-title">Notes & mistakes</div>
                <p className="bt-review-notes">{trade.notes || <span className="aa--muted">No notes</span>}</p>
                {Array.isArray(trade.mistakes) && trade.mistakes.length > 0 ? (
                  <ul className="bt-mistake-list">
                    {trade.mistakes.map((m, i) => (
                      <li key={i}>{typeof m === 'string' ? m : JSON.stringify(m)}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="aa--muted" style={{ fontSize: '0.8rem' }}>
                    No mistakes logged
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="bt-drawer-section">
                <div className="bt-drawer-section-title">Execution</div>
                <div className="bt-form-grid">
                  <div>
                    <label className="bt-label">Instrument</label>
                    <input className="bt-input" value={form.instrument} onChange={(e) => patchField('instrument', e.target.value)} />
                  </div>
                  <div>
                    <label className="bt-label">Direction</label>
                    <select className="bt-select" value={form.direction} onChange={(e) => patchField('direction', e.target.value)}>
                      <option value="long">Long</option>
                      <option value="short">Short</option>
                    </select>
                  </div>
                  <div>
                    <label className="bt-label">Entry</label>
                    <input className="bt-input" value={form.entryPrice} onChange={(e) => patchField('entryPrice', e.target.value)} />
                  </div>
                  <div>
                    <label className="bt-label">Exit</label>
                    <input className="bt-input" value={form.exitPrice} onChange={(e) => patchField('exitPrice', e.target.value)} />
                  </div>
                  <div>
                    <label className="bt-label">Stop</label>
                    <input className="bt-input" value={form.stopLoss} onChange={(e) => patchField('stopLoss', e.target.value)} />
                  </div>
                  <div>
                    <label className="bt-label">Take profit</label>
                    <input className="bt-input" value={form.takeProfit} onChange={(e) => patchField('takeProfit', e.target.value)} />
                  </div>
                  <div>
                    <label className="bt-label">Open (local)</label>
                    <input className="bt-input" type="datetime-local" value={form.openTime} onChange={(e) => patchField('openTime', e.target.value)} />
                  </div>
                  <div>
                    <label className="bt-label">Close (local)</label>
                    <input className="bt-input" type="datetime-local" value={form.closeTime} onChange={(e) => patchField('closeTime', e.target.value)} />
                  </div>
                  <div>
                    <label className="bt-label">PnL</label>
                    <input className="bt-input" value={form.pnlAmount} onChange={(e) => patchField('pnlAmount', e.target.value)} />
                  </div>
                  <div>
                    <label className="bt-label">Initial risk</label>
                    <input className="bt-input" value={form.initialRiskAmount} onChange={(e) => patchField('initialRiskAmount', e.target.value)} />
                  </div>
                  <div>
                    <label className="bt-label">R multiple (optional)</label>
                    <input className="bt-input" value={form.rMultiple} onChange={(e) => patchField('rMultiple', e.target.value)} />
                  </div>
                  <div>
                    <label className="bt-label">Timeframe</label>
                    <input className="bt-input" value={form.timeframe} onChange={(e) => patchField('timeframe', e.target.value)} />
                  </div>
                  <div>
                    <label className="bt-label">Session window</label>
                    <input className="bt-input" value={form.sessionLabel} onChange={(e) => patchField('sessionLabel', e.target.value)} />
                  </div>
                </div>
              </div>
              <div className="bt-drawer-section">
                <div className="bt-drawer-section-title">Metadata</div>
                <div className="bt-form-grid">
                  <div>
                    <label className="bt-label">Playbook id</label>
                    <input className="bt-input" value={form.playbookId} onChange={(e) => patchField('playbookId', e.target.value)} />
                  </div>
                  <div>
                    <label className="bt-label">Playbook name</label>
                    <input className="bt-input" value={form.playbookName} onChange={(e) => patchField('playbookName', e.target.value)} />
                  </div>
                  <div>
                    <label className="bt-label">Setup</label>
                    <input className="bt-input" value={form.setupName} onChange={(e) => patchField('setupName', e.target.value)} />
                  </div>
                  <div>
                    <label className="bt-label">Entry model</label>
                    <input className="bt-input" value={form.entryModel} onChange={(e) => patchField('entryModel', e.target.value)} />
                  </div>
                  <div>
                    <label className="bt-label">Confidence (1–10)</label>
                    <input className="bt-input" type="number" min={1} max={10} value={form.confidenceScore} onChange={(e) => patchField('confidenceScore', e.target.value)} />
                  </div>
                  <div>
                    <label className="bt-label">Checklist %</label>
                    <input className="bt-input" type="number" value={form.checklistScore} onChange={(e) => patchField('checklistScore', e.target.value)} />
                  </div>
                  <div>
                    <label className="bt-label">Rule adherence</label>
                    <input className="bt-input" type="number" value={form.ruleAdherenceScore} onChange={(e) => patchField('ruleAdherenceScore', e.target.value)} />
                  </div>
                  <div>
                    <label className="bt-label">Quality</label>
                    <select className="bt-select" value={form.qualityGrade} onChange={(e) => patchField('qualityGrade', e.target.value)}>
                      {['A+', 'A', 'B', 'C', 'D'].map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="bt-label">Bias</label>
                    <input className="bt-input" value={form.bias} onChange={(e) => patchField('bias', e.target.value)} />
                  </div>
                  <div>
                    <label className="bt-label">Market condition</label>
                    <input className="bt-input" value={form.marketCondition} onChange={(e) => patchField('marketCondition', e.target.value)} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="bt-label">Tags (comma)</label>
                    <input className="bt-input" value={form.tagsStr} onChange={(e) => patchField('tagsStr', e.target.value)} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="bt-label">Notes</label>
                    <textarea className="bt-textarea" rows={3} value={form.notes} onChange={(e) => patchField('notes', e.target.value)} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="bt-label">Mistakes (one per line)</label>
                    <textarea className="bt-textarea" rows={3} value={form.mistakesStr} onChange={(e) => patchField('mistakesStr', e.target.value)} />
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="bt-drawer-footer-btns">
            {!editing ? (
              <>
                <button type="button" className="bt-btn bt-btn--primary" onClick={() => setEditing(true)}>
                  Edit trade
                </button>
                <button type="button" className="bt-btn bt-btn--danger" disabled={saving} onClick={del}>
                  Delete
                </button>
              </>
            ) : (
              <>
                <button type="button" className="bt-btn bt-btn--primary" disabled={saving} onClick={save}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                <button type="button" className="bt-btn bt-btn--ghost" disabled={saving} onClick={() => setEditing(false)}>
                  Cancel edit
                </button>
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
