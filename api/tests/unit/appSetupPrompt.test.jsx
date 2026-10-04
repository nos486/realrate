// @vitest-environment happy-dom
/**
 * appSetupPrompt.test.jsx — Right after installing the Android app: a sheet offers bank SMS and
 * the fingerprint; «فعال کن» sends both requests in turn; shown once per user
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

const native = vi.hoisted(() => ({ app: true, permission: 'prompt', auto: false, bioAvailable: true, bioEnabled: false, calls: [] }));

vi.mock('../../../web/src/shared/native/nativeApp.js', () => ({ isNativeApp: () => native.app }));
vi.mock('../../../web/src/shared/native/smsInbox.js', () => ({
  smsPermission: async () => native.permission,
  getSmsSettings: () => ({ auto: native.auto }),
  enableSmsReading: async () => { native.calls.push('sms'); native.permission = 'granted'; native.auto = true; return { permission: 'granted' }; },
}));
vi.mock('../../../web/src/shared/native/biometricUnlock.js', () => ({
  isBiometricAvailable: async () => native.bioAvailable,
  isBiometricEnabled: async () => native.bioEnabled,
  enableBiometric: async () => { native.calls.push('fingerprint'); native.bioEnabled = true; },
}));
vi.mock('../../../web/src/features/auth/index.js', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../../../web/src/shared/features/useFeature.js', () => ({ useFeature: () => true }));
vi.mock('../../../web/src/shared/vault/useVault.js', () => ({ useVault: () => ({ status: 'unlocked' }) }));
vi.mock('../../../web/src/shared/ui/FeedbackProvider.jsx', () => ({ useFeedback: () => ({ toast: { success: vi.fn(), error: vi.fn() } }) }));

import AppSetupPrompt from '../../../web/src/shared/app/AppSetupPrompt.jsx';

const flush = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });

beforeEach(() => {
  Object.assign(native, { app: true, permission: 'prompt', auto: false, bioAvailable: true, bioEnabled: false, calls: [] });
  localStorage.clear();
});
afterEach(cleanup);

describe('AppSetupPrompt', () => {
  it('offers both, and «فعال کن» asks for SMS, then the fingerprint', async () => {
    render(<AppSetupPrompt />);
    await flush();
    expect(screen.getByText('خواندن پیامک‌های بانک')).toBeTruthy();
    expect(screen.getByText('باز کردن با اثر انگشت')).toBeTruthy();
    fireEvent.click(screen.getByText('فعال کن'));
    await flush();
    expect(native.calls).toEqual(['sms', 'fingerprint']);
    expect(screen.queryByText('راه‌اندازی اپ')).toBeNull();
    expect(localStorage.getItem('realrate_app_setup_done:u1')).toBe('1');
  });

  it('shown once: «بعداً» closes it for good', async () => {
    const first = render(<AppSetupPrompt />);
    await flush();
    fireEvent.click(screen.getByText('بعداً'));
    first.unmount();
    render(<AppSetupPrompt />);
    await flush();
    expect(screen.queryByText('راه‌اندازی اپ')).toBeNull();
    expect(native.calls).toEqual([]);
  });

  it('only what is missing; nothing when all is on, and never on the website', async () => {
    native.bioEnabled = true;
    const one = render(<AppSetupPrompt />);
    await flush();
    expect(screen.queryByText('باز کردن با اثر انگشت')).toBeNull();
    expect(screen.getByText('خواندن پیامک‌های بانک')).toBeTruthy();
    one.unmount();

    localStorage.clear();
    Object.assign(native, { permission: 'granted', auto: true });
    const none = render(<AppSetupPrompt />);
    await flush();
    expect(screen.queryByText('راه‌اندازی اپ')).toBeNull();
    none.unmount();

    localStorage.clear();
    Object.assign(native, { app: false, permission: 'prompt', bioEnabled: false });
    render(<AppSetupPrompt />);
    await flush();
    expect(screen.queryByText('راه‌اندازی اپ')).toBeNull();
  });
});
