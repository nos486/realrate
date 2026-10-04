/**
 * siteOrigin.test.js — Links the API builds go to the site, never to the API's own host
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SITE_ORIGIN, siteOrigin, resolveFrontendOrigin } from '../../src/lib/siteOrigin.js';
import { APP_WEBVIEW_ORIGIN } from '../../src/lib/appAuth.js';

const req = (origin) => new Request('https://realrate-api.geekio.org/api/x', { headers: origin ? { Origin: origin } : {} });

describe('siteOrigin', () => {
  it('is realrate.geekio.org, or a trusted FRONTEND_URL', () => {
    expect(SITE_ORIGIN).toBe('https://realrate.geekio.org');
    expect(siteOrigin({})).toBe('https://realrate.geekio.org');
    expect(siteOrigin({ FRONTEND_URL: 'https://www.realrate.ir/' })).toBe('https://www.realrate.ir');
    expect(siteOrigin({ FRONTEND_URL: 'https://evil.example' })).toBe('https://realrate.geekio.org');
  });
});

describe('resolveFrontendOrigin', () => {
  it('the frontend that asked, when it is ours', () => {
    expect(resolveFrontendOrigin(req('https://www.realrate.ir'), {})).toBe('https://www.realrate.ir');
  });

  it('the site for the Android app, an unknown origin or none — never the API host', () => {
    for (const origin of [APP_WEBVIEW_ORIGIN, 'https://evil.example', null]) {
      expect(resolveFrontendOrigin(req(origin), {})).toBe('https://realrate.geekio.org');
    }
  });
});

describe('the test reminder email', () => {
  afterEach(() => vi.restoreAllMocks());

  it('links to the site, not to the API', async () => {
    const sent = [];
    vi.doMock('../../src/lib/email.js', async (orig) => ({ ...(await orig()), isEmailConfigured: () => true, sendEmail: async (_env, msg) => sent.push(msg) }));
    vi.doMock('../../src/lib/auth.js', async (orig) => ({ ...(await orig()), getAuthenticatedUser: async () => ({ userId: 'u1', email: 'a@b.co' }) }));
    vi.doMock('../../src/repositories/account.repository.js', async (orig) => ({ ...(await orig()), dbGetUserAuthById: async () => ({ emailVerified: true }) }));
    vi.doMock('../../src/lib/security.js', async (orig) => ({ ...(await orig()), getRateLimitState: async () => ({ limited: false }), recordRateLimitHit: async () => {} }));
    vi.resetModules();
    const { handleSendTestEmailAlert } = await import('../../src/handlers/alertEmailRoutes.js');
    const request = new Request('https://realrate-api.geekio.org/api/alerts/email/test', { method: 'POST', headers: { Origin: APP_WEBVIEW_ORIGIN } });
    await handleSendTestEmailAlert(request, {});
    expect(sent).toHaveLength(1);
    expect(sent[0].html).toContain('https://realrate.geekio.org');
    expect(sent[0].html).not.toContain('realrate-api.geekio.org');
  });
});
