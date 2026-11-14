/**
 * smsVoiceApi.js — Send a voice note about a bank SMS to the server (experimental `sms_voice`)
 *
 * The server hands the clip to Gemini with the names of the user's expense categories and answers
 * the expense's title and one of those categories (or «سایر»); nothing is stored there.
 */

import { httpClient } from '../../shared/api/httpClient.js';
import { listCategories } from '../../shared/categories/categoryStore.js';

/** The user's categories of a kind the voice may pick from: the shown ones that count in the totals */
export function voiceCategories(kind = 'expense') {
  return listCategories(kind)
    .filter((c) => !c.excluded)
    .map((c) => ({ value: c.value, label: c.label }));
}

/**
 * @param {Blob} audio the recorded clip
 * @param {'expense'|'income'} [kind] a withdrawal's note picks an expense category, a deposit's an income one
 * @param {{ actions?: string[], projects?: Array<{ id: string, name: string }> }} [offer] what else the note may ask for
 *   instead of recording (api/src/domain/smsVoice.js SMS_VOICE_ACTIONS), and the open projects
 * @returns {Promise<{ understood: boolean, title: string, category: string, action: string, projectId: string, engine?: string, model?: string, durationMs?: number, heard?: string }>}
 */
export async function describeExpenseByVoice(audio, kind = 'expense', offer = {}) {
  const form = new FormData();
  form.append('audio', audio, 'voice.webm');
  form.append('categories', JSON.stringify(voiceCategories(kind)));
  form.append('kind', kind);
  if (offer.actions?.length) {
    form.append('actions', JSON.stringify(offer.actions));
    form.append('projects', JSON.stringify(offer.projects || []));
  }
  return httpClient.post('/api/sms/voice', form);
}
