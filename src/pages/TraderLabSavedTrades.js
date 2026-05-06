import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { FaTimes } from 'react-icons/fa';
import TraderSuiteShell from '../components/TraderSuiteShell';
import TraderLabShellNav from '../components/trader-deck/TraderLabShellNav';
import { useAuth } from '../context/AuthContext';
import Api from '../services/Api';
import { formatWelcomeEyebrow, getUserFirstName } from '../utils/welcomeUser';
import '../styles/trader-deck/TraderLabLayout.css';

function displaySymbolFromChartSymbol(chartSymbol) {
  const raw = String(chartSymbol || '');
  if (!raw) return '—';
  const token = raw.includes(':') ? raw.split(':')[1] : raw;
  return token || raw;
}

export default function TraderLabSavedTrades() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  const welcomeEyebrow = formatWelcomeEyebrow(user, getUserFirstName(user));

  useEffect(() => {
    let cancelled = false;
    Api.getTraderLabSessions()
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res?.data?.sessions) ? res.data.sessions : [];
        setSessions(list);
      })
      .catch(() => {
        if (!cancelled) toast.error('Could not load saved labs.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(
    () =>
      [...sessions].sort((a, b) =>
        String(b.sessionDate || '').localeCompare(String(a.sessionDate || '')),
      ),
    [sessions],
  );

  const openLab = (id) => {
    navigate(`/trader-deck/trade-validator/trader-lab?session=${encodeURIComponent(String(id))}`);
  };

  const remove = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Remove this saved lab?')) return;
    try {
      await Api.deleteTraderLabSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      toast.success('Removed.');
    } catch {
      toast.error('Could not remove lab.');
    }
  };

  return (
    <TraderSuiteShell
      variant="terminal"
      eyebrow={welcomeEyebrow}
      terminalSubtitle={t('traderLab.terminalSubtitle')}
      terminalTitlePrefix={null}
      title="Saved trades"
      terminalCenter={<TraderLabShellNav />}
      description={null}
      stats={[]}
      primaryAction={
        <Link to="/trader-deck/trade-validator/trader-lab" className="trader-suite-btn trader-suite-btn--primary">
          Back to Trader Lab
        </Link>
      }
    >
      <div className="tlab-saved-page trader-lab-v2 trader-lab-v2--gold" style={{ padding: '16px 20px 40px', maxWidth: 960, margin: '0 auto' }}>
        <h2 className="tlab-saved-page__title" style={{ margin: '0 0 12px', color: 'rgba(248,195,125,0.95)' }}>
          All saved labs
        </h2>
        <p style={{ color: 'rgba(200,210,230,0.7)', fontSize: 13, marginBottom: 18 }}>
          Open a row to continue in Trader Lab. The left rail on the lab shows your three most recent sessions.
        </p>
        {loading ? <p style={{ color: 'rgba(200,210,230,0.75)' }}>Loading…</p> : null}
        {!loading && !rows.length ? (
          <p style={{ color: 'rgba(200,210,230,0.75)' }}>No saved labs yet.</p>
        ) : null}
        {!loading && rows.length > 0 ? (
          <div className="tlab-saved-list" role="list">
            {rows.map((session) => (
              <div key={session.id} className="tlab-saved-row" style={{ marginBottom: 8 }}>
                <button type="button" className="tlab-saved-item" onClick={() => openLab(session.id)}>
                  <span className="tlab-saved-item__date">{session.sessionDate || '—'}</span>
                  <span className="tlab-saved-item__setup">{session.setupName || 'Untitled lab'}</span>
                  <span className="tlab-saved-item__symbol">{displaySymbolFromChartSymbol(session.chartSymbol)}</span>
                </button>
                <button
                  type="button"
                  className="tlab-saved-remove"
                  aria-label="Remove"
                  onClick={(e) => remove(session.id, e)}
                >
                  <FaTimes />
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </TraderSuiteShell>
  );
}
