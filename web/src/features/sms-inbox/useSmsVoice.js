/**
 * useSmsVoice.js — «ثبت با صدا» on a waiting bank withdrawal (experimental, `sms_voice`)
 *
 * One tap starts the recording of that message, a second tap stops it; the clip is sent to the
 * server, which answers a title and a category of the user's, and the withdrawal is recorded as
 * an everyday expense with them (recordSmsExpense). One message at a time.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
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
 * @returns {{ voice: { id: string, stage: 'recording'|'processing' }|null, toggle: (item: object) => Promise<void> }}
 */
export function useSmsVoice({ prepareAccounts }) {
  const { toast } = useFeedback();
  const [voice, setVoice] = useState(null);
  const session = useRef(null);

  // Leaving the page drops a recording in progress
  useEffect(() => () => session.current?.recorder.cancel(), []);

  const finish = useCallback(async (item, recorder) => {
    setVoice({ id: item.fingerprint, stage: 'processing' });
    try {
      const clip = await recorder.stop();
      const answer = await describeExpenseByVoice(clip);
      if (!answer?.understood) {
        toast.error(t('صدا واضح نبود؛ دوباره امتحان کنید.'));
        return;
      }
      await recordSmsExpense(item, { accounts: await prepareAccounts(item), category: answer.category, title: answer.title });
      bumpVaultEpoch();
      toast.success(t('هزینه‌ی «{title}» در «{category}» ثبت شد.', { title: answer.title, category: getExpenseCategory(answer.category).label }));
    } catch (err) {
      if (err?.message !== 'cancelled') toast.error(err?.message || t('ثبت با صدا ممکن نشد.'));
    } finally {
      session.current = null;
      setVoice(null);
    }
  }, [prepareAccounts, toast]);

  const toggle = useCallback(async (item) => {
    if (session.current) {
      // Second tap on the message being recorded stops it; taps elsewhere wait
      if (session.current.id === item.fingerprint && !session.current.stopping) {
        session.current.stopping = true;
        await finish(item, session.current.recorder);
      }
      return;
    }
    try {
      const recorder = await startVoiceRecording({ onLimit: () => { if (session.current?.id === item.fingerprint && !session.current.stopping) { session.current.stopping = true; finish(item, recorder); } } });
      session.current = { id: item.fingerprint, recorder, stopping: false };
      setVoice({ id: item.fingerprint, stage: 'recording' });
    } catch (err) {
      toast.error(err.message, { duration: 8000 });
    }
  }, [finish, toast]);

  return { voice, toggle };
}
