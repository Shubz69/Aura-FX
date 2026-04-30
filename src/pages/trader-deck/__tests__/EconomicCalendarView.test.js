import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, act } from '@testing-library/react';
import EconomicCalendarView from '../EconomicCalendarView';
import Api from '../../../services/Api';

jest.mock('../../../services/Api', () => ({
  __esModule: true,
  default: {
    getTraderDeckEconomicCalendar: jest.fn(),
  },
}));

const mockApi = Api;

async function flushCalendarEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function makeEvent(overrides = {}) {
  const base = Date.UTC(2030, 0, 15, 15, 0, 0);
  return {
    timestamp: base + 6 * 60 * 1000,
    date: '2030-01-15',
    time: '10:00 AM',
    currency: 'USD',
    impact: 'high',
    event: 'Mock Release',
    actual: null,
    forecast: '1.0',
    previous: '0.5',
    ...overrides,
  };
}

describe('EconomicCalendarView', () => {
  beforeEach(() => {
    mockApi.getTraderDeckEconomicCalendar.mockReset();
    jest.useFakeTimers();
    jest.setSystemTime(new Date(Date.UTC(2030, 0, 15, 14, 55, 0)));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('advances countdown locally without extra calendar API calls', async () => {
    const ev = makeEvent();
    mockApi.getTraderDeckEconomicCalendar.mockResolvedValue({
      data: { events: [ev], fetchedAt: new Date().toISOString() },
    });
    render(<EconomicCalendarView />);
    await flushCalendarEffects();
    expect(screen.getByText('Mock Release')).toBeInTheDocument();
    expect(mockApi.getTraderDeckEconomicCalendar).toHaveBeenCalledTimes(1);
    const cd = document.querySelector('.ec-countdown');
    expect(cd).toBeTruthy();
    const t0 = cd.textContent;
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(cd.textContent).not.toBe(t0);
    expect(mockApi.getTraderDeckEconomicCalendar).toHaveBeenCalledTimes(1);
  });

  it('refreshes actual after hot poll with refresh', async () => {
    const ts = Date.now() + 2 * 60 * 1000;
    mockApi.getTraderDeckEconomicCalendar
      .mockResolvedValueOnce({
        data: {
          events: [{ ...makeEvent(), timestamp: ts, actual: null }],
          fetchedAt: new Date().toISOString(),
        },
      })
      .mockResolvedValueOnce({
        data: {
          events: [{ ...makeEvent(), timestamp: ts, actual: '1.23' }],
          fetchedAt: new Date().toISOString(),
        },
      });
    render(<EconomicCalendarView />);
    await flushCalendarEffects();
    expect(screen.getByText('Mock Release')).toBeInTheDocument();
    await act(async () => {
      jest.advanceTimersByTime(45 * 1000 + 200);
    });
    await flushCalendarEffects();
    expect(screen.getByTitle('Actual')).toBeInTheDocument();
    expect(screen.getByTitle('Actual').textContent).toContain('1.23');
    const withRefresh = mockApi.getTraderDeckEconomicCalendar.mock.calls.some((c) => c[1] === true);
    expect(withRefresh).toBe(true);
  });

  it('does not poll while tab is hidden', async () => {
    const ts = Date.now() + 2 * 60 * 1000;
    mockApi.getTraderDeckEconomicCalendar.mockResolvedValue({
      data: { events: [{ ...makeEvent(), timestamp: ts }], fetchedAt: new Date().toISOString() },
    });
    render(<EconomicCalendarView />);
    await flushCalendarEffects();
    const n = mockApi.getTraderDeckEconomicCalendar.mock.calls.length;
    await act(async () => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await act(async () => {
      jest.advanceTimersByTime(45 * 1000 + 1000);
    });
    expect(mockApi.getTraderDeckEconomicCalendar.mock.calls.length).toBe(n);
    await act(async () => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await flushCalendarEffects();
    expect(mockApi.getTraderDeckEconomicCalendar.mock.calls.length).toBeGreaterThan(n);
  });

  it('stops hot interval pacing after actual appears (switches to cool)', async () => {
    const ts = Date.now() + 2 * 60 * 1000;
    mockApi.getTraderDeckEconomicCalendar
      .mockResolvedValueOnce({
        data: {
          events: [{ ...makeEvent(), timestamp: ts, actual: null }],
          fetchedAt: new Date().toISOString(),
        },
      })
      .mockResolvedValue({
        data: {
          events: [{ ...makeEvent(), timestamp: ts, actual: '2' }],
          fetchedAt: new Date().toISOString(),
        },
      });
    render(<EconomicCalendarView />);
    await flushCalendarEffects();
    await act(async () => {
      jest.advanceTimersByTime(45 * 1000 + 500);
    });
    await flushCalendarEffects();
    expect(mockApi.getTraderDeckEconomicCalendar.mock.calls.length).toBeGreaterThanOrEqual(2);
    const afterActual = mockApi.getTraderDeckEconomicCalendar.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(45 * 1000 + 500);
    });
    await flushCalendarEffects();
    expect(mockApi.getTraderDeckEconomicCalendar.mock.calls.length).toBe(afterActual);
  });
});
