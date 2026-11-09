/**
 * dictateApi.js — Turn a spoken clip into text for a text field (experimental `ai_assistant`)
 *
 * The server only writes down what was said; the words come back as text and nothing is stored there.
 */

import { httpClient } from '../api/httpClient.js';

/**
 * @param {Blob} audio the recorded clip
 * @returns {Promise<{ understood: boolean, text: string }>}
 */
export async function dictateByVoice(audio) {
  const form = new FormData();
  form.append('audio', audio, 'voice.webm');
  return httpClient.post('/api/ai/dictate', form);
}
