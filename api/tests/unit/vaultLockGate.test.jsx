// @vitest-environment happy-dom
/**
 * vaultLockGate.test.jsx — A locked vault shows the single lock screen with sign-out and the
 * forgotten-passphrase reset, instead of each section asking separately
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const logout = vi.fn();
vi.mock('../../../web/src/features/auth/index.js', () => ({
  useAuth: () => ({ user: { email: 'a@b.c', hasPassword: true }, logout }),
}));
vi.mock('../../../web/src/shared/vault/VaultUnlockCard.jsx', () => ({
  default: ({ onForgot }) => <button onClick={onForgot}>forgot</button>,
}));
vi.mock('../../../web/src/shared/vault/VaultResetSection.jsx', () => ({
  default: () => <div>reset-section</div>,
}));

import VaultLockGate from '../../../web/src/shared/vault/VaultLockGate.jsx';

afterEach(cleanup);

describe('VaultLockGate', () => {
  it('shows the reset only after "forgot" and keeps sign-out reachable', () => {
    render(<MemoryRouter><VaultLockGate /></MemoryRouter>);
    expect(screen.queryByText('reset-section')).toBeNull();
    fireEvent.click(screen.getByText('forgot'));
    expect(screen.getByText('reset-section')).toBeTruthy();
    fireEvent.click(screen.getByText('خروج از حساب'));
    expect(logout).toHaveBeenCalled();
  });
});
