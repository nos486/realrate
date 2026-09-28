import { describe, it, expect } from 'vitest';
import { withErrorHandler } from '../../src/middlewares/errorHandler.js';

describe('withErrorHandler', () => {
  it('adds CORS headers to a Response.redirect (immutable headers) instead of failing', async () => {
    const handler = withErrorHandler(async () => Response.redirect('ir.realrate.app://auth?code=abc', 302));
    const res = await handler(new Request('https://api.realrate.ir/api/auth/google/callback', { headers: { Origin: 'https://realrate.ir' } }));
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toMatch(/^ir\.realrate\.app:\/\/auth\/?\?code=abc$/);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://realrate.ir');
  });
});
