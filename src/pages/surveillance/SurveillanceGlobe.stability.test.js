import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import SurveillanceGlobe from './SurveillanceGlobe';

let latestProps = null;

jest.mock('react-globe.gl', () => {
  const ReactLib = require('react');
  return ReactLib.forwardRef(function MockGlobe(props, _ref) {
    latestProps = props;
    return <div data-testid="mock-globe" />;
  });
});

beforeAll(() => {
  global.ResizeObserver =
    global.ResizeObserver ||
    class {
      observe() {}
      disconnect() {}
    };
});

const sampleEvents = [
  {
    id: 'evt-1',
    title: 'Port disruption',
    summary: 'Shipping delays',
    event_type: 'maritime',
    rank_score: 80,
    severity: 4,
    lat: 1.2,
    lng: 103.8,
    tags: ['live_track'],
  },
  {
    id: 'evt-2',
    title: 'Airspace alert',
    summary: 'Flight reroutes',
    event_type: 'aviation',
    rank_score: 72,
    severity: 3,
    lat: 50.9,
    lng: 1.4,
    tags: ['flight'],
  },
];

test('hover marker does not remove markers from pointsData', async () => {
  render(<SurveillanceGlobe events={sampleEvents} activeCategory="all" selectedId={null} />);
  await waitFor(() => expect(latestProps).toBeTruthy());
  const before = latestProps.pointsData.length;
  const firstPoint = latestProps.pointsData[0];
  await act(async () => {
    latestProps.onPointHover(firstPoint);
  });
  const after = latestProps.pointsData.length;
  expect(after).toBe(before);
  expect(latestProps.pointsData.find((p) => String(p.eventId) === String(firstPoint.eventId))).toBeTruthy();
});

test('click marker emits select event for persistent panel flow', async () => {
  const onSelectEvent = jest.fn();
  render(<SurveillanceGlobe events={sampleEvents} activeCategory="all" selectedId={null} onSelectEvent={onSelectEvent} />);
  const firstPoint = latestProps.pointsData[0];
  await act(async () => {
    latestProps.onPointClick(firstPoint);
  });
  expect(onSelectEvent).toHaveBeenCalledWith(firstPoint.eventId);
});

test('changing category does not blank globe when markers exist', () => {
  const { rerender } = render(<SurveillanceGlobe events={sampleEvents} activeCategory="all" selectedId={null} />);
  expect(latestProps.pointsData.length).toBeGreaterThan(0);
  rerender(<SurveillanceGlobe events={sampleEvents} activeCategory="conflict" selectedId={null} />);
  expect(latestProps.pointsData.length).toBeGreaterThan(0);
});
