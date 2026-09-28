import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/repositories/index.js', () => ({
  dbGetUserAuthByEmail: vi.fn(),
  dbGetUserAuthById: vi.fn(),
  dbCreatePasswordUser: vi.fn(),
  dbUpdateUnverifiedSignup: vi.fn(),
  dbSetUserPassword: vi.fn(),
  dbMarkEmailVerified: vi.fn(),
  dbRecordLogin: vi.fn(),
  dbCreateAuthToken: vi.fn(async () => 'code_123'),
  dbConsumeAuthToken: vi.fn(),
  dbDeleteUserSessions: vi.fn(),
  dbSaveSession: vi.fn(),
  dbUpsertUser: vi.fn(),
  dbDeleteSession: vi.fn(),
  dbGetUserById: vi.fn(),
  dbRecordUserActivity: vi.fn(),
  normalizeEmail: (e) => String(e ?? '').trim().toLowerCase(),
}));

import * as repo from '../../src/repositories/index.js';
import { appChallengeOf, appAuthRedirect, isAppChallenge, appSignInPurpose } from '../../src/lib/appAuth.js';
import { handleAppSignIn } from '../../src/handlers/accountRoutes.js';
import { handleGoogleLogin, handleGoogleCallback } from '../../src/handlers/authRoutes.js';

// Challenge = base64url(SHA-256(verifier)), as Node's crypto computes it
const VERIFIER = 'dBjftJeZ4CVP-mJ92K9qOtBaWZ4CU2PT8I9D3bQpnHg';
const CHALLENGE = '09CZlaxHTBEJassrleI3ROl5GPA91QbJwcuSwL1JKpw';

const post = (body) => new Request('https://api.realrate.ir/api/auth/app/signin', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: 'https://localhost' },
  body: JSON.stringify(body),
});

const account = { id: 'usr_1', email: 'sara@example.com', name: 'سارا', picture: '', emailVerified: true };

describe('Android app Google sign-in', () => {
  beforeEach(() => vi.clearAllMocks());

  it('derives the S256 challenge of a verifier', async () => {
    expect(await appChallengeOf(VERIFIER)).toBe(CHALLENGE);
    expect(isAppChallenge(CHALLENGE)).toBe(true);
    expect(isAppChallenge('short')).toBe(false);
    expect(isAppChallenge(`${CHALLENGE}/`)).toBe(false);
  });

  it('builds the app link', () => {
    expect(appAuthRedirect({ code: 'abc' })).toBe('ir.realrate.app://auth?code=abc');
    expect(appAuthRedirect({ auth_error: 'لغو شد' })).toMatch(/^ir\.realrate\.app:\/\/auth\?auth_error=/);
  });

  it('carries the challenge through the Google state', async () => {
    const res = await handleGoogleLogin(
      new Request(`https://api.realrate.ir/api/auth/google/login?app_challenge=${CHALLENGE}&return_to=%2F`),
      { GOOGLE_CLIENT_ID: 'cid' },
    );
    const state = JSON.parse(atob(new URL(res.headers.get('Location')).searchParams.get('state').replace(/-/g, '+').replace(/_/g, '/')));
    expect(state.app).toBe(CHALLENGE);
  });

  it('ignores a malformed challenge (a normal web sign-in)', async () => {
    const res = await handleGoogleLogin(
      new Request('https://api.realrate.ir/api/auth/google/login?app_challenge=../../evil'),
      { GOOGLE_CLIENT_ID: 'cid' },
    );
    const raw = new URL(res.headers.get('Location')).searchParams.get('state');
    expect(JSON.parse(atob(raw.replace(/-/g, '+').replace(/_/g, '/'))).app).toBeUndefined();
  });

  it('sends errors of an app sign-in back to the app', async () => {
    const state = btoa(JSON.stringify({ app: CHALLENGE, nonce: 'n' }));
    const res = await handleGoogleCallback(
      new Request(`https://api.realrate.ir/api/auth/google/callback?error=access_denied&state=${encodeURIComponent(state)}`),
      {},
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toMatch(/^ir\.realrate\.app:\/\/auth\?auth_error=/);
  });

  it('turns code + verifier into a session', async () => {
    repo.dbConsumeAuthToken.mockResolvedValue('usr_1');
    repo.dbGetUserAuthById.mockResolvedValue(account);
    const res = await handleAppSignIn(post({ code: 'code_123', verifier: VERIFIER }), {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.token).toBeTruthy();
    expect(data.user.email).toBe('sara@example.com');
    expect(repo.dbConsumeAuthToken).toHaveBeenCalledWith({}, 'code_123', appSignInPurpose(CHALLENGE));
    expect(repo.dbSaveSession).toHaveBeenCalled();
  });

  it('refuses a code without its verifier', async () => {
    repo.dbConsumeAuthToken.mockResolvedValue(null);
    await expect(handleAppSignIn(post({ code: 'code_123', verifier: 'x'.repeat(43) }), {})).rejects.toThrow();
    await expect(handleAppSignIn(post({ code: 'code_123', verifier: 'bad' }), {})).rejects.toThrow();
    expect(repo.dbSaveSession).not.toHaveBeenCalled();
  });
});
