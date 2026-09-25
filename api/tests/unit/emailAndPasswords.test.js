import { describe, it, expect, vi, afterEach } from 'vitest';
import { hashPassword, verifyPassword, sha256Hex, generateUrlToken } from '../../src/lib/security.js';
import { sendEmail, isEmailConfigured, verificationEmail } from '../../src/lib/email.js';

describe('account password hashing', () => {
  it('verifies only the exact password, spaces included', async () => {
    const hash = await hashPassword(' pass word1 ');
    expect(hash).toMatch(/^pbkdf2\$100000\$/);
    expect(await verifyPassword(' pass word1 ', hash)).toBe(true);
    expect(await verifyPassword('pass word1', hash)).toBe(false);
    expect(await verifyPassword('anything', '')).toBe(false);
    expect(await hashPassword('same1234')).not.toBe(await hashPassword('same1234'));
  });

  it('makes long random URL-safe tokens and hashes them', async () => {
    const token = generateUrlToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('email delivery', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends through Resend with the configured sender', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const env = { RESEND_API_KEY: 're_test', EMAIL_FROM: 'RealRate <no-reply@geekio.org>' };
    expect(isEmailConfigured(env)).toBe(true);
    await sendEmail(env, { to: 'a@b.co', ...verificationEmail('https://realrate.ir/verify-email?token=x') });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer re_test');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ from: 'RealRate <no-reply@geekio.org>', to: ['a@b.co'] });
    expect(body.html).toContain('https://realrate.ir/verify-email?token=x');
    expect(body.html).toContain('dir="rtl"');
  });

  it('reports a provider failure and a missing configuration', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad', { status: 422 })));
    await expect(sendEmail({ RESEND_API_KEY: 'k', EMAIL_FROM: 'f' }, { to: 'a@b.co', subject: 's', html: 'h', text: 't' }))
      .rejects.toMatchObject({ statusCode: 502 });
    await expect(sendEmail({}, { to: 'a@b.co', subject: 's', html: 'h', text: 't' })).rejects.toMatchObject({ statusCode: 503 });
    expect(isEmailConfigured({ EMAIL_DEBUG_LOG: 'true' })).toBe(true);
  });

  it('escapes what it puts into the HTML', () => {
    const { html } = verificationEmail('https://x.y/?a="><script>');
    expect(html).not.toContain('<script>');
  });
});
