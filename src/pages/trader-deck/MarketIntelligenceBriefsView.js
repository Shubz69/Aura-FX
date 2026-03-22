/**
 * Market Intelligence briefs for Trader Deck – date-scoped Daily or Weekly.
 * List of briefs (PowerPoints); preview only (no download). Admin: upload, delete.
 */
import React, { useState, useEffect, useRef } from 'react';
import Api from '../../services/Api';
import { FaEye, FaTrash, FaPlus, FaTimes } from 'react-icons/fa';

export default function MarketIntelligenceBriefsView({ selectedDate, period, canEdit }) {
  const type = period === 'weekly' ? 'intel-weekly' : 'intel-daily';
  const [briefs, setBriefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addSuccess, setAddSuccess] = useState(null);
  const [previewId, setPreviewId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadUrl, setUploadUrl] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setAddSuccess(null);
    const dateStr = String(selectedDate).trim().slice(0, 10);
    Api.getTraderDeckContent(type, dateStr)
      .then((res) => {
        if (cancelled) return;
        setBriefs(Array.isArray(res.data?.briefs) ? res.data.briefs : []);
      })
      .catch(() => {
        if (!cancelled) setBriefs([]);
        setError('Failed to load briefs');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
  }, [type, selectedDate]);

  const previewUrl = previewId ? Api.getTraderDeckBriefPreviewUrl(previewId) : null;

  const handlePreview = (brief) => {
    if (brief.fileUrl) {
      window.open(brief.fileUrl, '_blank', 'noopener');
      return;
    }
    setPreviewId(brief.id);
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleAddByUrl = () => {
    const url = (uploadUrl || '').trim();
    const title = (uploadTitle || 'Brief').trim() || 'Brief';
    if (!url) return;
    const dateStr = String(selectedDate).trim().slice(0, 10);
    setUploading(true);
    setError(null);
    setAddSuccess(null);
    Api.uploadTraderDeckBrief({ date: dateStr, period, title, fileUrl: url })
      .then(() => {
        setUploadTitle('');
        setUploadUrl('');
        setAddSuccess(`Added for ${dateStr}`);
        setTimeout(() => setAddSuccess(null), 3000);
        return Api.getTraderDeckContent(type, dateStr);
      })
      .then((res) => setBriefs(Array.isArray(res.data?.briefs) ? res.data.briefs : []))
      .catch((err) => setError(err.response?.data?.message || 'Failed to add link'))
      .finally(() => setUploading(false));
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const title = uploadTitle.trim() || file.name.replace(/\.[^/.]+$/, '') || 'Brief';
    const dateStr = String(selectedDate).trim().slice(0, 10);
    setUploading(true);
    setError(null);
    setAddSuccess(null);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = typeof reader.result === 'string' ? reader.result.replace(/^data:[^;]+;base64,/, '') : '';
      Api.uploadTraderDeckBrief({
        date: dateStr,
        period,
        title,
        fileBase64: base64,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
      })
        .then(() => {
          setUploadTitle('');
          setAddSuccess(`Added for ${dateStr}`);
          setTimeout(() => setAddSuccess(null), 3000);
          return Api.getTraderDeckContent(type, dateStr);
        })
        .then((res) => setBriefs(Array.isArray(res.data?.briefs) ? res.data.briefs : []))
        .catch((err) => setError(err.response?.data?.message || 'Upload failed'))
        .finally(() => setUploading(false));
    };
    reader.readAsDataURL(file);
  };

  const handleDelete = (id) => {
    if (!window.confirm('Remove this brief?')) return;
    Api.deleteTraderDeckBrief(id)
      .then(() => setBriefs((prev) => prev.filter((b) => b.id !== id)))
      .catch((err) => setError(err.response?.data?.message || 'Delete failed'));
  };

  if (loading) {
    return (
      <div className="td-mi-loading td-mi-loading--page">
        <div className="td-mi-loading-pulse" aria-hidden />
        <p>Loading {period} briefs…</p>
      </div>
    );
  }

  const mainTitle = `Market Intelligence — ${period === 'weekly' ? 'Weekly' : 'Daily'} (${selectedDate})`;

  return (
    <>
      {error && <p className="td-mi-fallback-msg" role="status">{error}</p>}
      {addSuccess && <p className="td-mi-save-success" role="status">{addSuccess}</p>}
      <div className="td-deck-mi-modern">
        <header className="td-deck-mi-modern-hero">
          <div className="td-deck-mi-modern-hero-copy">
            <p className="td-deck-mo-eyebrow">Market intelligence</p>
            <h1 className="td-deck-mi-modern-title">{mainTitle}</h1>
            <p className="td-deck-mi-modern-sub">
              View briefs for the selected date. Preview only (no download). Upload PowerPoint or PDF, or add a view-only link.
            </p>
          </div>
          {briefs.length > 0 && (
            <div className="td-deck-mi-modern-stat" aria-hidden>
              <span className="td-deck-mi-modern-stat-value">{briefs.length}</span>
              <span className="td-deck-mi-modern-stat-label">brief{briefs.length !== 1 ? 's' : ''} this date</span>
            </div>
          )}
        </header>

        <div className="td-deck-mi-modern-grid">
          {canEdit && (
            <section className="td-deck-mi-tile td-deck-mi-tile--upload" aria-labelledby="intel-upload-heading">
              <h2 id="intel-upload-heading" className="td-deck-mi-tile-title">Add brief</h2>
              <p className="td-deck-mi-tile-hint">Title, file upload, or paste a view-only URL.</p>
              <div className="td-deck-mi-upload-stack">
                <input
                  type="text"
                  className="td-mi-edit-input td-deck-mi-input-full"
                  placeholder="Brief title"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pptx,.ppt,.pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/pdf"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
                <div className="td-deck-mi-upload-actions">
                  <button
                    type="button"
                    className="td-mi-btn td-mi-btn-edit"
                    onClick={handleUploadClick}
                    disabled={uploading}
                  >
                    <FaPlus aria-hidden /> {uploading ? 'Uploading…' : 'Upload file'}
                  </button>
                </div>
                <div className="td-deck-mi-url-row">
                  <input
                    type="url"
                    className="td-mi-edit-input td-deck-mi-input-grow"
                    placeholder="Or paste a view-only link"
                    value={uploadUrl}
                    onChange={(e) => setUploadUrl(e.target.value)}
                  />
                  <button
                    type="button"
                    className="td-mi-btn td-mi-btn-small"
                    onClick={handleAddByUrl}
                    disabled={uploading || !uploadUrl.trim()}
                  >
                    Add link
                  </button>
                </div>
              </div>
            </section>
          )}

          <section className="td-deck-mi-tile td-deck-mi-tile--list" aria-labelledby="intel-list-heading">
            <div className="td-deck-mi-tile-head">
              <h2 id="intel-list-heading" className="td-deck-mi-tile-title">Briefs</h2>
              <span className="td-deck-mi-tile-badge">{briefs.length}</span>
            </div>
            <ul className="td-deck-mi-brief-cards">
              {briefs.length === 0 ? (
                <li className="td-deck-mi-brief-empty">No briefs for this date. {canEdit && 'Use Add brief to upload or link one.'}</li>
              ) : (
                briefs.map((b) => (
                  <li key={b.id} className="td-deck-mi-brief-card">
                    <span className="td-deck-mi-brief-card-title">{b.title}</span>
                    <div className="td-deck-mi-brief-card-actions">
                      <button type="button" className="td-mi-btn td-mi-btn-small" onClick={() => handlePreview(b)} title="Preview">
                        <FaEye /> Preview
                      </button>
                      {canEdit && (
                        <button type="button" className="td-mi-btn td-mi-btn-remove" onClick={() => handleDelete(b.id)} title="Remove">
                          <FaTrash />
                        </button>
                      )}
                    </div>
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>
      </div>

      {previewId && (
        <div className="td-intel-preview-overlay" onClick={() => setPreviewId(null)}>
          <div className="td-intel-preview-box" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="td-intel-preview-close" onClick={() => setPreviewId(null)} aria-label="Close">
              <FaTimes />
            </button>
            <iframe
              title="Brief preview"
              src={previewUrl}
              className="td-intel-preview-iframe"
            />
          </div>
        </div>
      )}
    </>
  );
}
