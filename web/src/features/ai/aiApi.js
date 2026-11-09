/**
 * aiApi.js — Send a spoken list of transactions to the server (experimental `ai_assistant`)
 *
 * The server hands the clip to Gemini with the names of the user's own expense and income
 * categories and accounts (encrypted on the server, so the app sends them with the clip) and answers
 * the transactions it heard; nothing is stored there.
 */

import { httpClient } from '../../shared/api/httpClient.js';
import { listCategories } from '../../shared/categories/categoryStore.js';
import { getAccounts } from '../../shared/vault/vaultAccounts.js';

/** The categories of one kind the voice may pick from: the shown ones that count in the totals */
function pickable(kind) {
  return listCategories(kind).filter((c) => !c.excluded).map((c) => ({ value: c.value, label: c.label }));
}

/** What the voice may pick from: the user's expense and income categories, and their active accounts */
export async function aiContext() {
  let accounts = [];
  try {
    accounts = (await getAccounts()).accounts.filter((a) => !a.archived).map((a) => ({ id: a.id, name: a.name }));
  } catch { /* no accounts feature, or they cannot be read: none to pick */ }
  return { expense: pickable('expense'), income: pickable('income'), accounts };
}

/**
 * @param {Blob} audio the recorded clip
 * @param {object} context what aiContext() gave (the lists the model may pick from)
 * @param {string} [engine] an engine of config/voiceEngines.js (the server honors it for admins only)
 * @returns {Promise<{ understood: boolean, items: Array<{ kind: 'expense'|'income', amount: number, title: string,
 *   category: string, date: string, accountId: string }>, engine?: string, durationMs?: number, heard?: string }>}
 */
export async function askAiByVoice(audio, context, engine = '') {
  const form = new FormData();
  form.append('audio', audio, 'voice.webm');
  form.append('context', JSON.stringify(context));
  if (engine) form.append('engine', engine);
  return httpClient.post('/api/ai/voice', form);
}
