// @vitest-environment happy-dom
/**
 * vaultUnlockCard.test.jsx — In the Android app the fingerprint prompt opens by itself each time
 * the app comes back to the foreground while locked, once per return (no loop after closing it)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const unlockWithBiometric = vi.fn(async () => false);
vi.mock('../../../web/src/shared/native/biometricUnlock.js', () => ({
  biometricLabel: () => 'fingerprint',
  isBiometricEnabled: async () => true,
  unlockWithBiometric: (...args) => unlockWithBiometric(...args),
}));
vi.mock('../../../web/src/shared/native/nativeApp.js', () => ({ isNativeApp: () => true }));
vi.mock('../../../web/src/shared/vault/vaultStore.js', () => ({ unlockVault: async () => true }));
vi.mock('../../../web/src/shared/ui/FeedbackProvider.jsx', () => ({ useFeedback: () => ({ toast: { error: vi.fn() } }) }));
vi.mock('../../../web/src/features/portfolio/components/VaultLockCard.jsx', () => ({
  default: ({ extraAction }) => <div>{extraAction}</div>,
}));

import VaultUnlockCard, { resetBiometricAutoPrompt } from '../../../web/src/shared/vault/VaultUnlockCard.jsx';

let hidden = false;
function setHidden(value) {
  hidden = value;
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

beforeEach(() => {
  hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  resetBiometricAutoPrompt();
  unlockWithBiometric.mockClear();
});
afterEach(cleanup);

const renderCard = () => render(<MemoryRouter><VaultUnlockCard /></MemoryRouter>);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

describe('VaultUnlockCard automatic fingerprint prompt', () => {
  it('asks once when the lock screen appears, not again on another mount in the same stay', async () => {
    renderCard();
    await waitFor(() => expect(unlockWithBiometric).toHaveBeenCalledTimes(1));
    cleanup();
    renderCard();
    await wait(20);
    expect(unlockWithBiometric).toHaveBeenCalledTimes(1);
  });

  it('asks again each time the app returns from the background while locked', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      renderCard();
      await waitFor(() => expect(unlockWithBiometric).toHaveBeenCalledTimes(1));
      vi.setSystemTime(Date.now() + 10_000);
      setHidden(true);
      setHidden(false);
      await waitFor(() => expect(unlockWithBiometric).toHaveBeenCalledTimes(2));
      // Showing the page again without a trip to the background does not ask
      setHidden(false);
      await wait(20);
      expect(unlockWithBiometric).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits for the return when it locked in the background', async () => {
    hidden = true;
    renderCard();
    await wait(20);
    expect(unlockWithBiometric).not.toHaveBeenCalled();
    setHidden(false);
    await waitFor(() => expect(unlockWithBiometric).toHaveBeenCalledTimes(1));
  });

  it('does not reopen when the fingerprint dialog itself hid and showed the page', async () => {
    renderCard();
    await waitFor(() => expect(unlockWithBiometric).toHaveBeenCalledTimes(1));
    await wait(5);
    // The closed dialog's own hide/show right after it was cancelled
    setHidden(true);
    setHidden(false);
    await wait(20);
    expect(unlockWithBiometric).toHaveBeenCalledTimes(1);
  });
});
