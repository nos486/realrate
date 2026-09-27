// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { useFeature } from '../../../web/src/shared/features/useFeature.js';
import { Feature } from '../../../web/src/shared/features/Feature.jsx';
import { BetaBadge } from '../../../web/src/shared/features/BetaBadge.jsx';

const mockUseAuth = vi.fn();
vi.mock('../../../web/src/features/auth/index.js', () => ({
  useAuth: () => mockUseAuth(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useFeature hook & Feature component', () => {
  function TestConsumer({ featureKey }) {
    const enabled = useFeature(featureKey);
    return <div data-testid="status">{enabled ? 'ENABLED' : 'DISABLED'}</div>;
  }

  it('useFeature returns true when feature key is in user.features', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'admin_1', role: 'admin', features: ['cheque_scan'] },
    });

    render(<TestConsumer featureKey="cheque_scan" />);
    expect(screen.getByTestId('status').textContent).toBe('ENABLED');
  });

  it('useFeature returns false when feature key is not in user.features', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user_1', role: 'user', features: [] },
    });

    render(<TestConsumer featureKey="cheque_scan" />);
    expect(screen.getByTestId('status').textContent).toBe('DISABLED');
  });

  it('useFeature returns false when user is null', () => {
    mockUseAuth.mockReturnValue({ user: null });

    render(<TestConsumer featureKey="cheque_scan" />);
    expect(screen.getByTestId('status').textContent).toBe('DISABLED');
  });

  it('Feature component renders children only when feature is enabled', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'admin_1', role: 'admin', features: ['cheque_scan'] },
    });

    const { rerender } = render(
      <Feature name="cheque_scan" fallback={<div>FALLBACK</div>}>
        <div>FEATURE_CONTENT</div>
      </Feature>
    );

    expect(screen.getByText('FEATURE_CONTENT')).toBeDefined();
    expect(screen.queryByText('FALLBACK')).toBeNull();

    // Now change user to regular user
    mockUseAuth.mockReturnValue({
      user: { id: 'user_1', role: 'user', features: [] },
    });

    rerender(
      <Feature name="cheque_scan" fallback={<div>FALLBACK</div>}>
        <div>FEATURE_CONTENT</div>
      </Feature>
    );

    expect(screen.queryByText('FEATURE_CONTENT')).toBeNull();
    expect(screen.getByText('FALLBACK')).toBeDefined();
  });

  it('BetaBadge renders proper text and class', () => {
    const { container } = render(<BetaBadge className="custom-beta" />);
    const badge = container.querySelector('.beta-badge');
    expect(badge).toBeDefined();
    expect(badge.textContent).toBe('بتا');
    expect(badge.className).toContain('custom-beta');
  });
});
