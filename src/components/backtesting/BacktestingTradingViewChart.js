import React, { useCallback, useEffect, useMemo, useState } from 'react';
import TradingViewWidgetEmbed from '../TradingViewWidgetEmbed';
import { bridgeTimeframeToTvInterval, bridgeToTradingViewSymbol } from '../../lib/backtesting/tradingViewBridge';
import BacktestingChartPlaceholder from './BacktestingChartPlaceholder';

const TV_STUDIES = Object.freeze([]);

/**
 * TradingView embed for the backtesting chart stage (same tv.js pattern as TradingViewWidgetEmbed).
 * Consumes buildBacktestingChartBridgeState output; Aura remains authoritative for replay time (header + API).
 *
 * @param {object} props
 * @param {object} props.bridge — from buildBacktestingChartBridgeState
 * @param {object} props.session
 * @param {string} props.replayAtLabel
 */
export default function BacktestingTradingViewChart({ bridge, session, replayAtLabel }) {
  const [embedFailed, setEmbedFailed] = useState(false);
  const onError = useCallback(() => setEmbedFailed(true), []);

  const tvSymbol = useMemo(() => bridgeToTradingViewSymbol(bridge), [bridge]);
  const interval = useMemo(() => bridgeTimeframeToTvInterval(bridge?.timeframe), [bridge?.timeframe]);

  const readOnlyChart = session?.status === 'completed';

  useEffect(() => {
    setEmbedFailed(false);
  }, [bridge?.sessionId, tvSymbol, interval]);

  if (embedFailed) {
    return <BacktestingChartPlaceholder replayAtLabel={replayAtLabel} session={session} variant="embed-failed" />;
  }
  if (!tvSymbol || tvSymbol === '—') {
    return <BacktestingChartPlaceholder replayAtLabel={replayAtLabel} session={session} variant="no-feed" />;
  }

  return (
    <div className={`bt-chart-stage__tv-wrap${readOnlyChart ? ' bt-chart-stage__tv-wrap--archived' : ''}`}>
      <div className="bt-chart-stage__tv-frame">
        <TradingViewWidgetEmbed
          symbol={tvSymbol}
          interval={interval}
          height={420}
          theme="dark"
          studies={TV_STUDIES}
          allowSymbolChange={!readOnlyChart}
          onError={onError}
          className="bt-chart-stage__tv-embed"
        />
      </div>
      <p className="bt-chart-stage__provider-note">
        Market data for <strong>{tvSymbol}</strong> at {bridge?.timeframe || 'M15'} — simulated session time is in the header. Replay stepping
        updates Aura only; the widget does not follow historical replay bars.
      </p>
    </div>
  );
}
