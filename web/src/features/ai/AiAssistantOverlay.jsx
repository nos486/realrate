/**
 * AiAssistantOverlay.jsx — The AI assistant's card above the bottom bar while the «+» button is held to talk
 *
 * Listening: a live sound wave and «رها کنید تا ارسال شود»; sending: a rippling wave; done: the
 * intent's result (aiIntents.js), with «برگرداندن» (deletes them again) and «بستن».
 */

import React from 'react';
import { Mic, Undo2, X } from 'lucide-react';
import { t } from '../../utils/i18n.js';
import { VoiceWave } from '../sms-inbox/VoiceExpenseModal.jsx';

/**
 * @param {{ assistant: ReturnType<typeof import('./useAiAssistant.js').useAiAssistant> }} props
 */
export default function AiAssistantOverlay({ assistant }) {
  const { state, level, undo, dismiss } = assistant;
  if (!state) return null;
  const { stage } = state;
  return (
    <div className="ai-assistant" role="status" aria-live="polite">
      {stage !== 'done' ? (
        <>
          <p className="ai-assistant-hint">
            <Mic size={16} aria-hidden="true" />
            {stage === 'starting' && t('در حال آماده‌سازی میکروفون…')}
            {stage === 'recording' && t('بگویید؛ مثلاً «۵۰ هزار تومان نان و ۲۰۰ هزار تومان قبض برق، دیروز از حساب ملی». رها کنید تا ارسال شود.')}
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
