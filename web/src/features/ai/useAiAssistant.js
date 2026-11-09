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
import { askAiByVoice, aiContext } from './aiApi.js';
import { AI_INTENTS } from './aiIntents.js';

export const HOLD_MS = 350;
export const MIN_CLIP_MS = 700;
/** Dragging the held button this far up (px) cancels the note */
export const CANCEL_DRAG_PX = 70;
const HINT_KEY = 'realrate:aiHoldUses';
/** The button hints (a bounce) how to use it until it was held this many times */
const HINT_UNTIL = 3;

const heldBefore = () => { try { return Number(localStorage.getItem(HINT_KEY)) || 0; } catch { return HINT_UNTIL; } };

/**
 * @returns {{ enabled: boolean, state: { stage: 'starting'|'recording'|'processing'|'review'|'done', context?: object, intent?: object, answer?: object }|null,
 *   cancelling: boolean, hinting: boolean, level: () => number, edit: (answer: object) => void, confirm: () => Promise<void>, undo: () => Promise<void>, dismiss: () => void,
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
  const [cancelling, setCancelling] = useState(false); // the held button is dragged up: letting go cancels
  const [uses, setUses] = useState(heldBefore);
  const press = useRef({ pressed: false, timer: null, active: false, recorder: null, startedAt: 0, ignoreClick: false, startY: 0, cancelling: false });
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
      const context = await aiContext();
      const answer = await askAiByVoice(clip, context, voiceEngineById(engine) ? engine : '');
      const intent = Object.hasOwn(AI_INTENTS, answer?.intent) ? AI_INTENTS[answer.intent] : null;
      if (!answer?.understood || !intent) {
        setState(null);
        toast.error(t('متوجه نشدم؛ دوباره امتحان کنید.'));
        return;
      }
      // A question changes nothing: answered at once. Anything else is shown for the user to correct and
      // confirm, and saved only then (confirm)
      setState(intent.readOnly ? { stage: 'done', intent, answer } : { stage: 'review', intent, answer, context });
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
      if (p.cancelling) {
        // Dragged up and let go: nothing is sent
        p.cancelling = false;
        setCancelling(false);
        recorder.cancel();
        setState(null);
        impact();
        return;
      }
      setUses((n) => {
        const next = n + 1;
        try { localStorage.setItem(HINT_KEY, String(next)); } catch { /* no storage */ }
        return next;
      });
      send(recorder, p.startedAt);
    }
  }, [send]);

  const fabProps = {
    onPointerDown(e) {
      if (!enabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const p = press.current;
      p.pressed = true;
      p.ignoreClick = false;
      p.startY = e.clientY;
      p.cancelling = false;
      try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* not capturable */ }
      clearTimeout(p.timer);
      p.timer = setTimeout(begin, HOLD_MS);
    },
    onPointerMove(e) {
      const p = press.current;
      if (!p.active) return;
      const up = p.startY - e.clientY > CANCEL_DRAG_PX;
      if (up !== p.cancelling) {
        p.cancelling = up;
        setCancelling(up);
        if (up) impact();
      }
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

  const edit = useCallback((answer) => setState((s) => (s?.stage === 'review' ? { ...s, answer } : s)), []);
  const confirm = useCallback(async () => {
    if (state?.stage !== 'review' || !state.intent.ready(state.answer)) return;
    const { intent, answer } = state;
    setState({ ...state, saving: true });
    try {
      saved.current = { intent, handle: await intent.apply(answer) };
      bumpVaultEpoch();
      setState({ stage: 'done', intent, answer });
    } catch (err) {
      setState({ ...state, saving: false });
      toast.error(err?.message || t('ثبت با صدا ممکن نشد.'));
    }
  }, [state, toast]);

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

  const hinting = enabled && uses < HINT_UNTIL && !state;
  return { enabled, state, cancelling, hinting, level, edit, confirm, undo, dismiss, fabProps, takeClick };
}
