// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useMediaQuery } from '../../../web/src/hooks/useMediaQuery.js';

function installMatchMedia(initial) {
  const listeners = new Set();
  const state = { matches: initial };
  window.matchMedia = vi.fn(() => ({
    get matches() { return state.matches; },
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
  }));
  return {
    listeners,
    set(value) {
      state.matches = value;
      listeners.forEach((fn) => fn({ matches: value }));
    },
  };
}

afterEach(() => cleanup());

describe('useMediaQuery', () => {
  it('returns the current match on the first render', () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));
    expect(result.current).toBe(true);
  });

  it('updates when the media query starts or stops matching', () => {
    const mq = installMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));
    expect(result.current).toBe(false);
    act(() => mq.set(true));
    expect(result.current).toBe(true);
    act(() => mq.set(false));
    expect(result.current).toBe(false);
  });

  it('unsubscribes on unmount', () => {
    const mq = installMatchMedia(false);
    const { unmount } = renderHook(() => useMediaQuery('(max-width: 768px)'));
    expect(mq.listeners.size).toBe(1);
    unmount();
    expect(mq.listeners.size).toBe(0);
  });
});
