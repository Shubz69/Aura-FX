import React, { useEffect, useState, useCallback, useId, useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  FaCopy,
  FaCheck,
  FaTrophy,
  FaTwitter,
  FaWhatsapp,
  FaEnvelope,
  FaLinkedin,
  FaRocket,
  FaUserPlus,
  FaGift,
  FaSyncAlt,
  FaLightbulb,
  FaChevronDown,
} from 'react-icons/fa';
import AuraTerminalThemeShell from '../components/AuraTerminalThemeShell';
import Api from '../services/Api';
import '../styles/Affiliation.css';

/** Milestones — consistent labels & rewards (display only; backend may differ) */
const TIERS = [
  { referrals: 5, reward: '1 week free Premium', icon: '🥉', color: '#cd7f32', label: 'Bronze' },
  { referrals: 10, reward: '1 month free Premium', icon: '🥈', color: '#94a3b8', label: 'Silver' },
  { referrals: 25, reward: '3 months Elite access', icon: '🥇', color: '#eaa960', label: 'Gold' },
  { referrals: 100, reward: 'Lifetime Elite access', icon: '💎', color: '#f8c37d', label: 'Elite' },
];

const FAQ_ITEMS = [
  {
    q: 'When does a referral count?',
    a: 'Sign-ups count when someone registers with your link or enters your code (e.g. AURA-XXXXXXXX or legacy AT-000123). Subscriptions count when a referred person pays (including your code in the Stripe Payment Link “Referral” field if they did not sign up via link). Courses count once per referred person when they complete a tracked course payment while logged in. Numbers update from the server — this page refreshes when you come back to the tab and every 45 seconds.',
  },
  {
    q: 'How long until rewards apply?',
    a: 'Eligible rewards are typically applied within 48 hours after a milestone is verified. If something looks wrong, contact support with your referral code.',
  },
  {
    q: 'Will I get emails when something happens?',
    a: 'If email is configured on the server, you receive an email when you cross a sign-up tier (Bronze, Silver, Gold, Elite) and when a referred person completes their first tracked subscription or course purchase — once per person per type.',
  },
  {
    q: 'What is Total impact?',
    a: 'It is the sum of your sign-ups, subscription conversions, and course conversions. It is a simple “volume” number; tier rewards are still based on referred sign-ups (the milestone ladder). Momentum is a small score that weights subscriptions and courses a bit higher for encouragement.',
  },
  {
    q: 'Can I share anywhere?',
    a: 'Yes — social, forums, or direct messages. Just keep it honest: no spam, no misleading claims, and follow each platform’s rules.',
  },
  {
    q: 'What if tiers change?',
    a: 'We may adjust milestones or benefits over time. Existing verified progress is honoured according to the terms in place when you earned it, unless we notify you otherwise.',
  },
];

function ProgressDial({ pct, gradId }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, pct));
  const offset = circ - (clamped / 100) * circ;
  return (
    <svg viewBox="0 0 120 120" className="aff-dial-svg" aria-label={`${Math.round(clamped)} percent to next reward`}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="9" />
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f8c37d" />
          <stop offset="55%" stopColor="#eaa960" />
          <stop offset="100%" stopColor="#d48d44" />
        </linearGradient>
      </defs>
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="9"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 60 60)"
        style={{ transition: 'stroke-dashoffset 0.85s cubic-bezier(0.22, 1, 0.36, 1)' }}
      />
      <text x="60" y="55" textAnchor="middle" fill="#fff" fontSize="20" fontWeight="800" fontFamily="inherit">
        {Math.round(clamped)}%
      </text>
      <text x="60" y="71" textAnchor="middle" fill="rgba(255,255,255,0.78)" fontSize="9" fontFamily="inherit">
        Next tier
      </text>
    </svg>
  );
}

