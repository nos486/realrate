import { describe, it, expect } from 'vitest';
import { parseNativeAuthLink, isNativeApp, publicOrigin } from '../../../web/src/shared/native/nativeApp.js';

describe('Android app sign-in link', () => {
  it('reads the one-time code', () => {
    expect(parseNativeAuthLink('ir.realrate.app://auth?code=abc_123')).toEqual({ code: 'abc_123' });
  });

  it('reads an error', () => {
    const link = `ir.realrate.app://auth?auth_error=${encodeURIComponent('ورود با گوگل لغو شد.')}`;
    expect(parseNativeAuthLink(link)).toEqual({ error: 'ورود با گوگل لغو شد.' });
  });

  it('ignores other links', () => {
    expect(parseNativeAuthLink('https://realrate.ir/auth?code=x')).toBeNull();
    expect(parseNativeAuthLink('ir.realrate.app://other?code=x')).toBeNull();
    expect(parseNativeAuthLink(undefined)).toBeNull();
  });

  it('is the website outside the app', () => {
    expect(isNativeApp()).toBe(false);
    if (typeof window !== 'undefined') expect(publicOrigin()).toBe(window.location.origin);
  });
});
