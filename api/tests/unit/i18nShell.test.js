// @vitest-environment happy-dom
/**
 * i18nShell.test.js — English rendering of the shell texts: fixed API error messages are translated
 * on the client (httpClient), Persian stays byte-identical, and the password rules follow the language
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { registerMessages, setActiveLocale } from '../../src/domain/i18n.js';
import apiErrors from '../../../web/src/i18n/en/api-errors.js';
import auth from '../../../web/src/i18n/en/auth.js';
import { httpClient } from '../../../web/src/shared/api/httpClient.js';
import { checkNewPassword } from '../../../web/src/features/auth/components/passwordRules.js';

registerMessages('en', { ...apiErrors, ...auth });

const failWith = (message, status = 400) => vi.stubGlobal('fetch', vi.fn(async () => new Response(
  JSON.stringify({ error: { code: 'X', message } }),
  { status, headers: { 'content-type': 'application/json' } },
)));

afterEach(() => {
  setActiveLocale('fa');
  vi.unstubAllGlobals();
});

describe('API error messages on the client', () => {
  it('keeps the server Persian text in Persian', async () => {
    failWith('ایمیل یا رمز عبور نادرست است.', 401);
    const err = await httpClient.post('/api/x', {}).catch((e) => e);
    expect(err.message).toBe('ایمیل یا رمز عبور نادرست است.');
  });

  it('translates a fixed message in English and leaves an unknown one as sent', async () => {
    setActiveLocale('en');
    failWith('ایمیل یا رمز عبور نادرست است.', 401);
    expect((await httpClient.post('/api/x', {}).catch((e) => e)).message).toBe('The email or password is incorrect.');
    failWith('پیام ناشناخته ۱۲۳', 400);
    expect((await httpClient.post('/api/x', {}).catch((e) => e)).message).toBe('پیام ناشناخته ۱۲۳');
  });
});

describe('password rules', () => {
  it('speaks the active language', () => {
    expect(checkNewPassword('abc1')).toBe('رمز عبور باید حداقل ۸ کاراکتر باشد.');
    setActiveLocale('en');
    expect(checkNewPassword('abc1')).toBe('The password must be at least 8 characters.');
  });
});
