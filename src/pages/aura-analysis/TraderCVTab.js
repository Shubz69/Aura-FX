import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import html2canvas from 'html2canvas';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import { useOperatorAccount } from '../../context/OperatorAccountContext';
import Api from '../../services/Api';
import { calculateAuraxScore, getAuraxRankTitle } from '../../lib/aura-analysis/trader-cv/auraxScoreCalculator';
import { computeBehaviourBreakdown } from '../../lib/aura-analysis/trader-cv/behaviourAnalytics';
import { getAverageTradeQuality } from '../../lib/aura-analysis/trader-cv/tradeQualityCalculator';
import { computeStreaks } from '../../lib/aura-analysis/trader-cv/streakEngine';
import { getBestConditions, getReviewSummary, getMonthlyReviewStats } from '../../lib/aura-analysis/trader-cv/traderInsightsEngine';
import { normalizeReplay } from '../../lib/trader-replay/replayNormalizer';
import { buildReplayCvSnapshot } from '../../lib/trader-replay/replayIdentityEngine';
import { computeReplayHabitStats } from '../../lib/trader-replay/replayHabit';
import { buildReplayContributionProfile } from '../../lib/trader-replay/replayContributionEngine';
import { buildReplayNarrativeBridgeForUi } from '../../lib/trader-replay/replayNarrativeBridge';
import ReplayNarrativeBridgePanel from '../../components/aura-analysis/ReplayNarrativeBridgePanel';
import '../../styles/aura-analysis/AuraShared.css';
import { resolveAvatarUrlForUi } from '../../utils/avatar';
import { setTraderPassportShare } from '../../utils/traderPassportShare';
import '../../styles/aura-analysis/TraderCV.css';

function getDisplayInitials(u, displayLabel) {
  const n = (displayLabel || u?.name || u?.username || 'Trader').trim();
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase() || 'T';
  return (n.slice(0, 2) || 'T').toUpperCase();
}

const MIN_TRADES_FOR_FULL = 5;

function formatStreak(value) {
  const n = typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  return `${n}d`;
}

