/**
 * VoiceExpenseModal.jsx — «توضیح بدهید این هزینه چیست»: the window of a voice note on a bank withdrawal
 *
 * Opens when the microphone of a message is tapped (useSmsVoice.js). While it listens, a row of bars
 * at the bottom moves with the loudness of the voice (`level`, read every frame); once the clip is
 * sent it ripples by itself until the expense is recorded. The note is sent by itself when the speaker
 * pauses after speaking; «پایان و ثبت» ends it by hand.
 */

import { t } from '../../utils/i18n.js';
import React, { useEffect, useRef } from 'react';
import { Mic, Check } from 'lucide-react';
import { Button, Modal } from '../../shared/ui/index.js';
import { formatAmount } from '../expenses/utils/format.js';

const BARS = 28;

/** Bars of the live wave: each shows the loudness a few frames ago, so the wave travels sideways */
export function VoiceWave({ level, active }) {
  const bars = useRef([]);
  useEffect(() => {
    if (!active) return undefined;
    const history = new Array(BARS).fill(0);
    let frame = 0;
    let last = 0;
    const tick = (now) => {
      if (now - last > 60) {
        last = now;
        history.shift();
        history.push(level());
        bars.current.forEach((el, i) => {
          if (el) el.style.transform = `scaleY(${0.12 + Math.min(1, history[i]) * 0.88})`;
        });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, level]);

  return (
    <div className={`sms-voice-wave ${active ? 'is-live' : 'is-idle'}`} aria-hidden="true">
      {Array.from({ length: BARS }, (_, i) => (
        <span key={i} ref={(el) => { bars.current[i] = el; }} style={active ? undefined : { animationDelay: `${i * 45}ms` }} />
      ))}
    </div>
  );
}

/**
 * @param {{ voice: { item: object, stage: 'starting'|'recording'|'processing' }|null, level: () => number,
 *   onStop: () => void, onCancel: () => void }} props
 */
export default function VoiceExpenseModal({ voice, level, onStop, onCancel }) {
  if (!voice) return null;
  const { tx } = voice.item;
  const processing = voice.stage === 'processing';
  const deposit = tx.direction === 'credit';
  return (
    <Modal
      isOpen
      onClose={processing ? () => {} : onCancel}
      title={deposit ? t('توضیح بدهید این واریز بابت چیست') : t('توضیح بدهید این هزینه چیست')}
      icon={<Mic size={18} />}
      subtitle={`${formatAmount(tx.amount)} ${t('تومان')}`}
      maxWidth="420px"
      className="sms-voice-modal"
      footer={(
        <>
          <Button variant="secondary" onClick={onCancel} disabled={processing}>{t('انصراف')}</Button>
          <Button icon={<Check size={16} />} onClick={onStop} loading={processing} disabled={voice.stage !== 'recording'}>
            {t('پایان و ثبت')}
          </Button>
        </>
      )}
    >
      <p className="sms-voice-hint">
        {voice.stage === 'starting' && t('در حال آماده‌سازی میکروفون…')}
        {voice.stage === 'recording' && (deposit ? t('بگویید؛ مثلاً «فروش لپ‌تاپ». وقتی ساکت شدید می‌فهمم چه گفتید و برای تأیید یا اصلاح پایین نشان می‌دهم؛ دسته را خودم از بین دسته‌های درآمد شما انتخاب می‌کنم. یا بگویید «انتقال بین حساب‌هام است» یا «واریز وام است».') : t('بگویید؛ مثلاً «هزینه تیپاکس». وقتی ساکت شدید می‌فهمم چه گفتید و برای تأیید یا اصلاح پایین نشان می‌دهم؛ دسته را خودم از بین دسته‌های شما انتخاب می‌کنم. یا بگویید «انتقال بین حساب‌هام است» یا «برای پروژه‌ی خانه است».'))}
        {processing && (deposit ? t('در حال فهمیدن و ثبت درآمد…') : t('در حال فهمیدن و ثبت هزینه…'))}
      </p>
      <VoiceWave level={level} active={voice.stage === 'recording'} />
    </Modal>
  );
}
