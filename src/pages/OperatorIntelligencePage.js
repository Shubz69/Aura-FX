import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import {
  fetchOperatorIntelligencePageBundle,
  fetchIntelligenceFeed,
} from '../services/operatorIntelligenceAdapter';
import { DEFAULT_TERMINAL_CHART_SYMBOL } from '../data/terminalInstruments';
import '../styles/operator-intelligence/OperatorIntelligencePage.css';

/**
 * Operator Intelligence — fast decision layer (mock data via adapter).
 */
export default function OperatorIntelligencePage() {
  const { t } = useTranslation();
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
        setPageError(e?.message || t('operatorIntelligence.errors.loadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (pageState !== 'ready') return undefined;
    let cancelled = false;
    const refreshFeed = async (forceProvider) => {
      try {
        const rows = await fetchIntelligenceFeed({ refresh: forceProvider });
        if (!cancelled && Array.isArray(rows) && rows.length > 0) {
          setBundle((b) => (b ? { ...b, feed: rows } : null));
        }
      } catch {
        /* keep existing feed */
      }
    };
    const frequent = window.setInterval(() => refreshFeed(false), 120_000);
    const bustCache = window.setInterval(() => refreshFeed(true), 600_000);
    return () => {
      cancelled = true;
      window.clearInterval(frequent);
      window.clearInterval(bustCache);
    };
  }, [pageState]);

  const onSelectCandle = useCallback((bar) => {
    setSelectedBar(bar);
    setCandleOpen(true);
  }, []);

  return (
    <AuraTerminalThemeShell bodyClassName="oi-terminal-body">
      <div className="oi-page">
        <header className="oi-hero">
          <div className="oi-hero__text">
            <p className="oi-eyebrow">{t('operatorIntelligence.hero.eyebrow')}</p>
            <h1 className="oi-title">{t('operatorIntelligence.hero.title')}</h1>
            <p className="oi-subtitle">
              {t('operatorIntelligence.hero.subtitle')}
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
        interval={selectedBar?.interval || '60'}
      />
    </AuraTerminalThemeShell>
  );
}