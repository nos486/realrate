// @vitest-environment happy-dom
/**
 * proPage.test.jsx — The Free/Pro comparison page and the free plan's note on a section
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const auth = vi.hoisted(() => ({ user: { groups: [] } }));
vi.mock('../../../web/src/features/auth/index.js', () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock('../../../web/src/shared/api/httpClient.js', () => ({
  httpClient: { get: vi.fn(async () => ({ usage: { entries: { used: 12, limit: 30, period: 'month' }, cheques: { used: 0, limit: 0, period: 'total' } } })) },
}));
vi.mock('../../../web/src/shared/features/FeatureOffer.jsx', () => ({ default: () => <div>درخواست Pro</div> }));

import ProPage from '../../../web/src/features/pro/ProPage.jsx';
import PlanNote from '../../../web/src/shared/plan/PlanNote.jsx';

afterEach(cleanup);

describe('Pro page', () => {
  it('compares the plans and offers the request to a free user', () => {
    auth.user = { groups: [] };
    render(<ProPage />);
    expect(screen.getByText('هزینه و درآمد')).toBeTruthy();
    expect(screen.getByText('درخواست Pro')).toBeTruthy();
  });

  it('does not offer the request to a Pro user', () => {
    auth.user = { groups: ['pro'] };
    render(<ProPage />);
    expect(screen.queryByText('درخواست Pro')).toBeNull();
  });
});

describe('plan note', () => {
  it('shows the usage of the section to a free user', async () => {
    auth.user = { groups: [] };
    render(<MemoryRouter><PlanNote section="expenses" /></MemoryRouter>);
    expect(await screen.findByText(/۱۲ از ۳۰ در این ماه/)).toBeTruthy();
  });

  it('shows nothing on Pro', () => {
    auth.user = { groups: ['pro'] };
    const { container } = render(<MemoryRouter><PlanNote section="expenses" /></MemoryRouter>);
    expect(container.textContent).toBe('');
  });
});

import PlanBadge from '../../../web/src/shared/plan/PlanBadge.jsx';
import PlanHomeCard from '../../../web/src/shared/plan/PlanHomeCard.jsx';

describe('free plan badge and home card', () => {
  it('shows «رایگان» and the plan card to a free user, nothing on Pro', async () => {
    auth.user = { groups: [] };
    render(<MemoryRouter><PlanBadge /><PlanHomeCard /></MemoryRouter>);
    expect(screen.getByText('رایگان')).toBeTruthy();
    expect(await screen.findByText(/هزینه و درآمد: ۱۲ از ۳۰ در این ماه/)).toBeTruthy();
    cleanup();
    auth.user = { groups: ['pro'] };
    const { container } = render(<MemoryRouter><PlanBadge /><PlanHomeCard /></MemoryRouter>);
    expect(container.textContent).toBe('');
  });
});
