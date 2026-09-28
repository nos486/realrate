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
  it('asks for the SMS permission and reads the chosen days', async () => {
    render(<AppSettingsView />);
    expect(screen.getByText('پیامک‌های بانکی')).toBeTruthy();
    expect(screen.getByText(/PARSIANBANK/)).toBeTruthy();
    fireEvent.click(screen.getByText('بخوان'));
    await waitFor(() => expect(plugin.read).toHaveBeenCalled());
    expect(plugin.requestPermissions).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalled();
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
