import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { FaUsers, FaCopy, FaCheck, FaTrophy, FaTwitter, FaWhatsapp } from 'react-icons/fa';
import CosmicBackground from '../components/CosmicBackground';
import Api from '../services/Api';
import '../styles/Affiliation.css';

const TIERS = [
  { referrals: 5,    reward: '1 Week Free Premium',   icon: '🥉', color: '#cd7f32', label: '5 Premium' },
  { referrals: 10,   reward: '1 Month Free Premium',  icon: '�', color: '#f59e0b', label: '20 Referrals' },
  { referrals: 25,   reward: '3 Months Free Elite',   icon: '⭐', color: '#f59e0b', label: '35 Wars Referrals' },
  { referrals: 1000, reward: 'Lifetime Elite Access', icon: '💎', color: '#8b5cf6', label: '6,000 Elite Referrals' },
];

/* ── SVG circular progress dial ── */
function ProgressDial({ pct }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(100, pct) / 100) * circ;
  return (
    <svg viewBox="0 0 120 120" className="aff-dial-svg" aria-label={`${Math.round(pct)}% progress`}>
      {/* track */}
      <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="9" />
      {/* fill — gradient via linearGradient */}
      <defs>
        <linearGradient id="dialGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <circle
        cx="60" cy="60" r={r}
        fill="none"
        stroke="url(#dialGrad)"
        strokeWidth="9"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 60 60)"
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
      <text x="60" y="55" textAnchor="middle" fill="#fff" fontSize="20" fontWeight="800" fontFamily="inherit">
        {Math.round(pct)}%
      </text>
      <text x="60" y="71" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="9" fontFamily="inherit">
        Progress
      </text>
    </svg>
  );
}

