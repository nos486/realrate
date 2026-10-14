// @vitest-environment happy-dom
/**
 * localeStore.test.js — Which language a device starts in: its choice, a ?lang= link, a stored session, the browser
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { resolveBootLocale, getStoredLocale, bootLocale, chooseLocale } from '../../../web/src/shared/i18n/localeStore.js';
import { getLocale, setActiveLocale } from '../../src/domain/i18n.js';

const go = (url) => window.history.replaceState({}, '', url);

describe('resolveBootLocale', () => {
  beforeEach(() => {
    localStorage.clear();
    go('/login');
    setActiveLocale('fa');
  });

  it('asks on a device that never chose, away from the landing page', () => {
    expect(resolveBootLocale().needsChoice).toBe(true);
  });

  it('follows a stored choice without asking', () => {
    localStorage.setItem('realrate_locale', 'en');
    expect(resolveBootLocale()).toEqual({ locale: 'en', needsChoice: false });
    expect(getStoredLocale()).toBe('en');
  });

  it('keeps Persian, without asking, for a device with a stored session', () => {
    localStorage.setItem('realrate_token', 'x');
    expect(resolveBootLocale()).toEqual({ locale: 'fa', needsChoice: false });
  });

  it('takes the language from a ?lang= link and remembers it', () => {
    go('/register?lang=en');
    expect(resolveBootLocale()).toEqual({ locale: 'en', needsChoice: false });
    expect(localStorage.getItem('realrate_locale')).toBe('en');
  });

  it('drops ?lang= from the address once it is applied, so a later choice is not overridden on reload', () => {
    go('/register?lang=en&x=1#top');
    resolveBootLocale();
    expect(window.location.search).toBe('?x=1');
    expect(window.location.hash).toBe('#top');
  });

  it('ignores an unknown ?lang= value', () => {
    go('/register?lang=xx');
    expect(resolveBootLocale().needsChoice).toBe(true);
  });

  it('follows the browser language on the landing page', () => {
    go('/');
    const { locale, needsChoice } = resolveBootLocale();
    expect(needsChoice).toBe(false);
    expect(['fa', 'en']).toContain(locale);
  });
});

describe('bootLocale', () => {
  it('sets the active language, the document language and its direction', () => {
    bootLocale('en');
    expect(getLocale()).toBe('en');
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
    bootLocale('fa');
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    expect(document.documentElement.getAttribute('lang')).toBe('fa');
  });

  it('ignores a language it does not know when choosing', () => {
    chooseLocale('xx');
    expect(localStorage.getItem('realrate_locale')).toBe(null);
  });
});
