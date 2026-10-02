// @vitest-environment happy-dom
/**
 * appSuggestBanner.test.jsx — on an Android phone's browser the site suggests the app (direct APK
 * download from GitHub); never inside the app or on other devices; «×» hides it for a while
 */
import React from 'react';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import AppSuggestBanner, { shouldSuggestApp, ANDROID_APK_URL } from '../../../web/src/shared/app/AppSuggestBanner.jsx';

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('app suggestion', () => {
  it('only on an Android browser, not inside the app', () => {
    expect(shouldSuggestApp({ userAgent: ANDROID, native: false })).toBe(true);
    expect(shouldSuggestApp({ userAgent: IPHONE, native: false })).toBe(false);
    expect(shouldSuggestApp({ userAgent: ANDROID, native: true })).toBe(false);
  });

  it('«×» hides it for two weeks', () => {
    const now = Date.now();
    localStorage.setItem('realrate_app_suggest_dismissed', String(now));
    expect(shouldSuggestApp({ userAgent: ANDROID, native: false, now: now + 86_400_000 })).toBe(false);
    expect(shouldSuggestApp({ userAgent: ANDROID, native: false, now: now + 15 * 86_400_000 })).toBe(true);
  });

  it('links the latest APK from GitHub and the install guide', () => {
    Object.defineProperty(navigator, 'userAgent', { value: ANDROID, configurable: true });
    render(<AppSuggestBanner />);
    expect(screen.getByText('دانلود اپ').closest('a').getAttribute('href')).toBe('https://github.com/nos486/realrate/releases/latest/download/realrate.apk');
    expect(ANDROID_APK_URL).toMatch(/releases\/latest\/download\/realrate\.apk$/);
    expect(screen.getByText('راهنمای نصب').closest('a').getAttribute('href')).toBe('/android');
    fireEvent.click(screen.getByLabelText('بستن'));
    expect(screen.queryByText('دانلود اپ')).toBeNull();
    expect(Number(localStorage.getItem('realrate_app_suggest_dismissed'))).toBeGreaterThan(0);
  });
});
