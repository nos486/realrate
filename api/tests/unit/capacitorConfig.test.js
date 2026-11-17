/**
 * capacitorConfig.test.js — The Android WebView keeps its stock keyboard input connection
 *
 * `android.captureInput: true` swaps in Capacitor's own input connection, which makes keyboards
 * that compose text (Gboard, Persian) show a word only after it is finished and space is typed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('capacitor.config.json', () => {
  it('does not capture keyboard input', () => {
    const config = JSON.parse(readFileSync(new URL('../../../web/capacitor.config.json', import.meta.url), 'utf8'));
    expect(config.android?.captureInput).not.toBe(true);
  });
});