export default function Affiliation() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ referrals: 0, active: 0, earned: 0 });
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const referralCode = user?.id ? `AT-${String(user.id).padStart(6, '0')}` : null;
  const referralLink = referralCode
    ? `${window.location.origin}/register?ref=${referralCode}`
    : null;

  const fetchStats = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await Api.getReferralStats?.();
      const d = res?.data;
      if (d && typeof d === 'object') {
        setStats({
          referrals: Number(d.referrals) || 0,
          active: Number(d.active) || 0,
          earned: Number(d.earned) || 0,
        });
      }
    } catch (_) {}
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    fetchStats();
  }, [user, navigate, fetchStats]);

  const copyLink = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
    } catch {
      const el = document.createElement('textarea');
      el.value = referralLink;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const shareTwitter = () => {
    if (!referralLink) return;
    window.open(`https://twitter.com/intent/tweet?text=Join%20me%20on%20AURA%20TERMINAL%20%E2%80%94%20the%20ultimate%20trading%20platform.%20Use%20my%20link%3A%20${encodeURIComponent(referralLink)}`, '_blank');
  };
  const shareWhatsApp = () => {
    if (!referralLink) return;
    window.open(`https://wa.me/?text=Join%20me%20on%20AURA%20TERMINAL%3A%20${encodeURIComponent(referralLink)}`, '_blank');
  };

  const nextTier = TIERS.find(t => t.referrals > stats.referrals);
  const progressPct = nextTier
    ? Math.min(100, (stats.referrals / nextTier.referrals) * 100)
    : 100;

  const statCards = [
    { label: 'TOTAL REFERRALS',  value: loading ? '—' : stats.referrals, icon: '👥' },
    { label: 'ACTIVE REFERRALS', value: loading ? '—' : (stats.active ?? 0), icon: '📈' },
    { label: 'REWARDS EARNED',   value: loading ? '—' : (stats.earned ?? 0),  icon: '🏆' },
  ];

  return (
    <div className="aff-page">
      <CosmicBackground />

      <div className="aff-content">

        {/* ── HERO ── */}
        <div className="aff-hero">
          <div className="aff-hero__eyebrow">✦ REFERRAL PROGRAMME</div>
          <h1 className="aff-hero__title">Refer &amp; Earn</h1>
          <p className="aff-hero__sub">
            Share AURA FX with fellow traders. Every referral gets you closer to<br />
            free premium access.
          </p>
        </div>

        {/* ── MAIN DASHBOARD (2-col) ── */}
        <div className="aff-dashboard">

          {/* LEFT — stats + link */}
          <div className="aff-dashboard__left">

            {/* Stat cards */}
            <div className="aff-stats">
              {statCards.map((s, i) => (
                <div key={i} className="aff-stat">
                  <span className="aff-stat__icon">{s.icon}</span>
                  <div className="aff-stat__value">{s.value}</div>
                  <div className="aff-stat__label">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Referral link box */}
            <div className="aff-link-box">
              <div className="aff-link-box__label">REFERRAL LINK</div>
              <div className="aff-link-box__row">
                <span className="aff-link-box__url">{referralLink || 'Log in to view your link'}</span>
                <div className="aff-link-box__actions">
                  <button className="aff-share-btn aff-share-btn--tw" onClick={shareTwitter} title="Share on X / Twitter" type="button">
                    <FaTwitter />
                  </button>
                  <button className="aff-share-btn aff-share-btn--wa" onClick={shareWhatsApp} title="Share on WhatsApp" type="button">
                    <FaWhatsapp />
                  </button>
                  <button
                    className={`aff-copy-btn ${copied ? 'copied' : ''}`}
                    onClick={copyLink}
                    disabled={!referralLink}
                    type="button"
                  >
                    {copied ? <><FaCheck /> Copied!</> : <><FaCopy /> Copy</>}
                  </button>
                </div>
              </div>
              <div className="aff-link-box__code">Your code: <strong>{referralCode || '—'}</strong></div>
              {nextTier && (
                <div className="aff-link-progress">
                  <div className="aff-link-progress__bar" style={{ width: `${progressPct}%` }} />
                  <span className="aff-link-progress__label">
                    {Math.round(progressPct)}% of signups become referrals
                  </span>
                </div>
              )}
            </div>

          </div>

          {/* RIGHT — progress dial */}
          <div className="aff-dashboard__right">
            <div className="aff-progress-panel">
              <ProgressDial pct={progressPct} />
              <div className="aff-progress-panel__bar-wrap">
                <div className="aff-progress-panel__bar">
                  <div className="aff-progress-panel__fill" style={{ width: `${progressPct}%` }} />
                </div>
              </div>
              {nextTier && (
                <p className="aff-progress-panel__label">
                  {stats.referrals} / {nextTier.referrals} — {nextTier.reward}
                </p>
              )}
              <button
                className={`aff-copy-btn aff-copy-btn--sm ${copied ? 'copied' : ''}`}
                onClick={copyLink}
                disabled={!referralLink}
                type="button"
              >
                {copied ? <FaCheck /> : <FaCopy />} Copy
              </button>
            </div>
          </div>

        </div>

        {/* ── TIER PROGRESSION BAR ── */}
        <div className="aff-tier-bar-section">
          <div className="aff-tier-bar-header">
            <span className="aff-tier-bar-name">Aura Core</span>
            <span className="aff-tier-bar-cta">Earn more tiers →</span>
          </div>
          <div className="aff-tier-track">
            <div className="aff-tier-track__line" />
            {TIERS.map((tier, i) => {
              const achieved = stats.referrals >= tier.referrals;
              const isNext = nextTier?.referrals === tier.referrals;
              return (
                <div key={i} className={`aff-tier-node ${achieved ? 'achieved' : ''} ${isNext ? 'next' : ''}`}>
                  <div className="aff-tier-node__dot">
                    <span className="aff-tier-node__icon">{tier.icon}</span>
                  </div>
                  <div className="aff-tier-node__label">
                    <span className="aff-tier-node__count">{tier.referrals.toLocaleString()} Referrals</span>
                    <span className="aff-tier-node__reward">{tier.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── HOW IT WORKS ── */}
        <div className="aff-how">
          <h2 className="aff-section-title"><FaTrophy /> How It Works</h2>
          <div className="aff-how__grid">
            {TIERS.map((tier, i) => {
              const achieved = stats.referrals >= tier.referrals;
              return (
                <div key={i} className={`aff-how__card ${achieved ? 'aff-how__card--achieved' : ''}`} style={{ '--tc': tier.color }}>
                  <div className="aff-how__icon">{tier.icon}</div>
                  <div className="aff-how__ref-count">
                    {tier.referrals.toLocaleString()} {tier.referrals === 1 ? 'REFERRAL' : 'REFERRALS'}
                    {tier.referrals === 1000 && ' ELITE'}
                  </div>
                  <div className="aff-how__reward">{tier.reward}</div>
                  {achieved && <div className="aff-how__achieved">✓ Achieved</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── TERMS ── */}
        <div className="aff-terms">
          <h3 className="aff-terms__title">TERMS &amp; CONDITIONS</h3>
          <ul className="aff-terms__list">
            <li>Referrals must use your unique link to be tracked.</li>
            <li>Self-referrals or duplicate accounts are not permitted.</li>
            <li>Rewards are applied within 48 hours of milestone verification.</li>
            <li>AURA TERMINAL reserves the right to modify reward tiers at any time.</li>
            <li>Abuse of the referral system may result in account suspension.</li>
          </ul>
        </div>

      </div>
    </div>
  );
}
