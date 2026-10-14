// @vitest-environment happy-dom
/**
 * appSettingsStoreBuild.test.jsx — the store (nosms) build's «درباره اپ»: shows the package name and
 * says SMS reading is in the GitHub build
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, waitFor } from '@testing-library/react';

vi.mock('@capacitor/app', () => ({ App: { getInfo: async () => ({ id: 'org.geekio.realrate', version: '1.0.9', build: '9' }) } }));
vi.mock('../../../web/src/shared/native/nativeApp.js', () => ({ isNativeApp: () => true, smsEnabled: () => false, selfUpdateEnabled: () => false }));
vi.mock('../../../web/src/shared/native/nativePlugins.js', () => ({
  BankSms: { checkPermissions: vi.fn(async () => ({ sms: 'denied' })) },
  BiometricVault: { isAvailable: vi.fn(async () => ({ available: false })), has: vi.fn(async () => ({ stored: false })) },
}));
vi.mock('../../../web/src/shared/vault/useVault.js', () => ({ useVault: () => ({ status: 'locked', userId: 'usr_1' }) }));
vi.mock('../../../web/src/shared/features/useFeature.js', () => ({ useFeature: () => true }));
vi.mock('../../../web/src/shared/ui/FeedbackProvider.jsx', () => ({ useFeedback: () => ({ toast: { success: vi.fn(), error: vi.fn() } }) }));

import AppSettingsView from '../../../web/src/features/app-settings/AppSettingsView.jsx';

afterEach(cleanup);

describe('AppSettingsView in the store build', () => {
  it('shows the package name and the GitHub-build note, and no SMS card', async () => {
    render(<AppSettingsView />);
    await waitFor(() => expect(screen.getByText('org.geekio.realrate')).toBeTruthy());
    expect(screen.getByText(/این نسخه بدون پیامک است/)).toBeTruthy();
    expect(screen.queryByText('پیامک‌های بانکی')).toBeNull();
  });
});
