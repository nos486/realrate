// @vitest-environment happy-dom
/**
 * versionReload.test.js — a deployed web version loads by itself, but only when no input is lost:
 * the build comparison and the safe-moment rule that holds the reload back
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isNewBuild } from '../../../web/src/shared/pwa/versionCheck.js';
import { isSafeToReload, reloadWhenSafe, cancelWaitingReload } from '../../../web/src/shared/pwa/safeReload.js';

describe('isNewBuild', () => {
  it('is true only for a different non-empty build', () => {
    expect(isNewBuild('b', 'a')).toBe(true);
    expect(isNewBuild('a', 'a')).toBe(false);
    expect(isNewBuild('', 'a')).toBe(false);
    expect(isNewBuild('b', '')).toBe(false); // dev has no build id
  });
});

describe('safe reload', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    cancelWaitingReload();
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('reloads at once on a calm page', () => {
    const reload = vi.fn();
    expect(isSafeToReload()).toBe(true);
    expect(reloadWhenSafe(reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('waits while a dialog is open, then reloads after the next click once it is closed', () => {
    document.body.innerHTML = '<div role="dialog"><button id="x">x</button></div>';
    const reload = vi.fn();
    expect(reloadWhenSafe(reload)).toBe(false);
    document.body.innerHTML = '<button id="y">y</button>';
    document.getElementById('y').dispatchEvent(new Event('click', { bubbles: true }));
    vi.advanceTimersByTime(400);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('waits while a text field has focus, then reloads when it loses it', () => {
    document.body.innerHTML = '<input id="f" />';
    const input = document.getElementById('f');
    input.focus();
    const reload = vi.fn();
    expect(isSafeToReload()).toBe(false);
    reloadWhenSafe(reload);
    input.blur();
    vi.advanceTimersByTime(400);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
