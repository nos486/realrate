// @vitest-environment happy-dom
/**
 * storeBuildNotice.test.jsx — First sign-in on the store (nosms) build: a sheet says it is the lighter
 * version and links the GitHub build; once per user; never on the full build
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const native = vi.hoisted(() => ({ app: true, sms: false }));
vi.mock('../../../web/src/shared/native/nativeApp.js', () => ({ isNativeApp: () => native.app, smsEnabled: () => native.sms }));
vi.mock('../../../web/src/features/auth/index.js', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import StoreBuildNotice from '../../../web/src/shared/app/StoreBuildNotice.jsx';

beforeEach(() => {
  Object.assign(native, { app: true, sms: false });
  localStorage.clear();
});
afterEach(cleanup);

describe('StoreBuildNotice', () => {
  it('shows once on the store build, with the GitHub links', () => {
    const { unmount } = render(<StoreBuildNotice />);
    expect(screen.getByText(/نسخه‌ی گیت‌هاب را نصب کنید/)).toBeTruthy();
    expect(screen.getByText('github.com/nos486/realrate/releases/latest').getAttribute('href')).toBe('https://github.com/nos486/realrate/releases/latest');
    fireEvent.click(screen.getByText('متوجه شدم'));
    expect(screen.queryByText(/نسخه‌ی گیت‌هاب را نصب کنید/)).toBeNull();
    unmount();
    render(<StoreBuildNotice />);
    expect(screen.queryByText(/نسخه‌ی گیت‌هاب را نصب کنید/)).toBeNull();
  });

  it('is not shown on the full build', () => {
    native.sms = true;
    render(<StoreBuildNotice />);
    expect(screen.queryByText(/نسخه‌ی گیت‌هاب را نصب کنید/)).toBeNull();
  });
});
