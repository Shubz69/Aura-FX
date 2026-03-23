import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const BASE_URL = process.env.REACT_APP_API_URL || '';

/**
 * MT5 CSV upload for manual metrics. On success, navigates to the manual metrics dashboard.
 */
export default function CsvUploadSection({
  token,
  year,
  month,
  csvStatus,
  onUploaded,
}) {
  const navigate = useNavigate();
  const dashboardHref = `/reports/manual-metrics/dashboard?year=${year}&month=${month}`;
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef();

  const handleFile = (file) => {
    if (!file) return;
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      setError('Please upload a .csv file exported from MT5.');
      return;
    }
    if (file.size > 5_000_000) {
      setError('File too large (max 5MB).');
      return;
    }
    setError('');
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => setCsv(e.target?.result || '');
    reader.onerror = () => setError('Could not read this file. Try another export or re-save the CSV.');
    reader.readAsText(file);
  };

  const handleSubmit = async () => {
    if (!csv) return;
    setUploading(true);
    setError('');
    try {
      const res = await fetch(`${BASE_URL}/api/reports/csv-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ csv, year, month }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.message || `Upload failed (${res.status})`);
      }
      onUploaded?.();
      navigate(dashboardHref);
    } catch (err) {
      setError(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    setError('');
    setRemoving(true);
    try {
      const res = await fetch(`${BASE_URL}/api/reports/csv-upload`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ year, month }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.message || `Could not remove CSV (${res.status})`);
      }
      setCsv('');
      setFileName('');
      onUploaded?.();
    } catch (err) {
      setError(err.message || 'Could not remove CSV.');
    } finally {
      setRemoving(false);
    }
  };

  if (csvStatus) {
    return (
      <div className="rp-csv-done" aria-live="polite">
        <span className="rp-csv-done-icon">✓</span>
        <div className="rp-csv-done-body">
          <p className="rp-csv-done-title">MT5 CSV uploaded — {csvStatus.trade_count} trades</p>
          <p className="rp-csv-done-hint">Your MT5 data will be included in the report and manual metrics.</p>
        </div>
        <div className="rp-csv-done-actions">
          <Link to={dashboardHref} className="rp-btn rp-btn--primary rp-btn--sm">
            Open dashboard
          </Link>
          <button
            className="rp-btn rp-btn--ghost"
            onClick={handleRemove}
            disabled={removing}
            type="button"
            aria-busy={removing}
            aria-label="Remove uploaded MT5 CSV for this month"
          >
            {removing ? 'Removing…' : 'Remove'}
          </button>
        </div>
        {error && <p className="rp-field-error" role="alert">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rp-csv-section">
      <h4 className="rp-csv-title">MT5 trade history CSV</h4>
      <p className="rp-csv-hint">
        Export from MT5: History → All History → Save as Report (CSV). Comma or semicolon exports are supported.
        Report files that include a title block above the table (e.g. ReportHistory-*.csv) are supported — use CSV, not Excel.
      </p>

      {!csv ? (
        <div
          className="rp-csv-drop"
          onClick={() => fileRef.current?.click()}
          onDrop={(e) => {
            e.preventDefault();
            handleFile(e.dataTransfer.files?.[0]);
          }}
          onDragOver={(e) => e.preventDefault()}
          role="button"
          tabIndex={0}
          aria-label="Upload MT5 trade history CSV file"
          aria-busy={uploading}
          onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
        >
          <span className="rp-csv-drop-icon">📁</span>
          <span>Drop your MT5 CSV here or <u>browse</u></span>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => handleFile(e.target.files?.[0])}
            style={{ display: 'none' }}
            aria-hidden
          />
        </div>
      ) : (
        <div className="rp-csv-ready">
          <span className="rp-csv-file-name">📄 {fileName}</span>
          <button
            className="rp-btn rp-btn--primary rp-btn--sm"
            onClick={handleSubmit}
            disabled={uploading}
            type="button"
            aria-busy={uploading}
            aria-label={uploading ? 'Saving and opening metrics' : 'Show metrics from MT5 CSV'}
          >
            {uploading ? 'Opening…' : 'Show metrics'}
          </button>
          <button
            className="rp-btn rp-btn--ghost"
            onClick={() => {
              setCsv('');
              setFileName('');
              setError('');
            }}
            type="button"
            aria-label="Clear selected file"
          >
            ✕
          </button>
        </div>
      )}
      {error && <p className="rp-field-error" role="alert">{error}</p>}
    </div>
  );
}
