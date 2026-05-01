import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BacktestingEmptyState } from '../../components/backtesting/BacktestingSharedUi';
import Api from '../../services/Api';
import { toast } from 'react-toastify';

export default function BacktestingSessions() {
  const [sessions, setSessions] = useState([]);
  const [status, setStatus] = useState('');
  const [storage, setStorage] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (status) params.status = status;
      if (storage === 'persisted') params.storage = 'persisted';
      else if (storage === 'ephemeral') params.storage = 'ephemeral';
      const res = await Api.getBacktestingSessions(params);
      if (res.data?.success) setSessions(res.data.sessions || []);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [status, storage]);

  const dup = async (id) => {
    try {
      const res = await Api.duplicateBacktestingSession(id);
      if (res.data?.success) {
        toast.success('Duplicated');
        load();
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Duplicate failed');
    }
  };

  const arch = async (id) => {
    try {
      await Api.archiveBacktestingSession(id);
      toast.success('Archived');
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed');
    }
  };

  const del = async (id) => {
    if (!window.confirm('Delete this session and its trades?')) return;
    try {
      await Api.deleteBacktestingSession(id);
      toast.success('Deleted');
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed');
    }
  };

  const resumeSession = async (id) => {
    try {
      await Api.resumeBacktestingSession(id);
      toast.success('Session resumed');
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Resume failed');
    }
  };

  return (
    <>
      <header className="bt-page-header">
        <div>
          <h1 className="bt-title">Session manager</h1>
          <p className="bt-subtitle">
            Filter by library: <strong>Saved</strong> never auto-expires; <strong>Active 24h</strong> replay sessions expire unless you save them from the workspace.
          </p>
        </div>
        <Link to="/backtesting/new" className="bt-btn bt-btn--primary">
          New Session
        </Link>
      </header>

      <div className="bt-panel" style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <label className="bt-label">Library</label>
          <select className="bt-select" style={{ maxWidth: 240 }} value={storage} onChange={(e) => setStorage(e.target.value)}>
            <option value="">All</option>
            <option value="persisted">Saved (library)</option>
            <option value="ephemeral">Active 24h (unsaved replay)</option>
          </select>
        </div>
        <div>
          <label className="bt-label">Status</label>
          <select className="bt-select" style={{ maxWidth: 220 }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      {loading ? (
        <p className="bt-muted">Loading…</p>
      ) : sessions.length === 0 ? (
        <BacktestingEmptyState
          title="No sessions match this filter"
          hint="Create a new session from the wizard or clear the status filter to see all sessions."
        />
      ) : (
        <div className="bt-table-wrap bt-sessions-table-wrap">
          <table className="bt-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Saved</th>
                <th>Expires</th>
                <th>Playbook</th>
                <th>Instruments</th>
                <th>Range</th>
                <th>Status</th>
                <th>Trades</th>
                <th>Win%</th>
                <th>PF</th>
                <th>Net</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td>{s.sessionName || '—'}</td>
                  <td>{s.ephemeralExpiresAt ? <span className="aa-pill aa-pill--dim">Active</span> : <span className="aa-pill">Saved</span>}</td>
                  <td>{s.ephemeralExpiresAt ? new Date(s.ephemeralExpiresAt).toLocaleString() : '—'}</td>
                  <td>{s.playbookName || '—'}</td>
                  <td>{(s.instruments || []).length ? (s.instruments || []).join(', ') : '—'}</td>
                  <td>
                    {s.dateStart || '—'} → {s.dateEnd || '—'}
                  </td>
                  <td>{s.status}</td>
                  <td>{s.totalTrades ?? '—'}</td>
                  <td>{s.winRate != null ? `${(s.winRate * 100).toFixed(0)}%` : '—'}</td>
                  <td>{s.profitFactor != null ? Number(s.profitFactor).toFixed(2) : '—'}</td>
                  <td>{s.netPnl != null ? Number(s.netPnl).toFixed(2) : '—'}</td>
                  <td>
                    <div className="bt-actions bt-sessions-actions">
                      <Link className="bt-btn bt-btn--ghost" style={{ padding: '6px 10px', fontSize: '0.65rem' }} to={`/backtesting/session/${s.id}`}>
                        Open
                      </Link>
                      {s.status === 'draft' && (
                        <Link className="bt-btn bt-btn--ghost" style={{ padding: '6px 10px', fontSize: '0.65rem' }} to={`/backtesting/new?draft=${s.id}`}>
                          Continue draft
                        </Link>
                      )}
                      {s.status === 'paused' && (
                        <button type="button" className="bt-btn bt-btn--ghost" style={{ padding: '6px 10px', fontSize: '0.65rem' }} onClick={() => resumeSession(s.id)}>
                          Resume
                        </button>
                      )}
                      <button type="button" className="bt-btn bt-btn--ghost" style={{ padding: '6px 10px', fontSize: '0.65rem' }} onClick={() => dup(s.id)}>
                        Dup
                      </button>
                      <button type="button" className="bt-btn bt-btn--ghost" style={{ padding: '6px 10px', fontSize: '0.65rem' }} onClick={() => arch(s.id)}>
                        Archive
                      </button>
                      <button type="button" className="bt-btn bt-btn--danger" style={{ padding: '6px 10px', fontSize: '0.65rem' }} onClick={() => del(s.id)}>
                        Del
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
