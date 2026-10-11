// @vitest-environment happy-dom
/**
 * accountsContext.test.jsx — Screens under an AccountsProvider share one accounts list (one
 * download and decryption); outside one, useAccounts keeps its own.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, waitFor } from '@testing-library/react';

const getAccounts = vi.hoisted(() => vi.fn(async () => ({ accounts: [{ id: 'acc_1', name: 'ملت', type: 'bank' }] })));
vi.mock('../../../web/src/shared/vault/vaultAccounts.js', () => ({ getAccounts }));
const AUTH = vi.hoisted(() => ({ user: { id: 'u1' } }));
vi.mock('../../../web/src/features/auth/index.js', () => ({ useAuth: () => AUTH }));
const VAULT = vi.hoisted(() => ({ status: 'unlocked', epoch: 1 }));
vi.mock('../../../web/src/shared/vault/useVault.js', () => ({ useVault: () => VAULT }));
vi.mock('../../../web/src/shared/features/useFeature.js', () => ({ useFeature: () => true }));
vi.mock('../../../web/src/shared/refresh/pageRefresh.js', () => ({ useRefreshHandler: () => {} }));

import { useAccounts } from '../../../web/src/features/accounts/hooks/useAccounts.js';
import { AccountsProvider } from '../../../web/src/features/accounts/context/AccountsContext.jsx';

function Names({ id }) {
  const { accounts } = useAccounts();
  return <span data-testid={id}>{accounts.map((a) => a.name).join(',')}</span>;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AccountsProvider', () => {
  it('loads the list once for every screen under it', async () => {
    render(<AccountsProvider><Names id="a" /><Names id="b" /><Names id="c" /></AccountsProvider>);
    await waitFor(() => expect(screen.getByTestId('c').textContent).toBe('ملت'));
    expect(screen.getByTestId('a').textContent).toBe('ملت');
    expect(getAccounts).toHaveBeenCalledTimes(1);
  });

  it('keeps its own list outside a provider', async () => {
    render(<><Names id="a" /><Names id="b" /></>);
    await waitFor(() => expect(screen.getByTestId('b').textContent).toBe('ملت'));
    expect(getAccounts).toHaveBeenCalledTimes(2);
  });
});
