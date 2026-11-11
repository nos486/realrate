/**
 * wavClip.test.js — The recorded clip as 16 kHz mono WAV (web/src/shared/native/wavClip.js)
 */

import { describe, it, expect } from 'vitest';
import { toMono16k, encodeWav, toWavClip, WAV_RATE } from '../../../web/src/shared/native/wavClip.js';

describe('toMono16k', () => {
  it('averages the channels', () => {
    const out = toMono16k([new Float32Array([1, 0.5]), new Float32Array([0, 0.5])], WAV_RATE);
    expect([...out]).toEqual([0.5, 0.5]);
  });

  it('down-samples 48 kHz to a third of the samples, each the mean of three', () => {
    const out = toMono16k([new Float32Array([0, 0.3, 0.6, 1, 1, 1])], 48000);
    expect(out.length).toBe(2);
    expect(out[0]).toBeCloseTo(0.3, 5);
    expect(out[1]).toBeCloseTo(1, 5);
  });

  it('gives one sample for a very short clip', () => {
    expect(toMono16k([new Float32Array([0.2])], 48000).length).toBe(1);
  });
});

describe('encodeWav', () => {
  it('writes a RIFF/WAVE header for mono PCM16 and clips out-of-range samples', async () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 2]), 16000);
    const bytes = new Uint8Array(await wav.arrayBuffer());
    const view = new DataView(bytes.buffer);
    const ascii = (a, b) => String.fromCharCode(...bytes.slice(a, b));
    expect(wav.type).toBe('audio/wav');
    expect(bytes.length).toBe(44 + 8);
    expect([ascii(0, 4), ascii(8, 12), ascii(12, 16), ascii(36, 40)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint32(40, true)).toBe(8);
    expect([view.getInt16(44, true), view.getInt16(46, true), view.getInt16(48, true), view.getInt16(50, true)]).toEqual([0, 32767, -32768, 32767]);
  });

  it('a 30 s clip stays under the server limit of 1 MB', () => {
    expect(encodeWav(new Float32Array(WAV_RATE * 30)).size).toBeLessThan(1024 * 1024);
  });
});

describe('toWavClip', () => {
  it('returns the clip itself when this device cannot decode audio', async () => {
    const clip = new Blob(['x'], { type: 'audio/webm' });
    expect(await toWavClip(clip)).toBe(clip);
  });
});
