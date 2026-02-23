import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { isAdmin } from '../utils/roles';
import AdminApi from '../services/AdminApi';
import CosmicBackground from '../components/CosmicBackground';
import '../styles/AdminJournal.css';

const AdminJournal = () => {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [users, setUsers] = useState([]);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewingProofTaskId, setViewingProofTaskId] = useState(null);
  const [proofImageUrl, setProofImageUrl] = useState(null);

  const fetchStats = useCallback(async () => {
    if (!user || !isAdmin(user)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await AdminApi.getJournalStats();
      setSummary(res.data?.summary ?? null);
      setUsers(Array.isArray(res.data?.users) ? res.data.users : []);
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || err.response?.data?.error;
      setError(status === 403
        ? (msg || 'You don’t have permission to view journal stats.')
        : (msg || 'Failed to load journal stats.'));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const openUserDetail = async (userId) => {
    try {
      const res = await AdminApi.getJournalStats(userId);
      setDetail(res.data);
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || err.response?.data?.error;
      setError(status === 403
        ? (msg || 'You don’t have permission to view this user.')
        : (msg || 'Failed to load user detail.'));
    }
  };

  const closeDetail = () => {
    setDetail(null);
    setViewingProofTaskId(null);
    setProofImageUrl(null);
  };

  const viewProof = async (taskId) => {
    if (viewingProofTaskId === taskId && proofImageUrl) return;
    setViewingProofTaskId(taskId);
    setProofImageUrl(null);
    try {
      const res = await AdminApi.getJournalProof(taskId);
      const url = res.data?.proofImage;
      if (url) setProofImageUrl(url);
    } catch {
      setProofImageUrl(null);
    }
  };

  if (!user || !isAdmin(user)) {
    return <h4 className="admin-journal-denied">Access Denied: Admins Only</h4>;
  }

  return (
    <div className="admin-journal-page">
      <CosmicBackground />
      <div className="admin-journal-container">
        <h2 className="admin-journal-title">Aura Journal – Admin</h2>
        <p className="admin-journal-sub">Track user progress: tasks, proof, and XP.</p>

        {loading ? (
          <p className="admin-journal-loading">Loading journal stats...</p>
        ) : error ? (
          <p className="admin-journal-error">{error}</p>
        ) : (
          <>
            {summary && (
              <div className="admin-journal-summary">
                <div className="admin-journal-card">
                  <span className="admin-journal-card-value">{summary.usersWithJournal}</span>
                  <span className="admin-journal-card-label">Users with journal</span>
                </div>
                <div className="admin-journal-card">
                  <span className="admin-journal-card-value">{summary.tasksLast7}</span>
                  <span className="admin-journal-card-label">Tasks (last 7 days)</span>
                </div>
                <div className="admin-journal-card">
                  <span className="admin-journal-card-value">{summary.tasksLast30}</span>
                  <span className="admin-journal-card-label">Tasks (last 30 days)</span>
                </div>
                <div className="admin-journal-card">
                  <span className="admin-journal-card-value">{summary.completedWithProofLast7}</span>
                  <span className="admin-journal-card-label">Completed with proof (7d)</span>
                </div>
                <div className="admin-journal-card">
                  <span className="admin-journal-card-value">{summary.completedWithProofLast30}</span>
                  <span className="admin-journal-card-label">Completed with proof (30d)</span>
                </div>
                <div className="admin-journal-card">
                  <span className="admin-journal-card-value">{summary.totalJournalXpAwarded}</span>
                  <span className="admin-journal-card-label">Total journal XP awarded</span>
                </div>
              </div>
            )}

            <h3 className="admin-journal-table-title">Per-user progress</h3>
            {users.length > 0 && (
              <div className="admin-journal-search-wrap">
                <input
                  type="text"
                  className="admin-journal-search"
                  placeholder="Search by email or username…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  aria-label="Search users"
                />
              </div>
            )}
            {users.length === 0 ? (
              <p className="admin-journal-empty">No journal activity yet.</p>
            ) : (() => {
              const q = (searchTerm || '').toLowerCase().trim();
              const filtered = q
                ? users.filter(
                    (u) =>
                      (u.email || '').toLowerCase().includes(q) ||
                      (u.username || '').toLowerCase().includes(q)
                  )
                : users;
              return filtered.length === 0 ? (
                <p className="admin-journal-empty">No users match your search.</p>
              ) : (
              <div className="admin-journal-table-wrap">
                <table className="admin-journal-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Level</th>
                      <th>Total XP</th>
                      <th>Tasks</th>
                      <th>Completed</th>
                      <th>With proof</th>
                      <th>Journal XP</th>
                      <th>Last task</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <span className="admin-journal-user-email">{u.email}</span>
                          {u.username && u.username !== u.email && (
                            <span className="admin-journal-username"> ({u.username})</span>
                          )}
                        </td>
                        <td>{u.level ?? 1}</td>
                        <td>{Number(u.xp ?? 0).toLocaleString()}</td>
                        <td>{u.tasksTotal ?? 0}</td>
                        <td>{u.tasksCompleted ?? 0}</td>
                        <td>{u.tasksWithProof ?? 0}</td>
                        <td>{Number(u.journalXpEarned ?? 0).toLocaleString()}</td>
                        <td>{u.lastTaskDate || '–'}</td>
                        <td>
                          <button
                            type="button"
                            className="admin-journal-view-btn"
                            onClick={() => openUserDetail(u.id)}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              );
            })()}
          </>
        )}

        {detail && (
          <div className="admin-journal-modal" role="dialog" aria-modal="true">
            <div className="admin-journal-modal-inner">
              <div className="admin-journal-modal-header">
                <h3>{detail.user?.email} – Journal detail</h3>
                <button type="button" className="admin-journal-modal-close" onClick={closeDetail} aria-label="Close">&#215;</button>
              </div>
              <div className="admin-journal-modal-body">
                <p>
                  <strong>Level:</strong> {detail.user?.level} | <strong>XP:</strong> {Number(detail.user?.xp ?? 0).toLocaleString()} | <strong>Notes saved:</strong> {detail.notesSaved ?? 0}
                </p>
                <h4>XP by type</h4>
                <ul className="admin-journal-xp-list">
                  {(detail.xpByType || []).map((x, i) => (
                    <li key={i}>{x.type}: +{x.xp} XP ({x.count}x)</li>
                  ))}
                  {(detail.xpByType || []).length === 0 && <li>No journal XP yet.</li>}
                </ul>
                <h4>Tasks by date (last 90 days)</h4>
                <div className="admin-journal-by-date">
                  {(detail.tasksByDate || []).slice(0, 30).map((d, i) => (
                    <div key={i} className="admin-journal-date-row">
                      <span>{d.date}</span>
                      <span>Tasks: {d.total}</span>
                      <span>Done: {d.completed}</span>
                      <span>With proof: {d.withProof}</span>
                    </div>
                  ))}
                  {(detail.tasksByDate || []).length === 0 && <p>No tasks.</p>}
                </div>
                <h4>Tasks with proof (user folder)</h4>
                {(detail.tasksWithProof && detail.tasksWithProof.length > 0) ? (
                  <ul className="admin-journal-proof-list">
                    {detail.tasksWithProof.map((t) => (
                      <li key={t.id} className="admin-journal-proof-item">
                        <span>{t.date}</span>
                        <span className="admin-journal-proof-title">{t.title}</span>
                        <button type="button" className="admin-journal-view-btn" onClick={() => viewProof(t.id)}>
                          View proof
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No tasks with proof.</p>
                )}
                {viewingProofTaskId && (
                  <div className="admin-journal-proof-viewer">
                    {proofImageUrl ? (
                      <img src={proofImageUrl} alt="Task proof" className="admin-journal-proof-img" loading="lazy" />
                    ) : (
                      <span>Loading…</span>
                    )}
                    <button type="button" className="admin-journal-view-btn" onClick={() => { setViewingProofTaskId(null); setProofImageUrl(null); }}>Close</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminJournal;