export default function Affiliation() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const dialGradId = `aff-dial-grad-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [stats, setStats] = useState({
    signups: 0,
    referrals: 0,
    coursePurchases: 0,
    subscriptionPurchases: 0,
    totalImpact: 0,
    impactScore: 0,
    active: 0,
    earned: 0,
  });
  const [statsAt, setStatsAt] = useState(null);
  const [referralCode, setReferralCode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [toast, setToast] = useState(null);
  const prevMetricsRef = useRef(null);

  const referralLink =
    referralCode && typeof window !== 'undefined'
      ? `${window.location.origin}/register?ref=${encodeURIComponent(referralCode)}`
      : null;

  const fetchStats = useCallback(async (opts = {}) => {
    const silent = opts.silent === true;
    if (!user) return;
    if (!silent) setLoading(true);
    try {
      const res = await Api.getReferralStats();
      const d = res?.data;
      if (d && typeof d === 'object') {
        const signups = Number(d.signups ?? d.referrals) || 0;
        setReferralCode(d.referralCode || d.legacyAtCode || null);
        setStats({
          signups,
          referrals: signups,
          coursePurchases: Number(d.coursePurchases) || 0,
          subscriptionPurchases: Number(d.subscriptionPurchases) || 0,
          totalImpact: Number(d.totalImpact) || 0,
          impactScore: Number(d.impactScore) || 0,
          active: Number(d.active) || 0,
          earned: Number(d.earned) || 0,
        });
        setStatsAt(d.statsAt || null);
      }
    } catch (_) {
      /* keep defaults */
    } finally {
      if (!silent) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    fetchStats();
  }, [user, navigate, fetchStats]);

  /** Keep counts fresh: tab focus + periodic poll (stats are server truth). */
  useEffect(() => {
    if (!user) return undefined;
    const refresh = () => fetchStats({ silent: true });
    const onVis = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    const interval = window.setInterval(refresh, 45000);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.clearInterval(interval);
    };
  }, [user, fetchStats]);

  const inviteMessage = useMemo(() => {
    if (!referralLink) return '';
    const codeLine = referralCode ? `\n\nCode (signup or Stripe checkout): ${referralCode}` : '';
    return `I've been using AURA TERMINAL for trading education and serious tools. Join with my link — it helps me out:\n${referralLink}${codeLine}`;
  }, [referralLink, referralCode]);

  useEffect(() => {
    if (!toast?.msg) return undefined;
    const t = window.setTimeout(() => setToast(null), 6500);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (loading) return;
    const cur = {
      signups: stats.signups,
      subscriptionPurchases: stats.subscriptionPurchases,
      coursePurchases: stats.coursePurchases,
    };
    const prev = prevMetricsRef.current;
    if (!prev) {
      prevMetricsRef.current = cur;
      return;
    }
    if (cur.signups > prev.signups) {
      setToast({ msg: 'New sign-up from your referral — nice one.', kind: 'win' });
    } else if (cur.subscriptionPurchases > prev.subscriptionPurchases) {
      setToast({ msg: 'A referral activated a subscription.', kind: 'win' });
    } else if (cur.coursePurchases > prev.coursePurchases) {
      setToast({ msg: 'A referral completed a course purchase.', kind: 'win' });
    }
    prevMetricsRef.current = cur;
  }, [loading, stats.signups, stats.subscriptionPurchases, stats.coursePurchases]);

  const copyText = async (text, which) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    if (which === 'link') {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } else if (which === 'code') {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2500);
    } else if (which === 'invite') {
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2500);
    }
  };

  const shareTwitter = () => {
    if (!referralLink) return;
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent('Join me on AURA TERMINAL — serious tools for traders. My link:')} ${encodeURIComponent(referralLink)}`,
      '_blank',
    );
  };

  const shareWhatsApp = () => {
    if (!referralLink) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(`Join me on AURA TERMINAL: ${referralLink}`)}`, '_blank');
  };

  const shareEmail = () => {
    if (!referralLink) return;
    const subject = encodeURIComponent('Join me on AURA TERMINAL');
    const body = encodeURIComponent(
      `Hey,\n\nI've been using AURA TERMINAL for trading — thought you might want to check it out.\n\n${referralLink}\n\nSee you there.`,
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const shareLinkedIn = () => {
    if (!referralLink) return;
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(referralLink)}`,
      '_blank',
    );
  };

  const tierBasis = stats.signups || stats.referrals;
  const nextTier = TIERS.find((t) => t.referrals > tierBasis);
  const prevTier = [...TIERS].filter((t) => t.referrals <= tierBasis).pop();
  const progressPct = nextTier
    ? Math.min(100, (tierBasis / nextTier.referrals) * 100)
    : 100;

  const referralsToNext = nextTier ? Math.max(0, nextTier.referrals - tierBasis) : 0;

  const statCards = [
    {
      label: 'Total impact',
      value: loading ? '—' : stats.totalImpact,
      hint: 'Sign-ups + subs + courses (combined activity)',
      highlight: true,
    },
    { label: 'Sign-ups', value: loading ? '—' : tierBasis, hint: 'Registered with your code · drives tiers' },
    {
      label: 'Subscriptions',
      value: loading ? '—' : stats.subscriptionPurchases,
      hint: 'Referred users who bought a subscription',
    },
    {
      label: 'Courses',
      value: loading ? '—' : stats.coursePurchases,
      hint: 'Referred users who completed a course payment',
    },
    { label: 'Active plans', value: loading ? '—' : stats.active ?? 0, hint: 'Referred users · active or trialing' },
  ];

  const syncedLabel = statsAt
    ? `Updated ${new Date(statsAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`
    : null;

  return (
    <AuraTerminalThemeShell>
    <div className="aff-page">
      {toast?.msg && (
        <div className="aff-toast" role="status">
          <span className="aff-toast__icon" aria-hidden>
            ✦
          </span>
          <span className="aff-toast__text">{toast.msg}</span>
          <button type="button" className="aff-toast__close" onClick={() => setToast(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      <div className="aff-content journal-glass-panel journal-glass-panel--pad journal-glass-panel--rim">
        <header className="aff-hero">
          <div className="aff-hero__eyebrow">Referral programme</div>
          <h1 className="aff-hero__title">Refer &amp; earn</h1>
          <p className="aff-hero__sub">
            One link. Real rewards. Share AURA TERMINAL with traders you trust — unlock Premium and Elite perks as your
            community grows.
          </p>
          <div className="aff-hero__chips">
            <span className="aff-chip">No fees to join</span>
            <span className="aff-chip">Tracked automatically</span>
            <span className="aff-chip">Milestone rewards</span>
            <span className="aff-chip">Email tier alerts</span>
          </div>
        </header>

        {!loading && (
          <div className="aff-impact-strip" aria-label="Referral momentum">
            <div className="aff-impact-strip__main">
              <span className="aff-impact-strip__label">Momentum</span>
              <div className="aff-impact-strip__bar" role="progressbar" aria-valuenow={stats.impactScore} aria-valuemin={0} aria-valuemax={100}>
                <div className="aff-impact-strip__fill" style={{ width: `${Math.min(100, stats.impactScore)}%` }} />
              </div>
              <span className="aff-impact-strip__pct">{Math.min(100, stats.impactScore)}%</span>
            </div>
            <p className="aff-impact-strip__hint">
              Based on sign-ups, subscriptions, and course sales from people you referred. Tier unlocks still use{' '}
              <strong>sign-up</strong> count.
            </p>
            {syncedLabel && <p className="aff-impact-strip__sync">{syncedLabel}</p>}
          </div>
        )}

        <section className="aff-steps" aria-label="How referrals work in three steps">
          <div className="aff-steps__item">
            <div className="aff-steps__icon" aria-hidden>
              <FaRocket />
            </div>
            <h3 className="aff-steps__title">Share your link</h3>
            <p className="aff-steps__text">Copy once — use it in bios, DMs, or emails. Your code is baked into the URL.</p>
          </div>
          <div className="aff-steps__connector" aria-hidden />
          <div className="aff-steps__item">
            <div className="aff-steps__icon" aria-hidden>
              <FaUserPlus />
            </div>
            <h3 className="aff-steps__title">They sign up</h3>
            <p className="aff-steps__text">Friends register through your link or paste your code on the sign-up form.</p>
          </div>
          <div className="aff-steps__connector" aria-hidden />
          <div className="aff-steps__item">
            <div className="aff-steps__icon" aria-hidden>
              <FaGift />
            </div>
            <h3 className="aff-steps__title">You unlock tiers</h3>
            <p className="aff-steps__text">
              Hit sign-up milestones for rewards; subscriptions and courses boost your momentum and can trigger email alerts.
            </p>
          </div>
        </section>

        <div className="aff-dashboard">
          <div className="aff-dashboard__main">
            <div className="aff-stats">
              {statCards.map((s) => (
                <div key={s.label} className={`aff-stat ${s.highlight ? 'aff-stat--impact' : ''}`}>
                  <div className="aff-stat__value">{s.value}</div>
                  <div className="aff-stat__label">{s.label}</div>
                  <div className="aff-stat__hint">{s.hint}</div>
                </div>
              ))}
            </div>

            <div className="aff-link-box">
              <div className="aff-link-box__head">
                <span className="aff-link-box__label">Your referral link</span>
                <button type="button" className="aff-refresh" onClick={() => fetchStats()} disabled={loading} title="Refresh stats">
                  <FaSyncAlt className={loading ? 'aff-refresh--spin' : ''} />
                  Refresh
                </button>
              </div>
              <div className="aff-link-box__row">
                <span className="aff-link-box__url" title={referralLink || ''}>
                  {referralLink || 'Log in to generate your link'}
                </span>
              </div>
              <div className="aff-link-box__actions-bar">
                <button
                  type="button"
                  className={`aff-copy-btn ${copied ? 'copied' : ''}`}
                  onClick={() => copyText(referralLink, 'link')}
                  disabled={!referralLink}
                >
                  {copied ? (
                    <>
                      <FaCheck /> Copied link
                    </>
                  ) : (
                    <>
                      <FaCopy /> Copy link
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className={`aff-btn-secondary ${codeCopied ? 'copied' : ''}`}
                  onClick={() => copyText(referralCode, 'code')}
                  disabled={!referralCode}
                >
                  {codeCopied ? (
                    <>
                      <FaCheck /> Code copied
                    </>
                  ) : (
                    <>
                      <FaCopy /> Copy code
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className={`aff-btn-secondary aff-btn-invite ${inviteCopied ? 'copied' : ''}`}
                  onClick={() => copyText(inviteMessage, 'invite')}
                  disabled={!inviteMessage}
                >
                  {inviteCopied ? (
                    <>
                      <FaCheck /> Message copied
                    </>
                  ) : (
                    <>
                      <FaCopy /> Copy invite message
                    </>
                  )}
                </button>
              </div>
              <div className="aff-share-row">
                <span className="aff-share-row__label">Share</span>
                <div className="aff-share-row__btns">
                  <button type="button" className="aff-share-btn aff-share-btn--tw" onClick={shareTwitter} title="Share on X">
                    <FaTwitter />
                  </button>
                  <button type="button" className="aff-share-btn aff-share-btn--wa" onClick={shareWhatsApp} title="WhatsApp">
                    <FaWhatsapp />
                  </button>
                  <button type="button" className="aff-share-btn aff-share-btn--mail" onClick={shareEmail} title="Email">
                    <FaEnvelope />
                  </button>
                  <button type="button" className="aff-share-btn aff-share-btn--in" onClick={shareLinkedIn} title="LinkedIn">
                    <FaLinkedin />
                  </button>
                </div>
              </div>
              <div className="aff-link-box__code">
                Code: <strong>{referralCode || '—'}</strong>
              </div>
              {nextTier && (
                <div className="aff-milestone-progress">
                  <div className="aff-milestone-progress__top">
                    <span>
                      <strong>{tierBasis}</strong> / {nextTier.referrals} sign-ups → <em>{nextTier.reward}</em>
                    </span>
                    <span className="aff-milestone-progress__pct">{Math.round(progressPct)}%</span>
                  </div>
                  <div className="aff-milestone-progress__track">
                    <div className="aff-milestone-progress__fill" style={{ width: `${progressPct}%` }} />
                  </div>
                  <p className="aff-milestone-progress__hint">
                    {referralsToNext === 0
                      ? 'You reached this tier — next milestone unlocking soon.'
                      : `${referralsToNext} more referral${referralsToNext === 1 ? '' : 's'} until the next reward.`}
                  </p>
                </div>
              )}
              {!nextTier && (
                <p className="aff-milestone-progress__hint aff-milestone-progress__hint--done">
                  You have reached the highest displayed tier. Thank you for growing the community.
                </p>
              )}
            </div>

            <aside className="aff-tips">
              <div className="aff-tips__head">
                <FaLightbulb aria-hidden />
                <span>Tips that convert</span>
              </div>
              <ul className="aff-tips__list">
                <li>Lead with what you actually use — journal, validator, or desk — not generic hype.</li>
                <li>Use <strong>Copy invite message</strong> for DMs; it includes your link and code in one paste.</li>
                <li>If they subscribe via your Stripe Payment Link, remind them to paste your code in the Referral field if they did not sign up with your link first.</li>
                <li>Pin the link in your profile during high-engagement weeks to compound clicks.</li>
              </ul>
            </aside>
          </div>

          <aside className="aff-dashboard__aside">
            <div className="aff-progress-panel">
              <ProgressDial pct={progressPct} gradId={dialGradId} />
              {nextTier ? (
                <>
                  <p className="aff-progress-panel__next">
                    Next: <strong>{nextTier.label}</strong>
                  </p>
                  <p className="aff-progress-panel__reward">{nextTier.reward}</p>
                  {prevTier && (
                    <p className="aff-progress-panel__prev">
                      Last unlocked: <span>{prevTier.label}</span>
                    </p>
                  )}
                </>
              ) : (
                <p className="aff-progress-panel__reward">All milestone tiers cleared on this ladder.</p>
              )}
              <button
                type="button"
                className={`aff-copy-btn aff-copy-btn--sm ${copied ? 'copied' : ''}`}
                onClick={() => copyText(referralLink, 'link')}
                disabled={!referralLink}
              >
                {copied ? <FaCheck /> : <FaCopy />} Copy link
              </button>
            </div>
          </aside>
        </div>

        <section className="aff-tier-bar-section" aria-label="Referral milestones">
          <div className="aff-tier-bar-header">
            <span className="aff-tier-bar-name">Milestone path</span>
            <span className="aff-tier-bar-sub">Four tiers · cumulative referrals</span>
          </div>
          <div className="aff-tier-track">
            <div className="aff-tier-track__line" />
            {TIERS.map((tier, i) => {
              const achieved = tierBasis >= tier.referrals;
              const isNext = nextTier?.referrals === tier.referrals;
              return (
                <div key={tier.referrals} className={`aff-tier-node ${achieved ? 'achieved' : ''} ${isNext ? 'next' : ''}`}>
                  <div className="aff-tier-node__dot">
                    <span className="aff-tier-node__icon">{tier.icon}</span>
                  </div>
                  <div className="aff-tier-node__label">
                    <span className="aff-tier-node__count">{tier.referrals} referrals</span>
                    <span className="aff-tier-node__reward">{tier.label}</span>
                    <span className="aff-tier-node__detail">{tier.reward}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="aff-how">
          <h2 className="aff-section-title">
            <FaTrophy aria-hidden />
            Rewards at a glance
          </h2>
          <p className="aff-section-lead">Each tier stacks on your progress — check what you have unlocked and what is next.</p>
          <div className="aff-how__grid">
            {TIERS.map((tier) => {
              const achieved = tierBasis >= tier.referrals;
              return (
                <div
                  key={tier.referrals}
                  className={`aff-how__card ${achieved ? 'aff-how__card--achieved' : ''}`}
                  style={{ '--tier-accent': tier.color }}
                >
                  <div className="aff-how__icon">{tier.icon}</div>
                  <div className="aff-how__tier-name">{tier.label}</div>
                  <div className="aff-how__ref-count">{tier.referrals} referrals</div>
                  <div className="aff-how__reward">{tier.reward}</div>
                  {achieved ? (
                    <div className="aff-how__achieved">
                      <FaCheck /> Unlocked
                    </div>
                  ) : (
                    <div className="aff-how__pending">In progress</div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="aff-faq" aria-label="Frequently asked questions">
          <h2 className="aff-section-title">Questions</h2>
          <div className="aff-faq__list">
            {FAQ_ITEMS.map((item) => (
              <details key={item.q} className="aff-faq__item">
                <summary className="aff-faq__summary">
                  {item.q}
                  <FaChevronDown className="aff-faq__chev" aria-hidden />
                </summary>
                <p className="aff-faq__answer">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <footer className="aff-terms">
          <h3 className="aff-terms__title">Terms &amp; conditions</h3>
          <ul className="aff-terms__list">
            <li>Referrals must use your unique link (or approved code flow) to be tracked.</li>
            <li>Self-referrals, duplicate accounts, and fraudulent signups are not permitted.</li>
            <li>Rewards are applied within 48 hours of milestone verification where possible.</li>
            <li>AURA TERMINAL may update tiers or benefits; we will communicate material changes where required.</li>
            <li>Abuse of the programme may result in forfeiture of rewards and account action.</li>
          </ul>
        </footer>
      </div>
    </div>
    </AuraTerminalThemeShell>
  );
}
