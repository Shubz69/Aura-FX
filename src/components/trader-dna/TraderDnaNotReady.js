import React from 'react';
import { Link } from 'react-router-dom';

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
  const { status, statusMessage, progress, cooldown, qualificationGaps, analysisWindowDays, dataLookbackDays } =
    dna || {};
  const rem = cooldown?.remaining;
  const eligible = status === 'READY_FIRST_GENERATION' || status === 'READY_TO_GENERATE';
  const gaps = Array.isArray(qualificationGaps) ? qualificationGaps : [];

  const titleForStatus = () => {
    if (status === 'DATA_LOAD_FAILED') return 'We could not reach your data';
    if (status === 'COOLDOWN') return 'Your Trader DNA is sealed for this cycle';
    if (eligible) return 'You are cleared for synthesis';
    if (status === 'INSUFFICIENT_FOR_NEXT_CYCLE') return 'Your DNA is still forming';
    return 'Trader DNA requires more data';
  };

  const kickerForStatus = () => {
    if (status === 'DATA_LOAD_FAILED') return 'Connection / database';
    if (status === 'COOLDOWN') return 'DNA cycle active';
    if (eligible) return 'Eligibility confirmed';
    if (status === 'INSUFFICIENT_FOR_NEXT_CYCLE') return 'Next cycle open';
    return 'DNA formation';
  };

  const winDays = analysisWindowDays || progress?.analysisWindowDays || 90;
  const lookback = dataLookbackDays || 120;

  return (
    <div className={`tdna-nr ${afterIntro ? 'tdna-nr--reveal' : ''}`}>
      <div className="tdna-nr-aurora" aria-hidden />
      <div className="tdna-nr-inner">
        <p className="tdna-nr-kicker">{kickerForStatus()}</p>
        <h2 className="tdna-nr-title">{titleForStatus()}</h2>
        <p className="tdna-nr-msg">
          {statusMessage?.trim()
            ? statusMessage
            : 'Trader DNA is not available yet. Keep validating trades and journaling until the minimum data window is met, then return here.'}
        </p>

        {progress && status !== 'DATA_LOAD_FAILED' && dna?.dataHealth?.tradesOk !== false && (
          <div className="tdna-found-strip" role="status">
            <strong>What we found in your account</strong> (last ~{winDays} days for eligibility, up to {lookback} days
            loaded):{' '}
            {progress.totalTradesInWindow != null && (
              <>
                {progress.totalTradesInWindow} trade{progress.totalTradesInWindow !== 1 ? 's' : ''} in the DNA window
                {progress.pendingOutcomeTradesInWindow > 0
                  ? ` (${progress.pendingOutcomeTradesInWindow} still need a win/loss/breakeven outcome)`
                  : ''}
                .{' '}
              </>
            )}
            {progress.closedTradeCount != null && (
              <>
                {progress.closedTradeCount} closed (counted toward DNA).{' '}
              </>
            )}
            {progress.journalEntriesCounted != null && (
              <>
                {progress.journalEntriesCounted} journal entr{progress.journalEntriesCounted !== 1 ? 'ies' : 'y'} in the
                lookback.
              </>
            )}
          </div>
        )}

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

        {gaps.length > 0 && (
          <>
            <h3 className="tdna-nr-kicker" style={{ marginTop: 24, letterSpacing: '0.12em' }}>
              What is still needed
            </h3>
            <ul className="tdna-gap-list">
              {gaps.map((g) => (
                <li key={g.key} className="tdna-gap-item">
                  <p className="tdna-gap-title">{g.title}</p>
                  <p className="tdna-gap-meta">
                    {g.met} / {g.need} required
                  </p>
                  <p className="tdna-gap-detail">{g.detail}</p>
                  {g.hint && <p className="tdna-gap-hint">{g.hint}</p>}
                  {g.links?.length > 0 && (
                    <div className="tdna-gap-links">
                      {g.links.map((l) => (
                        <Link key={l.href} to={l.href} className="tdna-gap-link">
                          {l.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {progress && status !== 'DATA_LOAD_FAILED' && dna?.dataHealth?.tradesOk !== false && (
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

        {status === 'DATA_LOAD_FAILED' && (
          <div className="tdna-gap-links" style={{ marginTop: 16 }}>
            <Link to="/reports" className="tdna-gap-link">
              Back to Performance & DNA
            </Link>
          </div>
        )}

        <p className="tdna-nr-hint">
          Continue journaling, validating trades in Trade Validator, and logging outcomes. Trader DNA refreshes on a strict{' '}
          {dna?.cycleDays || 90}-day cadence once eligibility is met. Each successful run is saved to your profile in the
          database for that cycle.
        </p>
      </div>
    </div>
  );
}
