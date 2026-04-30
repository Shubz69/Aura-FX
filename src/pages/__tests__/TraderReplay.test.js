import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TraderReplay from '../TraderReplay';
import Api from '../../services/Api';
const mockTradeReplayChart = jest.fn(() => <div data-testid="trade-replay-chart">chart</div>);

jest.mock('../../context/AuraAnalysisContext', () => ({
  useAuraAnalysisData: () => ({ activePlatformId: 'mt5' }),
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

describe('TraderReplay page', () => {
  beforeEach(() => {
    mockTradeReplayChart.mockClear();
    mockApi.getTraderReplayTrades.mockResolvedValue({
      data: { trades: [{ id: 'mt5:1', symbol: 'EURUSD', source: 'mt5', openTime: '2026-01-01T09:00:00Z' }] },
    });
    mockApi.getTraderReplayTrade.mockResolvedValue({
      data: {
        trade: {
          replayId: 'mt5:1',
          source: 'mt5',
          symbol: 'EURUSD',
          direction: 'buy',
          openTime: '2026-01-01T09:00:00Z',
          closeTime: '2026-01-01T10:00:00Z',
          entry: 1.1,
          exit: 1.102,
          stopLoss: 1.095,
          takeProfit: 1.11,
          lotSize: 0.2,
          pnl: 40,
        },
      },
    });
    mockApi.getTraderReplayCandles.mockResolvedValue({
      data: { bars: [{ time: 1700000000, open: 1, high: 2, low: 1, close: 1.5 }] },
    });
    mockApi.getTraderReplayAnalysis.mockResolvedValue({
      data: { analysis: { strengths: ['good'], weaknesses: ['bad'], betterApproach: ['better'], nextTimeChecklist: ['next'], verdict: { entry: 'ok', exit: 'ok', risk: 'ok', timing: 'ok' } } },
    });
  });

  it('loads trade list and selected trade replay', async () => {
    render(
      <MemoryRouter initialEntries={['/aura-analysis/dashboard/trader-replay?tradeId=mt5%3A1']}>
        <Routes>
          <Route path="/aura-analysis/dashboard/trader-replay" element={<TraderReplay />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(mockApi.getTraderReplayTrades).toHaveBeenCalled());
    await waitFor(() => expect(mockApi.getTraderReplayTrade).toHaveBeenCalledWith('mt5:1'));
    expect(screen.getByText('Trader Replay')).toBeTruthy();
    await waitFor(() => expect(mockTradeReplayChart).toHaveBeenCalled());
    expect(screen.getByText(/AI trade review/i)).toBeTruthy();
    expect(screen.getByText(/Jump Entry/i)).toBeTruthy();
    expect(screen.getByText(/Jump Exit/i)).toBeTruthy();
    expect(screen.getByText(/Reset View/i)).toBeTruthy();
    await waitFor(() => {
      const props = mockTradeReplayChart.mock.calls.at(-1)?.[0];
      expect(props.recenterKey).toBeGreaterThan(0);
      expect(typeof props.recenterTargetTime).toBe('number');
    });
  });

  it('select button loads replay', async () => {
    render(
      <MemoryRouter initialEntries={['/aura-analysis/dashboard/trader-replay']}>
        <Routes>
          <Route path="/aura-analysis/dashboard/trader-replay" element={<TraderReplay />} />
        </Routes>
      </MemoryRouter>
    );
    const btn = await screen.findByRole('button', { name: /Replay/i });
    fireEvent.click(btn);
    await waitFor(() => expect(mockApi.getTraderReplayTrade).toHaveBeenCalled());
  });

  it('shows csv entry/exit warning when prices are missing', async () => {
    mockApi.getTraderReplayTrades.mockResolvedValue({
      data: { trades: [{ id: 'csv:2026-4-1', symbol: 'XAUUSD', source: 'csv', openTime: '2026-01-01T09:00:00Z' }] },
    });
    mockApi.getTraderReplayTrade.mockResolvedValue({
      data: {
        trade: {
          replayId: 'csv:2026-4-1',
          source: 'csv',
          symbol: 'XAUUSD',
          direction: 'buy',
          openTime: '2026-01-01T09:00:00Z',
          closeTime: '2026-01-01T10:00:00Z',
          entry: 0,
          exit: 0,
          stopLoss: null,
          takeProfit: null,
          lotSize: 0.1,
          pnl: 10,
        },
      },
    });
    render(
      <MemoryRouter initialEntries={['/aura-analysis/dashboard/trader-replay?tradeId=csv%3A2026-4-1']}>
        <Routes>
          <Route path="/aura-analysis/dashboard/trader-replay" element={<TraderReplay />} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText(/missing entry\/exit prices/i)).toBeTruthy();
  });
});
