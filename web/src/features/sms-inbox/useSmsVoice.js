/**
 * useSmsVoice.js — «ثبت با صدا» on a waiting bank withdrawal (experimental, `sms_voice`)
 *
 * `start(item)` opens the recording (the page shows VoiceExpenseModal while `voice` is set); `stop()`
 * (or the 30 s limit) sends the clip to the server, which answers a title and a category of the
 * user's. Nothing is recorded yet: the answer waits in `review` (VoiceConfirmBar at the bottom) for
 * `confirm()`, which records it as an everyday expense or income (recordSmsExpense), or `correct()`,
 * which listens again for the same message; `dismiss()` drops it. `cancel()` drops the recording. The note also ends by itself when the speaker stops (speech, then
 * a pause: voiceActivity.js), and is dropped when nothing is said. One message at a time. Only Whisper listens
 * (no language model); an admin (`cheque_scan_debug`) sees how long it took and what it heard.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFeature } from '../../shared/features/index.js';
import { voiceEngineById } from '../../config/voiceEngines.js';
import { t } from '../../utils/i18n.js';
import { useFeedback } from '../../shared/ui/FeedbackProvider.jsx';
import { startVoiceRecording } from '../../shared/native/voiceRecorder.js';
import { getExpenseCategory } from '../expenses/constants/expenseCategories.js';
import { getIncomeCategory } from '../incomes/constants/incomeCategories.js';
import { bumpVaultEpoch } from '../../shared/vault/vaultStore.js';
import { describeExpenseByVoice } from './smsVoiceApi.js';
import { recordSmsExpense, recordSmsIncome } from './smsRecord.js';

/**
 * @param {{ prepareAccounts: (item: object) => Promise<object[]>, offer?: (item: object) => Promise<{ actions: string[], projects: object[] }>,
 *   onAction?: (item: object, answer: object) => void }} options `prepareAccounts`: the accounts to record into, the one for
 *   the message made when needed (the page's withMessageAccounts); `offer`: what else the note may ask for (a transfer,
 *   a project…); `onAction`: opens that flow for the message, where the user confirms it
 * @returns {{ voice: { item: object, stage: 'starting'|'recording'|'processing' }|null,
 *   review: { item: object, answer: object }|null, confirm: () => Promise<void>, correct: () => void, dismiss: () => void,
 *   start: (item: object) => Promise<void>, stop: () => Promise<void>, cancel: () => void, level: () => number }}
 */
export function useSmsVoice({ prepareAccounts, offer, onAction }) {
  const { toast } = useFeedback();
  const canPickEngine = useFeature('cheque_scan_debug');
  const [voice, setVoice] = useState(null);
  const [review, setReview] = useState(null); // { item, answer, saving }: understood, waiting to be confirmed
  const session = useRef(null); // { item, recorder, stopping }
  const startCancelled = useRef(false);
  const prepare = useRef(prepareAccounts);
  const offerRef = useRef(offer);
  const actionRef = useRef(onAction);
  const stopRef = useRef(null);
  const cancelRef = useRef(null);
  const startRef = useRef(null);

  useEffect(() => { prepare.current = prepareAccounts; offerRef.current = offer; actionRef.current = onAction; });

  // Leaving the page drops a recording in progress
  useEffect(() => () => session.current?.recorder.cancel(), []);

  const stop = useCallback(async () => {
    const s = session.current;
    if (!s || s.stopping) return;
    s.stopping = true;
    setVoice({ item: s.item, stage: 'processing' });
    try {
      const clip = await s.recorder.stop();
      const offered = (await offerRef.current?.(s.item)) || { actions: [], projects: [] };
      const answer = await describeExpenseByVoice(clip, s.item.tx.direction === 'credit' ? 'income' : 'expense', offered);
      if (!answer?.understood || (!answer.title && !answer.action)) {
        toast.error(t('صدا واضح نبود؛ دوباره امتحان کنید.'));
        return;
      }
      // Asked for something else than recording: the message's own flow opens, where it is confirmed
      if (answer.action && actionRef.current) {
        actionRef.current(s.item, answer);
        return;
      }
      setReview({ item: s.item, answer, saving: false });
    } catch (err) {
      toast.error(err?.message || t('ثبت با صدا ممکن نشد.'));
    } finally {
      session.current = null;
      setVoice(null);
    }
  }, [toast]);
  useEffect(() => { stopRef.current = stop; }, [stop]);


  /** Record what was understood, with the title and category shown in the bar */
  const confirm = useCallback(async () => {
    if (!review || review.saving) return;
    const { item, answer } = review;
    setReview({ ...review, saving: true });
    try {
      const deposit = item.tx.direction === 'credit';
      const options = { accounts: await prepare.current(item), category: answer.category, title: answer.title };
      await (deposit ? recordSmsIncome : recordSmsExpense)(item, options);
      bumpVaultEpoch();
      const done = deposit
        ? t('درآمد «{title}» در «{category}» ثبت شد.', { title: answer.title, category: getIncomeCategory(answer.category).label })
        : t('هزینه‌ی «{title}» در «{category}» ثبت شد.', { title: answer.title, category: getExpenseCategory(answer.category).label });
      // For the comparison: the engine, its time, and the words it heard
      const detail = canPickEngine && answer.engine
        ? ` (${voiceEngineById(answer.engine)?.label || answer.engine} · ${((answer.durationMs || 0) / 1000).toFixed(1)}s${answer.heard ? ` · «${answer.heard}»` : ''})`
        : '';
      toast.success(done + detail, detail ? { duration: 10000 } : undefined);
      setReview(null);
    } catch (err) {
      toast.error(err?.message || t('ثبت با صدا ممکن نشد.'));
      setReview({ item, answer, saving: false });
    }
  }, [review, toast, canPickEngine]);

  /** Not what was meant: drop the answer and listen again for the same message */
  const correct = useCallback(() => {
    if (!review || review.saving) return;
    const { item } = review;
    setReview(null);
    startRef.current?.(item);
  }, [review]);

  const dismiss = useCallback(() => { if (!review?.saving) setReview(null); }, [review]);

  const start = useCallback(async (item) => {
    if (session.current || voice) return;
    setReview(null);
    startCancelled.current = false;
    setVoice({ item, stage: 'starting' });
    try {
      const recorder = await startVoiceRecording({
        onLimit: () => stopRef.current?.(),
        // The speaker finished: sent by itself
        onSilence: () => stopRef.current?.(),
        onNoSpeech: () => {
          toast.error(t('صدایی شنیده نشد؛ دوباره امتحان کنید.'));
          cancelRef.current?.();
        },
      });
      if (startCancelled.current) {
        recorder.cancel();
        return;
      }
      session.current = { item, recorder, stopping: false };
      setVoice({ item, stage: 'recording' });
    } catch (err) {
      toast.error(err.message, { duration: 8000 });
      setVoice(null);
    }
  }, [toast, voice]);

  useEffect(() => { startRef.current = start; }, [start]);

  const cancel = useCallback(() => {
    if (session.current?.stopping) return; // already sending
    startCancelled.current = true;
    session.current?.recorder.cancel();
    session.current = null;
    setVoice(null);
  }, []);

  useEffect(() => { cancelRef.current = cancel; }, [cancel]);

  const level = useCallback(() => session.current?.recorder.level() ?? 0, []);

  return { voice, review, confirm, correct, dismiss, start, stop, cancel, level };
}
