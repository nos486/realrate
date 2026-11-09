/**
 * voiceActivity.test.js — when a voice note is over: speech, then a pause (web/src/shared/native/voiceActivity.js)
 */

import { describe, it, expect } from 'vitest';
import { createVoiceActivity } from '../../../web/src/shared/native/voiceActivity.js';

/** Feed `level` every 100 ms from `from` to `to`; the first verdict, if any */
function run(activity, level, from, to) {
  for (let now = from; now <= to; now += 100) {
    const verdict = activity.feed(level, now);
    if (verdict) return { verdict, at: now };
  }
  return { verdict: null };
}

describe('createVoiceActivity', () => {
  it('ends after speech and a 1.5 s pause', () => {
    const a = createVoiceActivity();
    expect(run(a, 0.5, 0, 1000).verdict).toBe(null);
    const end = run(a, 0.02, 1100, 5000);
    expect(end.verdict).toBe('end');
    expect(end.at).toBeGreaterThanOrEqual(1100 + 1500);
  });

  it('does not end on a short breath between words', () => {
    const a = createVoiceActivity();
    run(a, 0.5, 0, 1000);
    expect(run(a, 0.02, 1100, 2000).verdict).toBe(null);
    expect(run(a, 0.5, 2100, 3000).verdict).toBe(null);
  });

  it('does not count a click as speech, and gives up when nothing is said', () => {
    const a = createVoiceActivity();
    a.feed(0.9, 0);
    expect(run(a, 0.02, 100, 9000).verdict).toBe(null);
    expect(run(a, 0.02, 9100, 12000).verdict).toBe('none');
  });
});
