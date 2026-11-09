/**
 * useSmsVoice.js — «ثبت با صدا» on a waiting bank withdrawal (experimental, `sms_voice`)
 *
 * `start(item)` opens the recording (the page shows VoiceExpenseModal while `voice` is set); `stop()`
 * (or the 30 s limit) sends the clip to the server, which answers a title and a category of the
 * user's, and the withdrawal is recorded as an everyday expense with them (recordSmsExpense);
 * `cancel()` drops the recording. One message at a time. An admin (`cheque_scan_debug`) can pick the
 * engine that listens (`engine`, remembered on the device) to compare them, and sees which engine
 * answered, how long it took and what it heard.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFeature } from '../../shared/features/index.js';
import { DEFAULT_VOICE_ENGINE, voiceEngineById } from '../../config/voiceEngines.js';
import { t } from '../../utils/i18n.js';
import { useFeedback } from '../../shared/ui/FeedbackProvider.jsx';
import { startVoiceRecording } from '../../shared/native/voiceRecorder.js';
import { getExpenseCategory } from '../expenses/constants/expenseCategories.js';
import { bumpVaultEpoch } from '../../shared/vault/vaultStore.js';
import { describeExpenseByVoice } from './smsVoiceApi.js';
import { recordSmsExpense } from './smsRecord.js';

/**
 * @param {{ prepareAccounts: (item: object) => Promise<object[]> }} options `prepareAccounts`: the
 *   accounts to record into, the one for the message made when needed (the page's withMessageAccounts)
 * @returns {{ engine: string, setEngine: (id: string) => void, canPickEngine: boolean, voice: { item: object, stage: 'starting'|'recording'|'processing' }|null,
 *   start: (item: object) => Promise<void>, stop: () => Promise<void>, cancel: () => void, level: () => number }}
 */
export function useSmsVoice({ prepareAccounts }) {
  const { toast } = useFeedback();
  const canPickEngine = useFeature('cheque_scan_debug');
  const [engine, setEngineState] = useState(() => {
    try { return voiceEngineById(localStorage.getItem('realrate:voiceEngine')) ? localStorage.getItem('realrate:voiceEngine') : DEFAULT_VOICE_ENGINE; } catch { return DEFAULT_VOICE_ENGINE; }
  });
  const engineRef = useRef(engine);
  const setEngine = useCallback((id) => {
    engineRef.current = id;
    setEngineState(id);
    try { localStorage.setItem('realrate:voiceEngine', id); } catch { /* no storage: lasts this page */ }
  }, []);
  const [voice, setVoice] = useState(null);
  const session = useRef(null); // { item, recorder, stopping }
  const startCancelled = useRef(false);
  const prepare = useRef(prepareAccounts);
  const stopRef = useRef(null);

  useEffect(() => { prepare.current = prepareAccounts; });

  // Leaving the page drops a recording in progress
  useEffect(() => () => session.current?.recorder.cancel(), []);

  const stop = useCallback(async () => {
    const s = session.current;
    if (!s || s.stopping) return;
    s.stopping = true;
    setVoice({ item: s.item, stage: 'processing' });
    try {
      const clip = await s.recorder.stop();
      const answer = await describeExpenseByVoice(clip, canPickEngine ? engineRef.current : '');
      if (!answer?.understood) {
        toast.error(t('صدا واضح نبود؛ دوباره امتحان کنید.'));
        return;
      }
      await recordSmsExpense(s.item, { accounts: await prepare.current(s.item), category: answer.category, title: answer.title });
      bumpVaultEpoch();
      const done = t('هزینه‌ی «{title}» در «{category}» ثبت شد.', { title: answer.title, category: getExpenseCategory(answer.category).label });
      // For the comparison: the engine, its time, and the words it heard
      const detail = canPickEngine && answer.engine
        ? ` (${voiceEngineById(answer.engine)?.label || answer.engine} · ${((answer.durationMs || 0) / 1000).toFixed(1)}s${answer.heard ? ` · «${answer.heard}»` : ''})`
        : '';
      toast.success(done + detail, detail ? { duration: 10000 } : undefined);
    } catch (err) {
      toast.error(err?.message || t('ثبت با صدا ممکن نشد.'));
    } finally {
      session.current = null;
      setVoice(null);
    }
  }, [toast, canPickEngine]);
  useEffect(() => { stopRef.current = stop; }, [stop]);

  const start = useCallback(async (item) => {
    if (session.current || voice) return;
    startCancelled.current = false;
    setVoice({ item, stage: 'starting' });
    try {
      const recorder = await startVoiceRecording({ onLimit: () => stopRef.current?.() });
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

  const cancel = useCallback(() => {
    if (session.current?.stopping) return; // already sending
    startCancelled.current = true;
    session.current?.recorder.cancel();
    session.current = null;
    setVoice(null);
  }, []);

  const level = useCallback(() => session.current?.recorder.level() ?? 0, []);

  return { voice, start, stop, cancel, level, engine, setEngine, canPickEngine };
}
