/**
 * voiceRecorder.js — Record a short voice note from the microphone (MediaRecorder)
 *
 * In the Android app the WebView asks for the microphone permission by itself on the first
 * recording (RECORD_AUDIO is in the manifest of the full build). The clip stays in memory: it
 * is sent once to the server for the voice note on a bank SMS and never saved.
 */

import { t } from '../../utils/i18n.js';

/** A voice note is a few words; a recording stops by itself after this long */
export const MAX_VOICE_MS = 30_000;

const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

/** Whether this WebView can record */
export function canRecordVoice() {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined';
}

/**
 * Start recording
 * @param {{ onLimit?: () => void }} [options] `onLimit`: called when MAX_VOICE_MS stops it; `stop()` then still gives the clip
 * @returns {Promise<{ stop: () => Promise<Blob>, cancel: () => void, level: () => number }>} `level()`: how loud it is
 *   right now, 0 to 1 (for the live wave while speaking)
 * @throws {Error} with a message for the user when the microphone is not allowed or not there
 */
export async function startVoiceRecording({ onLimit } = {}) {
  if (!canRecordVoice()) throw new Error(t('ضبط صدا در این دستگاه ممکن نیست.'));
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    throw new Error(err?.name === 'NotAllowedError' || err?.name === 'SecurityError'
      ? t('اجازه‌ی میکروفون داده نشد. از تنظیمات گوشی (برنامه‌ها ← RealRate ← مجوزها) آن را بدهید.')
      : t('میکروفون پیدا نشد.'));
  }
  const mimeType = TYPES.find((type) => MediaRecorder.isTypeSupported?.(type));
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  let cancelled = false;
  const finished = new Promise((resolve) => {
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      closeMeter();
      resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }));
    };
  });
  recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
  // The loudness, read from the same stream (an analyser; none where the WebView has no AudioContext)
  let audioCtx = null;
  let analyser = null;
  let samples = null;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) {
      audioCtx = new Ctx();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      samples = new Uint8Array(analyser.fftSize);
    }
  } catch { analyser = null; }
  const closeMeter = () => { try { audioCtx?.close(); } catch { /* already closed */ } };
  recorder.start();
  const timer = setTimeout(() => {
    if (recorder.state === 'recording') {
      recorder.stop();
      onLimit?.();
    }
  }, MAX_VOICE_MS);

  return {
    level() {
      if (!analyser) return 0;
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const v of samples) sum += ((v - 128) / 128) ** 2;
      return Math.min(1, Math.sqrt(sum / samples.length) * 4);
    },
    async stop() {
      clearTimeout(timer);
      if (recorder.state === 'recording') recorder.stop();
      const blob = await finished;
      if (cancelled) throw new Error('cancelled');
      return blob;
    },
    cancel() {
      cancelled = true;
      clearTimeout(timer);
      if (recorder.state === 'recording') recorder.stop();
      else stream.getTracks().forEach((track) => track.stop());
      closeMeter();
    },
  };
}
