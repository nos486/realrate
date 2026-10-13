// @vitest-environment happy-dom
/**
 * deleteAccountSection.test.jsx — Account settings: deleting the account needs the typed phrase
 * (and the password when the account has one), then signs the user out; hidden for admin and demo.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const state = vi.hoisted(() => ({ user: null, demo: false, logout: vi.fn(), deleteAccount: vi.fn() }));
vi.mock('../../../web/src/features/auth/context/AuthContext.jsx', () => ({
  useAuth: () => ({ user: state.user, logout: state.logout }),
}));
vi.mock('../../../web/src/features/demo/index.js', () => ({ useDemo: () => ({ isDemo: state.demo }) }));
vi.mock('../../../web/src/shared/ui/FeedbackProvider.jsx', () => ({ useFeedback: () => ({ toast: { success: vi.fn(), error: vi.fn() } }) }));
vi.mock('../../../web/src/features/auth/api/authApi.js', () => ({ deleteAccount: (...a) => state.deleteAccount(...a) }));

import DeleteAccountSection, { ACCOUNT_DELETE_PHRASE } from '../../../web/src/features/auth/components/DeleteAccountSection.jsx';

beforeEach(() => {
  cleanup();
  state.user = { id: 'u1', hasPassword: false, isAdmin: false };
  state.demo = false;
  state.logout = vi.fn(async () => {});
  state.deleteAccount = vi.fn(async () => ({ success: true }));
});

describe('DeleteAccountSection', () => {
  it('deletes after the phrase is typed, then signs out', async () => {
    render(<DeleteAccountSection />);
    fireEvent.click(screen.getByText('حذف حساب و همه اطلاعات'));
    const submit = screen.getByText('حذف همیشگی حساب').closest('button');
    expect(submit.disabled).toBe(true);
    fireEvent.change(document.getElementById('delete-account-phrase'), { target: { value: ACCOUNT_DELETE_PHRASE } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(state.logout).toHaveBeenCalled());
    expect(state.deleteAccount).toHaveBeenCalledWith({ password: undefined });
  });

  it('asks for the password when the account has one', async () => {
    state.user = { id: 'u1', hasPassword: true };
    render(<DeleteAccountSection />);
    fireEvent.click(screen.getByText('حذف حساب و همه اطلاعات'));
    fireEvent.change(document.getElementById('delete-account-phrase'), { target: { value: ACCOUNT_DELETE_PHRASE } });
    expect(screen.getByText('حذف همیشگی حساب').closest('button').disabled).toBe(true);
    fireEvent.change(document.getElementById('delete-account-password'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByText('حذف همیشگی حساب').closest('button'));
    await waitFor(() => expect(state.deleteAccount).toHaveBeenCalledWith({ password: 'secret123' }));
  });

  it('stays signed in and shows the error when the server refuses', async () => {
    state.deleteAccount = vi.fn(async () => { throw new Error('رمز عبور حساب نادرست است.'); });
    render(<DeleteAccountSection />);
    fireEvent.click(screen.getByText('حذف حساب و همه اطلاعات'));
    fireEvent.change(document.getElementById('delete-account-phrase'), { target: { value: ACCOUNT_DELETE_PHRASE } });
    fireEvent.click(screen.getByText('حذف همیشگی حساب').closest('button'));
    await screen.findByText('رمز عبور حساب نادرست است.');
    expect(state.logout).not.toHaveBeenCalled();
  });

  it('is hidden for admins and the demo account', () => {
    state.user = { id: 'a', isAdmin: true };
    const { container, rerender } = render(<DeleteAccountSection />);
    expect(container.innerHTML).toBe('');
    state.user = { id: 'u1' };
    state.demo = true;
    rerender(<DeleteAccountSection />);
    expect(container.innerHTML).toBe('');
  });
});
