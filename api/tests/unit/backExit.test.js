/** backExit — what the Android Back button does */
import { describe, it, expect } from 'vitest';
import { backAction, EXIT_WINDOW_MS } from '../../../web/src/shared/native/backExit.js';

describe('backAction', () => {
  it('steps back while the router has an earlier page', () => {
    expect(backAction({ canGoBack: true, lastPressAt: 0, now: 5000 })).toBe('back');
  });
  it('shows a hint on the first press at the first page', () => {
    expect(backAction({ canGoBack: false, lastPressAt: 0, now: 5000 })).toBe('hint');
  });
  it('exits on a second press within the window', () => {
    expect(backAction({ canGoBack: false, lastPressAt: 5000, now: 5000 + EXIT_WINDOW_MS })).toBe('exit');
  });
  it('hints again when the second press comes late', () => {
    expect(backAction({ canGoBack: false, lastPressAt: 5000, now: 5000 + EXIT_WINDOW_MS + 1 })).toBe('hint');
  });
});
