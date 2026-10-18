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

describe('the calendar day card', () => {
  it('has a card on a marked day saying what is due, and none on a free day', () => {
    const { container } = render(<MemoryRouter><CalendarWidget widget={{ config: {} }} /></MemoryRouter>);
    const marked = container.querySelector('.dash-cal-day.has-events').closest('.dash-cal-cell');
    expect(marked.querySelector('.dash-cal-tip')?.textContent).toContain('Car');
    const free = [...container.querySelectorAll('.dash-cal-cell')].find((cell) => !cell.querySelector('.has-events'));
    expect(free.querySelector('.dash-cal-tip')).toBeNull();
  });

  it('lists what each marker means', () => {
    const { container } = render(<MemoryRouter><CalendarWidget widget={{ config: { kinds: ['loan', 'goal'] } }} /></MemoryRouter>);
    expect(container.querySelectorAll('.dash-cal-legend li')).toHaveLength(3); // the two kinds and «تمام‌شده»
  });
});

describe('the calendar\'s past days', () => {
  it('marks a reached goal as finished with a grey marker', () => {
    const { container } = render(<MemoryRouter><CalendarWidget widget={{ height: 4, config: {} }} /></MemoryRouter>);
    expect(container.querySelector('.dash-cal-legend .dash-cal-dot.is-done')).toBeTruthy();
  });
});

describe('the calendar at each height', () => {
  const at = (height) => render(<MemoryRouter><CalendarWidget widget={{ height, config: {} }} /></MemoryRouter>).container;

  it('shows everything at 600px: month, legend and the list', () => {
    const c = at(4);
    expect(c.querySelector('.dash-cal-legend')).toBeTruthy();
    expect(c.querySelector('.dash-cal-agenda')).toBeTruthy();
    expect(c.querySelector('.dash-cal.is-cozy')).toBeNull();
  });

  it('shows the month alone at 300px', () => {
    const c = at(2);
    expect(c.querySelectorAll('.dash-cal-day').length).toBeGreaterThanOrEqual(29);
    expect(c.querySelector('.dash-cal.is-cozy')).toBeTruthy();
    expect(c.querySelector('.dash-cal-legend')).toBeNull();
    expect(c.querySelector('.dash-cal-agenda')).toBeNull();
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
  const book = {
    usd: { id: 'usd', name: 'دلار', price: 100000, changePercent: 1.5, category: 'currency', unit: 'تومان', params: {} },
    gold: { id: 'gold', name: 'طلا', price: 5000000, changePercent: -0.5, category: 'gold', unit: 'گرم', stale: true, params: {} },
  };
  const draw = async (config, editing = false, onConfigure) => {
    vi.resetModules();
    vi.doMock('../../../web/src/features/market/context/PricingContext.jsx', () => ({ usePricing: () => ({ itemMap: book }) }));
    const { default: RateListWidget } = await import('../../../web/src/features/dashboard/widgets/RateListWidget.jsx');
    return render(<RateListWidget widget={{ config }} editing={editing} onConfigure={onConfigure} />).container;
  };

  it('draws a tile per chosen asset with its price, unit and a coloured change', async () => {
    const c = await draw({ assetIds: ['usd', 'gold'] });
    expect(c.querySelectorAll('.dash-rate-tile')).toHaveLength(2);
    expect(c.querySelector('.dash-rate-list').dataset.count).toBe('2');
    expect(c.querySelector('.dash-rate-change.is-up')).toBeTruthy();
    expect(c.querySelector('.dash-rate-change.is-down')).toBeTruthy();
    expect(c.querySelector('.home-stale-mark')).toBeTruthy();
    expect(c.querySelector('.dash-rate-list.is-grid')).toBeTruthy();
  });

  it('hides the change on request', async () => {
    const c = await draw({ assetIds: ['usd'], change: false });
    expect(c.querySelector('.dash-rate-change')).toBeNull();
  });

  it('shows free slots only while arranging, and asks for assets when there are none', async () => {
    expect((await draw({ assetIds: ['usd'] })).querySelectorAll('.dash-rate-tile.is-empty')).toHaveLength(0);
    cleanup();
    const onConfigure = vi.fn();
    const c = await draw({ assetIds: ['usd'] }, true, onConfigure);
    expect(c.querySelectorAll('.dash-rate-tile.is-empty')).toHaveLength(3);
    cleanup();
    const empty = await draw({ assetIds: [] });
    expect(empty.querySelector('.dash-rate-list')).toBeNull();
  });

  it('draws rows in the list style', async () => {
    const c = await draw({ style: 'list', assetIds: ['usd'] });
    expect(c.querySelector('.dash-rate-list.is-list')).toBeTruthy();
  });
});

describe('the calendar\'s look', () => {
  it('shows the Gregorian span, a Gregorian day under each day and the picked day in both calendars', () => {
    const { container } = render(<MemoryRouter><CalendarWidget widget={{ height: 4, config: {} }} /></MemoryRouter>);
    expect(container.querySelector('.dash-cal-title small')?.textContent).toMatch(/\d{1,2} \w{3} - \d{1,2} \w{3} \d{4}/);
    expect(container.querySelectorAll('.dash-cal-greg').length).toBeGreaterThanOrEqual(29);
    const before = container.querySelector('.dash-cal-selected')?.textContent;
    expect(before).toContain('میلادی');
    fireEvent.click([...container.querySelectorAll('.dash-cal-day:not(.is-today)')].pop());
    expect(container.querySelector('.dash-cal-selected')?.textContent).not.toBe(before);
  });
});
