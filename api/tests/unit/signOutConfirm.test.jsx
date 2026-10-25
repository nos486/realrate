// @vitest-environment happy-dom
/**
 * signOutConfirm.test.jsx — signing out from account settings asks first
 */
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';

const logout = vi.fn();
vi.mock('../../../web/src/features/auth/context/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'a@b.c' }, logout }),
}));

import { FeedbackProvider } from '../../../web/src/shared/ui/FeedbackProvider.jsx';
import SignOutSection from '../../../web/src/features/auth/components/SignOutSection.jsx';

const renderSection = () => render(<FeedbackProvider><SignOutSection /></FeedbackProvider>);

beforeEach(() => logout.mockReset());
afterEach(cleanup);

describe('SignOutSection', () => {
  it('does not sign out when the confirmation is cancelled', async () => {
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'خروج از حساب' }));
    fireEvent.click(await screen.findByRole('button', { name: 'انصراف' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'انصراف' })).toBeNull());
    expect(logout).not.toHaveBeenCalled();
  });

  it('signs out once the user confirms', async () => {
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'خروج از حساب' }));
    fireEvent.click(await screen.findByRole('button', { name: 'خروج' }));
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });
});
