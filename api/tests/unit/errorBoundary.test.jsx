// @vitest-environment happy-dom
/**
 * errorBoundary.test.jsx — A page that fails to render shows a message with «تلاش دوباره» (not a
 * blank app) and another page tries again; a missing lazy chunk (a new version deployed) reloads
 * the app once
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '../../../web/src/shared/ui/ErrorBoundary.jsx';
import { isChunkLoadError, forgetChunkReload } from '../../../web/src/shared/ui/chunkReload.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

let broken = true;
function Page() {
  if (broken) throw new Error('boom');
  return <p>صفحه</p>;
}

describe('ErrorBoundary', () => {
  it('a failing page shows a message; «تلاش دوباره» and another page try again', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    broken = true;
    const { rerender } = render(<ErrorBoundary resetKey="a"><Page /></ErrorBoundary>);
    expect(screen.getByRole('alert').textContent).toContain('این بخش درست نمایش داده نشد');

    broken = false;
    fireEvent.click(screen.getByRole('button', { name: /تلاش دوباره/ }));
    expect(screen.getByText('صفحه')).toBeTruthy();

    broken = true;
    rerender(<ErrorBoundary resetKey="a"><Page key="x" /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toBeTruthy();
    broken = false;
    rerender(<ErrorBoundary resetKey="b"><Page key="x" /></ErrorBoundary>);
    expect(screen.getByText('صفحه')).toBeTruthy();
  });

  it('knows a missing lazy chunk, in each browser\'s words', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/a.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('boom'))).toBe(false);
  });

  it('a missing chunk reloads the app once, not again', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reload = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload });
    function Gone() {
      throw new TypeError('Failed to fetch dynamically imported module: /assets/old.js');
    }
    render(<ErrorBoundary resetKey="a"><Gone /></ErrorBoundary>);
    expect(reload).toHaveBeenCalledTimes(1);
    cleanup();
    render(<ErrorBoundary resetKey="a"><Gone /></ErrorBoundary>);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert').textContent).toContain('نسخه‌ی تازه');
    forgetChunkReload();
    expect(sessionStorage.getItem('realrate_chunk_reload')).toBeNull();
  });
});
