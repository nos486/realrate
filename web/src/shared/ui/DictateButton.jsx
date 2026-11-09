/**
 * DictateButton.jsx — A microphone beside a text field: tap, speak, and the words are typed in
 *
 * Shown only where the `ai_assistant` feature is on and the device can record. A tap starts the
 * recording, a pause after speaking (or another tap) ends it and sends the clip; the text goes to
 * `onText`, which adds it to the field.
 */

import { t } from '../../utils/i18n.js';
import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import { useFeature } from '../features/index.js';
import { startVoiceRecording, canRecordVoice } from '../native/voiceRecorder.js';
import { dictateByVoice } from '../native/dictateApi.js';
import { useFeedback } from './FeedbackProvider.jsx';

/** @param {{ onText: (text: string) => void, disabled?: boolean }} props */
export function DictateButton({ onText, disabled = false }) {
  const allowed = useFeature('ai_assistant');
  const { toast } = useFeedback();
  const [stage, setStage] = useState('idle');
  const recorder = useRef(null);
  const alive = useRef(true);
  useEffect(() => () => {
    alive.current = false;
    recorder.current?.cancel();
  }, []);

  if (!allowed || !canRecordVoice()) return null;

  async function finish() {
    const rec = recorder.current;
    if (!rec) return;
    recorder.current = null;
    setStage('processing');
    try {
      const audio = await rec.stop();
      const res = await dictateByVoice(audio);
      if (!alive.current) return;
      if (res?.understood && res.text) onText(res.text);
      else toast.error(t('متوجه نشدم؛ دوباره امتحان کنید.'));
    } catch (err) {
      if (alive.current) toast.error(err?.message || t('تبدیل صدا به متن ممکن نشد.'));
    } finally {
      if (alive.current) setStage('idle');
    }
  }

  async function begin() {
    setStage('starting');
    try {
      const rec = await startVoiceRecording({ onSilence: finish, onLimit: finish });
      if (!alive.current) { rec.cancel(); return; }
      recorder.current = rec;
      setStage('recording');
    } catch (err) {
      if (alive.current) { toast.error(err?.message || t('ضبط صدا ممکن نشد.')); setStage('idle'); }
    }
  }

  const recording = stage === 'recording';
  const busy = stage === 'starting' || stage === 'processing';
  return (
    <button
      type="button"
      className={`ui-dictate-btn ${recording ? 'is-recording' : ''}`}
      onClick={recording ? finish : begin}
      disabled={disabled || busy}
      aria-label={recording ? t('پایان گفتن') : t('گفتن با صدا')}
      title={recording ? t('پایان گفتن') : t('گفتن با صدا')}
    >
      {busy ? <Loader2 size={15} className="ui-dictate-spin" /> : recording ? <Square size={13} /> : <Mic size={15} />}
    </button>
  );
}

export default DictateButton;
