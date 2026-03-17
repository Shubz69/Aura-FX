import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { FaUsers, FaCopy, FaCheck, FaTrophy, FaGift, FaChartLine, FaLink } from 'react-icons/fa';
import CosmicBackground from '../components/CosmicBackground';
import Api from '../services/Api';
import '../styles/Affiliation.css';

const TIERS = [
  { referrals: 1,  reward: '1 Week Free Premium',    icon: '🥉', color: '#cd7f32' },
  { referrals: 3,  reward: '1 Month Free Premium',   icon: '🥈', color: '#9ca3af' },
  { referrals: 5,  reward: '3 Months Free Elite',    icon: '🥇', color: '#f59e0b' },
  { referrals: 10, reward: 'Lifetime Elite Access',  icon: '💎', color: '#8b5cf6' },
];

const HOW_IT_WORKS = [
  { step: '01', title: 'Get Your Link', desc: 'Copy your unique referral link from the dashboard below.', icon: <FaLink /> },
  { step: '02', title: 'Share It', desc: 'Share with traders, friends, or on social media.', icon: <FaUsers /> },
  { step: '03', title: 'They Sign Up', desc: 'When someone registers using your link, they\'re tracked as your referral.', icon: <FaChartLine /> },
  { step: '04', title: 'You Get Rewarded', desc: 'Hit a tier milestone and receive your reward automatically.', icon: <FaGift /> },
];

export default function Affiliation() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ referrals: 0, pending: 0, earned: 0 });
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
      if (res?.data) setStats(res.data);
    } catch (_) {
      // stats stay at defaults
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    fetchStats();
  }, [user, navigate, fetchStats]);

  const copyLink = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      const el = document.createElement('textarea');
      el.value = referralLink;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const nextTier = TIERS.find(t => t.referrals > stats.referrals);
  const progressPct = nextTier
    ? Math.min(100, (stats.referrals / nextTier.referrals) * 100)
    : 100;

  return (
    <div className="affiliation-page">
      <CosmicBackground />

      <div className="affiliation-content">

        {/* ── HERO ── */}
        <div className="affiliation-hero">
          <div className="affiliation-hero__eyebrow">
            <FaUsers />
            <span>Referral Programme</span>
          </div>
          <h1 className="affiliation-hero__title">Refer &amp; Earn</h1>
          <p className="affiliation-hero__sub">
            Share AURA TERMINAL with fellow traders. Every referral gets you closer to free premium access.
          </p>
        </div>

        {/* ── STATS ROW ── */}
        <div className="affiliation-stats">
          {[
            { label: 'Total Referrals', value: loading ? '—' : stats.referrals, icon: <FaUsers />, color: '#8b5cf6' },
            { label: 'Pending Signups', value: loading ? '—' : stats.pending, icon: <FaChartLine />, color: '#3b82f6' },
            { label: 'Rewards Earned', value: loading ? '—' : stats.earned, icon: <FaTrophy />, color: '#f59e0b' },
          ].map((s, i) => (
            <div key={i} className="affiliation-stat-card">
              <span className="affiliation-stat-card__icon" style={{ color: s.color }}>{s.icon}</span>
              <div className="affiliation-stat-card__value">{s.value}</div>
              <div className="affiliation-stat-card__label">{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── REFERRAL LINK BOX ── */}
        <div className="affiliation-link-box">
          <div className="affiliation-link-box__label">Your Referral Link</div>
          <div className="affiliation-link-box__row">
            <span className="affiliation-link-box__url">{referralLink || 'Log in to see your link'}</span>
            <button
              className={`affiliation-link-box__copy ${copied ? 'copied' : ''}`}
              onClick={copyLink}
              disabled={!referralLink}
            >
              {copied ? <><FaCheck /> Copied!</> : <><FaCopy /> Copy</>}
            </button>
          </div>
          <div className="affiliation-link-box__code">Your code: <strong>{referralCode || '—'}</strong></div>
        </div>

        {/* ── PROGRESS ── */}
        {nextTier && (
          <div className="affiliation-progress-box">
            <div className="affiliation-progress-box__header">
              <span>Progress to next reward</span>
              <span className="affiliation-progress-box__target">{stats.referrals} / {nextTier.referrals} referrals — {nextTier.icon} {nextTier.reward}</span>
            </div>
            <div className="affiliation-progress-bar">
              <div className="affiliation-progress-bar__fill" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        )}

        {/* ── REWARD TIERS ── */}
        <div className="affiliation-tiers">
          <h2 className="affiliation-section-title"><FaTrophy /> Reward Tiers</h2>
          <div className="affiliation-tiers__grid">
            {TIERS.map((tier, i) => {
              const achieved = stats.referrals >= tier.referrals;
              return (
                <div
                  key={i}
                  className={`affiliation-tier-card ${achieved ? 'achieved' : ''}`}
                  style={{ '--tier-color': tier.color }}
                >
                  <div className="affiliation-tier-card__icon">{tier.icon}</div>
                  <div className="affiliation-tier-card__referrals">
                    {tier.referrals} {tier.referrals === 1 ? 'Referral' : 'Referrals'}
                  </div>
                  <div className="affiliation-tier-card__reward">{tier.reward}</div>
                  {achieved && <div className="affiliation-tier-card__achieved">✓ Achieved</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── HOW IT WORKS ── */}
        <div className="affiliation-how">
          <h2 className="affiliation-section-title">How It Works</h2>
          <div className="affiliation-how__grid">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={i} className="affiliation-how__card">
                <div className="affiliation-how__step">{step.step}</div>
                <div className="affiliation-how__icon">{step.icon}</div>
                <h3 className="affiliation-how__title">{step.title}</h3>
                <p className="affiliation-how__desc">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── TERMS ── */}
        <div className="affiliation-terms">
          <h3>Terms &amp; Conditions</h3>
          <ul>
            <li>Referrals must sign up using your unique link to be tracked.</li>
            <li>Self-referrals or duplicate accounts are not permitted.</li>
            <li>Rewards are applied manually within 48 hours of milestone verification.</li>
            <li>AURA TERMINAL reserves the right to modify reward tiers at any time.</li>
            <li>Abuse of the referral system may result in account suspension.</li>
          </ul>
        </div>

      </div>
    </div>
  );
}
