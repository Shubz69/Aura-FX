import React from 'react';

function ProgressRing({ pct }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="tdna-nr-ring" style={{ '--p': p }}>
      <span className="tdna-nr-ring-val">{p}%</span>
      <span className="tdna-nr-ring-lbl">data window</span>
    </div>
  );
}

export default function TraderDnaNotReady({ dna, afterIntro = false }) {
  const { status, statusMessage, progress, cooldown } = dna || {};
  const rem = cooldown?.remaining;
  const eligible = status === 'READY_FIRST_GENERATION' || status === 'READY_TO_GENERATE';

  return (
    <div className={`tdna-nr ${afterIntro ? 'tdna-nr--reveal' : ''}`}>
      <div className="tdna-nr-aurora" aria-hidden />
      <div className="tdna-nr-inner">
        <p className="tdna-nr-kicker">
          {status === 'COOLDOWN' ? 'DNA cycle active' : eligible ? 'Eligibility confirmed' : 'DNA formation'}
        </p>
        <h2 className="tdna-nr-title">
          {status === 'COOLDOWN'
            ? 'Your Trader DNA is sealed for this cycle'
            : eligible
              ? 'You are cleared for synthesis'
              : status === 'INSUFFICIENT_FOR_NEXT_CYCLE'
                ? 'Your DNA is still forming'
                : 'Trader DNA requires more signal'}
        </h2>
        <p className="tdna-nr-msg">
          {statusMessage?.trim()
            ? statusMessage
            : 'Trader DNA is not available yet. Keep validating trades and journaling until the minimum data window is met, then return here.'}
        </p>

        {rem?.label && (
          <div className="tdna-nr-countdown">
            <span className="tdna-nr-countdown-label">Next synthesis window</span>
            <span className="tdna-nr-countdown-value">{rem.label}</span>
            {rem.nextAvailableOn && (
              <span className="tdna-nr-countdown-date">
                {new Date(rem.nextAvailableOn).toLocaleString(undefined, {
                  dateStyle: 'long',
                  timeStyle: 'short',
                })}
              </span>
            )}
          </div>
        )}

        {progress && (
          <div className="tdna-nr-metrics">
            <ProgressRing pct={progress.dataProgressPercent} />
            <div className="tdna-nr-stat-grid">
              <div className="tdna-nr-stat">
                <span className="tdna-nr-stat-val">{progress.closedTradeCount}</span>
                <span className="tdna-nr-stat-lbl">closed trades ({progress.minClosedTrades} min)</span>
              </div>
              <div className="tdna-nr-stat">
                <span className="tdna-nr-stat-val">{progress.distinctTradeDays}</span>
                <span className="tdna-nr-stat-lbl">distinct days ({progress.minDistinctTradeDays} min)</span>
              </div>
              <div className="tdna-nr-stat">
                <span className="tdna-nr-stat-val">{progress.calendarSpanDays}d</span>
                <span className="tdna-nr-stat-lbl">span ({progress.minCalendarSpanDays}d min)</span>
              </div>
              <div className="tdna-nr-stat">
                <span className="tdna-nr-stat-val">{progress.journalDaysLogged}</span>
                <span className="tdna-nr-stat-lbl">journal days ({progress.minJournalDays} min)</span>
              </div>
            </div>
          </div>
        )}

        <p className="tdna-nr-hint">
          Continue journaling, validating trades in Trade Validator, and logging outcomes. Trader DNA refreshes on a strict{' '}
          {dna?.cycleDays || 90}-day cadence once eligibility is met.
        </p>
      </div>
    </div>
  );
}
