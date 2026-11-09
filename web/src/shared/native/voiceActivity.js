/**
 * voiceActivity.js — Knowing when a voice note is over: speech, then a pause
 *
 * Pure: fed the microphone level (0 to 1) with the time, it says when the speaker has finished
 * ("end": speech was heard, then it stayed quiet for SILENCE_MS) or never started ("none": nothing
 * but quiet for NO_SPEECH_MS). Two thresholds (speech louder than the quiet one) keep a breath
 * between words from ending the note.
 */

export const SPEECH_LEVEL = 0.15;
export const QUIET_LEVEL = 0.1;
export const SILENCE_MS = 1500;
export const NO_SPEECH_MS = 10_000;
/** Speech must last this long to count (a click or a cough is not a note) */
export const MIN_SPEECH_MS = 300;

/**
 * @param {{ speech?: number, quiet?: number, silenceMs?: number, noSpeechMs?: number, minSpeechMs?: number }} [options]
 * @returns {{ feed: (level: number, now: number) => 'end'|'none'|null }}
 */
export function createVoiceActivity({ speech = SPEECH_LEVEL, quiet = QUIET_LEVEL, silenceMs = SILENCE_MS, noSpeechMs = NO_SPEECH_MS, minSpeechMs = MIN_SPEECH_MS } = {}) {
  let startedAt = null;
  let loudSince = null;
  let spoke = false;
  let quietSince = null;
  return {
    feed(level, now) {
      if (startedAt === null) startedAt = now;
      if (level >= speech) {
        if (loudSince === null) loudSince = now;
        if (now - loudSince >= minSpeechMs) spoke = true;
        quietSince = null;
        return null;
      }
      loudSince = null;
      if (!spoke) return now - startedAt >= noSpeechMs ? 'none' : null;
      if (level > quiet) { quietSince = null; return null; }
      if (quietSince === null) quietSince = now;
      return now - quietSince >= silenceMs ? 'end' : null;
    },
  };
}