export default function TraderCVTab() {
  const { user } = useAuth();
  const { selectedAccountId, loading: accountsLoading } = useOperatorAccount();
  const navigate = useNavigate();
  const passportPreviewRef = useRef(null);
  const passportExportRef = useRef(null);
  const [passportBusy, setPassportBusy] = useState(false);
  const [trades, setTrades] = useState([]);
  const [replaySessions, setReplaySessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (accountsLoading) return undefined;
    let cancelled = false;
    setLoading(true);
    const params =
      selectedAccountId != null && Number.isFinite(Number(selectedAccountId))
        ? { validatorAccountId: selectedAccountId }
        : {};
    Promise.all([
      Api.getAuraAnalysisTrades(params).catch(() => ({ data: { trades: [] } })),
      Api.getTraderReplaySessions().catch(() => ({ data: { sessions: [] } })),
    ])
      .then(([tradesRes, replayRes]) => {
        if (cancelled) return;
        const list = tradesRes.data?.trades ?? [];
        setTrades(Array.isArray(list) ? list : []);
        const rs = replayRes?.data?.sessions ?? replayRes?.data?.data;
        setReplaySessions(Array.isArray(rs) ? rs : []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accountsLoading, selectedAccountId]);

  const behaviour = useMemo(() => computeBehaviourBreakdown(trades, {
    journalStreak: user?.login_streak ?? 0,
    routineCompletionRate: 0,
  }), [trades, user?.login_streak]);

  const { auraxScore, breakdown } = useMemo(() => calculateAuraxScore({
    riskDiscipline: behaviour.riskDiscipline,
    ruleAdherence: behaviour.ruleAdherence,
    consistency: behaviour.consistency,
    emotionalControl: behaviour.emotionalControl,
  }), [behaviour]);

  const rankTitle = useMemo(() => getAuraxRankTitle(auraxScore), [auraxScore]);
  const quality = useMemo(() => getAverageTradeQuality(trades), [trades]);
  const streaks = useMemo(() => computeStreaks(user, trades), [user, trades]);
  const conditions = useMemo(() => getBestConditions(trades), [trades]);
  const review = useMemo(() => getReviewSummary(
    { riskDiscipline: behaviour.riskDiscipline, ruleAdherence: behaviour.ruleAdherence, consistency: behaviour.consistency, emotionalControl: behaviour.emotionalControl },
    conditions
  ), [behaviour, conditions]);
  const monthlyStats = useMemo(() => getMonthlyReviewStats(trades), [trades]);

  const normalizedReplaySessions = useMemo(
    () => replaySessions.map((r) => normalizeReplay(r)),
    [replaySessions]
  );
  const replayCvSnapshot = useMemo(() => buildReplayCvSnapshot(normalizedReplaySessions), [normalizedReplaySessions]);
  const replayHabitStats = useMemo(() => computeReplayHabitStats(normalizedReplaySessions), [normalizedReplaySessions]);
  const replayContribution = useMemo(
    () => buildReplayContributionProfile(normalizedReplaySessions, replayHabitStats),
    [normalizedReplaySessions, replayHabitStats]
  );
  const replayNarrativeBridge = useMemo(
    () =>
      buildReplayNarrativeBridgeForUi(
        normalizedReplaySessions,
        replayHabitStats,
        replayContribution
      ),
    [normalizedReplaySessions, replayHabitStats, replayContribution]
  );

  const summaryLine = useMemo(() => {
    if (auraxScore >= 80) return 'Disciplined trader with strong risk control and improving consistency.';
    if (auraxScore >= 60) return 'Structured approach with room to strengthen checklist and emotional discipline.';
    if (auraxScore >= 40) return 'Building foundations. Focus on risk rules and checklist completion.';
    return 'Complete validated trades and journal entries to unlock your full Trader CV.';
  }, [auraxScore]);

  const bestTrait = useMemo(() => {
    const arr = [
      { key: 'riskDiscipline', label: 'Risk discipline' },
      { key: 'ruleAdherence', label: 'Rule adherence' },
      { key: 'consistency', label: 'Consistency' },
      { key: 'emotionalControl', label: 'Emotional control' },
    ];
    const sorted = [...arr].sort((a, b) => (breakdown[b.key] ?? 0) - (breakdown[a.key] ?? 0));
    return sorted[0]?.label ?? 'â€”';
  }, [breakdown]);

  const weakestTrait = useMemo(() => {
    const arr = [
      { key: 'riskDiscipline', label: 'Risk discipline' },
      { key: 'ruleAdherence', label: 'Rule adherence' },
      { key: 'consistency', label: 'Consistency' },
      { key: 'emotionalControl', label: 'Emotional control' },
    ];
    const sorted = [...arr].sort((a, b) => (breakdown[a.key] ?? 0) - (breakdown[b.key] ?? 0));
    return sorted[0]?.label ?? 'â€”';
  }, [breakdown]);

  /** Prefer auth context; fall back to persisted `user` in localStorage (same source as Profile). */
  const storedProfile = useMemo(() => {
    try {
      return JSON.parse(typeof window !== 'undefined' ? localStorage.getItem('user') || '{}' : '{}');
    } catch {
      return {};
    }
  }, [user]);

  const rawUsername =
    (user?.username && String(user.username).trim()) ||
    (storedProfile.username && String(storedProfile.username).trim()) ||
    '';
  const rawName =
    (user?.name && String(user.name).trim()) ||
    (storedProfile.name && String(storedProfile.name).trim()) ||
    '';
  const emailLocal =
    (user?.email && String(user.email).split('@')[0]) ||
    (storedProfile.email && String(storedProfile.email).split('@')[0]) ||
    '';
  /** Passport headline: real name first, then username, then email local-part, then fallback. */
  const passportPrimaryName = rawName || rawUsername || emailLocal || 'Trader';
  const passportAltName =
    rawUsername && rawName && rawName.toLowerCase() !== rawUsername.toLowerCase()
      ? `@${rawUsername}`
      : null;

  const passportAvatarSource = useMemo(() => {
    const fromUser = user?.avatar && String(user.avatar).trim();
    const fromStored = storedProfile.avatar && String(storedProfile.avatar).trim();
    if (typeof window === 'undefined') return fromUser || fromStored || null;
    try {
      if (user?.id != null) {
        const dedicated = localStorage.getItem(`user_avatar_${user.id}`);
        if (dedicated && dedicated.trim()) return dedicated.trim();
      }
      if (fromStored) return fromStored;
    } catch (_) {
      /* ignore */
    }
    return fromUser || fromStored || null;
  }, [user?.id, user?.avatar, storedProfile]);

  const passportAvatarUrl = resolveAvatarUrlForUi(passportAvatarSource || '');
  const showPassportPhoto = Boolean(passportAvatarUrl);
  const issuedDate = useMemo(() => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }), []);

  const capturePassportDataUrl = useCallback(async () => {
    const el = passportExportRef.current || passportPreviewRef.current;
    if (!el) return null;
    try {
      if (typeof document !== 'undefined' && document.fonts?.ready) {
        await document.fonts.ready;
      }
    } catch (_) {
      /* ignore */
    }
    const captureScale = typeof window !== 'undefined'
      ? Math.max(2, Math.min(3, window.devicePixelRatio || 1))
      : 2;
    const canvas = await html2canvas(el, {
      scale: captureScale,
      backgroundColor: '#070b18',
      useCORS: true,
      allowTaint: false,
      logging: false,
      scrollX: 0,
      scrollY: typeof window !== 'undefined' ? -window.scrollY : 0,
      onclone: (clonedDoc) => {
        const captureRoot = clonedDoc.querySelector('.trader-cv-passport-card--export');
        if (captureRoot && captureRoot.classList) {
          captureRoot.classList.add('trader-cv-passport-card--capture');
        }
      },
    });
    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(null);
            return;
          }
          const reader = new FileReader();
          reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        },
        'image/png',
        0.92
      );
    });
  }, []);

  const handleSavePassport = useCallback(async () => {
    if (passportBusy) return;
    setPassportBusy(true);
    try {
      const dataUrl = await capturePassportDataUrl();
      if (!dataUrl) {
        toast.error('Could not create passport image. Try again or disable browser extensions that block canvas export.');
        return;
      }
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `aura-trader-passport-${(user?.username || 'trader').replace(/[^\w-]/g, '')}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Passport saved â€” premium render ready to share.');
    } catch (e) {
      console.warn(e);
      toast.error('Save failed. Try again in a moment.');
    } finally {
      setPassportBusy(false);
    }
  }, [passportBusy, capturePassportDataUrl, user?.username]);

  const handleSharePassportToCommunity = useCallback(async () => {
    if (passportBusy) return;
    setPassportBusy(true);
    try {
      const dataUrl = await capturePassportDataUrl();
      if (!dataUrl) {
        toast.error('Could not create passport image for sharing.');
        return;
      }
      try {
        setTraderPassportShare({ dataUrl, ts: Date.now() });
      } catch (err) {
        console.warn(err);
        toast.error('Image is too large to attach automatically â€” use Save and upload the file in Community.');
        return;
      }
      navigate('/community');
    } catch (e) {
      console.warn(e);
      toast.error('Could not prepare share. Try Save instead.');
    } finally {
      setPassportBusy(false);
    }
  }, [passportBusy, capturePassportDataUrl, navigate]);

  if (accountsLoading || loading) {
    return (
      <div className="trader-cv">
        <div className="trader-cv-loading">
          <div className="trader-cv-loading-ring" aria-hidden />
          <p>Loading your Trader CVâ€¦</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="trader-cv">
        <div className="trader-cv-error">{error}</div>
      </div>
    );
  }

  const hasEnoughData = trades.length >= MIN_TRADES_FOR_FULL;

  return (
    <div className="trader-cv">
      {/* Hero Score Card */}
      <section className="trader-cv-hero">
        <div className="trader-cv-hero-glow" aria-hidden />
        <div className="trader-cv-hero-inner">
          <div className="trader-cv-hero-left">
            <h2 className="trader-cv-hero-name">{user?.name || user?.username || 'Trader'}</h2>
            <p className="trader-cv-hero-rank">{rankTitle}</p>
            <div className="trader-cv-hero-score-wrap">
              <div className="trader-cv-hero-ring" style={{ '--score': Number.isFinite(auraxScore) ? auraxScore : 0 }}>
                <span className="trader-cv-hero-score-value">{Number.isFinite(auraxScore) ? auraxScore : 0}</span>
              </div>
              <span className="trader-cv-hero-score-label">Aurax Score</span>
            </div>
            <p className="trader-cv-hero-summary">{summaryLine}</p>
          </div>
          <div className="trader-cv-hero-chips">
            <div className="trader-cv-chip"><span className="trader-cv-chip-label">Current streak</span><span className="trader-cv-chip-value">{streaks.journalStreak}d</span></div>
            <div className="trader-cv-chip"><span className="trader-cv-chip-label">Best trait</span><span className="trader-cv-chip-value">{bestTrait}</span></div>
            <div className="trader-cv-chip"><span className="trader-cv-chip-label">Focus</span><span className="trader-cv-chip-value">{weakestTrait}</span></div>
            <div className="trader-cv-chip"><span className="trader-cv-chip-label">Monthly status</span><span className="trader-cv-chip-value">{trades.length} trades</span></div>
          </div>
        </div>
      </section>

      {/* Aurax Score Breakdown */}
      <section className="trader-cv-section">
        <h3 className="trader-cv-section-title">Aurax Score Breakdown</h3>
        <div className="trader-cv-breakdown-grid">
          {[
            { key: 'riskDiscipline', label: 'Risk Discipline', weight: '30%' },
            { key: 'ruleAdherence', label: 'Rule Adherence', weight: '30%' },
            { key: 'consistency', label: 'Consistency', weight: '25%' },
            { key: 'emotionalControl', label: 'Emotional Control', weight: '15%' },
          ].map(({ key, label, weight }) => (
            <div key={key} className="trader-cv-breakdown-card">
              <div className="trader-cv-breakdown-header">
                <span className="trader-cv-breakdown-label">{label}</span>
                <span className="trader-cv-breakdown-weight">{weight}</span>
              </div>
              <div className="trader-cv-breakdown-bar-wrap">
                <div className="trader-cv-breakdown-bar" style={{ width: `${Math.max(0, Math.min(100, Number(breakdown[key]) || 0))}%` }} />
              </div>
              <p className="trader-cv-breakdown-score">{Math.round(Number(breakdown[key]) || 0)}</p>
              <p className="trader-cv-breakdown-message">{behaviour.messages?.[key] ?? 'â€”'}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trade Quality */}
      <section className="trader-cv-section">
        <h3 className="trader-cv-section-title">Trade Quality Score</h3>
        {trades.length === 0 ? (
          <div className="trader-cv-empty">Complete validated trades to see average trade quality and recent quality trend.</div>
        ) : (
          <div className="trader-cv-quality-row">
            <div className="trader-cv-quality-card">
              <span className="trader-cv-quality-value">{quality.averageQuality}</span>
              <span className="trader-cv-quality-label">Avg this period</span>
            </div>
            <div className="trader-cv-quality-trend">
              Trend: {quality.trend === 'up' ? 'â†‘ Improving' : quality.trend === 'down' ? 'â†“ Review process' : 'â†’ Stable'}
            </div>
            {quality.recent.length > 0 && (
              <div className="trader-cv-quality-badges">
                {quality.recent.slice(0, 5).map((q, i) => (
                  <span key={i} className={`trader-cv-quality-badge trader-cv-quality-badge--${q.label.replace(/\s+/g, '-').toLowerCase()}`}>{q.label}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Replay-derived identity (Trader Replay) */}
      <section className="trader-cv-section">
        <h3 className="trader-cv-section-title">Replay review identity</h3>
        {replayCvSnapshot.completedReplayCount === 0 ? (
          <div className="trader-cv-empty">
            Complete replays in Trader Replay to accumulate a grounded review identity alongside your trade statistics.
          </div>
        ) : (
          <div className="trader-cv-replay-identity">
            <p className="trader-cv-replay-line">
              <strong>{replayCvSnapshot.completedReplayCount}</strong> completed replays Â· avg replay Q{' '}
              <strong>{replayCvSnapshot.averageReplayQuality ?? 'â€”'}</strong> Â· avg review depth{' '}
              <strong>{replayCvSnapshot.averageReviewCompleteness ?? 'â€”'}%</strong>
              {replayCvSnapshot.learningExampleCount > 0 ? (
                <>
                  {' '}
                  Â· <strong>{replayCvSnapshot.modelExampleCount}</strong> model /{' '}
                  <strong>{replayCvSnapshot.cautionExampleCount}</strong> caution examples
                </>
              ) : null}
            </p>
            {replayCvSnapshot.evidenceLabel ? (
              <p className="trader-cv-replay-micro">{replayCvSnapshot.evidenceLabel}</p>
            ) : null}
            {replayCvSnapshot.explainabilitySummary ? (
              <p className="trader-cv-replay-expl">{replayCvSnapshot.explainabilitySummary}</p>
            ) : null}
            {replayCvSnapshot.developmentProfile?.strongestTrait ? (
              <p className="trader-cv-replay-line trader-cv-replay-line--tight">
                <strong>Replay strength Â· </strong>
                {replayCvSnapshot.developmentProfile.strongestTrait.label}: {replayCvSnapshot.developmentProfile.strongestTrait.line}
              </p>
            ) : null}
            {replayCvSnapshot.developmentProfile?.highestRiskTrait ? (
              <p className="trader-cv-replay-line trader-cv-replay-line--tight">
                <strong>Highest-risk pattern Â· </strong>
                {replayCvSnapshot.developmentProfile.highestRiskTrait.label}: {replayCvSnapshot.developmentProfile.highestRiskTrait.line}
              </p>
            ) : null}
            {replayCvSnapshot.developmentProfile?.evidenceConfidenceLine ? (
              <p className="trader-cv-replay-micro">{replayCvSnapshot.developmentProfile.evidenceConfidenceLine}</p>
            ) : null}
            {replayCvSnapshot.currentDevelopmentFocus?.detail ? (
              <p className="trader-cv-replay-focus">{replayCvSnapshot.currentDevelopmentFocus.detail}</p>
            ) : null}
            {replayCvSnapshot.developmentProfile?.developmentPractice ? (
              <p className="trader-cv-replay-micro">
                <strong>Next Â· </strong>
                {replayCvSnapshot.developmentProfile.developmentPractice}
              </p>
            ) : null}
            {replayCvSnapshot.developmentProfile?.stopDoing && replayCvSnapshot.developmentProfile.guidanceMode !== 'gather_evidence' ? (
              <p className="trader-cv-replay-micro">
                <strong>Stop Â· </strong>
                {replayCvSnapshot.developmentProfile.stopDoing}
              </p>
            ) : null}
            {replayCvSnapshot.recentGrowthSignal ? (
              <p className="trader-cv-replay-growth">{replayCvSnapshot.recentGrowthSignal}</p>
            ) : null}
            {replayCvSnapshot.attentionNeededSignal ? (
              <p className="trader-cv-replay-attention">{replayCvSnapshot.attentionNeededSignal}</p>
            ) : null}

            {replayNarrativeBridge.visible ? (
              <div className="trader-cv-replay-narrative-wrap">
                <h4 className="trader-cv-replay-subtitle">Recent replay review narrative</h4>
                <ReplayNarrativeBridgePanel bridge={replayNarrativeBridge} variant="cv" />
              </div>
            ) : null}

            <div className="trader-cv-replay-contribution">
              <h4 className="trader-cv-replay-subtitle">Replay discipline &amp; behavior contribution</h4>
              <p className="trader-cv-replay-micro">
                One input to your wider profile â€” not a replacement for Aurax. Indices are 0â€“100 from completed replays only.
              </p>
              <div className="trader-cv-replay-contrib-grid">
                <div className="trader-cv-replay-contrib-card">
                  <span className="trader-cv-replay-contrib-label">Discipline index</span>
                  <span className="trader-cv-replay-contrib-value">
                    {replayContribution.discipline.replayDisciplineContribution ?? 'â€”'}
                  </span>
                  <span className="trader-cv-replay-contrib-meta">{replayContribution.discipline.replayDisciplineConfidence}</span>
                </div>
                <div className="trader-cv-replay-contrib-card">
                  <span className="trader-cv-replay-contrib-label">Behavior index</span>
                  <span className="trader-cv-replay-contrib-value">
                    {replayContribution.behavior.replayBehaviorContribution ?? 'â€”'}
                  </span>
                  <span className="trader-cv-replay-contrib-meta">{replayContribution.behavior.replayBehaviorConfidence}</span>
                </div>
                <div className="trader-cv-replay-contrib-card">
                  <span className="trader-cv-replay-contrib-label">7d discipline trend</span>
                  <span className="trader-cv-replay-contrib-value">
                    {replayContribution.discipline.replayDisciplineTrend === 'improving'
                      ? 'â†‘ Improving'
                      : replayContribution.discipline.replayDisciplineTrend === 'slipping'
                        ? 'â†“ Softer'
                        : replayContribution.discipline.replayDisciplineTrend === 'insufficient_evidence'
                          ? 'â€”'
                          : 'â†’ Stable'}
                  </span>
                  <span className="trader-cv-replay-contrib-meta">vs prior week</span>
                </div>
              </div>
              {replayContribution.behavior.strengths[0] ? (
                <p className="trader-cv-replay-line trader-cv-replay-line--tight">
                  <strong>Strength Â·</strong> {replayContribution.behavior.strengths[0]}
                </p>
              ) : null}
              {replayContribution.behavior.cautions[0] ? (
                <p className="trader-cv-replay-line trader-cv-replay-line--tight">
                  <strong>Caution Â·</strong> {replayContribution.behavior.cautions[0]}
                </p>
              ) : null}
              {replayContribution.scoreContributionExplanations.slice(0, 2).map((line, i) => (
                <p key={`replay-expl-${i}`} className="trader-cv-replay-expl">{line}</p>
              ))}
              {replayContribution.developmentActions[0] ? (
                <p className="trader-cv-replay-dev">
                  <strong>Development Â·</strong> {replayContribution.developmentActions[0]}
                </p>
              ) : null}
            </div>
          </div>
        )}
      </section>

      {/* Best Conditions */}
      <section className="trader-cv-section">
        <h3 className="trader-cv-section-title">Where You Perform Best</h3>
        {!conditions.hasData ? (
          <div className="trader-cv-empty">More trade data is needed to identify your strongest conditions.</div>
        ) : (
          <div className="trader-cv-conditions-grid">
            <div className="trader-cv-condition"><span className="trader-cv-condition-label">Best day</span><span className="trader-cv-condition-value">{conditions.bestDay ?? 'â€”'}</span></div>
            <div className="trader-cv-condition"><span className="trader-cv-condition-label">Worst day</span><span className="trader-cv-condition-value">{conditions.worstDay ?? 'â€”'}</span></div>
            <div className="trader-cv-condition"><span className="trader-cv-condition-label">Best session</span><span className="trader-cv-condition-value">{conditions.bestSession ?? 'â€”'}</span></div>
            <div className="trader-cv-condition"><span className="trader-cv-condition-label">Weakest period</span><span className="trader-cv-condition-value">{conditions.worstSession ?? 'â€”'}</span></div>
            <div className="trader-cv-condition"><span className="trader-cv-condition-label">Best pair</span><span className="trader-cv-condition-value">{conditions.bestPair ?? 'â€”'}</span></div>
            <div className="trader-cv-condition"><span className="trader-cv-condition-label">Worst pair</span><span className="trader-cv-condition-value">{conditions.worstPair ?? 'â€”'}</span></div>
          </div>
        )}
      </section>

      {/* Streaks + Gamification */}
      <section className="trader-cv-section">
        <h3 className="trader-cv-section-title">Streaks & Progress</h3>
        <div className="trader-cv-streaks">
          <div className="trader-cv-streak-card"><span className="trader-cv-streak-value">{Number.isFinite(streaks.journalStreak) ? streaks.journalStreak : 0}</span><span className="trader-cv-streak-label">Journal streak</span></div>
          <div className="trader-cv-streak-card"><span className="trader-cv-streak-value">{Number.isFinite(streaks.ruleAdherenceStreak) ? streaks.ruleAdherenceStreak : 0}</span><span className="trader-cv-streak-label">Rule adherence streak</span></div>
          <div className="trader-cv-streak-card"><span className="trader-cv-streak-value">{Number.isFinite(streaks.disciplinedDaysStreak) ? streaks.disciplinedDaysStreak : 0}</span><span className="trader-cv-streak-label">Disciplined days</span></div>
        </div>
        <div className="trader-cv-rank-bar">
          <span className="trader-cv-rank-title">Rank</span>
          <span className="trader-cv-rank-value">{rankTitle}</span>
          <div className="trader-cv-rank-progress"><div className="trader-cv-rank-fill" style={{ width: `${Number.isFinite(auraxScore) ? Math.max(0, Math.min(100, auraxScore)) : 0}%` }} /></div>
        </div>
      </section>

      {/* Development timeline â€“ simplified trend */}
      <section className="trader-cv-section">
        <h3 className="trader-cv-section-title">Score Trend</h3>
        {trades.length < 3 ? (
          <div className="trader-cv-empty">Aurax Score trend will appear as you log more trades.</div>
        ) : (
          <div className="trader-cv-trend-cards">
            <div className="trader-cv-trend-card"><span className="trader-cv-trend-label">Risk Discipline</span><span className="trader-cv-trend-value">{breakdown.riskDiscipline}</span></div>
            <div className="trader-cv-trend-card"><span className="trader-cv-trend-label">Rule Adherence</span><span className="trader-cv-trend-value">{breakdown.ruleAdherence}</span></div>
            <div className="trader-cv-trend-card"><span className="trader-cv-trend-label">Consistency</span><span className="trader-cv-trend-value">{breakdown.consistency}</span></div>
            <div className="trader-cv-trend-card"><span className="trader-cv-trend-label">Emotional Control</span><span className="trader-cv-trend-value">{breakdown.emotionalControl}</span></div>
          </div>
        )}
      </section>

      {/* Weekly / Monthly Review */}
      <section className="trader-cv-section">
        <h3 className="trader-cv-section-title">Review Summary</h3>
        <div className="trader-cv-review-grid">
          <div className="trader-cv-review-col">
            <h4 className="trader-cv-review-heading">Strengths</h4>
            <ul className="trader-cv-review-list">{review.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
          <div className="trader-cv-review-col">
            <h4 className="trader-cv-review-heading">Weaknesses</h4>
            <ul className="trader-cv-review-list trader-cv-review-list--weak">{review.weaknesses.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </div>
          <div className="trader-cv-review-col">
            <h4 className="trader-cv-review-heading">Actions</h4>
            <ul className="trader-cv-review-list trader-cv-review-list--action">{review.actions.map((a, i) => <li key={i}>{a}</li>)}</ul>
          </div>
        </div>
        {monthlyStats.totalTrades > 0 && (
          <div className="trader-cv-monthly-stats">
            <span>Trades: {monthlyStats.totalTrades}</span>
            <span>Win rate: {monthlyStats.winRate.toFixed(1)}%</span>
            <span>Avg R: {monthlyStats.avgR.toFixed(2)}</span>
          </div>
        )}
      </section>

      {!hasEnoughData && (
        <div className="trader-cv-cta">
          <p>Complete 5+ validated trades to unlock your full Trader CV analytics.</p>
        </div>
      )}

      <section className="trader-cv-section trader-cv-passport-section">
        <h3 className="trader-cv-section-title">Trader Passport</h3>
        <p className="trader-cv-passport-intro">
          A shareable ID-style summary of your Trader CV. Only you see this here. Others only see it if you save the image or send it in{' '}
          <strong>Community</strong> messages â€” choose the channel and audience carefully.
        </p>

        <div ref={passportPreviewRef} className="trader-cv-passport-card" aria-hidden={false}>
          <div className="trader-cv-passport-cosmos" aria-hidden />
          <div className="trader-cv-passport-scan" aria-hidden />
          <div className="trader-cv-passport-card-inner">
            <header className="trader-cv-passport-top">
              <div className="trader-cv-passport-brand-block">
                <span className="trader-cv-passport-brand-mark">AURA</span>
                <span className="trader-cv-passport-brand-sub">TERMINAL</span>
              </div>
              <div className="trader-cv-passport-chip">
                <span className="trader-cv-passport-chip-pulse" aria-hidden />
                <span className="trader-cv-passport-chip-text">PASSPORT Â· VERIFIED</span>
              </div>
            </header>

            <div className="trader-cv-passport-hero">
              <div className="trader-cv-passport-avatar-col">
                <div className="trader-cv-passport-avatar-shell">
                  <div className="trader-cv-passport-avatar-ring" aria-hidden />
                  <div
                    className={`trader-cv-passport-photo${showPassportPhoto ? '' : ' trader-cv-passport-photo--placeholder'}`}
                    style={showPassportPhoto ? { background: '#0a1020' } : undefined}
                  >
                    {showPassportPhoto ? (
                      <img
                        src={passportAvatarUrl}
                        alt=""
                        {...(typeof passportAvatarUrl === 'string' && /^https?:/i.test(passportAvatarUrl)
                          ? { crossOrigin: 'anonymous' }
                          : {})}
                      />
                    ) : (
                      <span className="trader-cv-passport-photo-initials">{getDisplayInitials(user, passportPrimaryName)}</span>
                    )}
                  </div>
                </div>
                <p className="trader-cv-passport-avatar-caption">VISUAL ID</p>
              </div>

              <div className="trader-cv-passport-identity">
                <p className="trader-cv-passport-hud">HOLDER // TRADER ID</p>
                <p className="trader-cv-passport-handle">{passportPrimaryName}</p>
                {passportAltName ? (
                  <p className="trader-cv-passport-altname">{passportAltName}</p>
                ) : null}
                <p className="trader-cv-passport-rank">{rankTitle}</p>
              </div>

              <div className="trader-cv-passport-aurax-block">
                <p className="trader-cv-passport-hud">AURAX</p>
                <p className="trader-cv-passport-score-num">
                  {Number.isFinite(auraxScore) ? Math.round(auraxScore) : 0}
                </p>
                <p className="trader-cv-passport-score-sub">composite</p>
              </div>
            </div>

            <div className="trader-cv-passport-metrics">
              {[
                { key: 'riskDiscipline', short: 'RISK', code: 'R_DISC' },
                { key: 'ruleAdherence', short: 'RULES', code: 'RULE_ADH' },
                { key: 'consistency', short: 'CONSIST', code: 'CONS' },
                { key: 'emotionalControl', short: 'EMOTION', code: 'EMO_CTL' },
              ].map(({ key, short, code }) => (
                <div key={key} className="trader-cv-passport-metric">
                  <span className="trader-cv-passport-metric-code">{code}</span>
                  <span className="trader-cv-passport-metric-label">{short}</span>
                  <span className="trader-cv-passport-metric-val">{Math.round(Number(breakdown[key]) || 0)}</span>
                </div>
              ))}
            </div>

            <div className="trader-cv-passport-footer-row">
              <div className="trader-cv-passport-footer-cell">
                <p className="trader-cv-passport-hud">TRADE QUALITY (AVG)</p>
                <p className="trader-cv-passport-quality">
                  {trades.length ? `${quality.averageQuality}` : 'â€”'}
                  {trades.length > 0 ? <span className="trader-cv-passport-quality-sub"> Â· window</span> : null}
                </p>
              </div>
              <div className="trader-cv-passport-footer-cell trader-cv-passport-footer-cell--right">
                <p className="trader-cv-passport-hud">ISSUED</p>
                <p className="trader-cv-passport-issued">{issuedDate}</p>
                <p className="trader-cv-passport-id">
                  REF Â· {String(user?.id ?? user?.username ?? 'â€”').slice(0, 14)}
                </p>
              </div>
            </div>

            <p className="trader-cv-passport-watermark">
              AURA TERMINAL™
            </p>
          </div>
        </div>

        <div className="trader-cv-passport-export-stage" aria-hidden>
          <div ref={passportExportRef} className="trader-cv-passport-card trader-cv-passport-card--export" aria-hidden>
            <div className="trader-cv-passport-cosmos" aria-hidden />
            <div className="trader-cv-passport-scan" aria-hidden />
            <div className="trader-cv-passport-card-inner">
              <header className="trader-cv-passport-top">
                <div className="trader-cv-passport-brand-block">
                  <span className="trader-cv-passport-brand-mark">AURA</span>
                  <span className="trader-cv-passport-brand-sub">TERMINAL</span>
                </div>
                <div className="trader-cv-passport-chip">
                  <span className="trader-cv-passport-chip-pulse" aria-hidden />
                  <span className="trader-cv-passport-chip-text">PASSPORT Â· VERIFIED</span>
                </div>
              </header>

              <div className="trader-cv-passport-hero">
                <div className="trader-cv-passport-avatar-col">
                  <div className="trader-cv-passport-avatar-shell">
                    <div className="trader-cv-passport-avatar-ring" aria-hidden />
                    <div
                      className={`trader-cv-passport-photo${showPassportPhoto ? '' : ' trader-cv-passport-photo--placeholder'}`}
                      style={showPassportPhoto ? { background: '#0a1020' } : undefined}
                    >
                      {showPassportPhoto ? (
                        <img
                          src={passportAvatarUrl}
                          alt=""
                          {...(typeof passportAvatarUrl === 'string' && /^https?:/i.test(passportAvatarUrl)
                            ? { crossOrigin: 'anonymous' }
                            : {})}
                        />
                      ) : (
                        <span className="trader-cv-passport-photo-initials">{getDisplayInitials(user, passportPrimaryName)}</span>
                      )}
                    </div>
                  </div>
                  <p className="trader-cv-passport-avatar-caption">VISUAL ID</p>
                </div>

                <div className="trader-cv-passport-identity">
                  <p className="trader-cv-passport-hud">HOLDER // TRADER ID</p>
                  <p className="trader-cv-passport-handle">{passportPrimaryName}</p>
                  {passportAltName ? (
                    <p className="trader-cv-passport-altname">{passportAltName}</p>
                  ) : null}
                  <p className="trader-cv-passport-rank">{rankTitle}</p>
                </div>

                <div className="trader-cv-passport-aurax-block">
                  <p className="trader-cv-passport-hud">AURAX</p>
                  <p className="trader-cv-passport-score-num">
                    {Number.isFinite(auraxScore) ? Math.round(auraxScore) : 0}
                  </p>
                  <p className="trader-cv-passport-score-sub">composite</p>
                </div>
              </div>

              <div className="trader-cv-passport-metrics">
                {[
                  { key: 'riskDiscipline', short: 'RISK', code: 'R_DISC' },
                  { key: 'ruleAdherence', short: 'RULES', code: 'RULE_ADH' },
                  { key: 'consistency', short: 'CONSIST', code: 'CONS' },
                  { key: 'emotionalControl', short: 'EMOTION', code: 'EMO_CTL' },
                ].map(({ key, short, code }) => (
                  <div key={key} className="trader-cv-passport-metric">
                    <span className="trader-cv-passport-metric-code">{code}</span>
                    <span className="trader-cv-passport-metric-label">{short}</span>
                    <span className="trader-cv-passport-metric-val">{Math.round(Number(breakdown[key]) || 0)}</span>
                  </div>
                ))}
              </div>

              <div className="trader-cv-passport-footer-row">
                <div className="trader-cv-passport-footer-cell">
                  <p className="trader-cv-passport-hud">TRADE QUALITY (AVG)</p>
                  <p className="trader-cv-passport-quality">
                    {trades.length ? `${quality.averageQuality}` : 'â€”'}
                    {trades.length > 0 ? <span className="trader-cv-passport-quality-sub"> Â· window</span> : null}
                  </p>
                </div>
                <div className="trader-cv-passport-footer-cell trader-cv-passport-footer-cell--right">
                  <p className="trader-cv-passport-hud">ISSUED</p>
                  <p className="trader-cv-passport-issued">{issuedDate}</p>
                  <p className="trader-cv-passport-id">
                    REF Â· {String(user?.id ?? user?.username ?? 'â€”').slice(0, 14)}
                  </p>
                </div>
              </div>

              <p className="trader-cv-passport-watermark">
                AURA TERMINAL™
              </p>
            </div>
          </div>
        </div>

        <div className="trader-cv-passport-actions">
          <button
            type="button"
            className="trader-cv-passport-btn trader-cv-passport-btn--primary"
            disabled={passportBusy}
            onClick={handleSavePassport}
          >
            {passportBusy ? 'Workingâ€¦' : 'Save image'}
          </button>
          <button
            type="button"
            className="trader-cv-passport-btn trader-cv-passport-btn--secondary"
            disabled={passportBusy}
            onClick={handleSharePassportToCommunity}
          >
            Share via Community
          </button>
        </div>
      </section>
    </div>
  );
}
