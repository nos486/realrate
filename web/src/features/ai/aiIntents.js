/**
 * aiIntents.js — What the app does with each intent the AI assistant hears (api/src/domain/aiAssistant.js)
 *
 * The server only listens and names the intent with its data; the app acts, because the user's
 * records are encrypted and only the browser can read them. Nothing is saved on the model's word
 * alone: the answer is first shown for the user to correct and confirm. An intent is a row here:
 *   Review          → the editor of the answer ({ answer, onChange, context } props) shown before saving
 *   ready(answer)   → whether the answer is complete enough to confirm (the rest is asked of the user)
 *   apply(answer)   → a handle for undo (or null when nothing can be undone); Result: how the saved answer shows
 *   undo(handle)  → takes the effect back
 * `readOnly` intents change nothing: there is no review and no undo, the answer is shown at once.
 * `question`: the model only rewrites the question in the words reports/askQuery.js reads; the answer is
 * computed here, on the decrypted records. Next rows: reports and summaries, corrections, more records.
 */

import RecordsResult from './RecordsResult.jsx';
import RecordsReview from './RecordsReview.jsx';
import QuestionResult from './QuestionResult.jsx';
import EditReview from './EditReview.jsx';
import EditResult from './EditResult.jsx';
import { applyEdit, undoEdit } from './aiEdit.js';
import { saveVoiceItems, undoVoiceItems } from './aiRecords.js';

export const AI_INTENTS = {
  records: {
    Review: RecordsReview,
    ready: (answer) => answer.items.length > 0 && answer.items.every((i) => i.amount > 0 && i.title.trim()),
    apply: (answer) => saveVoiceItems(answer.items),
    undo: (handle) => undoVoiceItems(handle),
    Result: RecordsResult,
  },
  question: {
    readOnly: true,
    Result: QuestionResult,
  },
  edit: {
    Review: EditReview,
    ready: (answer) => Boolean(answer.chosenId) && (answer.op === 'delete' || Object.keys(answer.changes).length > 0),
    apply: (answer) => applyEdit(answer),
    undo: (handle) => undoEdit(handle),
    Result: EditResult,
  },
};
