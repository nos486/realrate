/**
 * wavClip.js — Turn a recorded clip into 16 kHz mono WAV (PCM16) before it is sent
 *
 * The browser records WebM/Opus, which some speech models cannot decode (Cloudflare's Whisper answers
 * "Failed to decode audio file"); a plain WAV every engine reads. Speech needs only 16 kHz, so a
 * clip stays small (about 32 KB a second: 30 s is under the server's 1 MB limit). The decoding is
 * the browser's own (AudioContext); anything that fails leaves the original clip to be sent.
 */

/** Sample rate of the clip sent */
export const WAV_RATE = 16000;

/**
 * Mono samples at `WAV_RATE` from decoded channels: the channels averaged, then each output sample
 * the mean of the input samples it covers (a box filter, so down-sampling does not alias)
 * @param {Float32Array[]} channels decoded channels, all as long as each other
 * @param {number} rate their sample rate
 * @returns {Float32Array}
 */
export function toMono16k(channels, rate) {
  const length = channels[0]?.length || 0;
  const mono = new Float32Array(length);
  for (const channel of channels) for (let i = 0; i < length; i++) mono[i] += channel[i] / channels.length;
  if (rate === WAV_RATE) return mono;
  const ratio = rate / WAV_RATE;
  const out = new Float32Array(Math.max(1, Math.floor(length / ratio)));
  for (let i = 0; i < out.length; i++) {
    const from = Math.floor(i * ratio);
    const to = Math.min(length, Math.max(from + 1, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = from; j < to; j++) sum += mono[j];
    out[i] = sum / (to - from);
  }
  return out;
}

/**
 * A WAV file (44-byte header, then little-endian PCM16) of mono samples
 * @param {Float32Array} samples -1..1
 * @param {number} [rate]
 * @returns {Blob}
 */
export function encodeWav(samples, rate = WAV_RATE) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset, s) => { for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i)); };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); // bytes a second
  view.setUint16(32, 2, true); // bytes a sample
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * The clip as 16 kHz mono WAV, or the clip itself when this device cannot decode it
 * @param {Blob} blob
 * @returns {Promise<Blob>}
 */
export async function toWavClip(blob) {
  let ctx;
  try {
    const Ctx = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
    if (!Ctx) return blob;
    ctx = new Ctx();
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
    const wav = encodeWav(toMono16k(channels, decoded.sampleRate));
    return wav.size > 0 ? wav : blob;
  } catch {
    return blob;
  } finally {
    try { ctx?.close(); } catch { /* already closed */ }
  }
}
