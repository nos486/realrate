// @vitest-environment happy-dom
/**
 * scrollLock.test.js — The page's scroll lock holds across overlays closed in any order
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { lockBodyScroll } from '../../../web/src/shared/ui/scrollLock.js';

beforeEach(() => {
  document.body.style.overflow = '';
});

describe('lockBodyScroll', () => {
  it('locks while any overlay holds it and gives the page back when the last lets go', () => {
    const first = lockBodyScroll();
    const second = lockBodyScroll();
    expect(document.body.style.overflow).toBe('hidden');
    // The first overlay closes while the one over it is still open
    first();
    expect(document.body.style.overflow).toBe('hidden');
    second();
    expect(document.body.style.overflow).toBe('');
  });

  it('keeps an overflow the page had, and ignores a second release', () => {
    document.body.style.overflow = 'scroll';
    const a = lockBodyScroll();
    const b = lockBodyScroll();
    a();
    a();
    expect(document.body.style.overflow).toBe('hidden');
    b();
    expect(document.body.style.overflow).toBe('scroll');
  });
});
