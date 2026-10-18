// @vitest-environment happy-dom
/**
 * dashboardClockCalendar.test.jsx — The clock and calendar widgets of the home page: the clock
 * shows today's date, the calendar a Shamsi month whose days can be picked
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../web/src/features/goals/hooks/useGoals.js', () => ({ useGoals: () => ({ goals: [{ id: 'g1', name: 'Car', targetDate: new Date().toISOString().slice(0, 10) }], vaultLocked: false }) }));
vi.mock('../../../web/src/features/goals/hooks/useGoalProgress.js', () => ({ useGoalProgress: () => ({ progressOf: () => ({ reached: false }) }) }));

import ClockWidget from '../../../web/src/features/dashboard/widgets/ClockWidget.jsx';
import CalendarWidget from '../../../web/src/features/dashboard/widgets/CalendarWidget.jsx';

afterEach(cleanup);

describe('the clock widget', () => {
  it('shows the time and today\'s date', () => {
    const { container } = render(<ClockWidget widget={{ config: {} }} />);
    expect(container.querySelector('time')?.textContent).toMatch(/[\d۰-۹]{2}:[\d۰-۹]{2}/);
    expect(container.querySelector('.dash-clock-date')?.textContent).toBeTruthy();
  });
});

describe('the calendar widget', () => {
  const view = () => render(<MemoryRouter><CalendarWidget widget={{ config: {} }} /></MemoryRouter>);

  it('draws the month with a dot on a day a goal falls due', () => {
    const { container } = view();
    expect(container.querySelectorAll('.dash-cal-day').length).toBeGreaterThanOrEqual(29);
    expect(container.querySelectorAll('.dash-cal-dot.is-goal').length).toBeGreaterThan(0);
  });

  it('lists the month\'s events, or one picked day\'s', () => {
    const { container } = view();
    expect(screen.getAllByText('Car').length).toBeGreaterThan(0);
    const marked = container.querySelector('.dash-cal-day.has-events');
    fireEvent.click(marked);
    expect(marked.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getAllByText('Car').length).toBeGreaterThan(0);
  });
});

describe('the calendar agenda style', () => {
  it('lists the coming events day by day instead of a month grid', () => {
    const { container } = render(<MemoryRouter><CalendarWidget widget={{ config: { style: 'agenda' } }} /></MemoryRouter>);
    expect(container.querySelector('.dash-cal-grid')).toBeNull();
    expect(screen.getAllByText('Car').length).toBeGreaterThan(0);
  });

  it('marks only the kinds the user chose', () => {
    const { container } = render(<MemoryRouter><CalendarWidget widget={{ config: { kinds: ['loan'] } }} /></MemoryRouter>);
    expect(container.querySelectorAll('.dash-cal-dot.is-goal')).toHaveLength(0);
  });
});

describe('the favorite rates widget', () => {
  it('always draws four tiles, the unchosen ones empty', async () => {
    vi.resetModules();
    vi.doMock('../../../web/src/features/market/context/PricingContext.jsx', () => ({ usePricing: () => ({ itemMap: {} }) }));
    const { default: RateListWidget } = await import('../../../web/src/features/dashboard/widgets/RateListWidget.jsx');
    const { container } = render(<RateListWidget widget={{ config: { assetIds: ['usd'] } }} editing={false} />);
    expect(container.querySelectorAll('.dash-rate-tile')).toHaveLength(4);
    expect(container.querySelectorAll('.dash-rate-tile.is-empty')).toHaveLength(4);
    expect(container.querySelector('.dash-rate-list.is-grid')).toBeTruthy();
  });

  it('draws rows in the list style', async () => {
    vi.resetModules();
    vi.doMock('../../../web/src/features/market/context/PricingContext.jsx', () => ({ usePricing: () => ({ itemMap: {} }) }));
    const { default: RateListWidget } = await import('../../../web/src/features/dashboard/widgets/RateListWidget.jsx');
    const { container } = render(<RateListWidget widget={{ config: { style: 'list', assetIds: [] } }} editing={false} />);
    expect(container.querySelector('.dash-rate-list.is-list')).toBeTruthy();
  });
});
