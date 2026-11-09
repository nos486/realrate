/**
 * AiAssistantOverlay.jsx — The AI assistant while the «+» button is held to talk, and what follows
 *
 * Listening and sending: the page behind is blurred (a scrim like a modal's backdrop) and a small card
 * above the bottom bar shows a sound wave and a hint. Review and result use the app's own Modal, so they
 * look and act like every other window: the review asks to correct and confirm, the result offers
 * «برگرداندن» (deletes what was saved) and «بستن».
 */

import React from 'react';
import { Mic, Undo2, Check, Sparkles } from 'lucide-react';
import { Button, Modal } from '../../shared/ui/index.js';
import { t } from '../../utils/i18n.js';
import { VoiceWave } from '../sms-inbox/VoiceExpenseModal.jsx';

/**
 * @param {{ assistant: ReturnType<typeof import('./useAiAssistant.js').useAiAssistant> }} props
 */
export default function AiAssistantOverlay({ assistant }) {
  const { state, level, undo, dismiss, edit, confirm, cancelling } = assistant;
  if (!state) return null;
  const { stage } = state;

  if (stage === 'review') {
    return (
      <Modal
        isOpen
        onClose={state.saving ? () => {} : dismiss}
        title={t('درست فهمیدم؟')}
        subtitle={t('اصلاح کنید و تأیید بزنید')}
        icon={<Sparkles size={18} />}
        maxWidth="460px"
        footer={(
          <>
            <Button variant="secondary" onClick={dismiss} disabled={state.saving}>{t('انصراف')}</Button>
            <Button icon={<Check size={16} />} onClick={confirm} loading={state.saving} disabled={!state.intent.ready(state.answer)}>{t('تأیید و ثبت')}</Button>
          </>
        )}
      >
        <state.intent.Review answer={state.answer} onChange={edit} context={state.context} />
      </Modal>
    );
  }

  if (stage === 'done') {
    return (
      <Modal
        isOpen
        onClose={dismiss}
        title={state.intent.readOnly ? t('پاسخ') : t('ثبت شد')}
        icon={<Sparkles size={18} />}
        maxWidth="460px"
        footer={(
          <>
            {!state.intent.readOnly && <Button variant="secondary" icon={<Undo2 size={16} />} onClick={undo}>{t('برگرداندن')}</Button>}
            <Button onClick={dismiss}>{t('بستن')}</Button>
          </>
        )}
      >
        <state.intent.Result answer={state.answer} />
      </Modal>
    );
  }

  return (
    <>
      <div className="ai-assistant-scrim" aria-hidden="true" />
      <div className={`ai-assistant ${cancelling ? 'is-cancelling' : ''}`} role="status" aria-live="polite">
        <p className="ai-assistant-hint">
          <Mic size={16} aria-hidden="true" />
          {stage === 'starting' && t('در حال آماده‌سازی میکروفون…')}
          {stage === 'recording' && cancelling && t('رها کنید تا لغو شود.')}
          {stage === 'recording' && !cancelling && t('بگویید؛ مثلاً «۵۰ هزار تومان نان و ۲۰۰ هزار تومان قبض برق، دیروز از حساب ملی» یا بپرسید «این ماه چقدر خوراک خرج کردم؟». رها کنید تا ارسال شود؛ برای لغو، دکمه را به بالا بکشید.')}
          {stage === 'processing' && t('در حال فهمیدن…')}
        </p>
        <VoiceWave level={level} active={stage === 'recording'} />
      </div>
    </>
  );
}
