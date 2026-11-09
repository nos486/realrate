/**
 * AiAssistantOverlay.jsx — The AI assistant's card above the bottom bar while the «+» button is held to talk
 *
 * Listening: a live sound wave and «رها کنید تا ارسال شود»; sending: a rippling wave; done: the
 * intent's result (aiIntents.js), with «برگرداندن» (deletes them again) and «بستن».
 */

import React from 'react';
import { Mic, Undo2, X, Check } from 'lucide-react';
import { Button } from '../../shared/ui/index.js';
import { t } from '../../utils/i18n.js';
import { VoiceWave } from '../sms-inbox/VoiceExpenseModal.jsx';

/**
 * @param {{ assistant: ReturnType<typeof import('./useAiAssistant.js').useAiAssistant> }} props
 */
export default function AiAssistantOverlay({ assistant }) {
  const { state, level, undo, dismiss, edit, confirm, cancelling } = assistant;
  if (!state) return null;
  const { stage } = state;
  return (
    <div className={`ai-assistant ${cancelling ? 'is-cancelling' : ''} ${stage === 'review' ? 'is-review' : ''}`} role="status" aria-live="polite">
      {stage === 'review' ? (
        <>
          <strong className="ai-assistant-heading">{t('درست فهمیدم؟ اصلاح کنید و تأیید بزنید')}</strong>
          <div className="ai-assistant-scroll">
            <state.intent.Review answer={state.answer} onChange={edit} context={state.context} />
          </div>
          <div className="ai-assistant-actions">
            <Button variant="secondary" onClick={dismiss} disabled={state.saving}>{t('انصراف')}</Button>
            <Button icon={<Check size={16} />} onClick={confirm} loading={state.saving} disabled={!state.intent.ready(state.answer)}>{t('تأیید و ثبت')}</Button>
          </div>
        </>
      ) : stage !== 'done' ? (
        <>
          <p className="ai-assistant-hint">
            <Mic size={16} aria-hidden="true" />
            {stage === 'starting' && t('در حال آماده‌سازی میکروفون…')}
            {stage === 'recording' && cancelling && t('رها کنید تا لغو شود.')}
            {stage === 'recording' && !cancelling && t('بگویید؛ مثلاً «۵۰ هزار تومان نان و ۲۰۰ هزار تومان قبض برق، دیروز از حساب ملی». رها کنید تا ارسال شود؛ برای لغو، دکمه را به بالا بکشید.')}
            {stage === 'processing' && t('در حال فهمیدن و ثبت…')}
          </p>
          <VoiceWave level={level} active={stage === 'recording'} />
        </>
      ) : (
        <>
          <button type="button" className="ai-assistant-close" onClick={dismiss} aria-label={t('بستن')}><X size={18} /></button>
          <state.intent.Result answer={state.answer} />
          <button type="button" className="ai-assistant-undo" onClick={undo}><Undo2 size={16} />{t('برگرداندن')}</button>
        </>
      )}
    </div>
  );
}
