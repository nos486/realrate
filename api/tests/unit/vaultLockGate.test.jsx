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
let status = 'locked';
vi.mock('../../../web/src/features/auth/index.js', () => ({
  useAuth: () => ({ user: { email: 'a@b.c', hasPassword: true }, logout }),
}));
vi.mock('../../../web/src/features/demo/index.js', () => ({ useDemo: () => ({ isDemo: false }) }));
vi.mock('../../../web/src/shared/vault/useVault.js', () => ({ useVault: () => ({ status }) }));
vi.mock('../../../web/src/shared/vault/VaultUnlockCard.jsx', () => ({
  default: ({ onForgot }) => <button onClick={onForgot}>forgot</button>,
}));
vi.mock('../../../web/src/shared/vault/VaultResetSection.jsx', () => ({
  default: () => <div>reset-section</div>,
}));

import VaultLockGate from '../../../web/src/shared/vault/VaultLockGate.jsx';

afterEach(cleanup);

describe('VaultLockGate', () => {
  it('mounts the app only once the vault is known and open', () => {
    for (const s of ['idle', 'loading', 'locked']) {
      status = s;
      render(<MemoryRouter><VaultLockGate><p>app</p></VaultLockGate></MemoryRouter>);
      expect(screen.queryByText('app')).toBeNull();
      cleanup();
    }
    status = 'unlocked';
    render(<MemoryRouter><VaultLockGate><p>app</p></VaultLockGate></MemoryRouter>);
    expect(screen.getByText('app')).toBeTruthy();
  });


  it('shows the reset only after "forgot" and keeps sign-out reachable', () => {
    status = 'locked';
    render(<MemoryRouter><VaultLockGate><p>app</p></VaultLockGate></MemoryRouter>);
    expect(screen.queryByText('reset-section')).toBeNull();
    fireEvent.click(screen.getByText('forgot'));
    expect(screen.getByText('reset-section')).toBeTruthy();
    fireEvent.click(screen.getByText('خروج از حساب'));
    expect(logout).toHaveBeenCalled();
  });
});
