import React, { useCallback, useEffect, useState } from 'react';
import AuraTerminalThemeShell from '../components/AuraTerminalThemeShell';
import AuraPulseBar from '../components/operator-intelligence/AuraPulseBar';
import LiveMarketView from '../components/operator-intelligence/LiveMarketView';
import CandleIntelligencePanel from '../components/operator-intelligence/CandleIntelligencePanel';
import OperatorBiasEngine from '../components/operator-intelligence/OperatorBiasEngine';
import MarketDriversPanel from '../components/operator-intelligence/MarketDriversPanel';
import MarketIntelligenceFeed from '../components/operator-intelligence/MarketIntelligenceFeed';
import MarketImpactCalendar from '../components/operator-intelligence/MarketImpactCalendar';
import ActionSummaryCard from '../components/operator-intelligence/ActionSummaryCard';
import OperatorWatchlists from '../components/operator-intelligence/OperatorWatchlists';
import MarketWatchPanel from '../components/operator-intelligence/MarketWatchPanel';
import { fetchOperatorIntelligencePageBundle } from '../services/operatorIntelligenceAdapter';
import { DEFAULT_TERMINAL_CHART_SYMBOL } from '../data/terminalInstruments';
import '../styles/operator-intelligence/OperatorIntelligencePage.css';

/**
 * Operator Intelligence — fast decision layer (mock data via adapter).
 */
export default function OperatorIntelligencePage() {
  const [bundle, setBundle] = useState(null);
  const [pageState, setPageState] = useState('loading');
  const [pageError, setPageError] = useState('');
  const [deskSymbol, setDeskSymbol] = useState(DEFAULT_TERMINAL_CHART_SYMBOL);
  const [candleOpen, setCandleOpen] = useState(false);
  const [selectedBar, setSelectedBar] = useState(null);

  const loading = pageState === 'loading';

  useEffect(() => {
    let cancelled = false;
    fetchOperatorIntelligencePageBundle()
      .then((b) => {
        if (cancelled) return;
        setBundle(b);
        setPageState('ready');
        setPageError('');
      })
      .catch((e) => {
        if (cancelled) return;
        setBundle(null);
        setPageState('error');
        setPageError(e?.message || 'Unable to load operator intelligence.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSelectCandle = useCallback((bar) => {
    setSelectedBar(bar);
    setCandleOpen(true);
  }, []);

  return (
    <AuraTerminalThemeShell bodyClassName="oi-terminal-body">
      <div className="oi-page">
        <header className="oi-hero">
          <div className="oi-hero__text">
            <p className="oi-eyebrow">Aurora Terminal</p>
            <h1 className="oi-title">Operator Intelligence</h1>
            <p className="oi-subtitle">
              Compress the tape into decisions: what is happening, why, and what to do now.
            </p>
          </div>
        </header>

        {pageState === 'error' ? (
          <div className="oi-banner oi-banner--error" role="alert">
            {pageError}
          </div>
        ) : null}

        <AuraPulseBar pulse={bundle?.pulse ?? null} loading={loading} />

        <div className="oi-layout">
          <aside className="oi-col oi-col--left">
            <MarketDriversPanel drivers={bundle?.drivers ?? null} loading={loading} />
            <OperatorBiasEngine bias={bundle?.bias ?? null} loading={loading} />
            <MarketWatchPanel seedRows={bundle?.marketWatch ?? null} loading={loading} />
          </aside>

          <section className="oi-col oi-col--center">
            <LiveMarketView
              symbol={deskSymbol}
              onSymbolChange={setDeskSymbol}
              onSelectCandle={onSelectCandle}
            />
            <MarketImpactCalendar rows={bundle?.calendar ?? null} loading={loading} />
          </section>

          <aside className="oi-col oi-col--right">
            <MarketIntelligenceFeed items={bundle?.feed ?? null} loading={loading} />
            <OperatorWatchlists watchlists={bundle?.watchlists ?? null} loading={loading} />
            <ActionSummaryCard summary={bundle?.actionSummary ?? null} loading={loading} />
          </aside>
        </div>
      </div>

      <CandleIntelligencePanel
        open={candleOpen}
        onClose={() => {
          setCandleOpen(false);
        }}
        bar={selectedBar}
        symbol={deskSymbol}
      />
    </AuraTerminalThemeShell>
  );
}
