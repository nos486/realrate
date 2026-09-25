import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/auth.js', () => ({
  getAuthenticatedUser: vi.fn(),
  isUserAdmin: (email) => email === 'admin@example.com',
}));

vi.mock('../../src/repositories/index.js', () => ({
  dbGetUserAuthByEmail: vi.fn(),
  dbGetUserAuthById: vi.fn(),
  dbCreatePasswordUser: vi.fn(),
  dbUpdateUnverifiedSignup: vi.fn(),
  dbSetUserPassword: vi.fn(),
  dbMarkEmailVerified: vi.fn(),
  dbRecordLogin: vi.fn(),
  dbCreateAuthToken: vi.fn(async () => 'tok_123'),
  dbConsumeAuthToken: vi.fn(),
  dbDeleteUserSessions: vi.fn(async () => 2),
  dbSaveSession: vi.fn(),
  normalizeEmail: (e) => String(e ?? '').trim().toLowerCase(),
}));

vi.mock('../../src/lib/email.js', () => ({
  sendEmail: vi.fn(),
  isEmailConfigured: vi.fn(() => true),
  verificationEmail: (url) => ({ subject: 'verify', html: url, text: url }),
  passwordResetEmail: (url) => ({ subject: 'reset', html: url, text: url }),
  accountExistsEmail: (login, reset) => ({ subject: 'exists', html: reset, text: reset }),
}));

import * as repo from '../../src/repositories/index.js';
import { getAuthenticatedUser } from '../../src/lib/auth.js';
import { sendEmail, isEmailConfigured } from '../../src/lib/email.js';
import { hashPassword } from '../../src/lib/security.js';
import {
  handleRegister,
  handleVerifyEmail,
  handleLogin,
  handleForgotPassword,
  handleResetPassword,
  handleSetPassword,
  handleResendVerification,
  parseNewPassword,
} from '../../src/handlers/accountRoutes.js';

