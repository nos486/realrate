/**
 * smsVoiceApi.js — Send a voice note about a bank SMS to the server (experimental `sms_voice`)
 *
 * The server hands the clip to Gemini with the names of the user's expense categories and answers
 * the expense's title and one of those categories (or «سایر»); nothing is stored there.
 */

import { httpClient } from '../../shared/api/httpClient.js';
import { listCategories } from '../../shared/categories/categoryStore.js';

/** The user's expense categories the voice may pick from: the shown ones that count in the totals */
export function voiceCategories() {
  return listCategories('expense')
    .filter((c) => !c.excluded)
    .map((c) => ({ value: c.value, label: c.label }));
}

/**
 * @param {Blob} audio the recorded clip
 * @param {string} [engine] an engine of config/voiceEngines.js (the server honors it for admins only)
 * @returns {Promise<{ understood: boolean, title: string, category: string, engine?: string, model?: string, durationMs?: number, heard?: string }>}
 */
export async function describeExpenseByVoice(audio, engine = '') {
  const form = new FormData();
  form.append('audio', audio, 'voice.webm');
  form.append('categories', JSON.stringify(voiceCategories()));
  if (engine) form.append('engine', engine);
  return httpClient.post('/api/sms/voice', form);
}
