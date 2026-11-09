/**
 * aiIntents.js — What the app does with each intent the AI assistant hears (api/src/domain/aiAssistant.js)
 *
 * The server only listens and names the intent with its data; the app acts, because the user's
 * records are encrypted and only the browser can read them. An intent is a row here:
 *   apply(answer) → a handle for undo (or null when nothing can be undone), Result: how the answer shows
 *   undo(handle)  → takes the effect back
 * Next rows (not built): `report` / `question` — the model returns a structured query (period, category,
 * comparison with last year) that the app runs on the decrypted records and shows as a figure or a table.
 */

import RecordsResult from './RecordsResult.jsx';
import { saveVoiceItems, undoVoiceItems } from './aiRecords.js';

export const AI_INTENTS = {
  records: {
    apply: (answer) => saveVoiceItems(answer.items),
    undo: (handle) => undoVoiceItems(handle),
    Result: RecordsResult,
  },
};