const post = (path, body, headers = {}) => new Request(`https://api.realrate.ir${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: 'https://realrate.ir', ...headers },
  body: JSON.stringify(body),
});

const env = {};
let PASSWORD_HASH;
const account = (overrides = {}) => ({
  id: 'usr_1', email: 'sara@example.com', name: 'سارا', customName: '', picture: '',
  role: 'user', passwordHash: PASSWORD_HASH, emailVerified: true, ...overrides,
});

describe('email/password accounts', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    isEmailConfigured.mockReturnValue(true);
    PASSWORD_HASH ||= await hashPassword('secret123');
  });

  describe('password rules', () => {
    it.each(['short1', 'onlyletters', '12345678', 'x'.repeat(129) + '1'])('rejects %s', (pw) => {
      expect(() => parseNewPassword(pw)).toThrow();
    });
    it('accepts letters + digits, Persian included', () => {
      expect(parseNewPassword('رمزمن۱۲۳۴')).toBe('رمزمن۱۲۳۴');
      expect(parseNewPassword('good pass 1')).toBe('good pass 1');
    });
  });

  describe('register', () => {
    it('creates an unverified account and emails a link to the requesting frontend', async () => {
      repo.dbGetUserAuthByEmail.mockResolvedValue(null);
      repo.dbCreatePasswordUser.mockImplementation(async (_env, data) => account({ ...data, emailVerified: false }));
      const res = await handleRegister(post('/api/auth/register', { email: ' Sara@Example.com ', password: 'secret123', name: 'سارا' }), env);
      expect(res.status).toBe(200);
      const created = repo.dbCreatePasswordUser.mock.calls[0][1];
      expect(created.email).toBe('sara@example.com');
      expect(created.passwordHash).toMatch(/^pbkdf2\$/);
      expect(created.passwordHash).not.toContain('secret123');
      expect(sendEmail.mock.calls[0][1]).toMatchObject({ to: 'sara@example.com', html: 'https://realrate.ir/verify-email?token=tok_123' });
      expect((await res.json()).token).toBeUndefined();
    });

    it('answers the same for an existing account but only emails its owner', async () => {
      repo.dbGetUserAuthByEmail.mockResolvedValue(account());
      const res = await handleRegister(post('/api/auth/register', { email: 'sara@example.com', password: 'another123' }), env);
      expect(res.status).toBe(200);
      expect(repo.dbCreatePasswordUser).not.toHaveBeenCalled();
      expect(repo.dbSetUserPassword).not.toHaveBeenCalled();
      expect(sendEmail.mock.calls[0][1].subject).toBe('exists');
    });

    it('lets a repeated sign-up replace a never-verified one', async () => {
      repo.dbGetUserAuthByEmail.mockResolvedValue(account({ emailVerified: false }));
      await handleRegister(post('/api/auth/register', { email: 'sara@example.com', password: 'another123' }), env);
      expect(repo.dbUpdateUnverifiedSignup).toHaveBeenCalled();
      expect(sendEmail.mock.calls[0][1].subject).toBe('verify');
    });

    it('refuses before creating anything when email cannot be sent', async () => {
      isEmailConfigured.mockReturnValue(false);
      await expect(handleRegister(post('/api/auth/register', { email: 'new@example.com', password: 'secret123' }), env))
        .rejects.toMatchObject({ statusCode: 503 });
      expect(repo.dbCreatePasswordUser).not.toHaveBeenCalled();
    });

    it('rejects an invalid email or weak password', async () => {
      await expect(handleRegister(post('/api/auth/register', { email: 'nope', password: 'secret123' }), env)).rejects.toMatchObject({ statusCode: 400 });
      await expect(handleRegister(post('/api/auth/register', { email: 'a@b.co', password: 'short' }), env)).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('verify email', () => {
    it('verifies with a valid token and signs the user in', async () => {
      repo.dbConsumeAuthToken.mockResolvedValue('usr_1');
      repo.dbGetUserAuthById.mockResolvedValue(account());
      const res = await handleVerifyEmail(post('/api/auth/verify-email', { token: 'tok_123' }), env);
      const data = await res.json();
      expect(repo.dbConsumeAuthToken).toHaveBeenCalledWith(env, 'tok_123', 'verify_email');
      expect(repo.dbMarkEmailVerified).toHaveBeenCalledWith(env, 'usr_1');
      expect(data.token).toBeTruthy();
      expect(data.user).toMatchObject({ id: 'usr_1', hasPassword: true });
      expect(res.headers.get('Set-Cookie')).toContain('HttpOnly');
    });

    it('rejects an unknown or expired token', async () => {
      repo.dbConsumeAuthToken.mockResolvedValue(null);
      await expect(handleVerifyEmail(post('/api/auth/verify-email', { token: 'x' }), env)).rejects.toMatchObject({ statusCode: 400 });
      expect(repo.dbMarkEmailVerified).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('signs in with the right password', async () => {
      repo.dbGetUserAuthByEmail.mockResolvedValue(account());
      const res = await handleLogin(post('/api/auth/login', { email: 'SARA@example.com', password: 'secret123' }), env);
      expect((await res.json()).user.email).toBe('sara@example.com');
      expect(repo.dbSaveSession).toHaveBeenCalled();
    });

    it('gives one answer for a wrong password, an unknown email and a Google-only account', async () => {
      repo.dbGetUserAuthByEmail.mockResolvedValueOnce(account());
      await expect(handleLogin(post('/api/auth/login', { email: 'sara@example.com', password: 'wrong1234' }), env))
        .rejects.toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' });
      repo.dbGetUserAuthByEmail.mockResolvedValueOnce(null);
      await expect(handleLogin(post('/api/auth/login', { email: 'ghost@example.com', password: 'secret123' }), env))
        .rejects.toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' });
      repo.dbGetUserAuthByEmail.mockResolvedValueOnce(account({ passwordHash: '' }));
      await expect(handleLogin(post('/api/auth/login', { email: 'sara@example.com', password: '' + 'secret123' }), env))
        .rejects.toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' });
      expect(repo.dbSaveSession).not.toHaveBeenCalled();
    });

    it('does not sign in an unverified address', async () => {
      repo.dbGetUserAuthByEmail.mockResolvedValue(account({ emailVerified: false }));
      await expect(handleLogin(post('/api/auth/login', { email: 'sara@example.com', password: 'secret123' }), env))
        .rejects.toMatchObject({ statusCode: 403, code: 'EMAIL_NOT_VERIFIED' });
    });
  });

  describe('forgot / reset password', () => {
    it('emails a reset link only when the account exists, with the same answer either way', async () => {
      repo.dbGetUserAuthByEmail.mockResolvedValueOnce(account({ passwordHash: '' }));
      const a = await (await handleForgotPassword(post('/api/auth/password/forgot', { email: 'sara@example.com' }), env)).json();
      repo.dbGetUserAuthByEmail.mockResolvedValueOnce(null);
      const b = await (await handleForgotPassword(post('/api/auth/password/forgot', { email: 'ghost@example.com' }), env)).json();
      expect(a).toEqual(b);
      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(sendEmail.mock.calls[0][1].html).toBe('https://realrate.ir/reset-password?token=tok_123');
    });

    it('sets the new password, verifies the address and signs out every other session', async () => {
      repo.dbConsumeAuthToken.mockResolvedValue('usr_1');
      repo.dbGetUserAuthById.mockResolvedValue(account());
      const res = await handleResetPassword(post('/api/auth/password/reset', { token: 'tok_123', password: 'fresh1234' }), env);
      expect(res.status).toBe(200);
      const [, userId, hash, opts] = repo.dbSetUserPassword.mock.calls[0];
      expect(userId).toBe('usr_1');
      expect(hash).toMatch(/^pbkdf2\$/);
      expect(opts).toEqual({ markVerified: true });
      expect(repo.dbDeleteUserSessions).toHaveBeenCalledWith(env, 'usr_1');
    });

    it('validates the password before using up the token', async () => {
      await expect(handleResetPassword(post('/api/auth/password/reset', { token: 'tok_123', password: 'weak' }), env))
        .rejects.toMatchObject({ statusCode: 400 });
      expect(repo.dbConsumeAuthToken).not.toHaveBeenCalled();
    });

    it('resends verification only for a pending email sign-up', async () => {
      repo.dbGetUserAuthByEmail.mockResolvedValueOnce(account());
      await handleResendVerification(post('/api/auth/verify-email/resend', { email: 'sara@example.com' }), env);
      expect(sendEmail).not.toHaveBeenCalled();
      repo.dbGetUserAuthByEmail.mockResolvedValueOnce(account({ emailVerified: false }));
      await handleResendVerification(post('/api/auth/verify-email/resend', { email: 'sara@example.com' }), env);
      expect(sendEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe('set / change password while signed in', () => {
    const authed = (body) => post('/api/auth/password', body, { Authorization: 'Bearer cur_token' });

    it('lets a Google account add its first password without a current one', async () => {
      getAuthenticatedUser.mockResolvedValue({ userId: 'g_1' });
      repo.dbGetUserAuthById.mockResolvedValue(account({ id: 'g_1', passwordHash: '' }));
      const res = await handleSetPassword(authed({ newPassword: 'fresh1234' }), env);
      expect(res.status).toBe(200);
      expect(repo.dbSetUserPassword.mock.calls[0][1]).toBe('g_1');
      expect(repo.dbDeleteUserSessions).toHaveBeenCalledWith(env, 'g_1', { exceptToken: 'cur_token' });
    });

    it('requires the current password to change an existing one', async () => {
      getAuthenticatedUser.mockResolvedValue({ userId: 'usr_1' });
      repo.dbGetUserAuthById.mockResolvedValue(account());
      await expect(handleSetPassword(authed({ currentPassword: 'wrong1234', newPassword: 'fresh1234' }), env))
        .rejects.toMatchObject({ code: 'INVALID_CURRENT_PASSWORD' });
      expect(repo.dbSetUserPassword).not.toHaveBeenCalled();
      await handleSetPassword(authed({ currentPassword: 'secret123', newPassword: 'fresh1234' }), env);
      expect(repo.dbSetUserPassword).toHaveBeenCalled();
    });

    it('requires a session', async () => {
      getAuthenticatedUser.mockResolvedValue(null);
      await expect(handleSetPassword(authed({ newPassword: 'fresh1234' }), env)).rejects.toMatchObject({ statusCode: 401 });
    });
  });
});
