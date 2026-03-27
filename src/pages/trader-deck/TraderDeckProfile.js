import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FaCog } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import { useEntitlements } from '../../context/EntitlementsContext';
import { formatMembershipLabel } from '../../utils/roles';
import Api from '../../services/Api';
import '../../styles/trader-deck/TraderDeckProfile.css';

const DEFAULT_BALANCE_KEY = 'trader-deck-default-balance';
const DEFAULT_RISK_KEY = 'trader-deck-default-risk-pct';

function formatPnL(n) {
  if (n == null || Number.isNaN(n)) return '$0.00';
  const v = Number(n);
  const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v >= 0 ? `$${abs}` : `-$${abs}`;
}

function computeProfileStats(trades = [], pnlData = {}) {
  const totalTrades = trades.length;
  const wins = trades.filter((t) => (t.result || '').toLowerCase() === 'win' || (Number(t.pnl) || 0) > 0).length;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const totalPnL = pnlData.totalPnL != null ? pnlData.totalPnL : trades.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
  const avgR = trades.length ? trades.reduce((s, t) => s + (Number(t.rMultiple) ?? Number(t.rr) ?? 0), 0) / trades.length : 0;
  const byPair = {};
  trades.forEach((t) => {
    const pair = t.pair || '—';
    if (!byPair[pair]) byPair[pair] = 0;
    byPair[pair] += Number(t.pnl) || 0;
  });
  const pairs = Object.entries(byPair).map(([pair, pnl]) => ({ pair, pnl })).sort((a, b) => b.pnl - a.pnl);
  const bestPair = pairs[0]?.pair ?? '—';
  const worstPair = pairs[pairs.length - 1]?.pair ?? '—';
  const consistency = totalTrades > 0 ? Math.round(Math.min(100, Math.max(0, 50 + (winRate - 50) * 0.4))) : 0;
  const bySession = {};
  trades.forEach((t) => {
    const session = t.session || 'Unknown';
    if (!bySession[session]) bySession[session] = { count: 0, pnl: 0 };
    bySession[session].count += 1;
    bySession[session].pnl += Number(t.pnl) || 0;
  });
  const preferredSession = Object.entries(bySession).sort((a, b) => b[1].count - a[1].count)[0]?.[0] ?? 'Unknown';
  return {
    totalTrades,
    winRate,
    averageR: avgR,
    totalPnL,
    bestPair,
    worstPair,
    consistency,
    preferredSession,
  };
}

export default function TraderDeckProfile() {
  const { user } = useAuth();
  const { entitlements, user: meUser } = useEntitlements();
  const [trades, setTrades] = useState([]);
  const [pnlData, setPnlData] = useState({});
  const [loading, setLoading] = useState(true);
  const [defaultBalance, setDefaultBalance] = useState(() => localStorage.getItem(DEFAULT_BALANCE_KEY) || '');
  const [defaultRisk, setDefaultRisk] = useState(() => localStorage.getItem(DEFAULT_RISK_KEY) || '');

  useEffect(() => {
    Promise.all([
      Api.getAuraAnalysisTrades().then((r) => (r.data?.trades ?? r.data?.data ?? [])),
      Api.getAuraAnalysisPnl().then((r) => ({
        totalPnL: r.data?.totalPnL ?? r.data?.monthlyPnl ?? 0,
      })),
    ])
      .then(([t, p]) => {
        setTrades(Array.isArray(t) ? t : []);
        setPnlData(typeof p === 'object' ? p : {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => computeProfileStats(trades, pnlData), [trades, pnlData]);

  const displayName = (user?.name && user.name.trim()) || (user?.username && user.username.trim()) || '—';
  const displayEmail = (user?.email && user.email.trim()) || '—';
  const displayRole = formatMembershipLabel(
    meUser?.role ?? user?.role,
    entitlements?.effectiveTier ?? entitlements?.tier
  );
  const displayBalance = defaultBalance.trim() || '—';
  const displayRisk = defaultRisk.trim() ? `${defaultRisk}%` : '—';

  return (
    <div className="td-profile">
      <h2 className="td-profile-title">Profile</h2>

      <div className="td-profile-grid">
        <section className="td-profile-account-card">
          <div className="td-profile-account-header">
            <div>
              <h3 className="td-profile-account-title">Account</h3>
              <p className="td-profile-account-sub">Your profile and defaults</p>
            </div>
            <Link to="/profile" className="td-profile-settings-icon" aria-label="Account settings">
              <FaCog />
            </Link>
          </div>
          <dl className="td-profile-account-fields">
            <div className="td-profile-field">
              <dt>Name</dt>
              <dd>{displayName}</dd>
            </div>
            <div className="td-profile-field">
              <dt>Email</dt>
              <dd>{displayEmail}</dd>
            </div>
            <div className="td-profile-field">
              <dt>Role</dt>
              <dd>{displayRole}</dd>
            </div>
            <div className="td-profile-field">
              <dt>Default balance</dt>
              <dd>{displayBalance}</dd>
            </div>
            <div className="td-profile-field">
              <dt>Default risk %</dt>
              <dd>{displayRisk}</dd>
            </div>
          </dl>
        </section>

        <div className="td-profile-stats-wrap">
          <div className="td-profile-stats-grid">
            <div className="td-profile-stat-card">
              <span className="td-profile-stat-label">Total trades</span>
              <span className="td-profile-stat-value">{loading ? '—' : stats.totalTrades}</span>
            </div>
            <div className="td-profile-stat-card">
              <span className="td-profile-stat-label">Win rate</span>
              <span className="td-profile-stat-value td-profile-stat-positive">
                {loading ? '—' : `${stats.winRate.toFixed(2)}%`}
              </span>
            </div>
            <div className="td-profile-stat-card">
              <span className="td-profile-stat-label">Average R</span>
              <span className="td-profile-stat-value">{loading ? '—' : stats.averageR.toFixed(2)}</span>
            </div>
            <div className="td-profile-stat-card">
              <span className="td-profile-stat-label">Total PnL</span>
              <span className={`td-profile-stat-value ${stats.totalPnL >= 0 ? 'td-profile-stat-positive' : 'td-profile-stat-negative'}`}>
                {loading ? '—' : formatPnL(stats.totalPnL)}
              </span>
            </div>
            <div className="td-profile-stat-card">
              <span className="td-profile-stat-label">Best pair</span>
              <span className="td-profile-stat-value">{loading ? '—' : stats.bestPair}</span>
            </div>
            <div className="td-profile-stat-card">
              <span className="td-profile-stat-label">Worst pair</span>
              <span className="td-profile-stat-value">{loading ? '—' : stats.worstPair}</span>
            </div>
            <div className="td-profile-stat-card">
              <span className="td-profile-stat-label">Consistency score</span>
              <span className="td-profile-stat-value">{loading ? '—' : stats.consistency}</span>
            </div>
            <div className="td-profile-stat-card">
              <span className="td-profile-stat-label">Preferred session</span>
              <span className="td-profile-stat-value">{loading ? '—' : stats.preferredSession}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
