// @vitest-environment happy-dom
/**
 * appSettingsView.test.jsx — the Android app's settings page: SMS reading and fingerprint
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';

const plugin = vi.hoisted(() => ({
  read: vi.fn(async () => ({ messages: [] })),
  checkPermissions: vi.fn(async () => ({ sms: 'prompt' })),
  requestPermissions: vi.fn(async () => ({ sms: 'granted' })),
}));
const biometric = vi.hoisted(() => ({
  isAvailable: vi.fn(async () => ({ available: true })),
  has: vi.fn(async () => ({ stored: false })),
  store: vi.fn(),
  retrieve: vi.fn(),
  clear: vi.fn(),
}));
vi.mock('../../../web/src/shared/native/nativeApp.js', () => ({ isNativeApp: () => true }));
vi.mock('../../../web/src/shared/native/nativePlugins.js', () => ({ BankSms: plugin, BiometricVault: biometric }));
vi.mock('../../../web/src/shared/vault/useVault.js', () => ({ useVault: () => ({ status: 'locked', userId: 'usr_1' }) }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('../../../web/src/shared/ui/FeedbackProvider.jsx', () => ({ useFeedback: () => ({ toast }) }));

import AppSettingsView from '../../../web/src/features/app-settings/AppSettingsView.jsx';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('AppSettingsView', () => {
  it('shows the banks read and their senders', () => {
    render(<AppSettingsView />);
    expect(screen.getByText('پیامک‌های بانکی')).toBeTruthy();
    // Parsian and its Ewano card send from the same number
    expect(screen.getAllByText(/PARSIANBANK/)).toHaveLength(2);
    expect(screen.getByText(/اوانو/)).toBeTruthy();
  });

  it('«ثبت سریع» is off until turned on', () => {
    render(<AppSettingsView />);
    const toggle = screen.getByLabelText('دکمه‌ی ثبت سریع');
    expect(toggle.checked).toBe(false);
    fireEvent.click(toggle);
    expect(JSON.parse(localStorage.getItem('realrate_sms_settings')).quickRecord).toBe(true);
  });

  it('turning on automatic reading asks for the permission', async () => {
    render(<AppSettingsView />);
    fireEvent.click(screen.getByLabelText('خواندن خودکار پیامک'));
    await waitFor(() => expect(JSON.parse(localStorage.getItem('realrate_sms_settings')).auto).toBe(true));
  });

  it('the fingerprint needs the vault unlocked first', async () => {
    render(<AppSettingsView />);
    await waitFor(() => expect(screen.getByText(/ابتدا اطلاعات رمزنگاری‌شده را با رمز عبور باز کنید/)).toBeTruthy());
    expect(screen.getByLabelText('باز کردن با اثر انگشت').disabled).toBe(true);
  });
});
