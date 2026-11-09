/**
 * useAiAssistant.js — Hold the «+» button and say your expenses and incomes (experimental, `ai_assistant`)
 *
 * A press on the button held for HOLD_MS starts recording; letting go sends the clip (the button's
 * short tap is untouched: it opens «ثبت سریع»). The server answers the transactions it heard —
 * several at once, each with an amount in tomans, a category of the user's, a day and an account —
 * and they are created at once (aiRecords.js) and listed with an undo. There is no silence
 * detection: the hand decides when the note ends. A clip shorter than MIN_CLIP_MS is dropped (an
 * accidental press). An admin (`cheque_scan_debug`) uses the engine chosen in the SMS voice window.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFeature } from '../../shared/features/index.js';
import { useVault } from '../../shared/vault/useVault.js';
import { useFeedback } from '../../shared/ui/FeedbackProvider.jsx';
import { startVoiceRecording, canRecordVoice } from '../../shared/native/voiceRecorder.js';
import { bumpVaultEpoch } from '../../shared/vault/vaultStore.js';
import { impact } from '../../shared/native/haptics.js';
import { voiceEngineById } from '../../config/voiceEngines.js';
import { t } from '../../utils/i18n.js';
import { askAiByVoice } from './aiApi.js';
import { AI_INTENTS } from './aiIntents.js';

export const HOLD_MS = 350;
export const MIN_CLIP_MS = 700;

/**
 * @returns {{ enabled: boolean, state: { stage: 'starting'|'recording'|'processing'|'done', intent?: object, answer?: object }|null,
 *   level: () => number, undo: () => Promise<void>, dismiss: () => void,
 *   fabProps: object, takeClick: () => boolean }} `fabProps`: spread on the «+» button; `takeClick()`: true when
 *   the click that follows a hold must be ignored
 */
export function useAiAssistant() {
  const { toast } = useFeedback();
  const allowed = useFeature('ai_assistant');
  const canPickEngine = useFeature('cheque_scan_debug');
  const vault = useVault();
  const enabled = allowed && vault.status === 'unlocked' && canRecordVoice();

  const [state, setState] = useState(null);
  const press = useRef({ pressed: false, timer: null, active: false, recorder: null, startedAt: 0, ignoreClick: false });
  const saved = useRef(null);

  useEffect(() => () => {
    clearTimeout(press.current.timer);
    press.current.recorder?.cancel();
  }, []);

  const send = useCallback(async (recorder, startedAt) => {
    if (Date.now() - startedAt < MIN_CLIP_MS) {
      recorder.cancel();
      setState(null);
      toast.error(t('دکمه را نگه دارید و حرف بزنید؛ رها کنید تا ارسال شود.'));
      return;
    }
    setState({ stage: 'processing' });
    try {
      const clip = await recorder.stop();
      let engine = '';
      try { engine = canPickEngine ? localStorage.getItem('realrate:voiceEngine') || '' : ''; } catch { /* no storage */ }
      const answer = await askAiByVoice(clip, voiceEngineById(engine) ? engine : '');
      const intent = AI_INTENTS[answer?.intent];
      if (!answer?.understood || !intent) {
        setState(null);
        toast.error(t('متوجه نشدم؛ دوباره امتحان کنید.'));
        return;
      }
      saved.current = { intent, handle: await intent.apply(answer) };
      bumpVaultEpoch();
      setState({ stage: 'done', intent, answer });
    } catch (err) {
      setState(null);
      toast.error(err?.message || t('ثبت با صدا ممکن نشد.'));
    }
  }, [toast, canPickEngine]);

  const begin = useCallback(async () => {
    const p = press.current;
    p.active = true;
    p.ignoreClick = true;
    impact();
    saved.current = null;
    setState({ stage: 'starting' });
    try {
      const recorder = await startVoiceRecording({ onLimit: () => { if (p.recorder) { const r = p.recorder; p.recorder = null; p.active = false; send(r, p.startedAt); } } });
      if (!p.pressed) {
        // Let go while the microphone was still opening (e.g. its first permission dialog)
        recorder.cancel();
        p.active = false;
        setState(null);
        return;
      }
      p.recorder = recorder;
      p.startedAt = Date.now();
      setState({ stage: 'recording' });
    } catch (err) {
      p.active = false;
      setState(null);
      toast.error(err.message, { duration: 8000 });
    }
  }, [send, toast]);

  const release = useCallback(() => {
    const p = press.current;
    p.pressed = false;
    clearTimeout(p.timer);
    if (!p.active) return;
    if (p.recorder) {
      const recorder = p.recorder;
      p.recorder = null;
      p.active = false;
      send(recorder, p.startedAt);
    }
  }, [send]);

  const fabProps = {
    onPointerDown(e) {
      if (!enabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const p = press.current;
      p.pressed = true;
      p.ignoreClick = false;
      try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* not capturable */ }
      clearTimeout(p.timer);
      p.timer = setTimeout(begin, HOLD_MS);
    },
    onPointerUp: release,
    onPointerCancel: release,
    onContextMenu(e) { if (enabled) e.preventDefault(); },
  };

  const takeClick = useCallback(() => {
    const p = press.current;
    const ignore = p.ignoreClick;
    p.ignoreClick = false;
    return ignore;
  }, []);

  const level = useCallback(() => press.current.recorder?.level() ?? 0, []);
  const dismiss = useCallback(() => { saved.current = null; setState(null); }, []);
  const undo = useCallback(async () => {
    const done = saved.current;
    if (!done) return;
    try {
      await done.intent.undo(done.handle);
      bumpVaultEpoch();
      saved.current = null;
      setState(null);
      toast.success(t('ثبت‌های صوتی برگردانده شد.'));
    } catch (err) {
      toast.error(err?.message || t('برگرداندن ممکن نشد.'));
    }
  }, [toast]);

  return { enabled, state, level, undo, dismiss, fabProps, takeClick };
}
