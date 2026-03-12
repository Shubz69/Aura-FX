/**
 * Market Intelligence briefs for Trader Deck – date-scoped Daily or Weekly.
 * List of briefs (PowerPoints); preview only (no download). Admin: upload, delete.
 */
import React, { useState, useEffect, useRef } from 'react';
import Api from '../../services/Api';
import TraderDeckDashboardShell from '../../components/trader-deck/TraderDeckDashboardShell';
import { FaEye, FaTrash, FaPlus, FaTimes } from 'react-icons/fa';

const MAX_FILE_MB = 4;

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
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`File too large (max ${MAX_FILE_MB}MB). Use a smaller file or add an external link.`);
      return;
    }
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

  return (
    <>
      {error && <p className="td-mi-fallback-msg" role="status">{error}</p>}
      {addSuccess && <p className="td-mi-save-success" role="status">{addSuccess}</p>}
      <TraderDeckDashboardShell
        title={`Market Intelligence — ${period === 'weekly' ? 'Weekly' : 'Daily'} (${selectedDate})`}
        canEdit={false}
      >
        <div className="td-intel-briefs-panel">
          <p className="td-mi-source td-mi-source--readonly">
            View briefs for the selected date. Preview only (no download).
          </p>
          {canEdit && (
            <>
              <div className="td-intel-upload-row">
                <input
                  type="text"
                  className="td-mi-edit-input td-intel-upload-title"
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
                <button
                  type="button"
                  className="td-mi-btn td-mi-btn-edit"
                  onClick={handleUploadClick}
                  disabled={uploading}
                >
                  <FaPlus /> {uploading ? 'Uploading…' : 'Add brief (max 4MB)'}
                </button>
              </div>
              <div className="td-intel-upload-row td-intel-upload-row--url">
                <input
                  type="url"
                  className="td-mi-edit-input td-intel-upload-url"
                  placeholder="Or paste a view-only link (optional)"
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
            </>
          )}
          <ul className="td-intel-briefs-list">
            {briefs.length === 0 ? (
              <li className="td-intel-brief-empty">No briefs for this date. {canEdit && 'Add one above.'}</li>
            ) : (
              briefs.map((b) => (
                <li key={b.id} className="td-intel-brief-item">
                  <span className="td-intel-brief-title">{b.title}</span>
                  <div className="td-intel-brief-actions">
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
        </div>
      </TraderDeckDashboardShell>

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
