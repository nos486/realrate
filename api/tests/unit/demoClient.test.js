// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  httpClient,
  HttpError,
  notifyDemoReadOnly,
  DEMO_READ_ONLY_EVENT,
} = await import('../../../web/src/shared/api/httpClient.js');

const {
  isDemoReadOnly,
} = await import('../../../web/src/features/demo/context/DemoContext.jsx');

describe('demo client helpers & httpClient DEMO_READ_ONLY handling', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('notifyDemoReadOnly dispatches DEMO_READ_ONLY_EVENT with expected message', () => {
    let capturedDetail = null;
    const listener = (e) => {
      capturedDetail = e.detail;
    };
    window.addEventListener(DEMO_READ_ONLY_EVENT, listener);

    notifyDemoReadOnly();
    expect(capturedDetail).toEqual({
      message: 'این نسخه دمو است و تغییرات ذخیره نمی‌شود.',
    });

    notifyDemoReadOnly('پیام سفارشی خطا');
    expect(capturedDetail).toEqual({
      message: 'پیام سفارشی خطا',
    });

    window.removeEventListener(DEMO_READ_ONLY_EVENT, listener);
  });

  it('httpClient dispatches DEMO_READ_ONLY_EVENT when server returns 403 DEMO_READ_ONLY', async () => {
    const errorBody = {
      success: false,
      error: {
        code: 'DEMO_READ_ONLY',
        message: 'این نسخه دمو است و تغییرات ذخیره نمی‌شود.',
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: {
        get: (h) => (h.toLowerCase() === 'content-type' ? 'application/json' : null),
      },
      json: async () => errorBody,
    });

    let eventFired = false;
    let eventMessage = '';
    const listener = (e) => {
      eventFired = true;
      eventMessage = e.detail?.message;
    };
    window.addEventListener(DEMO_READ_ONLY_EVENT, listener);

    await expect(httpClient.post('/api/portfolio/transactions', { amount: 100 })).rejects.toThrow(
      HttpError
    );

    expect(eventFired).toBe(true);
    expect(eventMessage).toBe('این نسخه دمو است و تغییرات ذخیره نمی‌شود.');

    window.removeEventListener(DEMO_READ_ONLY_EVENT, listener);
  });

  it('httpClient does NOT dispatch DEMO_READ_ONLY_EVENT if request is silent', async () => {
    const errorBody = {
      success: false,
      error: {
        code: 'DEMO_READ_ONLY',
        message: 'این نسخه دمو است و تغییرات ذخیره نمی‌شود.',
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: {
        get: (h) => (h.toLowerCase() === 'content-type' ? 'application/json' : null),
      },
      json: async () => errorBody,
    });

    let eventFired = false;
    const listener = () => {
      eventFired = true;
    };
    window.addEventListener(DEMO_READ_ONLY_EVENT, listener);

    await expect(
      httpClient.post('/api/vault/records/batch', { records: [] }, { silent: true })
    ).rejects.toThrow(HttpError);

    expect(eventFired).toBe(false);

    window.removeEventListener(DEMO_READ_ONLY_EVENT, listener);
  });

  it('httpClient does NOT dispatch DEMO_READ_ONLY_EVENT for standard 403 Forbidden errors', async () => {
    const errorBody = {
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'دسترسی غیرمجاز',
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: {
        get: (h) => (h.toLowerCase() === 'content-type' ? 'application/json' : null),
      },
      json: async () => errorBody,
    });

    let eventFired = false;
    const listener = () => {
      eventFired = true;
    };
    window.addEventListener(DEMO_READ_ONLY_EVENT, listener);

    await expect(httpClient.get('/api/admin/users')).rejects.toThrow(HttpError);

    expect(eventFired).toBe(false);

    window.removeEventListener(DEMO_READ_ONLY_EVENT, listener);
  });

  it('isDemoReadOnly returns boolean indicating read-only state', () => {
    // Initial state outside of a demo session is false
    expect(typeof isDemoReadOnly()).toBe('boolean');
  });
});
