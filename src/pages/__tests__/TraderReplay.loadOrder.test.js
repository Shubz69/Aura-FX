import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TraderReplay from '../TraderReplay';
import Api from '../../services/Api';
import { buildCsvReplayTradeId, buildReplayTradeUrl } from '../../lib/trader-replay/replayLink';
const mockTradeReplayChart = jest.fn(() => <div data-testid="trade-replay-chart">chart</div>);

jest.mock('../../context/AuraAnalysisContext', () => ({
  useAuraAnalysisData: () => ({ activePlatformId: 'csv' }),
}));

jest.mock('../../components/TraderSuiteShell', () => ({ children, title }) => (
  <div>
    <h1>{title}</h1>
    {children}
  </div>
));

jest.mock('../../components/trader-replay/TradeReplayChart', () => (props) => mockTradeReplayChart(props));

jest.mock('../../components/operator-intelligence/CandleIntelligencePanel', () => () => null);

jest.mock('../../services/Api', () => ({
  __esModule: true,
  default: {
    getTraderReplayTrades: jest.fn(),
    getTraderReplayTrade: jest.fn(),
    getTraderReplayCandles: jest.fn(),
    getTraderReplayAnalysis: jest.fn(),
  },
}));

const mockApi = Api;

describe('TraderReplay load order and Aura-style deep link', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTradeReplayChart.mockClear();
  });

  it('does not request candles until trade fetch has resolved', async () => {
    let resolveTrade;
    mockApi.getTraderReplayTrades.mockResolvedValue({
      data: { trades: [{ id: 'csv:2026-4-0', symbol: 'EURUSD', source: 'csv', openTime: '2026-01-01T09:00:00Z' }] },
    });
    mockApi.getTraderReplayTrade.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTrade = resolve;
        })
    );
    mockApi.getTraderReplayCandles.mockResolvedValue({ data: { bars: [] } });
    mockApi.getTraderReplayAnalysis.mockResolvedValue({ data: { analysis: null } });

    const rid = buildCsvReplayTradeId(2026, 4, 0);
    render(
      <MemoryRouter initialEntries={[buildReplayTradeUrl(rid)]}>
        <Routes>
          <Route path="/aura-analysis/dashboard/trader-replay" element={<TraderReplay />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(mockApi.getTraderReplayTrade).toHaveBeenCalledWith('csv:2026-4-0'));
    expect(mockApi.getTraderReplayCandles).not.toHaveBeenCalled();

    resolveTrade({
      data: {
        trade: {
          replayId: 'csv:2026-4-0',
          source: 'csv',
          symbol: 'EURUSD',
          direction: 'buy',
          openTime: '2026-01-01T09:00:00Z',
          closeTime: '2026-01-01T10:00:00Z',
          entry: 1.1,
          exit: 1.11,
          stopLoss: null,
          takeProfit: null,
          lotSize: 0.1,
          pnl: 10,
        },
      },
    });

    await waitFor(() => expect(mockApi.getTraderReplayCandles).toHaveBeenCalled());
    expect(mockApi.getTraderReplayCandles.mock.calls[0][0]).toEqual(
      expect.objectContaining({ tradeId: 'csv:2026-4-0' })
    );
  });

  it('uses heuristic analysis when analysis endpoint fails', async () => {
    mockApi.getTraderReplayTrades.mockResolvedValue({ data: { trades: [] } });
    mockApi.getTraderReplayTrade.mockResolvedValue({
      data: {
        trade: {
          replayId: 'mt5:9',
          source: 'mt5',
          symbol: 'GBPUSD',
          direction: 'sell',
          openTime: '2026-01-02T09:00:00Z',
          closeTime: '2026-01-02T10:00:00Z',
          entry: 1.25,
          exit: 1.248,
          stopLoss: 1.26,
          takeProfit: null,
          lotSize: 0.2,
          pnl: -5,
        },
      },
    });
    mockApi.getTraderReplayCandles.mockResolvedValue({ data: { bars: [{ time: 1700000000, open: 1, high: 2, low: 1, close: 1.5 }] } });
    mockApi.getTraderReplayAnalysis.mockRejectedValue(new Error('network'));

    render(
      <MemoryRouter initialEntries={['/aura-analysis/dashboard/trader-replay?tradeId=mt5%3A9']}>
        <Routes>
          <Route path="/aura-analysis/dashboard/trader-replay" element={<TraderReplay />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(mockApi.getTraderReplayAnalysis).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/Good/i)).toBeTruthy());
  });

  it('does not auto-reset chart centering during playback ticks', async () => {
    jest.useFakeTimers();
    mockApi.getTraderReplayTrades.mockResolvedValue({
      data: { trades: [{ id: 'mt5:10', symbol: 'EURUSD', source: 'mt5', openTime: '2026-01-01T09:00:00Z' }] },
    });
    mockApi.getTraderReplayTrade.mockResolvedValue({
      data: {
        trade: {
          replayId: 'mt5:10',
          source: 'mt5',
          symbol: 'EURUSD',
          direction: 'buy',
          openTime: '2026-01-01T09:00:00Z',
          closeTime: '2026-01-01T10:00:00Z',
          entry: 1.1,
          exit: 1.11,
          lotSize: 0.2,
          pnl: 20,
        },
      },
    });
    mockApi.getTraderReplayCandles.mockResolvedValue({
      data: { bars: Array.from({ length: 200 }).map((_, i) => ({ time: 1700000000 + i * 60, open: 1, high: 2, low: 1, close: 1.5 })) },
    });
    mockApi.getTraderReplayAnalysis.mockResolvedValue({ data: { analysis: { strengths: ['ok'] } } });
    render(
      <MemoryRouter initialEntries={['/aura-analysis/dashboard/trader-replay?tradeId=mt5%3A10']}>
        <Routes>
          <Route path="/aura-analysis/dashboard/trader-replay" element={<TraderReplay />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(mockTradeReplayChart).toHaveBeenCalled());
    const before = mockTradeReplayChart.mock.calls.at(-1)[0].recenterKey;
    fireEvent.click(screen.getByRole('button', { name: /^Play$/i }));
    jest.advanceTimersByTime(2800);
    await waitFor(() => {
      const after = mockTradeReplayChart.mock.calls.at(-1)[0].recenterKey;
      expect(after).toBe(before);
    });
    jest.useRealTimers();
  });
});
