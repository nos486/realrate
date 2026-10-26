/**
 * apiHosts.test.js — Each site host talks to its own API; other hosts and the app keep the build's
 */
import { describe, it, expect } from 'vitest';
import { resolveApiBase, DEFAULT_API_ORIGIN } from '../../src/config/apiHosts.js';
import { isOriginAllowed } from '../../src/lib/helpers.js';

const BUILD = 'https://realrate-api.geekio.org/';

describe('resolveApiBase', () => {
  it('maps each site host to its API', () => {
    expect(resolveApiBase({ hostname: 'realrate.ir', envUrl: BUILD, prod: true })).toBe('https://api.realrate.ir');
    expect(resolveApiBase({ hostname: 'www.realrate.ir', envUrl: BUILD, prod: true })).toBe('https://api.realrate.ir');
    expect(resolveApiBase({ hostname: 'realrate.geekio.org', envUrl: BUILD, prod: true })).toBe('https://realrate-api.geekio.org');
  });

  it('keeps the build API for the Android app, previews and unknown hosts', () => {
    expect(resolveApiBase({ hostname: 'localhost', native: true, envUrl: BUILD, prod: true })).toBe('https://realrate-api.geekio.org');
    expect(resolveApiBase({ hostname: 'realrate.ir', native: true, envUrl: BUILD, prod: true })).toBe('https://realrate-api.geekio.org');
    expect(resolveApiBase({ hostname: 'abc.realrate-5pn.pages.dev', envUrl: BUILD, prod: true })).toBe('https://realrate-api.geekio.org');
    expect(resolveApiBase({ hostname: 'evilrealrate.ir', prod: true })).toBe(DEFAULT_API_ORIGIN);
  });

  it('uses the Vite proxy in development', () => {
    expect(resolveApiBase({ hostname: 'localhost' })).toBe('');
    expect(resolveApiBase({ browser: false })).toBe('http://localhost:8787');
  });

  it('every mapped site may call the API (CORS)', () => {
    for (const host of ['realrate.ir', 'www.realrate.ir', 'realrate.geekio.org']) {
      expect(isOriginAllowed(`https://${host}`)).toBe(true);
    }
  });
});
