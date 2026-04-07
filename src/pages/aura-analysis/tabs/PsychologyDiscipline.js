import React, { memo } from 'react';
import { useAuraAnalysisData, useAuraAnalysisMetrics } from '../../../context/AuraAnalysisContext';
import { fmtPct, fmtNum, fmtDuration } from '../../../lib/aura-analysis/analytics';
import AuraAnalysisEmptyState from '../../../components/aura-analysis/AuraAnalysisEmptyState';
import { AuraPnlHistogram, AuraHourOfDayStrip, AuraWeekdayHourHeatmap } from '../../../components/aura-analysis/AuraPerformanceCharts';
import { useAuraPerfSection, useIdleDeferredReady, useInViewOnce } from '../auraTabPerf';
import '../../../styles/aura-analysis/AuraShared.css';

function Ring({ score, label, color }) {
  const r = 40;
  const circ = 2 * Math.PI * r;
  const filled = circ * Math.min(score / 100, 1);
  return (
    <div style={{ position: 'relative', width: 92, height: 92, flexShrink: 0 }}>
      <svg width="92" height="92" viewBox="0 0 92 92" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="46" cy="46" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
        <circle cx="46" cy="46" r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={`${filled} ${circ}`} strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <span style={{ fontSize: '1.05rem', fontWeight: 800, color, lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: '0.52rem', fontWeight: 700, color: 'rgba(255,255,255,0.32)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>{label}</span>
      </div>
    </div>
  );
}

/**
 * Behavioral analytics from MT history — mirrors journal-style metrics (TradeZella-adjacent)
 * without requiring manual mood tags.
 */
const PsychologyDisciplineMain = memo(function PsychologyDisciplineMain() {
  const { analytics: a, analyticsDataKey } = useAuraAnalysisMetrics();
  useAuraPerfSection('PsychologyDiscipline.main');
  const deferHeavy = useIdleDeferredReady(analyticsDataKey || '');
  const [coachRef, coachVis] = useInViewOnce({ rootMargin: '200px' });

  const disciplineScore = Math.max(0, Math.min(100, Math.round(
    100
    - Math.min(a.revengeStyleRate * 0.9, 35)
    - Math.min(Math.max(0, a.behaviorVolatilityScore - 35), 30)
    - (a.oversizedTradeCount > 0 ? Math.min(a.oversizedTradeCount * 4, 20) : 0)
    - (a.pctWithSL < 70 ? 15 : 0)
  )));

  const discColor = disciplineScore >= 70 ? '#f8c37d' : disciplineScore >= 45 ? '#c9a05c' : '#9a8f84';

  return (
    <div className="aa-page">

      <div className="aa-card aa-card--accent" style={{ marginBottom: 16, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <Ring score={disciplineScore} label="Discipline" color={discColor} />
          <Ring score={a.behaviorVolatilityScore} label="Volatility" color={a.behaviorVolatilityScore < 45 ? '#f8c37d' : '#c49b7c'} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: discColor, marginBottom: 6 }}>Behaviour profile</div>
          <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.52)', lineHeight: 1.65, margin: 0 }}>
            These scores use your actual closes: quick re-entries after losses, P/L variance vs mean, oversized lots vs your own average,
            and stop usage. They approximate what proprietary journals surface as “psychology” without manual journaling.
          </p>
        </div>
      </div>

      <div className="aa-grid-4" style={{ marginBottom: 16 }}>
        {[
          { label: 'Revenge-style rate', value: fmtPct(a.revengeStyleRate), cls: a.revengeStyleRate > 25 ? 'aa--red' : 'aa--green', sub: 'Loss → trade ≤5m' },
          { label: 'Lot CV (consistency)', value: a.lotSizeCv > 0 ? fmtNum(a.lotSizeCv, 2) : '—', cls: a.lotSizeCv > 0.45 ? 'aa--amber' : '', sub: 'Lower = calmer sizing' },
          { label: 'Oversized trades', value: String(a.oversizedTradeCount), cls: a.oversizedTradeCount > 0 ? 'aa--amber' : '', sub: '&gt; μ + 2σ lots' },
          { label: 'Max loss run ($)', value: a.maxConsecLossSum > 0 ? '-$' + fmtNum(a.maxConsecLossSum) : '—', cls: 'aa--red', sub: 'Consecutive closes' },
          { label: 'Win / loss hold', value: a.avgWinDurationMs > 0 && a.avgLossDurationMs > 0 ? fmtDuration(a.avgWinDurationMs) + ' / ' + fmtDuration(a.avgLossDurationMs) : '—', cls: a.avgLossDurationMs > a.avgWinDurationMs * 1.25 ? 'aa--amber' : '', sub: 'Avg duration' },
          { label: 'Largest win % GP', value: a.largestWinPctOfGross > 0 ? fmtPct(a.largestWinPctOfGross) : '—', cls: a.largestWinPctOfGross > 45 ? 'aa--amber' : '', sub: 'Hope vs process' },
          { label: 'Concentration', value: fmtPct(a.topSymbolConcentrationPct), cls: a.topSymbolConcentrationPct > 55 ? 'aa--amber' : '', sub: 'Trades in top symbol' },
          { label: 'Streak (current)', value: a.currentStreak > 0 ? `${a.currentStreak} ${a.streakType}` : '—', cls: a.streakType === 'loss' ? 'aa--red' : a.streakType === 'win' ? 'aa--green' : '' },
          { label: 'Mistake cost', value: (a.institutional?.behavioural?.mistakeCost?.totalMistakeCost ?? 0) > 0 ? `-$${fmtNum(a.institutional.behavioural.mistakeCost.totalMistakeCost)}` : '—', cls: 'aa--amber', sub: 'SL + revenge tail' },
          { label: 'Loss clusters', value: String(a.institutional?.behavioural?.mistakeClustering?.lossBurstClusters ?? '—'), cls: '', sub: '≥3 losses' },
        ].map(({ label, value, sub, cls }) => (
          <div key={label} className="aa-kpi">
            <span className="aa-kpi-label">{label}</span>
            <span className={`aa-kpi-value ${cls || ''}`}>{value}</span>
            {sub && <span className="aa-kpi-sub">{sub}</span>}
          </div>
        ))}
      </div>

      <div className="aa-grid-2" style={{ marginBottom: 16 }}>
        <div className="aa-card">
          <div className="aa-section-title">Impulse timing (UTC)</div>
          <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.38)', margin: '0 0 10px', lineHeight: 1.5 }}>
            Hours with abnormal activity after red days often correlate with rule breaks — compare against your revenge-rate.
          </p>
          {deferHeavy ? (
            <AuraHourOfDayStrip byHourUtc={a.byHourUtc} />
          ) : (
            <div className="aa-skeleton" style={{ height: 64, borderRadius: 8 }} aria-hidden />
          )}
        </div>
        <div className="aa-card">
          <div className="aa-section-title">Emotional outcome spread</div>
          {deferHeavy ? (
            <AuraPnlHistogram bins={a.pnlHistogram} height={128} />
          ) : (
            <div className="aa-skeleton aa-skeleton-chart" style={{ height: 128 }} aria-hidden />
          )}
        </div>
      </div>

      {a.institutional?.behavioural?.weekdayHourBehaviour?.grid?.length > 0 && (
        <div className="aa-card" style={{ marginBottom: 16 }}>
          {deferHeavy ? (
            <AuraWeekdayHourHeatmap behaviour={a.institutional.behavioural.weekdayHourBehaviour} height={168} />
          ) : (
            <div className="aa-skeleton aa-skeleton-chart" style={{ height: 168 }} aria-hidden />
          )}
        </div>
      )}

      <div className="aa-card" ref={coachRef}>
        <div className="aa-section-title-lg" style={{ marginBottom: 12 }}>
          <span className="aa-title-dot" />
          Automated coaching notes
        </div>
        {!coachVis ? (
          <div className="aa-skeleton" style={{ minHeight: 120, borderRadius: 10 }} aria-hidden />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {a.revengeStyleRate >= 20 && (
            <div className="aa-warning">
              <i className="fas fa-bolt aa-warning-icon" style={{ color: '#c9a05c' }} />
              {fmtPct(a.revengeStyleRate)} of setups follow a loss within five minutes — pause after red closes.
            </div>
          )}
          {a.avgLossDurationMs > a.avgWinDurationMs * 1.3 && a.avgWinDurationMs > 0 && (
            <div className="aa-warning aa-warning--red">
              <i className="fas fa-hourglass-half aa-warning-icon" style={{ color: '#9a8f84' }} />
              Losers run longer than winners — classic “hope” behaviour; define max hold or BE rules.
            </div>
          )}
          {a.oversizedTradeCount > 0 && (
            <div className="aa-warning">
              <i className="fas fa-weight-hanging aa-warning-icon" style={{ color: '#c9a05c' }} />
              {a.oversizedTradeCount} trades used far larger size than your norm — tilt often shows up in leverage first.
            </div>
          )}
          {a.largestWinPctOfGross > 50 && (
            <div className="aa-insight">
              <div className="aa-insight-dot" />
              One winner drove {fmtPct(a.largestWinPctOfGross)} of gross profit — journal whether repeats are repeatable.
            </div>
          )}
          {disciplineScore >= 75 && (
            <div className="aa-insight">
              <div className="aa-insight-dot" style={{ background: '#f8c37d' }} />
              Behavioural metrics look stable — keep the rules that produced this sample.
            </div>
          )}
          {a.insights.slice(0, 4).map((txt, i) => (
            <div key={i} className="aa-insight">
              <div className="aa-insight-dot" />
              <span>{txt}</span>
            </div>
          ))}
          </div>
        )}
      </div>

    </div>
  );
});

export default function PsychologyDiscipline() {
  const { trades, loading, error, activePlatformId, connections } = useAuraAnalysisData();
  const needsConnection = !connections?.length || !activePlatformId;

  if (loading) {
    return (
      <div className="aa-page">
        <div className="aa-grid-3" style={{ marginBottom: 12 }}>{[...Array(3)].map((_, i) => <div key={i} className="aa-skeleton aa-skeleton-kpi" />)}</div>
        <div className="aa-skeleton aa-skeleton-chart" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="aa-page">
        <div className="aa-error"><i className="fas fa-exclamation-circle aa-error-icon" />{error}</div>
      </div>
    );
  }

  if (!trades.length) {
    return (
      <div className="aa-page">
        <AuraAnalysisEmptyState
          icon="mt5"
          variant={needsConnection ? 'connect' : 'data'}
          title={needsConnection ? 'Connect for behavioural analytics' : 'No trades in this period'}
          description={
            needsConnection
              ? 'Link MetaTrader from the Connection Hub to score discipline, revenge-style entries, and sizing consistency from your history.'
              : 'Psychology metrics are derived from closed trades in the selected range.'
          }
        />
      </div>
    );
  }

  return <PsychologyDisciplineMain />;
}
