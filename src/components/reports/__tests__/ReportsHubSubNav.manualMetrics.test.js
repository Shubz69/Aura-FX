import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ReportsHubSubNav from '../ReportsHubSubNav';

describe('ReportsHubSubNav (Performance & DNA)', () => {
  it('shows only Monthly report and DNA — Manual metrics moved to /manual-metrics', () => {
    render(
      <MemoryRouter initialEntries={['/reports']}>
        <ReportsHubSubNav role="elite" year={2026} month={4} />
      </MemoryRouter>
    );

    expect(screen.getByRole('navigation', { name: /performance and dna sections/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /monthly report/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /^dna$/i })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /manual metrics/i })).toBeNull();
  });

  it('same two tabs for premium role', () => {
    render(
      <MemoryRouter>
        <ReportsHubSubNav role="premium" year={2026} month={4} />
      </MemoryRouter>
    );
    expect(screen.queryByRole('link', { name: /manual metrics/i })).toBeNull();
  });
});
