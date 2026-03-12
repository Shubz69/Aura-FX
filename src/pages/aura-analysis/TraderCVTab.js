import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import Api from '../../services/Api';
import { calculateAuraxScore, getAuraxRankTitle } from '../../lib/aura-analysis/trader-cv/auraxScoreCalculator';
import { computeBehaviourBreakdown } from '../../lib/aura-analysis/trader-cv/behaviourAnalytics';
import { getAverageTradeQuality } from '../../lib/aura-analysis/trader-cv/tradeQualityCalculator';
import { computeStreaks, getRankTitle } from '../../lib/aura-analysis/trader-cv/streakEngine';
import { getBestConditions, getReviewSummary, getMonthlyReviewStats } from '../../lib/aura-analysis/trader-cv/traderInsightsEngine';
import '../../styles/aura-analysis/TraderCV.css';

const MIN_TRADES_FOR_FULL = 5;

function formatStreak(value) {
  const n = typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  return `${n}d`;
}

export default function TraderCVTab() {
  const { user } = useAuth();
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      Api.getAuraAnalysisTrades({}).catch(() => ({ data: { trades: [] } })),
    ])
      .then(([tradesRes]) => {
        if (cancelled) return;
        const list = tradesRes.data?.trades ?? [];
        setTrades(Array.isArray(list) ? list : []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load data');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

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
    return sorted[0]?.label ?? '—';
  }, [breakdown]);

  const weakestTrait = useMemo(() => {
    const arr = [
      { key: 'riskDiscipline', label: 'Risk discipline' },
      { key: 'ruleAdherence', label: 'Rule adherence' },
      { key: 'consistency', label: 'Consistency' },
      { key: 'emotionalControl', label: 'Emotional control' },
    ];
    const sorted = [...arr].sort((a, b) => (breakdown[a.key] ?? 0) - (breakdown[b.key] ?? 0));
    return sorted[0]?.label ?? '—';
  }, [breakdown]);

  if (loading) {
    return (
      <div className="trader-cv">
        <div className="trader-cv-loading">
          <div className="trader-cv-loading-ring" aria-hidden />
          <p>Loading your Trader CV…</p>
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
              <p className="trader-cv-breakdown-message">{behaviour.messages?.[key] ?? '—'}</p>
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
              Trend: {quality.trend === 'up' ? '↑ Improving' : quality.trend === 'down' ? '↓ Review process' : '→ Stable'}
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

      {/* Best Conditions */}
      <section className="trader-cv-section">
        <h3 className="trader-cv-section-title">Where You Perform Best</h3>
        {!conditions.hasData ? (
          <div className="trader-cv-empty">More trade data is needed to identify your strongest conditions.</div>
        ) : (
          <div className="trader-cv-conditions-grid">
            <div className="trader-cv-condition"><span className="trader-cv-condition-label">Best day</span><span className="trader-cv-condition-value">{conditions.bestDay ?? '—'}</span></div>
            <div className="trader-cv-condition"><span className="trader-cv-condition-label">Worst day</span><span className="trader-cv-condition-value">{conditions.worstDay ?? '—'}</span></div>
            <div className="trader-cv-condition"><span className="trader-cv-condition-label">Best session</span><span className="trader-cv-condition-value">{conditions.bestSession ?? '—'}</span></div>
            <div className="trader-cv-condition"><span className="trader-cv-condition-label">Weakest period</span><span className="trader-cv-condition-value">{conditions.worstSession ?? '—'}</span></div>
            <div className="trader-cv-condition"><span className="trader-cv-condition-label">Best pair</span><span className="trader-cv-condition-value">{conditions.bestPair ?? '—'}</span></div>
            <div className="trader-cv-condition"><span className="trader-cv-condition-label">Worst pair</span><span className="trader-cv-condition-value">{conditions.worstPair ?? '—'}</span></div>
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

      {/* Development timeline – simplified trend */}
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
    </div>
  );
}
